-- App identity (ADR 0002 §1). Until now RLS only knew the user: every app runs in the browser
-- with the same session, so app A could read app B's kv rows, files and tables whenever the user
-- had both apps. Browsers set the Origin header themselves, so it identifies the calling app.

-- Origins that belong to an app. Deploys register https://<slug>.<domain>; `mininode dev`
-- registers http://localhost:<port>.
create table platform.app_origins (
  origin text primary key check (origin = lower(origin) and origin ~ '^https?://[^/]+$'),
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade
);
create index app_origins_app_slug_idx on platform.app_origins (app_slug);
alter table platform.app_origins enable row level security;
revoke all on platform.app_origins from public, anon, authenticated;
grant all on platform.app_origins to service_role;
-- Admins see which origins belong to which app; changes go through deploys (service role).
create policy app_origins_admin_select on platform.app_origins for select to authenticated
  using ((select platform.is_admin()));
grant select on platform.app_origins to authenticated;

-- Production apps deployed before this migration. The domain is hardcoded: on staging these rows
-- are useless but harmless, and every deploy registers the right origin for its environment.
insert into platform.app_origins (origin, app_slug)
select 'https://' || slug || '.mininode.app', slug
from platform.apps
where target = 'cloudflare'
on conflict (origin) do nothing;

-- The app whose page sent this request, or null (no Origin, unknown origin, server clients).
-- PostgREST and Storage pass request.headers. Realtime does not, so postgres_changes on app data
-- delivers nothing; apps use broadcast channels instead (ADR 0002 §1).
create function platform.calling_app() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.app_slug
  from platform.app_origins o
  where o.origin = lower(nullif(current_setting('request.headers', true), '')::json ->> 'origin');
$$;

-- Access to an app's data: the user may use the app, and the request comes from that app.
create function platform.app_access(p_slug text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select platform.has_grant(p_slug))
    and p_slug is not distinct from (select platform.calling_app());
$$;

revoke execute on function platform.calling_app() from public, anon;
revoke execute on function platform.app_access(text) from public, anon;
grant execute on function platform.calling_app() to authenticated, service_role;
grant execute on function platform.app_access(text) to authenticated, service_role;

-- kv: same rules as before, plus the calling app.
drop policy app_kv_own on platform.app_kv;
drop policy app_kv_shared on platform.app_kv;
create policy app_kv_own on platform.app_kv for all to authenticated
  using ((select platform.app_access(app_slug)) and owner_id = (select platform.effective_owner(app_slug)))
  with check ((select platform.app_access(app_slug)) and owner_id = (select platform.effective_owner(app_slug)));
create policy app_kv_shared on platform.app_kv for all to authenticated
  using ((select platform.app_access(app_slug)) and owner_id is null)
  with check ((select platform.app_access(app_slug)) and owner_id is null);

-- files: `<slug>/<owner or "shared">/…`, reachable only from that app.
create or replace function platform.may_access_app_file(p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select platform.app_access(split_part(p_name, '/', 1)))
    and (
      split_part(p_name, '/', 2) = 'shared'
      or split_part(p_name, '/', 2) = (select platform.effective_owner(split_part(p_name, '/', 1)))::text
    );
$$;

-- notifications: an app may only notify under its own name.
create or replace function platform.notify_self(p_app_slug text, p_title text, p_body text default null, p_url text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not (select platform.app_access(p_app_slug)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into platform.notifications (user_id, app_slug, title, body, url)
  values ((select auth.uid()), p_app_slug, p_title, p_body, p_url)
  returning id into v_id;
  return v_id;
end;
$$;

-- App tables: new tables get policies with app_access (no hosted app has tables yet).
create or replace function platform.secure_table(p_slug text, p_table text, p_mode platform.data_mode)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_schema text := platform.app_schema_name(p_slug);
  v_grant text := format('(select platform.app_access(%L))', p_slug);
  v_owner text;
  v_rel regclass := format('%I.%I', v_schema, p_table)::regclass;
begin
  execute format('alter table %s enable row level security', v_rel);
  execute format('alter table %s force row level security', v_rel);
  execute format('revoke all on %s from public, anon, authenticated', v_rel);

  if p_mode in ('private', 'shared-account') then
    if not exists (
      select 1 from pg_attribute
      where attrelid = v_rel and attname = 'owner_id' and not attisdropped
        and atttypid = 'uuid'::regtype
    ) then
      raise exception '%.% needs an owner_id uuid column for mode %', v_schema, p_table, p_mode;
    end if;

    v_owner := case p_mode
      when 'private' then '(select auth.uid())'
      else format('(select platform.effective_owner(%L))', p_slug)
    end;

    execute format('alter table %s alter column owner_id set default %s', v_rel,
      case p_mode when 'private' then 'auth.uid()' else format('platform.effective_owner(%L)', p_slug) end);
    execute format('alter table %s alter column owner_id set not null', v_rel);
    execute format('create index if not exists %I on %s (owner_id)', p_table || '_owner_id_idx', v_rel);
    execute format('grant select, insert, update, delete on %s to authenticated', v_rel);
    execute format(
      'create policy %I on %s for all to authenticated using (%s and owner_id = %s) with check (%s and owner_id = %s)',
      p_table || '_' || replace(p_mode::text, '-', '_'), v_rel, v_grant, v_owner, v_grant, v_owner);

    if p_mode = 'shared-account' then
      execute format(
        'create trigger %I after insert or update or delete on %s for each row execute function platform.audit_shared_write(%L)',
        p_table || '_audit', v_rel, p_slug);
    end if;

  elsif p_mode = 'group' then
    execute format('grant select, insert, update, delete on %s to authenticated', v_rel);
    execute format('create policy %I on %s for all to authenticated using (%s) with check (%s)',
      p_table || '_group', v_rel, v_grant, v_grant);

  elsif p_mode = 'readonly' then
    execute format('grant select on %s to authenticated', v_rel);
    execute format('create policy %I on %s for select to authenticated using (%s)',
      p_table || '_readonly', v_rel, v_grant);

  else
    raise exception 'mode % has no table template', p_mode;
  end if;

  execute format('grant all on %s to service_role', v_rel);
end;
$$;

-- create or replace keeps grants, but restate the lock-down for clarity.
revoke execute on function platform.secure_table(text, text, platform.data_mode) from public, anon, authenticated;
