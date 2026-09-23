-- Platform core: profiles, roles, apps, grants, invites, audit, notifications.
-- Everything security-relevant funnels through a few SECURITY DEFINER helpers so that
-- RLS policies stay short and fast (helpers are called once per statement via `(select …)`).

create schema if not exists platform;
comment on schema platform is 'MiniNode platform tables and helpers (exposed to the Data API).';

revoke all on schema platform from public, anon;
grant usage on schema platform to authenticated, service_role;

create type platform.user_role as enum ('admin', 'trusted', 'user');
create type platform.data_mode as enum ('none', 'private', 'shared-account', 'group', 'readonly');
create type platform.app_status as enum ('pending', 'online', 'degraded', 'down', 'disabled');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table platform.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  role platform.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform.apps (
  slug text primary key check (slug ~ '^[a-z][a-z0-9-]{0,30}[a-z0-9]$' and slug !~ '--'),
  name text not null check (char_length(name) between 1 and 40),
  description text not null check (char_length(description) between 1 and 120),
  kind text not null check (kind in ('static', 'spa', 'nextjs', 'container', 'remote')),
  target text not null check (target in ('cloudflare', 'vercel', 'nucbox', 'remote')),
  data_mode platform.data_mode not null default 'none',
  is_default boolean not null default false,
  allowed_roles platform.user_role[] not null default '{user,trusted,admin}',
  -- The account whose data trusted users act on in shared-account mode (the owner/admin).
  owner_id uuid references auth.users (id) on delete set null,
  manifest jsonb not null,
  status platform.app_status not null default 'pending',
  deployed_version text,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_account_needs_owner check (data_mode <> 'shared-account' or owner_id is not null)
);

create table platform.app_grants (
  user_id uuid not null references auth.users (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, app_slug)
);
create index app_grants_app_slug_idx on platform.app_grants (app_slug);

create table platform.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role platform.user_role not null default 'user' check (role <> 'admin'),
  app_slugs text[] not null default '{}',
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint expires_after_creation check (expires_at > created_at)
);
create unique index invites_one_open_per_email_idx on platform.invites (lower(email))
  where accepted_at is null and revoked_at is null;
create index invites_created_by_idx on platform.invites (created_by);

create table platform.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  acting_as uuid,
  app_slug text,
  action text not null,
  detail jsonb not null default '{}'
);
create index audit_log_at_idx on platform.audit_log (at desc);

create table platform.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_slug text references platform.apps (slug) on delete cascade on update cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 500),
  url text check (url is null or url ~ '^https://([a-z0-9-]+\.)?mininode\.app(/|$)' or url ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on platform.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_app_slug_idx on platform.notifications (app_slug);

create function platform.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on platform.profiles
  for each row execute function platform.touch_updated_at();
create trigger apps_touch before update on platform.apps
  for each row execute function platform.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Identity helpers (used by RLS policies everywhere, including app schemas)
-- ---------------------------------------------------------------------------

create function platform.current_user_role() returns platform.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from platform.profiles p where p.user_id = (select auth.uid());
$$;

create function platform.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select platform.current_user_role()) = 'admin', false);
$$;

-- True when the caller signed in (any method) within the last `max_age_seconds`.
-- Used as a step-up check for admin actions (JWT `amr` claim).
create function platform.recent_auth(max_age_seconds integer default 600) returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
    where (entry ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - max_age_seconds
  );
$$;

-- Whether the caller may use an app. Admins may use every app that is not disabled.
create function platform.has_grant(p_slug text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from platform.apps a
    join platform.profiles p on p.user_id = (select auth.uid())
    where a.slug = p_slug
      and a.status <> 'disabled'
      and p.role = any (a.allowed_roles)
      and (
        p.role = 'admin'
        or exists (
          select 1 from platform.app_grants g
          where g.app_slug = a.slug and g.user_id = p.user_id
        )
      )
  );
$$;

-- The user id whose rows the caller works on. In shared-account apps, trusted users and the
-- admin act on the app owner's data; everyone else works on their own rows.
create function platform.effective_owner(p_slug text) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select a.owner_id
      from platform.apps a
      where a.slug = p_slug
        and a.data_mode = 'shared-account'
        and (select platform.current_user_role()) in ('trusted', 'admin')
        and (select platform.has_grant(p_slug))
    ),
    (select auth.uid())
  );
$$;

revoke execute on function platform.current_user_role() from public, anon;
revoke execute on function platform.is_admin() from public, anon;
revoke execute on function platform.recent_auth(integer) from public, anon;
revoke execute on function platform.has_grant(text) from public, anon;
revoke execute on function platform.effective_owner(text) from public, anon;
grant execute on function platform.current_user_role() to authenticated, service_role;
grant execute on function platform.is_admin() to authenticated, service_role;
grant execute on function platform.recent_auth(integer) to authenticated, service_role;
grant execute on function platform.has_grant(text) to authenticated, service_role;
grant execute on function platform.effective_owner(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- New users: profile, role and grants come from the matching open invite.
-- The very first user of a fresh project becomes the admin (bootstrap).
-- ---------------------------------------------------------------------------

create function platform.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite platform.invites%rowtype;
  v_role platform.user_role := 'user';
  v_name text;
begin
  select * into v_invite
  from platform.invites i
  where lower(i.email) = lower(new.email)
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if not exists (select 1 from platform.profiles) then
    v_role := 'admin';
  elsif v_invite.id is not null then
    v_role := v_invite.role;
  end if;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into platform.profiles (user_id, display_name, role)
  values (new.id, left(v_name, 60), v_role);

  insert into platform.app_grants (user_id, app_slug, granted_by)
  select new.id, a.slug, v_invite.created_by
  from platform.apps a
  where (a.is_default or a.slug = any (coalesce(v_invite.app_slugs, '{}')))
    and v_role = any (a.allowed_roles)
  on conflict do nothing;

  if v_invite.id is not null then
    update platform.invites set accepted_at = now(), accepted_by = new.id where id = v_invite.id;
  end if;

  insert into platform.audit_log (actor_id, action, detail)
  values (new.id, 'user.created', jsonb_build_object('role', v_role, 'invite_id', v_invite.id));

  return new;
end;
$$;

revoke execute on function platform.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function platform.handle_new_user();

-- Adds `mn_role` to every access token so gates can authorize without a database round trip.
create function platform.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role platform.user_role;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
begin
  select p.role into v_role from platform.profiles p where p.user_id = (event ->> 'user_id')::uuid;
  v_claims := jsonb_set(v_claims, '{mn_role}', to_jsonb(coalesce(v_role::text, 'user')));
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

revoke execute on function platform.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema platform to supabase_auth_admin;
grant execute on function platform.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Row level security for platform tables
-- ---------------------------------------------------------------------------

alter table platform.profiles enable row level security;
alter table platform.apps enable row level security;
alter table platform.app_grants enable row level security;
alter table platform.invites enable row level security;
alter table platform.audit_log enable row level security;
alter table platform.notifications enable row level security;

revoke all on all tables in schema platform from anon, authenticated;

-- profiles: everyone reads their own; admins read all. Users may only rename themselves.
grant select on platform.profiles to authenticated;
grant update (display_name) on platform.profiles to authenticated;
create policy profiles_select on platform.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select platform.is_admin()));
create policy profiles_update_self on platform.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- apps: visible when the caller may use them. Writes happen through CI (service role).
grant select on platform.apps to authenticated;
create policy apps_select on platform.apps for select to authenticated
  using ((select platform.has_grant(slug)) or (select platform.is_admin()));

-- grants: own grants visible; admins manage grants after a recent sign-in.
grant select, insert, delete on platform.app_grants to authenticated;
create policy app_grants_select on platform.app_grants for select to authenticated
  using (user_id = (select auth.uid()) or (select platform.is_admin()));
create policy app_grants_admin_insert on platform.app_grants for insert to authenticated
  with check ((select platform.is_admin()) and (select platform.recent_auth(600)));
create policy app_grants_admin_delete on platform.app_grants for delete to authenticated
  using ((select platform.is_admin()) and (select platform.recent_auth(600)));

-- invites: admins read them; creation and revocation go through the API (service role),
-- which also sends the email.
grant select on platform.invites to authenticated;
create policy invites_admin_select on platform.invites for select to authenticated
  using ((select platform.is_admin()));

-- audit log: admins only, append-only through SECURITY DEFINER functions.
grant select on platform.audit_log to authenticated;
create policy audit_admin_select on platform.audit_log for select to authenticated
  using ((select platform.is_admin()));

-- notifications: users read and mark their own.
grant select on platform.notifications to authenticated;
grant update (read_at) on platform.notifications to authenticated;
create policy notifications_select_own on platform.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own on platform.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant all on all tables in schema platform to service_role;
grant usage, select on all sequences in schema platform to service_role;

-- ---------------------------------------------------------------------------
-- RPCs callable by signed-in users
-- ---------------------------------------------------------------------------

-- Lets an app notify the signed-in user (in-app reminders). Other users are notified
-- server-side with the service role.
create function platform.notify_self(p_app_slug text, p_title text, p_body text default null, p_url text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not (select platform.has_grant(p_app_slug)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into platform.notifications (user_id, app_slug, title, body, url)
  values ((select auth.uid()), p_app_slug, p_title, p_body, p_url)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function platform.notify_self(text, text, text, text) from public, anon;
grant execute on function platform.notify_self(text, text, text, text) to authenticated;

-- Admin: change a user's role. Requires a recent sign-in; the admin cannot demote themselves.
create function platform.admin_set_role(p_user_id uuid, p_role platform.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select platform.is_admin()) or not (select platform.recent_auth(600)) then
    raise exception 'admin with recent sign-in required' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'admins cannot change their own role' using errcode = '22023';
  end if;
  if p_role = 'admin' then
    raise exception 'there is exactly one admin' using errcode = '22023';
  end if;
  update platform.profiles set role = p_role where user_id = p_user_id;
  if not found then
    raise exception 'unknown user' using errcode = 'P0002';
  end if;
  insert into platform.audit_log (actor_id, action, detail)
  values ((select auth.uid()), 'user.role_changed', jsonb_build_object('user_id', p_user_id, 'role', p_role));
end;
$$;
revoke execute on function platform.admin_set_role(uuid, platform.user_role) from public, anon;
grant execute on function platform.admin_set_role(uuid, platform.user_role) to authenticated;

-- Admin: list users with email and last sign-in (auth.users is not exposed directly).
create function platform.admin_list_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role platform.user_role,
  app_count bigint,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select platform.is_admin()) then
    raise exception 'admin required' using errcode = '42501';
  end if;
  return query
    select p.user_id, u.email::text, p.display_name, p.role,
      (select count(*) from platform.app_grants g where g.user_id = p.user_id),
      u.last_sign_in_at, p.created_at
    from platform.profiles p
    join auth.users u on u.id = p.user_id
    order by p.role, p.display_name;
end;
$$;
revoke execute on function platform.admin_list_users() from public, anon;
grant execute on function platform.admin_list_users() to authenticated;
