-- Push notifications (ADR 0005). Devices subscribe through the portal's service worker; the API
-- delivers every new bell notification to the user's devices (Web Push, VAPID) and releases
-- scheduled reminders (`mn.push.schedule`) when they are due. A cron in the API runs every minute.

-- One row per device and browser. An endpoint belongs to one user at a time (shared devices).
create table platform.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_id_idx on platform.push_subscriptions (user_id);
alter table platform.push_subscriptions enable row level security;
revoke all on platform.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on platform.push_subscriptions to service_role;
-- Users see and remove their own devices; adding goes through push_subscribe.
grant select (id, endpoint, user_agent, created_at, last_success_at), delete
  on platform.push_subscriptions to authenticated;
create policy push_subscriptions_own_select on platform.push_subscriptions for select
  to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_own_delete on platform.push_subscriptions for delete
  to authenticated using (user_id = (select auth.uid()));

-- Reminders an app scheduled for the current user; released into notifications when due.
create table platform.scheduled_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  key text not null check (char_length(key) between 1 and 200),
  due_at timestamptz not null,
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 500),
  url text check (url is null or url ~ '^/'),
  created_at timestamptz not null default now(),
  unique (user_id, app_slug, key)
);
create index scheduled_pushes_due_idx on platform.scheduled_pushes (due_at);
create index scheduled_pushes_app_slug_idx on platform.scheduled_pushes (app_slug);
alter table platform.scheduled_pushes enable row level security;
revoke all on platform.scheduled_pushes from public, anon, authenticated;
grant select, insert, update, delete on platform.scheduled_pushes to service_role;

-- New notifications wait for delivery; rows from before this migration stay null (not pushed).
alter table platform.notifications add column push_pending boolean;
alter table platform.notifications alter column push_pending set default true;
create index notifications_push_pending_idx on platform.notifications (created_at)
  where push_pending;

-- Registers this device for the caller (moving it away from a previous user of the device).
create function platform.push_subscribe(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into platform.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now(), last_success_at = null;
end;
$$;

-- Whether the caller has at least one device with notifications on (for mn.push.status).
create function platform.push_device_count() returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from platform.push_subscriptions where user_id = (select auth.uid());
$$;

-- Schedules (or reschedules, same key) a reminder from the calling app.
create function platform.push_schedule(
  p_app_slug text, p_key text, p_due_at timestamptz, p_title text,
  p_body text default null, p_url text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select platform.app_access(p_app_slug)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_due_at > now() + interval '400 days' then
    raise exception 'due_at too far in the future' using errcode = '22023';
  end if;
  if (select count(*) from platform.scheduled_pushes
      where user_id = (select auth.uid()) and app_slug = p_app_slug and key <> p_key) >= 500 then
    raise exception 'too many scheduled reminders' using errcode = '54000';
  end if;
  insert into platform.scheduled_pushes (user_id, app_slug, key, due_at, title, body, url)
  values ((select auth.uid()), p_app_slug, p_key, p_due_at, p_title, p_body, p_url)
  on conflict (user_id, app_slug, key) do update
    set due_at = excluded.due_at, title = excluded.title, body = excluded.body,
        url = excluded.url, created_at = now();
end;
$$;

create function platform.push_cancel(p_app_slug text, p_key text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select platform.app_access(p_app_slug)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from platform.scheduled_pushes
  where user_id = (select auth.uid()) and app_slug = p_app_slug and key = p_key;
end;
$$;

create function platform.push_list(p_app_slug text)
returns table (key text, due_at timestamptz, title text, body text, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select platform.app_access(p_app_slug)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select s.key, s.due_at, s.title, s.body, s.url
    from platform.scheduled_pushes s
    where s.user_id = (select auth.uid()) and s.app_slug = p_app_slug
    order by s.due_at;
end;
$$;

-- API cron: moves due reminders into the bell (as pending pushes). Reminders of users who lost
-- access to the app are dropped.
create function platform.push_release_due() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    delete from platform.scheduled_pushes s
    where s.id in (
      select id from platform.scheduled_pushes
      where due_at <= now()
      order by due_at
      limit 500
      for update skip locked
    )
    returning s.user_id, s.app_slug, s.title, s.body, s.url
  )
  insert into platform.notifications (user_id, app_slug, title, body, url)
  select d.user_id, d.app_slug, d.title, d.body, d.url
  from due d
  join platform.apps a on a.slug = d.app_slug and a.status <> 'disabled'
  join platform.profiles p on p.user_id = d.user_id and p.role = any (a.allowed_roles)
  where p.role = 'admin'
    or exists (
      select 1 from platform.app_grants g where g.user_id = d.user_id and g.app_slug = d.app_slug
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- API cron: claims up to p_limit notifications to push (each exactly once).
create function platform.push_claim(p_limit integer default 200)
returns table (id uuid, user_id uuid, app_slug text, title text, body text, url text)
language sql
security definer
set search_path = ''
as $$
  update platform.notifications n
  set push_pending = false
  where n.id in (
    select id from platform.notifications
    where push_pending
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning n.id, n.user_id, n.app_slug, n.title, n.body, n.url;
$$;

revoke execute on function platform.push_subscribe(text, text, text, text) from public, anon;
revoke execute on function platform.push_device_count() from public, anon;
revoke execute on function platform.push_schedule(text, text, timestamptz, text, text, text) from public, anon;
revoke execute on function platform.push_cancel(text, text) from public, anon;
revoke execute on function platform.push_list(text) from public, anon;
revoke execute on function platform.push_release_due() from public, anon, authenticated;
revoke execute on function platform.push_claim(integer) from public, anon, authenticated;
grant execute on function platform.push_subscribe(text, text, text, text) to authenticated;
grant execute on function platform.push_device_count() to authenticated;
grant execute on function platform.push_schedule(text, text, timestamptz, text, text, text) to authenticated;
grant execute on function platform.push_cancel(text, text) to authenticated;
grant execute on function platform.push_list(text) to authenticated;
grant execute on function platform.push_release_due() to service_role;
grant execute on function platform.push_claim(integer) to service_role;
