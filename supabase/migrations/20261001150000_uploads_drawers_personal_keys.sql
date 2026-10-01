-- Uploads from Verwaltung (web apps and programs), personal app drawers and order, and API keys
-- that are either site-wide (the admin's) or personal (each user's own). ADRs 0013–0015.

-- ---------- uploads (Verwaltung → Hochladen) ----------
-- A ZIP with a web app, or an installer for a program. Web apps are integrated by script
-- (`mininode integrate`) in a GitHub workflow; what the script cannot do waits for an AI review.
-- Only the API Worker and the workflows (service role) write; admins read.
create table platform.submissions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('webapp', 'program')),
  filename text not null check (char_length(filename) between 1 and 200),
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  -- webapp: path in the private `submissions` bucket; program: key in the installers bucket (R2)
  storage_path text not null check (char_length(storage_path) between 1 and 300),
  -- queued → integrating → integrated | needs_review | failed (web apps)
  -- queued → installing → installed | needs_review | failed (programs)
  status text not null default 'queued' check (
    status in ('queued', 'integrating', 'integrated', 'installing', 'installed',
               'needs_review', 'failed', 'dismissed')
  ),
  slug text check (slug is null or slug ~ '^[a-z][a-z0-9-]{0,30}[a-z0-9]$'),
  name text check (name is null or char_length(name) <= 60),
  -- { framework, reasons: [{code, message, file?}], warnings: [], actions: [] }
  summary jsonb not null default '{}'::jsonb,
  log text check (log is null or char_length(log) <= 20000),
  run_url text check (run_url is null or run_url ~ '^https://'),
  pr_url text check (pr_url is null or pr_url ~ '^https://'),
  review_url text check (review_url is null or review_url ~ '^https://'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index submissions_created_by_idx on platform.submissions (created_by);
create index submissions_status_idx on platform.submissions (status, created_at desc);
create trigger submissions_touch before update on platform.submissions
  for each row execute function platform.touch_updated_at();

alter table platform.submissions enable row level security;
revoke all on platform.submissions from public, anon, authenticated;
grant select on platform.submissions to authenticated;
grant all on platform.submissions to service_role;
create policy submissions_admin_select on platform.submissions for select to authenticated
  using ((select platform.is_admin()));

-- ZIPs wait here until the workflow has picked them up. Private; only the service role reads.
insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 41943040)
on conflict (id) do nothing;

-- ---------- personal drawers and order ----------
-- A drawer groups apps (or games, in the Gaming Hub) for one person. Nobody else sees it.
create table platform.user_drawers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  area text not null default 'apps' check (area in ('apps', 'games')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index user_drawers_user_idx on platform.user_drawers (user_id, area, position);

create table platform.user_drawer_items (
  drawer_id uuid not null references platform.user_drawers (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  position integer not null default 0,
  primary key (drawer_id, app_slug)
);
create index user_drawer_items_app_slug_idx on platform.user_drawer_items (app_slug);

-- The order a person chose, per screen: `all`, `favorites`, `shared`, `games`, `cat:<id>`,
-- `games:<genre>` or `drawer:<id>`. Apps missing from the list follow in the screen's own order.
create table platform.user_app_order (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope text not null check (scope ~ '^[a-z]{3,10}(:[A-Za-z0-9_-]{1,40})?$'),
  slugs text[] not null check (
    cardinality(slugs) <= 300 and array_to_string(slugs, ',') ~ '^[a-z0-9,-]*$'
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

alter table platform.user_drawers enable row level security;
alter table platform.user_drawer_items enable row level security;
alter table platform.user_app_order enable row level security;
revoke all on platform.user_drawers, platform.user_drawer_items, platform.user_app_order
  from public, anon, authenticated;
grant select, insert, update, delete on platform.user_drawers, platform.user_drawer_items,
  platform.user_app_order to authenticated;
grant all on platform.user_drawers, platform.user_drawer_items, platform.user_app_order
  to service_role;

create policy user_drawers_own on platform.user_drawers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy user_drawer_items_own on platform.user_drawer_items for all to authenticated
  using (exists (
    select 1 from platform.user_drawers d
    where d.id = drawer_id and d.user_id = (select auth.uid())
  ))
  with check (
    (select platform.has_grant(app_slug))
    and exists (
      select 1 from platform.user_drawers d
      where d.id = drawer_id and d.user_id = (select auth.uid())
    )
  );
create policy user_app_order_own on platform.user_app_order for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Limits that keep a runaway client from filling the tables.
create function platform.limit_user_drawers() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from platform.user_drawers where user_id = new.user_id and area = new.area) >= 30 then
    raise exception 'at most 30 drawers per area' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger user_drawers_limit before insert on platform.user_drawers
  for each row execute function platform.limit_user_drawers();

create function platform.limit_drawer_items() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from platform.user_drawer_items where drawer_id = new.drawer_id) >= 200 then
    raise exception 'at most 200 apps per drawer' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger user_drawer_items_limit before insert on platform.user_drawer_items
  for each row execute function platform.limit_drawer_items();

-- ---------- API keys: site-wide or personal ----------
-- sitewide: the admin's key serves everyone (ADR 0006). personal: every user brings their own;
-- calls without it fail with api_key_missing and the app asks for it.
alter table platform.api_services
  add column key_mode text not null default 'sitewide' check (key_mode in ('sitewide', 'personal'));
grant select (key_mode) on platform.api_services to authenticated;

-- A user's own keys: ciphertext (AES-GCM, bound to the API and the user) written by the API Worker
-- only. Not readable by any client; `my_api_keys` shows the hint.
create table platform.user_api_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  service_id text not null references platform.api_services (id) on delete cascade,
  key_enc text not null,
  key_hint text check (key_hint is null or char_length(key_hint) <= 4),
  updated_at timestamptz not null default now(),
  primary key (user_id, service_id)
);
create index user_api_keys_service_id_idx on platform.user_api_keys (service_id);
alter table platform.user_api_keys enable row level security;
revoke all on platform.user_api_keys from public, anon, authenticated;
grant all on platform.user_api_keys to service_role;

-- The personal-key APIs this user can use (through apps they may open), with their own key hint.
create function platform.my_api_keys()
returns table (
  service_id text,
  name text,
  docs_url text,
  base_url text,
  auth_type text,
  key_hint text,
  key_updated_at timestamptz,
  apps jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.docs_url, s.base_url, s.auth ->> 'type', k.key_hint, k.updated_at,
    (
      select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'reason', r.reason)
        order by a.name)
      from platform.app_api_services r
      join platform.apps a on a.slug = r.app_slug
      where r.service_id = s.id and (select platform.has_grant(a.slug))
    )
  from platform.api_services s
  left join platform.user_api_keys k
    on k.service_id = s.id and k.user_id = (select auth.uid())
  where (select auth.uid()) is not null
    and s.key_mode = 'personal'
    and s.auth ->> 'type' <> 'none'
    and exists (
      select 1 from platform.app_api_services r
      where r.service_id = s.id and (select platform.has_grant(r.app_slug))
    )
  order by s.name;
$$;
revoke execute on function platform.my_api_keys() from public, anon;
grant execute on function platform.my_api_keys() to authenticated, service_role;

-- How many people entered their own key per API (admin overview; never the keys).
create function platform.admin_personal_key_counts()
returns table (service_id text, users bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select k.service_id, count(*) from platform.user_api_keys k
  where (select platform.is_admin())
  group by k.service_id;
$$;
revoke execute on function platform.admin_personal_key_counts() from public, anon;
grant execute on function platform.admin_personal_key_counts() to authenticated, service_role;

-- A target change drops the site-wide key (ADR 0006) and now the personal keys as well: a key
-- is never sent anywhere but where it was entered for.
create or replace function platform.register_app_apis(p_app_slug text, p_apis jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_api jsonb;
  v_existing platform.api_services;
  v_others text[];
begin
  for v_api in select * from jsonb_array_elements(coalesce(p_apis, '[]'::jsonb)) loop
    select * into v_existing from platform.api_services where id = v_api ->> 'id' for update;
    if found and (v_existing.base_url <> v_api ->> 'baseUrl' or v_existing.auth <> v_api -> 'auth') then
      select array_agg(app_slug order by app_slug) into v_others
      from platform.app_api_services
      where service_id = v_existing.id and app_slug <> p_app_slug;
      if v_others is not null then
        raise exception 'API "%" is already used by % with a different baseUrl or auth',
          v_existing.id, array_to_string(v_others, ', ')
          using errcode = '23505';
      end if;
      update platform.api_services
      set key_enc = null, key_hint = null, key_updated_at = now(), key_updated_by = null
      where id = v_existing.id;
      delete from platform.user_api_keys where service_id = v_existing.id;
    end if;
    insert into platform.api_services (id, name, base_url, auth, docs_url)
    values (v_api ->> 'id', v_api ->> 'name', v_api ->> 'baseUrl', v_api -> 'auth', v_api ->> 'docs')
    on conflict (id) do update
      set name = excluded.name, base_url = excluded.base_url, auth = excluded.auth,
          docs_url = coalesce(excluded.docs_url, platform.api_services.docs_url);
    insert into platform.app_api_services (app_slug, service_id, reason)
    values (p_app_slug, v_api ->> 'id', v_api ->> 'reason')
    on conflict (app_slug, service_id) do update set reason = excluded.reason;
  end loop;

  delete from platform.app_api_services r
  where r.app_slug = p_app_slug
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_apis, '[]'::jsonb)) a
      where a.value ->> 'id' = r.service_id
    );
end;
$$;
