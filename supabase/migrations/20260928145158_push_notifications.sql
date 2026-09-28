-- Push notifications (ADR 0005). Devices subscribe through the portal's service worker; the API
-- delivers every new bell notification to the user's devices (Web Push, VAPID) and releases
-- scheduled reminders (`mn.push.schedule`) when they are due. A cron in the API runs every minute.

-- One row per device and browser. An endpoint belongs to one user at a time (shared devices).
-- Only the browsers' push services are accepted, so the API never posts to arbitrary hosts.
create table platform.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (
    char_length(endpoint) <= 1000
    and endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
  ),
  -- base64url of the 65-byte P-256 key and the 16-byte auth secret
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  -- Refusals (401/403) in a row, e.g. after a VAPID key change; the API deletes it at five.
  rejected_count smallint not null default 0
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
  -- An app path; never `//host` or `/\host`, which browsers read as another site.
  url text check (url is null or url ~ '^/($|[^/\\])'),
  created_at timestamptz not null default now(),
  unique (user_id, app_slug, key)
);
create index scheduled_pushes_due_idx on platform.scheduled_pushes (due_at);
create index scheduled_pushes_app_slug_idx on platform.scheduled_pushes (app_slug);
alter table platform.scheduled_pushes enable row level security;
revoke all on platform.scheduled_pushes from public, anon, authenticated;
grant select, insert, update, delete on platform.scheduled_pushes to service_role;

-- New notifications wait for delivery; rows from before this migration stay null (not pushed).
-- A failed send puts the row back (push_attempts counts tries, at most three).
alter table platform.notifications add column push_pending boolean;
alter table platform.notifications alter column push_pending set default true;
alter table platform.notifications add column push_attempts smallint not null default 0;
-- Same rule for bell links (checked for new rows; older rows are left as they are).
alter table platform.notifications
  add constraint notifications_url_no_other_host
  check (url is null or url !~ '^/[/\\]') not valid;
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
  -- At most ten devices per user: the oldest go.
  delete from platform.push_subscriptions
  where id in (
    select id from platform.push_subscriptions
    where user_id = (select auth.uid())
    order by created_at desc
    offset 10
  );
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
  if p_url is not null and p_url !~ '^/($|[^/\\])' then
    raise exception 'url must be an app path' using errcode = '22023';
  end if;
  if p_due_at > now() + interval '400 days' then
    raise exception 'due_at too far in the future' using errcode = '22023';
  end if;
  -- Serialise per user and app so concurrent calls cannot pass the limit together.
  perform pg_advisory_xact_lock(hashtext('push_schedule:' || (select auth.uid())::text || ':' || p_app_slug));
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

-- API cron: claims up to p_limit notifications to push. Older than an hour means the moment has
-- passed (e.g. push was not configured yet): those are marked done without being sent.
create function platform.push_claim(p_limit integer default 20)
returns table (id uuid, user_id uuid, app_slug text, title text, body text, url text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update platform.notifications
  set push_pending = false
  where push_pending and created_at < now() - interval '1 hour';

  return query
    update platform.notifications n
    set push_pending = false, push_attempts = n.push_attempts + 1
    where n.id in (
      select x.id from platform.notifications x
      where x.push_pending
      order by x.created_at
      limit p_limit
      for update skip locked
    )
    returning n.id, n.user_id, n.app_slug, n.title, n.body, n.url;
end;
$$;

-- API cron: puts notifications back that could not be sent (transient errors, send budget).
-- `p_count_attempt = false` for ones that were not even tried.
create function platform.push_unclaim(p_ids uuid[], p_count_attempt boolean default true)
returns void
language sql
security definer
set search_path = ''
as $$
  update platform.notifications
  set push_pending = push_attempts < 3 or not p_count_attempt,
      push_attempts = case when p_count_attempt then push_attempts else push_attempts - 1 end
  where id = any (p_ids);
$$;

revoke execute on function platform.push_subscribe(text, text, text, text) from public, anon;
revoke execute on function platform.push_device_count() from public, anon;
revoke execute on function platform.push_schedule(text, text, timestamptz, text, text, text) from public, anon;
revoke execute on function platform.push_cancel(text, text) from public, anon;
revoke execute on function platform.push_list(text) from public, anon;
revoke execute on function platform.push_release_due() from public, anon, authenticated;
revoke execute on function platform.push_claim(integer) from public, anon, authenticated;
revoke execute on function platform.push_unclaim(uuid[], boolean) from public, anon, authenticated;
grant execute on function platform.push_subscribe(text, text, text, text) to authenticated;
grant execute on function platform.push_device_count() to authenticated;
grant execute on function platform.push_schedule(text, text, timestamptz, text, text, text) to authenticated;
grant execute on function platform.push_cancel(text, text) to authenticated;
grant execute on function platform.push_list(text) to authenticated;
grant execute on function platform.push_release_due() to service_role;
grant execute on function platform.push_claim(integer) to service_role;
grant execute on function platform.push_unclaim(uuid[], boolean) to service_role;
