-- Google Calendar sync for the Kalender app (ADR 0010). Per user, the API Worker mirrors chosen
-- calendar sources into a Google calendar "MiniNode" (push) and brings the user's Google
-- calendars in as calendars of the family `kalender` (pull), both ways. Everything here is
-- called by the API with the service role; users reach it only through the API.

create table platform.gcal_sync (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  -- Kalender source ids mirrored into Google: `col:<collection>` or `app:<slug>:<type>`.
  push_sources text[] not null default '{}' check (cardinality(push_sources) <= 100),
  -- Google id of the calendar "MiniNode" and the sync token for changes made there.
  target_calendar_id text,
  target_sync_token text,
  status text not null default 'idle' check (status in ('idle', 'running', 'error')),
  error text,
  locked_until timestamptz,
  last_sync_at timestamptz,
  requested_at timestamptz,
  updated_at timestamptz not null default now()
);

-- The user's Google calendars; each enabled one becomes a collection.
create table platform.gcal_calendars (
  user_id uuid not null references auth.users (id) on delete cascade,
  google_id text not null,
  name text not null,
  color text,
  writable boolean not null default false,
  enabled boolean not null default true,
  collection_id uuid references platform.collections (id) on delete set null,
  sync_token text,
  primary key (user_id, google_id)
);

-- Which Google event a record is. `push`: mirrored into "MiniNode"; `pull`: from a Google
-- calendar. `synced_version` is the record version Google has (-1: push again).
create table platform.gcal_links (
  user_id uuid not null references auth.users (id) on delete cascade,
  record_id uuid not null references platform.records (id) on delete cascade,
  google_calendar_id text not null,
  google_event_id text not null,
  etag text,
  synced_version integer not null,
  kind text not null check (kind in ('push', 'pull')),
  primary key (user_id, record_id),
  unique (user_id, google_calendar_id, google_event_id)
);
create index gcal_links_record on platform.gcal_links (record_id);

alter table platform.gcal_sync enable row level security;
alter table platform.gcal_calendars enable row level security;
alter table platform.gcal_links enable row level security;
revoke all on platform.gcal_sync, platform.gcal_calendars, platform.gcal_links
  from public, anon, authenticated;
grant all on platform.gcal_sync, platform.gcal_calendars, platform.gcal_links to service_role;

create trigger gcal_sync_touch before update on platform.gcal_sync
  for each row execute function platform.touch_updated_at();

-- Fields a Google event owns in `data`; other keys (colour, link) stay as MiniNode set them.
create function platform.gcal_managed_data(p_data jsonb) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_data, '{}') - 'all_day' - 'description' - 'status' - 'recurrence' - 'reminders';
$$;

-- Whether the user may change the record from the calendar (own event, editor or owner).
create function platform.gcal_editable(p_user uuid, p_record platform.records) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_record.type = 'event'
    and coalesce(p_record.created_by_app, 'kalender') = 'kalender'
    and exists (
      select 1 from platform.collection_members m
      join platform.collections c on c.id = m.collection_id and c.deleted_at is null
      where m.collection_id = p_record.collection_id and m.user_id = p_user
        and m.role in ('owner', 'editor'));
$$;

-- The user's personal Kalender collection, created on first use.
create function platform.gcal_personal(p_user uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from platform.collections
  where owner_id = p_user and family = 'kalender' and personal;
  if v_id is null then
    insert into platform.collections (name, family, owner_id, personal)
    select personal_name, 'kalender', p_user, true
    from platform.collection_families where family = 'kalender'
    on conflict (owner_id, family) where personal do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from platform.collections
      where owner_id = p_user and family = 'kalender' and personal;
    else
      insert into platform.collection_members (collection_id, user_id, role)
      values (v_id, p_user, 'owner');
    end if;
  end if;
  return v_id;
end;
$$;

-- Starts a sync: locks the user's row for five minutes. Null when disabled or already running.
create function platform.gcal_begin(p_user uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v platform.gcal_sync;
begin
  update platform.gcal_sync set status = 'running', locked_until = now() + interval '5 minutes'
  where user_id = p_user and enabled and (locked_until is null or locked_until < now())
  returning * into v;
  if not found then return null; end if;
  return to_jsonb(v) || jsonb_build_object('calendars', (
    select coalesce(jsonb_agg(to_jsonb(c)), '[]') from platform.gcal_calendars c
    where c.user_id = p_user));
end;
$$;

create function platform.gcal_finish(p_user uuid, p_error text) returns void
language sql
security definer
set search_path = ''
as $$
  update platform.gcal_sync set
    status = case when p_error is null then 'idle' else 'error' end,
    error = p_error,
    locked_until = null,
    last_sync_at = case when p_error is null then now() else last_sync_at end
  where user_id = p_user;
$$;

-- Switches one Google calendar off (its collection and events go to the bin) or on again.
create function platform.gcal_set_calendar(p_user uuid, p_google_id text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col uuid;
begin
  select collection_id into v_col from platform.gcal_calendars
  where user_id = p_user and google_id = p_google_id;
  if not p_enabled and v_col is not null then
    update platform.records set deleted_at = now(), version = version + 1, updated_at = now()
    where collection_id = v_col and deleted_at is null;
    update platform.collections set deleted_at = now() where id = v_col;
  end if;
  if not p_enabled then
    delete from platform.gcal_links where user_id = p_user and google_calendar_id = p_google_id;
  end if;
  update platform.gcal_calendars set enabled = p_enabled,
    collection_id = case when p_enabled then collection_id else null end,
    sync_token = case when p_enabled then sync_token else null end
  where user_id = p_user and google_id = p_google_id;
end;
$$;

-- Switches the sync off: Google calendars leave MiniNode, "MiniNode" stays in Google as it is.
create function platform.gcal_disable(p_user uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  for v_id in select google_id from platform.gcal_calendars where user_id = p_user loop
    perform platform.gcal_set_calendar(p_user, v_id, false);
  end loop;
  delete from platform.gcal_calendars where user_id = p_user;
  delete from platform.gcal_links where user_id = p_user;
  update platform.gcal_sync set enabled = false, target_sync_token = null, status = 'idle',
    error = null, locked_until = null
  where user_id = p_user;
end;
$$;

-- Stores the target calendar and the user's Google calendar list ([{google_id, name, color,
-- writable}]); enabled calendars get a collection. Returns the calendars.
create function platform.gcal_calendars_sync(p_user uuid, p_target text, p_list jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal platform.gcal_calendars;
  v_col uuid;
begin
  if jsonb_typeof(p_list) <> 'array' then
    raise exception 'invalid_list' using errcode = '22023';
  end if;
  update platform.gcal_sync set target_calendar_id = p_target,
    target_sync_token = case when target_calendar_id is distinct from p_target then null
      else target_sync_token end
  where user_id = p_user;
  insert into platform.gcal_calendars (user_id, google_id, name, color, writable)
  select p_user, c ->> 'google_id', left(coalesce(nullif(c ->> 'name', ''), 'Google'), 100),
    c ->> 'color', coalesce((c ->> 'writable')::boolean, false)
  from jsonb_array_elements(p_list) c
  where c ->> 'google_id' is not null
  on conflict (user_id, google_id) do update
    set name = excluded.name, color = excluded.color, writable = excluded.writable;
  -- calendars no longer in the Google list leave MiniNode
  for v_cal in select * from platform.gcal_calendars g
    where g.user_id = p_user
      and not exists (select 1 from jsonb_array_elements(p_list) c where c ->> 'google_id' = g.google_id)
  loop
    perform platform.gcal_set_calendar(p_user, v_cal.google_id, false);
    delete from platform.gcal_calendars where user_id = p_user and google_id = v_cal.google_id;
  end loop;
  -- enabled calendars without a (live) collection get one
  for v_cal in select g.* from platform.gcal_calendars g
    left join platform.collections c on c.id = g.collection_id and c.deleted_at is null
    where g.user_id = p_user and g.enabled and c.id is null
  loop
    insert into platform.collections (name, family, owner_id, personal, color)
    values (v_cal.name, 'kalender', p_user, false, v_cal.color)
    returning id into v_col;
    insert into platform.collection_members (collection_id, user_id, role)
    values (v_col, p_user, case when v_cal.writable then 'owner' else 'viewer' end);
    update platform.gcal_calendars set collection_id = v_col, sync_token = null
    where user_id = p_user and google_id = v_cal.google_id;
  end loop;
  return (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from platform.gcal_calendars g
    where g.user_id = p_user);
end;
$$;

-- Writes a record from Google: new ones into p_collection, existing ones by id. Only the
-- fields Google owns change; the data schema still applies.
create function platform.gcal_write(
  p_user uuid, p_collection uuid, p_id uuid, p_fields jsonb, p_source_key text
) returns platform.records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row platform.records;
  v_schema jsonb := (select schema from platform.record_types where type = 'event');
  v_data jsonb;
begin
  if p_id is null then
    v_data := jsonb_strip_nulls(coalesce(p_fields -> 'data', '{}'));
    if not extensions.jsonb_matches_schema(v_schema::json, v_data) then
      raise exception 'invalid_data' using errcode = '22023';
    end if;
    insert into platform.records (type, collection_id, title, starts_at, ends_at, place_name, data,
      source_app, source_key, created_by, created_by_app, updated_by_app, field_sources,
      identity_hash)
    values ('event', p_collection, p_fields ->> 'title', (p_fields ->> 'starts_at')::timestamptz,
      (p_fields ->> 'ends_at')::timestamptz, p_fields ->> 'place_name', v_data, 'google',
      p_source_key, p_user, 'kalender', 'kalender', '{}',
      platform.identity_hash('event', p_fields || jsonb_build_object('data', v_data)))
    returning * into v_row;
  else
    select * into v_row from platform.records where id = p_id for update;
    v_data := jsonb_strip_nulls(platform.gcal_managed_data(v_row.data)
      || coalesce(p_fields -> 'data', '{}'));
    if not extensions.jsonb_matches_schema(v_schema::json, v_data) then
      raise exception 'invalid_data' using errcode = '22023';
    end if;
    update platform.records set title = p_fields ->> 'title',
      starts_at = (p_fields ->> 'starts_at')::timestamptz,
      ends_at = (p_fields ->> 'ends_at')::timestamptz,
      place_name = p_fields ->> 'place_name', data = v_data, updated_by_app = 'kalender',
      identity_hash = platform.identity_hash('event', p_fields || jsonb_build_object('data', v_data)),
      version = version + 1, updated_at = now()
    where id = p_id
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- Applies changed Google events of one calendar (kind `pull`: a Google calendar; `push`: the
-- calendar "MiniNode") and stores the next sync token. Items: {event_id, etag, updated,
-- deleted, record_id?, master_event_id?, exdate_key?, fields?}. With p_full, events of a pulled
-- calendar that Google no longer lists go to the bin. Returns {applied, skipped}.
create function platform.gcal_apply(
  p_user uuid, p_calendar text, p_kind text, p_items jsonb, p_sync_token text, p_full boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col uuid;
  v_item jsonb;
  v_link platform.gcal_links;
  v_rec platform.records;
  v_row platform.records;
  v_seen text[] := '{}';
  v_applied integer := 0;
  v_skipped integer := 0;
begin
  if p_kind = 'pull' then
    select collection_id into v_col from platform.gcal_calendars
    where user_id = p_user and google_id = p_calendar and enabled;
    if v_col is null then
      raise exception 'unknown_calendar' using errcode = 'P0002';
    end if;
  elsif p_kind = 'push' then
    v_col := platform.gcal_personal(p_user);
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    begin
      v_seen := v_seen || (v_item ->> 'event_id');
      v_link := null;
      v_rec := null;

      -- one occurrence changed or cancelled: exclude it from its series
      if v_item ->> 'master_event_id' is not null and v_item ->> 'exdate_key' is not null then
        select * into v_link from platform.gcal_links
        where user_id = p_user and google_calendar_id = p_calendar
          and google_event_id = v_item ->> 'master_event_id';
        if found then
          update platform.records set
            data = jsonb_set(data, '{recurrence,exdates}',
              coalesce(data #> '{recurrence,exdates}', '[]') || to_jsonb(v_item ->> 'exdate_key')),
            version = version + 1, updated_at = now()
          where id = v_link.record_id and data ? 'recurrence'
            and not coalesce(data #> '{recurrence,exdates}', '[]') ? (v_item ->> 'exdate_key')
          returning * into v_row;
          if found and v_link.synced_version = v_row.version - 1 then
            update platform.gcal_links set synced_version = v_row.version
            where user_id = p_user and record_id = v_row.id;
          end if;
        end if;
        v_link := null;
        if coalesce((v_item ->> 'deleted')::boolean, false) then
          v_applied := v_applied + 1;
          continue;
        end if;
      end if;

      select * into v_link from platform.gcal_links
      where user_id = p_user and google_calendar_id = p_calendar
        and google_event_id = v_item ->> 'event_id';
      if found then
        select * into v_rec from platform.records where id = v_link.record_id;
      elsif p_kind = 'push' and v_item ->> 'record_id' is not null then
        -- a MiniNode record whose link was lost (sync switched off and on): link it again
        insert into platform.gcal_links (user_id, record_id, google_calendar_id, google_event_id,
          etag, synced_version, kind)
        select p_user, r.id, p_calendar, v_item ->> 'event_id', v_item ->> 'etag', -1, 'push'
        from platform.records r
        join platform.collection_members m on m.collection_id = r.collection_id and m.user_id = p_user
        where r.id::text = v_item ->> 'record_id'
        on conflict do nothing;
        v_applied := v_applied + 1;
        continue;
      end if;

      if coalesce((v_item ->> 'deleted')::boolean, false) then
        if v_link.record_id is not null then
          if p_kind = 'pull' or platform.gcal_editable(p_user, v_rec) then
            update platform.records set deleted_at = now(), version = version + 1, updated_at = now()
            where id = v_link.record_id and deleted_at is null;
          end if;
          -- app records deleted in Google come back with the next push
          delete from platform.gcal_links where user_id = p_user and record_id = v_link.record_id;
        end if;
        v_applied := v_applied + 1;
        continue;
      end if;

      if v_link.record_id is not null then
        if v_rec.deleted_at is not null or v_link.etag = v_item ->> 'etag' then
          -- deleted here (the push removes it in Google), or our own write coming back
          v_skipped := v_skipped + 1;
          continue;
        end if;
        if p_kind = 'push' and not platform.gcal_editable(p_user, v_rec) then
          -- another app's record changed in Google: MiniNode's version wins
          update platform.gcal_links set synced_version = -1
          where user_id = p_user and record_id = v_rec.id;
          v_skipped := v_skipped + 1;
          continue;
        end if;
        if v_rec.version <> v_link.synced_version
           and v_rec.updated_at > coalesce((v_item ->> 'updated')::timestamptz, '-infinity') then
          -- changed here more recently: the push sends MiniNode's version
          v_skipped := v_skipped + 1;
          continue;
        end if;
        v_row := platform.gcal_write(p_user, null, v_rec.id, v_item -> 'fields', null);
        update platform.gcal_links set etag = v_item ->> 'etag', synced_version = v_row.version
        where user_id = p_user and record_id = v_rec.id;
      else
        v_row := platform.gcal_write(p_user, v_col, null, v_item -> 'fields', v_item ->> 'event_id');
        -- events made directly in "MiniNode" are pushed once more to get their MiniNode id
        insert into platform.gcal_links (user_id, record_id, google_calendar_id, google_event_id,
          etag, synced_version, kind)
        values (p_user, v_row.id, p_calendar, v_item ->> 'event_id', v_item ->> 'etag',
          case when p_kind = 'push' then -1 else v_row.version end, p_kind);
        if p_kind = 'push' then
          -- it lives in the personal calendar now, which therefore stays mirrored
          update platform.gcal_sync set push_sources = push_sources || ('col:' || v_col)
          where user_id = p_user and not ('col:' || v_col = any (push_sources));
        end if;
      end if;
      v_applied := v_applied + 1;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  if p_full and p_kind = 'pull' then
    -- a full list: what Google no longer has is gone
    with gone as (
      update platform.records r set deleted_at = now(), version = version + 1, updated_at = now()
      from platform.gcal_links l
      where l.user_id = p_user and l.google_calendar_id = p_calendar and l.kind = 'pull'
        and l.record_id = r.id and r.deleted_at is null
        and not (l.google_event_id = any (v_seen))
      returning r.id
    )
    delete from platform.gcal_links where user_id = p_user and record_id in (select id from gone);
  end if;

  if p_kind = 'pull' then
    update platform.gcal_calendars set sync_token = p_sync_token
    where user_id = p_user and google_id = p_calendar;
  else
    update platform.gcal_sync set target_sync_token = p_sync_token where user_id = p_user;
  end if;
  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end;
$$;

-- What to send to Google: records of the chosen sources that Google does not have in their
-- current version (into "MiniNode"), records changed here in pulled calendars (back to their
-- Google calendar), and links whose record is gone or no longer chosen. At most p_limit.
create function platform.gcal_push_plan(p_user uuid, p_limit integer) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select * from platform.gcal_sync where user_id = p_user and enabled
  ),
  cols as (
    select m.collection_id, c.color from platform.collection_members m
    join platform.collections c on c.id = m.collection_id and c.deleted_at is null
    where m.user_id = p_user
  ),
  gcols as (
    select collection_id, google_id, writable from platform.gcal_calendars
    where user_id = p_user and collection_id is not null
  ),
  readable as (
    select type from platform.app_type_grants where app_slug = 'kalender'
  ),
  wanted as (
    select r.*, t.calendar as projection, a.name as app_name, cols.color as collection_color
    from platform.records r
    join cols on cols.collection_id = r.collection_id
    join platform.record_types t on t.type = r.type
    left join platform.apps a on a.slug = r.created_by_app
    cross join me
    where r.deleted_at is null
      and t.calendar is not null
      and r.type in (select type from readable)
      and r.collection_id not in (select collection_id from gcols)
      and (
        (coalesce(r.created_by_app, r.source_app, 'kalender') = 'kalender'
          and 'col:' || r.collection_id = any (me.push_sources))
        or (coalesce(r.created_by_app, r.source_app, 'kalender') <> 'kalender'
          and 'app:' || coalesce(r.created_by_app, r.source_app) || ':' || r.type = any (me.push_sources))
      )
      and coalesce(r.starts_at, r.due_at) is not null
      and (r.data ? 'recurrence'
        or coalesce(r.ends_at, r.starts_at, r.due_at) >= now() - interval '30 days')
  ),
  push_up as (
    select jsonb_build_object('kind', 'push', 'record', to_jsonb(w), 'event_id', l.google_event_id,
      'calendar_id', l.google_calendar_id) as op
    from wanted w
    cross join me
    left join platform.gcal_links l on l.user_id = p_user and l.record_id = w.id
    where l.record_id is null or l.synced_version <> w.version
      or l.google_calendar_id is distinct from me.target_calendar_id
  ),
  pull_up as (
    select jsonb_build_object('kind', 'pull', 'record', to_jsonb(r) || jsonb_build_object('projection', 'span'),
      'event_id', l.google_event_id, 'calendar_id', g.google_id) as op
    from platform.records r
    join gcols g on g.collection_id = r.collection_id and g.writable
    left join platform.gcal_links l on l.user_id = p_user and l.record_id = r.id
    where r.deleted_at is null and r.type = 'event'
      and (l.record_id is null or l.synced_version <> r.version)
      and platform.gcal_editable(p_user, r)
  ),
  gone as (
    select jsonb_build_object('record_id', l.record_id, 'calendar_id', l.google_calendar_id,
      'event_id', l.google_event_id, 'kind', l.kind) as op
    from platform.gcal_links l
    left join platform.records r on r.id = l.record_id
    where l.user_id = p_user
      and (r.deleted_at is not null
        or (l.kind = 'push' and l.record_id not in (select id from wanted)))
  )
  select jsonb_build_object(
    'target', (select target_calendar_id from me),
    'prefs', (select value from platform.app_kv
      where app_slug = 'kalender' and owner_id = p_user and key = 'prefs'),
    'deletes', coalesce((select jsonb_agg(op) from (select op from gone limit p_limit) x), '[]'),
    'upserts', coalesce((select jsonb_agg(op) from (
      select op from push_up union all select op from pull_up limit p_limit) x), '[]'));
$$;

-- Stores what the push did: links [{record_id, calendar_id, event_id, etag, version, kind}]
-- and removed links [record_id].
create function platform.gcal_save_links(p_user uuid, p_links jsonb, p_removed jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from platform.gcal_links
  where user_id = p_user
    and record_id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p_removed, '[]')) x);
  insert into platform.gcal_links (user_id, record_id, google_calendar_id, google_event_id, etag,
    synced_version, kind)
  select p_user, (l ->> 'record_id')::uuid, l ->> 'calendar_id', l ->> 'event_id', l ->> 'etag',
    (l ->> 'version')::integer, l ->> 'kind'
  from jsonb_array_elements(coalesce(p_links, '[]')) l
  join platform.records r on r.id = (l ->> 'record_id')::uuid
  on conflict (user_id, record_id) do update set google_calendar_id = excluded.google_calendar_id,
    google_event_id = excluded.google_event_id, etag = excluded.etag,
    synced_version = excluded.synced_version, kind = excluded.kind;
$$;

-- Users whose sync is due: asked for, or not run for five minutes (oldest first).
create function platform.gcal_due(p_limit integer) returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from platform.gcal_sync
  where enabled and (locked_until is null or locked_until < now())
    and (last_sync_at is null or last_sync_at < now() - interval '5 minutes'
      or requested_at > last_sync_at)
  order by coalesce(last_sync_at, '-infinity') limit p_limit;
$$;

revoke execute on function platform.gcal_managed_data(jsonb),
  platform.gcal_editable(uuid, platform.records), platform.gcal_personal(uuid),
  platform.gcal_begin(uuid), platform.gcal_finish(uuid, text),
  platform.gcal_set_calendar(uuid, text, boolean), platform.gcal_disable(uuid),
  platform.gcal_calendars_sync(uuid, text, jsonb),
  platform.gcal_write(uuid, uuid, uuid, jsonb, text),
  platform.gcal_apply(uuid, text, text, jsonb, text, boolean),
  platform.gcal_push_plan(uuid, integer), platform.gcal_save_links(uuid, jsonb, jsonb),
  platform.gcal_due(integer)
  from public, anon, authenticated;
grant execute on function platform.gcal_managed_data(jsonb),
  platform.gcal_editable(uuid, platform.records), platform.gcal_personal(uuid),
  platform.gcal_begin(uuid), platform.gcal_finish(uuid, text),
  platform.gcal_set_calendar(uuid, text, boolean), platform.gcal_disable(uuid),
  platform.gcal_calendars_sync(uuid, text, jsonb),
  platform.gcal_write(uuid, uuid, uuid, jsonb, text),
  platform.gcal_apply(uuid, text, text, jsonb, text, boolean),
  platform.gcal_push_plan(uuid, integer), platform.gcal_save_links(uuid, jsonb, jsonb),
  platform.gcal_due(integer)
  to service_role;
