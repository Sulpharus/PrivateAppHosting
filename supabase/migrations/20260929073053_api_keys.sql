-- Host-level API keys (ADR 0006). Apps declare the external APIs they need in mininode.json; the
-- deploy registers them here, one entry per API id however many apps use it. The admin enters
-- the key once under Verwaltung → API-Schlüssel; the API Worker stores it encrypted and adds it
-- to proxied requests, so no app and no browser ever sees it.

create table platform.api_services (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  -- Public https host (no credentials, query, IP literal or trailing dot); the manifest checks more.
  base_url text not null check (
    base_url ~ '^https://[^/?#@:\[\]]+(/[^?#]*)?$'
    and base_url !~ '^https://[0-9.]+(/|$)'
    and base_url !~ '^https://[^/]*\.(/|$)'
  ),
  -- {"type":"header","name":"X-Api-Key","prefix":"…"} | {"type":"bearer"} | {"type":"query","param":"…"}
  -- | {"type":"none"} (a public API without a key, proxied because browsers cannot reach it)
  auth jsonb not null check (
    (auth ->> 'type' = 'bearer' and auth = '{"type":"bearer"}'::jsonb)
    or (auth ->> 'type' = 'none' and auth = '{"type":"none"}'::jsonb)
    or (auth ->> 'type' = 'query' and auth ->> 'param' ~ '^[A-Za-z][A-Za-z0-9_-]{0,40}$'
        and auth - 'type' - 'param' = '{}'::jsonb)
    or (auth ->> 'type' = 'header' and auth ->> 'name' ~ '^[A-Za-z][A-Za-z0-9-]{0,40}$'
        and lower(auth ->> 'name') not in ('host', 'cookie', 'content-type', 'content-length',
          'transfer-encoding', 'connection', 'accept', 'accept-language', 'accept-encoding', 'origin')
        and coalesce(auth ->> 'prefix', '') ~ '^[ -~]{0,20}$'
        and auth - 'type' - 'name' - 'prefix' = '{}'::jsonb)
  ),
  docs_url text check (docs_url is null or docs_url ~ '^https?://'),
  -- AES-GCM ciphertext (base64, IV first, AAD = id), written by the API Worker only.
  key_enc text,
  -- Last four characters, so the admin recognises the key without seeing it.
  key_hint text check (key_hint is null or char_length(key_hint) <= 4),
  key_updated_at timestamptz,
  key_updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index api_services_key_updated_by_idx on platform.api_services (key_updated_by);

create table platform.app_api_services (
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  -- restrict: an entry can only be removed once no app requests it (checked atomically).
  service_id text not null references platform.api_services (id) on delete restrict,
  reason text not null check (char_length(reason) between 1 and 200),
  primary key (app_slug, service_id)
);
create index app_api_services_service_id_idx on platform.app_api_services (service_id);

create trigger api_services_touch before update on platform.api_services
  for each row execute function platform.touch_updated_at();

alter table platform.api_services enable row level security;
alter table platform.app_api_services enable row level security;
revoke all on platform.api_services, platform.app_api_services from public, anon, authenticated;
grant select, insert, update, delete on platform.api_services, platform.app_api_services
  to service_role;

-- Admins see the list, never the ciphertext.
grant select (id, name, base_url, auth, docs_url, key_hint, key_updated_at, created_at, updated_at)
  on platform.api_services to authenticated;
grant select on platform.app_api_services to authenticated;
create policy api_services_admin_select on platform.api_services for select to authenticated
  using ((select platform.is_admin()));
create policy app_api_services_admin_select on platform.app_api_services for select
  to authenticated using ((select platform.is_admin()));

-- Deploy (service role only, so no security definer needed): makes the app's declared APIs the
-- exact set it uses. An API id that another app already uses must have the same base URL and key
-- placement; otherwise the deploy stops, because one key cannot serve two different APIs. When
-- the target changes otherwise (the only app moved it, or an unused entry is taken over), the
-- stored key is dropped: a key is never sent anywhere but where the admin entered it for.
create function platform.register_app_apis(p_app_slug text, p_apis jsonb)
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

revoke execute on function platform.register_app_apis(text, jsonb) from public, anon, authenticated;
grant execute on function platform.register_app_apis(text, jsonb) to service_role;
