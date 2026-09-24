-- Helpers that hosted-app migrations use to create their schema and secure their tables with
-- the standard policy templates. Every generated policy calls platform.has_grant(slug), which
-- the pgTAP meta-test (supabase/tests/app_isolation.test.sql) enforces for all app_* tables.

create function platform.app_schema_name(p_slug text) returns text
language sql
immutable
set search_path = ''
as $$
  select 'app_' || replace(p_slug, '-', '_');
$$;

-- Creates the app schema with no access for anon and usage for signed-in users.
create function platform.create_app_schema(p_slug text) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_schema text := platform.app_schema_name(p_slug);
begin
  if p_slug !~ '^[a-z][a-z0-9-]{0,30}[a-z0-9]$' then
    raise exception 'invalid app slug: %', p_slug;
  end if;
  execute format('create schema if not exists %I', v_schema);
  execute format('revoke all on schema %I from public, anon', v_schema);
  execute format('grant usage on schema %I to authenticated, service_role', v_schema);
  execute format('alter default privileges in schema %I revoke all on tables from public, anon', v_schema);
  execute format('alter default privileges in schema %I revoke all on sequences from public, anon', v_schema);
  execute format('alter default privileges in schema %I revoke all on functions from public, anon', v_schema);
  execute format('grant all on all tables in schema %I to service_role', v_schema);
  execute format('alter default privileges in schema %I grant all on tables to service_role', v_schema);
  return v_schema;
end;
$$;

-- Records shared-account writes with the real actor so the owner can see who changed what.
create function platform.audit_shared_write() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into platform.audit_log (actor_id, acting_as, app_slug, action, detail)
  values (
    (select auth.uid()),
    coalesce(new.owner_id, old.owner_id),
    tg_argv[0],
    lower(tg_op) || ':' || tg_table_name,
    jsonb_build_object('id', coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'))
  );
  return coalesce(new, old);
end;
$$;
revoke execute on function platform.audit_shared_write() from public, anon, authenticated;

-- Enables RLS on an app table and installs the policies for its data mode.
--   private         rows belong to auth.uid()                      (table needs owner_id uuid)
--   shared-account  rows belong to platform.effective_owner(slug)   (table needs owner_id uuid)
--   group           every user with a grant reads and writes all rows
--   readonly        every user with a grant reads; writes only via service role
create function platform.secure_table(p_slug text, p_table text, p_mode platform.data_mode)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_schema text := platform.app_schema_name(p_slug);
  v_grant text := format('(select platform.has_grant(%L))', p_slug);
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

-- Only migrations (running as postgres) may call the schema helpers.
revoke execute on function platform.create_app_schema(text) from public, anon, authenticated;
revoke execute on function platform.secure_table(text, text, platform.data_mode) from public, anon, authenticated;
grant execute on function platform.app_schema_name(text) to authenticated, service_role;
