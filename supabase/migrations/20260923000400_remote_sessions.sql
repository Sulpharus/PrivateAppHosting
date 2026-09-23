-- Remote app sessions and the per-app queue. A Windows RemoteApp allows one active session,
-- so each remote app has at most one `active` row; everyone else waits as `queued`.
-- All writes go through the API (service role); users read a sanitized status view via RPC.

create table platform.remote_sessions (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'active', 'ended')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  last_seen_at timestamptz,
  ended_at timestamptz,
  end_reason text
);
create unique index remote_sessions_one_active_idx on platform.remote_sessions (app_slug)
  where status = 'active';
create unique index remote_sessions_one_open_per_user_idx on platform.remote_sessions (app_slug, user_id)
  where status in ('queued', 'active');
create index remote_sessions_user_idx on platform.remote_sessions (user_id);
create index remote_sessions_queue_idx on platform.remote_sessions (app_slug, created_at)
  where status = 'queued';

alter table platform.remote_sessions enable row level security;
grant select on platform.remote_sessions to authenticated;
grant all on platform.remote_sessions to service_role;
create policy remote_sessions_select on platform.remote_sessions for select to authenticated
  using (user_id = (select auth.uid()) or (select platform.is_admin()));

-- Status of every remote app the caller may use, including who is connected (display name only)
-- and the caller's own queue position.
create function platform.remote_status()
returns table (
  app_slug text,
  active_user_name text,
  active_since timestamptz,
  is_mine boolean,
  queue_length integer,
  my_position integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.slug,
    p.display_name,
    s.started_at,
    coalesce(s.user_id = (select auth.uid()), false),
    (select count(*)::integer from platform.remote_sessions q
      where q.app_slug = a.slug and q.status = 'queued'),
    (select q.pos::integer from (
        select q2.user_id, row_number() over (order by q2.created_at) as pos
        from platform.remote_sessions q2
        where q2.app_slug = a.slug and q2.status = 'queued'
      ) q where q.user_id = (select auth.uid()))
  from platform.apps a
  left join platform.remote_sessions s on s.app_slug = a.slug and s.status = 'active'
  left join platform.profiles p on p.user_id = s.user_id
  where a.kind = 'remote' and (select platform.has_grant(a.slug));
$$;
revoke execute on function platform.remote_status() from public, anon;
grant execute on function platform.remote_status() to authenticated;

-- Queue or activate a session for the given user. Returns the session row.
-- Called by the API after it checked grant, role and step-up.
create function platform.remote_request(p_app_slug text, p_user_id uuid)
returns platform.remote_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row platform.remote_sessions;
begin
  perform pg_advisory_xact_lock(hashtext('platform.remote:' || p_app_slug));

  select * into v_row from platform.remote_sessions
    where app_slug = p_app_slug and user_id = p_user_id and status in ('queued', 'active');
  if found then
    return v_row;
  end if;

  insert into platform.remote_sessions (app_slug, user_id, status, started_at, last_seen_at)
  select p_app_slug, p_user_id,
    case when exists (select 1 from platform.remote_sessions
      where app_slug = p_app_slug and status in ('active', 'queued')) then 'queued' else 'active' end,
    null, now()
  returning * into v_row;

  if v_row.status = 'active' then
    update platform.remote_sessions set started_at = now() where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- Ends a session and promotes the next queued user. Returns the promoted session, if any.
create function platform.remote_end(p_session_id uuid, p_reason text default 'disconnected')
returns platform.remote_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app text;
  v_next platform.remote_sessions;
begin
  select app_slug into v_app from platform.remote_sessions where id = p_session_id;
  if v_app is null then
    raise exception 'unknown session' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('platform.remote:' || v_app));

  update platform.remote_sessions
  set status = 'ended', ended_at = now(), end_reason = p_reason
  where id = p_session_id and status in ('queued', 'active');

  if not exists (select 1 from platform.remote_sessions where app_slug = v_app and status = 'active') then
    update platform.remote_sessions
    set status = 'active', started_at = now(), last_seen_at = now()
    where id = (
      select id from platform.remote_sessions
      where app_slug = v_app and status = 'queued'
      order by created_at limit 1
    )
    returning * into v_next;
  end if;
  return v_next;
end;
$$;

-- Ends sessions without a heartbeat for `p_idle` (the idle policy) and promotes waiters.
create function platform.remote_expire_idle(p_idle interval default interval '15 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from platform.remote_sessions
    where status in ('active', 'queued') and coalesce(last_seen_at, created_at) < now() - p_idle
  loop
    perform platform.remote_end(v_id, 'idle');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function platform.remote_request(text, uuid) from public, anon, authenticated;
revoke execute on function platform.remote_end(uuid, text) from public, anon, authenticated;
revoke execute on function platform.remote_expire_idle(interval) from public, anon, authenticated;
grant execute on function platform.remote_request(text, uuid) to service_role;
grant execute on function platform.remote_end(uuid, text) to service_role;
grant execute on function platform.remote_expire_idle(interval) to service_role;
