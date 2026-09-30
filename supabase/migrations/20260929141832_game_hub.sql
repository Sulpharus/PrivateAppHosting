-- Gaming Hub (ADR 0009): one username for all games, playtime per game and the results games
-- report. Games are apps with a `game` block in their manifest. Apps write only through the
-- functions below, which take the app from the calling origin (calling_app), so a game can
-- neither report for another game nor for another user. The portal reads the caller's own
-- figures; leaderboards show usernames only, and only people who chose one appear there.

create table platform.game_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.-]{3,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index game_profiles_username_key on platform.game_profiles (lower(username));

create table platform.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seconds integer not null default 0 check (seconds between 0 and 43200),
  -- set when a newer session of the same game starts; closed sessions earn no more time
  closed_at timestamptz
);
create index game_sessions_user_app_idx on platform.game_sessions (user_id, app_slug, started_at desc);
create index game_sessions_app_idx on platform.game_sessions (app_slug);

create table platform.game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade,
  at timestamptz not null default now(),
  outcome text not null check (outcome in ('win', 'loss', 'draw', 'done')),
  stats jsonb not null default '{}' check (jsonb_typeof(stats) = 'object'),
  seconds integer check (seconds between 0 and 86400)
);
create index game_results_app_user_idx on platform.game_results (app_slug, user_id);
create index game_results_user_app_at_idx on platform.game_results (user_id, app_slug, at desc);
create index game_results_user_at_idx on platform.game_results (user_id, at desc);

-- Only the functions below touch these tables.
alter table platform.game_profiles enable row level security;
alter table platform.game_sessions enable row level security;
alter table platform.game_results enable row level security;
alter table platform.game_profiles force row level security;
alter table platform.game_sessions force row level security;
alter table platform.game_results force row level security;
revoke all on platform.game_profiles, platform.game_sessions, platform.game_results
  from public, anon, authenticated;
grant all on platform.game_profiles, platform.game_sessions, platform.game_results
  to service_role;

-- The game the request comes from, if the caller may use it; raises otherwise.
create function platform.calling_game() returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text := (select platform.calling_app());
begin
  if (select auth.uid()) is null or v_slug is null or not (select platform.has_grant(v_slug))
    or not exists (select 1 from platform.apps where slug = v_slug and manifest ? 'game')
  then
    raise exception 'not_a_game' using errcode = '42501';
  end if;
  return v_slug;
end;
$$;

-- ---------- profile ----------

-- The caller's username: read by the portal and by games (to greet the player), not by other
-- apps.
create function platform.game_profile()
returns table (username text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.username from platform.game_profiles g
  where g.user_id = (select auth.uid())
    and (
      (select platform.calling_app()) is null
      or exists (
        select 1 from platform.apps a
        where a.slug = (select platform.calling_app()) and a.manifest ? 'game'
          and (select platform.has_grant(a.slug))
      )
    );
$$;

-- Sets or changes the caller's username; null removes it (and with it any leaderboard entry).
-- Only in the portal: no app may rename a player on every leaderboard.
create function platform.game_set_username(p_username text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_username), '');
begin
  if (select auth.uid()) is null or (select platform.calling_app()) is not null
    or not (select platform.mfa_ok())
  then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name is null then
    delete from platform.game_profiles where user_id = (select auth.uid());
    return;
  end if;
  if v_name !~ '^[A-Za-z0-9_.-]{3,20}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;
  begin
    insert into platform.game_profiles (user_id, username)
    values ((select auth.uid()), v_name)
    on conflict (user_id) do update set username = excluded.username, updated_at = now();
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;
end;
$$;

-- ---------- reported by games ----------

create function platform.game_session_start() returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := (select platform.calling_game());
  v_id uuid;
begin
  -- One live session per player and game: parallel tabs cannot multiply the playtime.
  perform pg_advisory_xact_lock(hashtext('game_session:' || v_slug || ':' || (select auth.uid())::text));
  if (
    select count(*) from platform.game_sessions
    where user_id = (select auth.uid()) and app_slug = v_slug
      and started_at > now() - interval '1 hour'
  ) >= 240 then
    raise exception 'too_many_sessions' using errcode = '54000';
  end if;
  update platform.game_sessions set closed_at = now()
  where user_id = (select auth.uid()) and app_slug = v_slug and closed_at is null;
  insert into platform.game_sessions (user_id, app_slug)
  values ((select auth.uid()), v_slug)
  returning id into v_id;
  return v_id;
end;
$$;

-- Adds the time since the last ping, at most 90 seconds, so a tab left open in the background
-- or a missed ping never counts as hours of play. Returns the session's seconds.
create function platform.game_session_ping(p_session uuid) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := (select platform.calling_game());
  v_seconds integer;
begin
  update platform.game_sessions s
  set seconds = least(
        43200,
        s.seconds + least(90, greatest(0, extract(epoch from now() - s.last_seen_at)))::integer
      ),
      last_seen_at = greatest(s.last_seen_at, now())
  where s.id = p_session and s.user_id = (select auth.uid()) and s.app_slug = v_slug
    and s.closed_at is null
  returning s.seconds into v_seconds;
  if v_seconds is null then
    raise exception 'unknown_session' using errcode = 'P0002';
  end if;
  return v_seconds;
end;
$$;

-- One finished round. Only the stats the manifest declares are kept, and only numbers.
create function platform.game_result(p_outcome text, p_stats jsonb, p_seconds integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := (select platform.calling_game());
  v_stats jsonb;
  v_id uuid;
begin
  if p_outcome not in ('win', 'loss', 'draw', 'done') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('game_result:' || v_slug || ':' || (select auth.uid())::text));
  if (
    select count(*) from platform.game_results
    where user_id = (select auth.uid()) and app_slug = v_slug and at > now() - interval '1 hour'
  ) >= 300 then
    raise exception 'too_many_results' using errcode = '54000';
  end if;
  -- Declared stats only, as numbers within the stat's min and max (min defaults to 0).
  select coalesce(jsonb_object_agg(v.key, v.value), '{}')
  into v_stats
  from (
    select e.key, e.value,
      case when jsonb_typeof(e.value) = 'number' then e.value::numeric end as n,
      coalesce((d ->> 'min')::numeric, 0) as lo,
      coalesce((d ->> 'max')::numeric, 1e12) as hi
    from jsonb_each(case when jsonb_typeof(p_stats) = 'object' then p_stats else '{}' end) e
    join platform.apps a on a.slug = v_slug
    cross join lateral (
      select d from jsonb_array_elements(a.manifest -> 'game' -> 'stats') d
      where d ->> 'id' = e.key
      limit 1
    ) def
  ) v
  where v.n is not null and v.n between v.lo and v.hi;
  insert into platform.game_results (user_id, app_slug, outcome, stats, seconds)
  values (
    (select auth.uid()), v_slug, p_outcome, v_stats,
    case when p_seconds between 0 and 86400 then p_seconds end
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- read by the hub (portal) and by games ----------

-- Every game the caller may play, with their own playtime, results and records.
create function platform.game_hub()
returns table (
  slug text, name text, genre text, players text, stats jsonb, seconds bigint,
  sessions bigint, last_played timestamptz, results bigint, wins bigint, losses bigint,
  draws bigint, records jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.slug, a.name, a.manifest -> 'game' ->> 'genre',
    coalesce(a.manifest -> 'game' ->> 'players', 'solo'),
    coalesce(a.manifest -> 'game' -> 'stats', '[]'),
    coalesce(ss.seconds, 0), coalesce(ss.sessions, 0),
    greatest(ss.last_seen, rr.last_at),
    coalesce(rr.results, 0), coalesce(rr.wins, 0), coalesce(rr.losses, 0), coalesce(rr.draws, 0),
    coalesce((
      select jsonb_object_agg(d ->> 'id', best.value)
      from jsonb_array_elements(coalesce(a.manifest -> 'game' -> 'stats', '[]')) d
      cross join lateral (
        select case when d ->> 'better' = 'lower'
          then min((r.stats ->> (d ->> 'id'))::numeric)
          else max((r.stats ->> (d ->> 'id'))::numeric) end as value
        from platform.game_results r
        where r.app_slug = a.slug and r.user_id = (select auth.uid()) and r.stats ? (d ->> 'id')
      ) best
      where best.value is not null
    ), '{}')
  from platform.apps a
  left join lateral (
    select sum(s.seconds) as seconds, count(*) as sessions, max(s.last_seen_at) as last_seen
    from platform.game_sessions s
    where s.app_slug = a.slug and s.user_id = (select auth.uid())
  ) ss on true
  left join lateral (
    select count(*) as results, count(*) filter (where r.outcome = 'win') as wins,
      count(*) filter (where r.outcome = 'loss') as losses,
      count(*) filter (where r.outcome = 'draw') as draws, max(r.at) as last_at
    from platform.game_results r
    where r.app_slug = a.slug and r.user_id = (select auth.uid())
  ) rr on true
  where a.manifest ? 'game' and a.status <> 'disabled' and (select platform.has_grant(a.slug))
    -- the portal sees every game; a game sees only itself
    and coalesce((select platform.calling_app()), a.slug) = a.slug
  order by a.name;
$$;

-- Seconds played and rounds finished per day (Berlin time) since p_from, for the activity chart
-- and the streak.
create function platform.game_days(p_from date)
returns table (day date, seconds bigint, results bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select d.day, coalesce(sum(d.seconds), 0)::bigint, coalesce(sum(d.results), 0)::bigint
  from (
    select (s.started_at at time zone 'Europe/Berlin')::date as day, s.seconds::bigint as seconds,
      0::bigint as results
    from platform.game_sessions s
    where s.user_id = (select auth.uid()) and s.started_at >= p_from - 1
    union all
    select (r.at at time zone 'Europe/Berlin')::date, 0, 1
    from platform.game_results r
    where r.user_id = (select auth.uid()) and r.at >= p_from - 1
  ) d
  where d.day >= p_from
    -- across all games: the portal only
    and (select platform.calling_app()) is null
  group by d.day
  order by d.day;
$$;

-- The caller's latest rounds, optionally of one game.
create function platform.game_recent(p_slug text default null, p_limit integer default 20)
returns table (
  id uuid, app_slug text, name text, at timestamptz, outcome text, stats jsonb, seconds integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.app_slug, a.name, r.at, r.outcome, r.stats, r.seconds
  from platform.game_results r
  join platform.apps a on a.slug = r.app_slug
  where r.user_id = (select auth.uid())
    and (p_slug is null or r.app_slug = p_slug)
    and coalesce((select platform.calling_app()), r.app_slug) = r.app_slug
  order by r.at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- Best value per player for one stat of one game. Only people with a username appear. Asked
-- from the portal or from the game itself, by someone who may play it.
create function platform.game_leaderboard(p_slug text, p_stat text, p_limit integer default 10)
returns table (rank bigint, username text, value numeric, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with def as (
    select d ->> 'better' as better
    from platform.apps a, jsonb_array_elements(a.manifest -> 'game' -> 'stats') d
    where a.slug = p_slug and d ->> 'id' = p_stat
    limit 1
  ),
  best as (
    select r.user_id,
      case when (select better from def) = 'lower'
        then min((r.stats ->> p_stat)::numeric) else max((r.stats ->> p_stat)::numeric) end as value
    from platform.game_results r
    where r.app_slug = p_slug and r.stats ? p_stat
    group by r.user_id
  )
  select rank() over (order by case when (select better from def) = 'lower' then b.value
      else -b.value end),
    g.username, b.value, b.user_id = (select auth.uid())
  from best b
  join platform.game_profiles g on g.user_id = b.user_id
  where exists (select 1 from def)
    and (select platform.has_grant(p_slug))
    and coalesce((select platform.calling_app()), p_slug) = p_slug
  order by 1
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function
  platform.calling_game(), platform.game_profile(), platform.game_set_username(text),
  platform.game_session_start(), platform.game_session_ping(uuid),
  platform.game_result(text, jsonb, integer), platform.game_hub(), platform.game_days(date),
  platform.game_recent(text, integer), platform.game_leaderboard(text, text, integer)
  from public, anon;
grant execute on function
  platform.game_profile(), platform.game_set_username(text),
  platform.game_session_start(), platform.game_session_ping(uuid),
  platform.game_result(text, jsonb, integer), platform.game_hub(), platform.game_days(date),
  platform.game_recent(text, integer), platform.game_leaderboard(text, text, integer)
  to authenticated;
