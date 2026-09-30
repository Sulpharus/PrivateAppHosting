-- Suite core (ADR 0002, phase 4, lean): shared records that several apps read and write, in
-- collections that people can share, with per-app permissions the admin approves.
--
-- Reads go through RLS on platform.records: the caller must be a member of the collection, and
-- the calling app (calling_app, from the page's origin) must have read access to the type.
-- Writes go only through suite_upsert / suite_delete, which check the app's access level,
-- merge duplicates (identity keys), respect field priority between apps and validate `data`
-- against the type's JSON Schema.

create extension if not exists pg_jsonschema with schema extensions;

-- ---------- registry ----------

create table platform.record_types (
  type text primary key check (type ~ '^[a-z][a-z0-9_]{1,40}$'),
  version integer not null default 1,
  label text not null,
  -- personal collections are per family ("Meine Termine", "Meine Aufgaben", …)
  family text not null check (family ~ '^[a-z][a-z0-9_]{1,30}$'),
  -- JSON Schema for `data`
  schema jsonb not null,
  -- identity keys for de-duplication within a collection: common columns or `data.<field>`;
  -- empty means "source key only"
  identity text[] not null default '{}',
  -- how the universal calendar shows it: a span (starts_at..ends_at), a due date, or not at all
  calendar text check (calendar in ('span', 'due'))
);
alter table platform.record_types enable row level security;
revoke all on platform.record_types from public, anon, authenticated;
grant select on platform.record_types to authenticated;
grant all on platform.record_types to service_role;
create policy record_types_read on platform.record_types for select to authenticated using (true);

create table platform.collection_families (
  family text primary key,
  personal_name text not null
);
alter table platform.collection_families enable row level security;
revoke all on platform.collection_families from public, anon, authenticated;
grant select on platform.collection_families to authenticated;
create policy collection_families_read on platform.collection_families
  for select to authenticated using (true);

insert into platform.collection_families (family, personal_name) values
  ('kalender', 'Meine Termine'),
  ('aufgaben', 'Meine Aufgaben'),
  ('sport', 'Mein Sport'),
  ('finanzen', 'Meine Finanzen');

-- Stage 1 time types plus the stage 2 types the first apps need (Sportplaner, Haushalt).
insert into platform.record_types (type, label, family, identity, calendar, schema) values
  ('event', 'Termin', 'kalender', '{title,starts_at}', 'span', '{
    "type": "object", "additionalProperties": false,
    "properties": {
      "all_day": {"type": "boolean"},
      "description": {"type": "string", "maxLength": 10000},
      "recurrence": {"$ref": "#/$defs/recurrence"},
      "reminders": {"type": "array", "maxItems": 10, "items": {"$ref": "#/$defs/reminder"}},
      "url": {"type": "string", "maxLength": 2000},
      "color": {"type": "string", "pattern": "^(blue|green|violet|amber|rose|teal|gray)$"},
      "busy": {"type": "boolean"},
      "visibility": {"enum": ["default", "private"]},
      "status": {"enum": ["confirmed", "tentative", "cancelled"]}
    },
    "$defs": {
      "recurrence": {"type": "object", "additionalProperties": false, "required": ["rrule"],
        "properties": {"rrule": {"type": "string", "maxLength": 500},
          "exdates": {"type": "array", "maxItems": 500, "items": {"type": "string"}},
          "tz": {"type": "string", "maxLength": 60}}},
      "reminder": {"type": "object", "additionalProperties": false, "required": ["offset"],
        "properties": {"offset": {"type": "string", "pattern": "^-?P"}, "channel": {"enum": ["push"]}}}
    }}'),
  ('task', 'Aufgabe', 'aufgaben', '{}', 'due', '{
    "type": "object", "additionalProperties": false,
    "properties": {
      "notes": {"type": "string", "maxLength": 10000},
      "priority": {"type": "integer", "minimum": 1, "maximum": 4},
      "all_day": {"type": "boolean"},
      "recurrence": {"type": "object", "additionalProperties": false, "required": ["rrule"],
        "properties": {"rrule": {"type": "string", "maxLength": 500}}},
      "checklist": {"type": "array", "maxItems": 200, "items": {"type": "object",
        "additionalProperties": false,
        "properties": {"title": {"type": "string", "maxLength": 500}, "done": {"type": "boolean"}}}},
      "project": {"type": "string", "format": "uuid"},
      "reminders": {"type": "array", "maxItems": 10, "items": {"type": "object",
        "additionalProperties": false, "required": ["offset"],
        "properties": {"offset": {"type": "string", "pattern": "^-?P"}}}}
    }}'),
  ('reminder', 'Erinnerung', 'aufgaben', '{}', 'due', '{
    "type": "object", "additionalProperties": false,
    "properties": {"on": {"type": "string", "format": "uuid"}, "repeat": {"type": "string"}}}'),
  ('project', 'Projekt', 'aufgaben', '{title}', 'span', '{
    "type": "object", "additionalProperties": false,
    "properties": {"description": {"type": "string", "maxLength": 10000},
      "color": {"type": "string"}, "archived": {"type": "boolean"}}}'),
  ('activity', 'Sporteinheit', 'sport', '{}', 'span', '{
    "type": "object", "additionalProperties": false,
    "properties": {"sport": {"type": "string", "maxLength": 100},
      "provider": {"type": "string", "maxLength": 200},
      "plan_status": {"enum": ["planned", "done", "cancelled"]},
      "notes": {"type": "string", "maxLength": 5000}}}'),
  ('contract', 'Vertrag', 'finanzen', '{data.provider,title}', 'due', '{
    "type": "object", "additionalProperties": false,
    "properties": {"kind": {"enum": ["subscription", "insurance", "rent", "membership", "utility", "loan", "salary", "other"]},
      "interval": {"enum": ["week", "month", "quarter", "half_year", "year"]},
      "provider": {"type": "string", "maxLength": 200},
      "customer_no": {"type": "string", "maxLength": 100},
      "category": {"type": "string", "maxLength": 100},
      "direction": {"enum": ["expense", "income", "transfer"]}}}'),
  ('transaction', 'Buchung', 'finanzen', '{}', 'span', '{
    "type": "object", "additionalProperties": false,
    "properties": {"kind": {"enum": ["expense", "income", "transfer"]},
      "category": {"type": "string", "maxLength": 100},
      "counterparty": {"type": "string", "maxLength": 200},
      "purpose": {"type": "string", "maxLength": 500}}}');

-- ---------- collections ----------

create table platform.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  family text references platform.collection_families (family),
  owner_id uuid not null references auth.users (id) on delete cascade,
  personal boolean not null default false,
  color text check (color ~ '^(blue|green|violet|amber|rose|teal|gray)$'),
  created_at timestamptz not null default now(),
  -- a deleted shared collection keeps its records in the bin for 30 days
  deleted_at timestamptz
);
create unique index collections_personal_key on platform.collections (owner_id, family) where personal;

create table platform.collection_members (
  collection_id uuid not null references platform.collections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);
create index collection_members_user_idx on platform.collection_members (user_id);

-- ---------- app permissions ----------

create table platform.app_type_requests (
  app_slug text not null references platform.apps (slug) on delete cascade,
  type text not null references platform.record_types (type) on delete cascade,
  access text not null check (access in ('read', 'create', 'write', 'delete')),
  why text not null check (char_length(why) between 1 and 200),
  requested_at timestamptz not null default now(),
  primary key (app_slug, type)
);

create table platform.app_type_grants (
  app_slug text not null references platform.apps (slug) on delete cascade,
  type text not null references platform.record_types (type) on delete cascade,
  access text not null check (access in ('read', 'create', 'write', 'delete')),
  -- lower wins when two apps write the same field; set per type by the admin
  priority integer not null default 1000 check (priority between 1 and 1000),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (app_slug, type)
);

-- ---------- records ----------

create table platform.records (
  id uuid primary key default gen_random_uuid(),
  type text not null references platform.record_types (type),
  collection_id uuid not null references platform.collections (id) on delete cascade,
  title text check (char_length(title) <= 500),
  starts_at timestamptz,
  ends_at timestamptz,
  due_at timestamptz,
  status text check (char_length(status) <= 40),
  amount_cents bigint,
  currency text check (currency ~ '^[A-Z]{3}$'),
  place_name text check (char_length(place_name) <= 300),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 200000),
  source_app text,
  source_key text check (char_length(source_key) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_by_app text,
  updated_by_app text,
  -- which app last wrote which field (`title`, `data.notes`, …)
  field_sources jsonb not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- md5 of the normalised identity values (see identity_hash), for de-duplication
  identity_hash text,
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create unique index records_source_key
  on platform.records (collection_id, source_app, type, source_key) where source_key is not null;
create index records_identity_idx on platform.records (collection_id, type, identity_hash)
  where deleted_at is null and identity_hash is not null;
create index records_collection_type_idx on platform.records (collection_id, type);
create index records_starts_idx on platform.records (collection_id, starts_at) where deleted_at is null;
create index records_due_idx on platform.records (collection_id, due_at) where deleted_at is null;
create index records_recurring_idx on platform.records (collection_id)
  where deleted_at is null and data ? 'recurrence';

-- ---------- helpers ----------

create function platform.access_level(p_access text) returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_access when 'read' then 1 when 'create' then 2 when 'write' then 3
    when 'delete' then 4 else 0 end;
$$;

-- The calling app's access level to a type (0 without an approved grant or outside an app).
create function platform.suite_access(p_type text) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select platform.access_level(g.access)
    from platform.app_type_grants g
    where g.app_slug = (select platform.calling_app()) and g.type = p_type
      and (select platform.has_grant(g.app_slug))
  ), 0);
$$;

-- The calling app's best access level to any type of a family (collections are per family).
create function platform.suite_family_access(p_family text) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(platform.access_level(g.access)), 0)
  from platform.app_type_grants g
  join platform.record_types t on t.type = g.type
  where g.app_slug = (select platform.calling_app()) and t.family = p_family
    and (select platform.has_grant(g.app_slug));
$$;

-- Collections the caller belongs to (not deleted), and the types the calling app may read:
-- set-returning, so RLS evaluates each once per query instead of once per row.
create function platform.my_collections() returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.collection_id from platform.collection_members m
  join platform.collections c on c.id = m.collection_id and c.deleted_at is null
  where m.user_id = (select auth.uid());
$$;

create function platform.readable_types() returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select g.type from platform.app_type_grants g
  where g.app_slug = (select platform.calling_app()) and (select platform.has_grant(g.app_slug));
$$;

-- Collection APIs work from the portal (no app) or from an app with access to that family.
create function platform.collection_gate(p_family text, p_level integer) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and ((select platform.calling_app()) is null
      or (select platform.suite_family_access(p_family)) >= p_level);
$$;

create function platform.collection_role(p_collection uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case m.role when 'viewer' then 1 when 'editor' then 2 when 'owner' then 3 end
    from platform.collection_members m
    join platform.collections c on c.id = m.collection_id and c.deleted_at is null
    where m.collection_id = p_collection and m.user_id = (select auth.uid())
  ), 0);
$$;

create function platform.suite_priority(p_app text, p_type text) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select priority from platform.app_type_grants where app_slug = p_app and type = p_type),
    1000);
$$;

-- ---------- RLS ----------

alter table platform.collections enable row level security;
alter table platform.collection_members enable row level security;
alter table platform.app_type_requests enable row level security;
alter table platform.app_type_grants enable row level security;
alter table platform.records enable row level security;
alter table platform.records force row level security;
revoke all on platform.collections, platform.collection_members, platform.app_type_requests,
  platform.app_type_grants, platform.records from public, anon, authenticated;
grant select on platform.collections, platform.collection_members, platform.records
  to authenticated;
grant all on platform.collections, platform.collection_members, platform.app_type_requests,
  platform.app_type_grants, platform.records to service_role;

create policy collections_members on platform.collections for select to authenticated
  using (id in (select platform.my_collections()) and platform.collection_gate(family, 1));
create policy collection_members_members on platform.collection_members for select to authenticated
  using (collection_id in (select platform.my_collections())
    and exists (select 1 from platform.collections c where c.id = collection_id
      and platform.collection_gate(c.family, 1)));
-- A record is readable by members of its collection, from an app with read access to its type.
create policy records_read on platform.records for select to authenticated
  using (
    deleted_at is null
    and type in (select platform.readable_types())
    and collection_id in (select platform.my_collections())
  );

-- ---------- collections API ----------

-- The caller's personal collection of a family, created on first use.
create function platform.personal_collection(p_family text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not (select platform.collection_gate(p_family, 1)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into v_id from platform.collections
  where owner_id = (select auth.uid()) and family = p_family and personal;
  if v_id is not null then return v_id; end if;
  select personal_name into v_name from platform.collection_families where family = p_family;
  if v_name is null then
    raise exception 'unknown_family' using errcode = '22023';
  end if;
  insert into platform.collections (name, family, owner_id, personal)
  values (v_name, p_family, (select auth.uid()), true)
  on conflict (owner_id, family) where personal do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from platform.collections
    where owner_id = (select auth.uid()) and family = p_family and personal;
  else
    insert into platform.collection_members (collection_id, user_id, role)
    values (v_id, (select auth.uid()), 'owner');
  end if;
  return v_id;
end;
$$;

-- Collections the caller belongs to, with their role and the member names.
create function platform.suite_collections(p_family text default null)
returns table (
  id uuid, name text, family text, personal boolean, color text, role text, owner_name text,
  members jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.family, c.personal, c.color, m.role, p.display_name,
    coalesce((
      select jsonb_agg(jsonb_build_object('user_id', mm.user_id, 'name', pp.display_name,
        'role', mm.role) order by pp.display_name)
      from platform.collection_members mm
      join platform.profiles pp on pp.user_id = mm.user_id
      where mm.collection_id = c.id
    ), '[]')
  from platform.collections c
  join platform.collection_members m on m.collection_id = c.id and m.user_id = (select auth.uid())
  join platform.profiles p on p.user_id = c.owner_id
  where (p_family is null or c.family = p_family)
    and c.deleted_at is null
    and (select platform.collection_gate(c.family, 1))
  order by c.personal desc, c.name;
$$;

create function platform.collection_create(p_name text, p_family text, p_color text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from platform.collection_families where family = p_family) then
    raise exception 'unknown_family' using errcode = '22023';
  end if;
  if not (select platform.collection_gate(p_family, 2)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select count(*) from platform.collections where owner_id = (select auth.uid())) >= 100 then
    raise exception 'too_many_collections' using errcode = '54000';
  end if;
  insert into platform.collections (name, family, owner_id, color)
  values (btrim(p_name), p_family, (select auth.uid()), p_color)
  returning id into v_id;
  insert into platform.collection_members (collection_id, user_id, role)
  values (v_id, (select auth.uid()), 'owner');
  return v_id;
end;
$$;

-- Adds, changes or (role null) removes a member. Only the owner; the owner cannot be changed.
-- Members must be people on the platform.
create function platform.collection_set_member(p_collection uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select platform.collection_role(p_collection)) < 3
     or not (select platform.collection_gate(
       (select family from platform.collections where id = p_collection), 2)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from platform.collections where id = p_collection and personal) then
    raise exception 'personal_collection' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'owner_cannot_change' using errcode = '22023';
  end if;
  if p_role is null then
    delete from platform.collection_members where collection_id = p_collection and user_id = p_user;
    return;
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if not exists (select 1 from platform.profiles where user_id = p_user) then
    raise exception 'unknown_user' using errcode = '22023';
  end if;
  insert into platform.collection_members (collection_id, user_id, role)
  values (p_collection, p_user, p_role)
  on conflict (collection_id, user_id) do update set role = excluded.role;
end;
$$;

-- The owner deletes a shared collection (and its records); others leave it.
create function platform.collection_leave(p_collection uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role integer := (select platform.collection_role(p_collection));
begin
  if v_role = 0 or not (select platform.collection_gate(
       (select family from platform.collections where id = p_collection), 2)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_role = 3 then
    if exists (select 1 from platform.collections where id = p_collection and personal) then
      raise exception 'personal_collection' using errcode = '42501';
    end if;
    -- into the bin: the collection and its records disappear now and are removed after 30 days
    update platform.records set deleted_at = now()
    where collection_id = p_collection and deleted_at is null;
    update platform.collections set deleted_at = now() where id = p_collection;
  else
    delete from platform.collection_members
    where collection_id = p_collection and user_id = (select auth.uid());
  end if;
end;
$$;

-- ---------- records API ----------

-- The value of an identity key in a flat record json (common columns top level, data nested).
create function platform.identity_value(p_record jsonb, p_key text) returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p_key like 'data.%' then p_record -> 'data' -> substr(p_key, 6)
    when p_key = 'title' then to_jsonb(lower(btrim(p_record ->> 'title')))
    -- times compare as instants, whatever format the app sent
    when p_key in ('starts_at', 'ends_at', 'due_at') then to_jsonb((p_record ->> p_key)::timestamptz)
    else p_record -> p_key end;
$$;

-- A field's value for "did it change?": raw, with times compared as instants.
create function platform.field_value(p_record jsonb, p_key text) returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p_key like 'data.%' then p_record -> 'data' -> substr(p_key, 6)
    when p_key in ('starts_at', 'ends_at', 'due_at') and p_record ->> p_key is not null
      then to_jsonb((p_record ->> p_key)::timestamptz)
    else p_record -> p_key end;
$$;

-- md5 of a record's identity values, or null when the type has none or one is missing.
create function platform.identity_hash(p_type text, p_record jsonb) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when cardinality(t.identity) = 0 then null
    when exists (select 1 from unnest(t.identity) k
      where platform.identity_value(p_record, k) is null
        or jsonb_typeof(platform.identity_value(p_record, k)) = 'null') then null
    else md5((select jsonb_agg(platform.identity_value(p_record, k) order by k)
      from unnest(t.identity) k)::text) end
  from platform.record_types t where t.type = p_type;
$$;

-- Creates or updates a record. `p_fields` holds the common columns (title, starts_at, ends_at,
-- due_at, status, amount_cents, currency, place_name, lat, lon) and `data` (merged key by key).
-- An existing record is found by id, by the app's source key, or by the type's identity keys
-- (then the create becomes a merge). Fields another app with higher priority wrote last are
-- left alone and reported. Returns { record, merged, rejectedFields }.
create function platform.suite_upsert(
  p_type text,
  p_fields jsonb,
  p_source_key text default null,
  p_collection uuid default null,
  p_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app text := (select platform.calling_app());
  v_level integer := (select platform.suite_access(p_type));
  v_type platform.record_types;
  v_collection uuid;
  v_existing platform.records;
  v_new jsonb;
  v_sources jsonb;
  v_rejected text[] := '{}';
  v_key text;
  v_owner text;
  v_prio integer := (select platform.suite_priority(v_app, p_type));
  v_cols constant text[] := array['title', 'starts_at', 'ends_at', 'due_at', 'status',
    'amount_cents', 'currency', 'place_name', 'lat', 'lon'];
  v_merged boolean := false;
  v_row platform.records;
  v_foreign boolean;
begin
  if (select auth.uid()) is null or v_app is null or v_level < 2 then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fields) <> 'object' then
    raise exception 'invalid_fields' using errcode = '22023';
  end if;
  select * into v_type from platform.record_types where type = p_type;
  for v_key in select jsonb_object_keys(p_fields) loop
    if v_key <> 'data' and not (v_key = any (v_cols)) then
      raise exception 'unknown_field %', v_key using errcode = '22023';
    end if;
  end loop;
  if p_fields ? 'data' and jsonb_typeof(p_fields -> 'data') <> 'object' then
    raise exception 'invalid_data' using errcode = '22023';
  end if;

  -- find the record; ids of records the caller may not edit look like missing ones
  if p_id is not null then
    select * into v_existing from platform.records
    where id = p_id and type = p_type and deleted_at is null
      and collection_id in (select platform.my_collections())
      and (select platform.collection_role(collection_id)) >= 2
    for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    v_collection := v_existing.collection_id;
  else
    v_collection := coalesce(p_collection, (select platform.personal_collection(v_type.family)));
    if (select platform.collection_role(v_collection)) < 2 then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if (select family from platform.collections where id = v_collection)
       is distinct from v_type.family then
      raise exception 'wrong_collection' using errcode = '22023';
    end if;
    -- one writer at a time per collection and type, so duplicates cannot slip in
    perform pg_advisory_xact_lock(hashtext(v_collection::text || ':' || p_type));
    if p_source_key is not null then
      select * into v_existing from platform.records
      where collection_id = v_collection and source_app = v_app and type = p_type
        and source_key = p_source_key
      for update;
      -- a source key that was deleted comes back to life
    end if;
    v_key := platform.identity_hash(p_type, p_fields);
    if v_existing.id is null and v_key is not null then
      select r.* into v_existing
      from platform.records r
      where r.collection_id = v_collection and r.type = p_type and r.deleted_at is null
        and r.identity_hash = v_key
      limit 1
      for update;
      v_merged := v_existing.id is not null;
    end if;
  end if;

  if v_existing.id is null then
    -- a new record
    v_sources := (
      select coalesce(jsonb_object_agg(k, v_app), '{}') from (
        select k from jsonb_object_keys(p_fields) k where k <> 'data'
        union all
        select 'data.' || k from jsonb_object_keys(coalesce(p_fields -> 'data', '{}')) k
      ) keys);
    v_new := jsonb_build_object('data', coalesce(p_fields -> 'data', '{}')) || (p_fields - 'data');
  else
    -- an update or a merge: foreign records need write access, and priority decides per field
    v_foreign := v_existing.source_app is distinct from v_app
      and v_existing.created_by_app is distinct from v_app;
    v_new := to_jsonb(v_existing);
    v_sources := v_existing.field_sources;
    for v_key in
      select k from jsonb_object_keys(p_fields) k where k <> 'data'
      union all
      select 'data.' || k from jsonb_object_keys(coalesce(p_fields -> 'data', '{}')) k
    loop
      v_owner := v_sources ->> v_key;
      -- an unchanged value (e.g. the identity keys of a merge) is neither written nor refused
      if platform.field_value(v_new, v_key) is not distinct from platform.field_value(p_fields, v_key) then
        continue;
      end if;
      -- a merge keeps the existing spelling of the identity keys it matched on
      if v_merged and v_key = any (v_type.identity) and platform.identity_value(v_new, v_key)
          is not distinct from platform.identity_value(p_fields, v_key) then
        continue;
      end if;
      if (v_foreign and v_level < 3 and platform.identity_value(v_new, v_key) is not null
            and jsonb_typeof(platform.identity_value(v_new, v_key)) <> 'null')
         or (v_owner is not null and v_owner <> v_app
            and (select platform.suite_priority(v_owner, p_type)) < v_prio)
      then
        v_rejected := v_rejected || v_key;
        continue;
      end if;
      if v_key like 'data.%' then
        v_new := jsonb_set(v_new, array['data', substr(v_key, 6)],
          p_fields -> 'data' -> substr(v_key, 6));
      else
        v_new := jsonb_set(v_new, array[v_key], p_fields -> v_key);
      end if;
      v_sources := v_sources || jsonb_build_object(v_key, v_app);
    end loop;
  end if;

  -- data: nulls remove a field; then the type's schema decides
  v_new := jsonb_set(v_new, '{data}', jsonb_strip_nulls(coalesce(v_new -> 'data', '{}')));
  if not extensions.jsonb_matches_schema(v_type.schema::json, v_new -> 'data') then
    raise exception 'invalid_data for %', p_type using errcode = '22023';
  end if;

  if v_existing.id is null then
    insert into platform.records (
      type, collection_id, title, starts_at, ends_at, due_at, status, amount_cents, currency,
      place_name, lat, lon, data, source_app, source_key, created_by, created_by_app,
      updated_by_app, field_sources, identity_hash
    ) values (
      p_type, v_collection, v_new ->> 'title', (v_new ->> 'starts_at')::timestamptz,
      (v_new ->> 'ends_at')::timestamptz, (v_new ->> 'due_at')::timestamptz, v_new ->> 'status',
      (v_new ->> 'amount_cents')::bigint, v_new ->> 'currency', v_new ->> 'place_name',
      (v_new ->> 'lat')::double precision, (v_new ->> 'lon')::double precision, v_new -> 'data',
      v_app, p_source_key, (select auth.uid()), v_app, v_app, v_sources,
      platform.identity_hash(p_type, v_new)
    ) returning * into v_row;
  else
    update platform.records set
      title = v_new ->> 'title', starts_at = (v_new ->> 'starts_at')::timestamptz,
      ends_at = (v_new ->> 'ends_at')::timestamptz, due_at = (v_new ->> 'due_at')::timestamptz,
      status = v_new ->> 'status', amount_cents = (v_new ->> 'amount_cents')::bigint,
      currency = v_new ->> 'currency', place_name = v_new ->> 'place_name',
      lat = (v_new ->> 'lat')::double precision, lon = (v_new ->> 'lon')::double precision,
      data = v_new -> 'data', field_sources = v_sources, updated_by_app = v_app,
      identity_hash = platform.identity_hash(p_type, v_new),
      version = version + 1, updated_at = now(), deleted_at = null
    where id = v_existing.id
    returning * into v_row;
  end if;
  return jsonb_build_object('record', to_jsonb(v_row) - 'field_sources' - 'identity_hash', 'merged', v_merged,
    'rejectedFields', to_jsonb(v_rejected));
end;
$$;

-- Moves a record to the bin (30 days). The writing app may always delete its own records;
-- others need `delete` access and a higher priority than the app that created it.
create function platform.suite_delete(p_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app text := (select platform.calling_app());
  v_rec platform.records;
begin
  select * into v_rec from platform.records
  where id = p_id and deleted_at is null and collection_id in (select platform.my_collections())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if (select auth.uid()) is null or v_app is null
     or (select platform.suite_access(v_rec.type)) < 2
     or (select platform.collection_role(v_rec.collection_id)) < 2
     or (
       v_rec.created_by_app is distinct from v_app
       and (
         (select platform.suite_access(v_rec.type)) < 4
         or (select platform.suite_priority(v_app, v_rec.type))
            >= (select platform.suite_priority(v_rec.created_by_app, v_rec.type))
       )
     )
  then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update platform.records set deleted_at = now(), updated_by_app = v_app, version = version + 1,
    updated_at = now()
  where id = p_id;
end;
$$;

-- ---------- deploys and the admin ----------

-- Registers what an app asks for (manifest `suite.uses`). Grants for types it no longer asks
-- for are dropped; a lower request lowers the grant.
create function platform.register_app_suite(p_slug text, p_uses jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- only the deploy (service role) may call this: see the grants at the end
  if jsonb_typeof(p_uses) <> 'array' then
    raise exception 'invalid_uses' using errcode = '22023';
  end if;
  insert into platform.audit_log (app_slug, action, detail)
  select p_slug, 'suite.grant_lowered', jsonb_build_object('type', g.type, 'from', g.access,
    'to', r.access)
  from platform.app_type_grants g
  left join lateral (
    select u ->> 'access' as access from jsonb_array_elements(p_uses) u where u ->> 'type' = g.type
  ) r on true
  where g.app_slug = p_slug
    and (r.access is null or platform.access_level(r.access) < platform.access_level(g.access));
  delete from platform.app_type_requests r
  where r.app_slug = p_slug
    and not exists (select 1 from jsonb_array_elements(p_uses) u where u ->> 'type' = r.type);
  insert into platform.app_type_requests (app_slug, type, access, why)
  select p_slug, u ->> 'type', u ->> 'access', u ->> 'why'
  from jsonb_array_elements(p_uses) u
  on conflict (app_slug, type) do update set access = excluded.access, why = excluded.why;
  delete from platform.app_type_grants g
  where g.app_slug = p_slug
    and not exists (select 1 from platform.app_type_requests r where r.app_slug = p_slug and r.type = g.type);
  update platform.app_type_grants g set access = r.access
  from platform.app_type_requests r
  where g.app_slug = p_slug and r.app_slug = g.app_slug and r.type = g.type
    and platform.access_level(r.access) < platform.access_level(g.access);
end;
$$;

-- Requests and grants for Verwaltung → Gemeinsame Daten.
create function platform.admin_suite_matrix()
returns table (app_slug text, app_name text, type text, type_label text, requested text,
  why text, granted text, priority integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.slug, a.name, t.type, t.label, r.access, r.why, g.access, g.priority
  from platform.app_type_requests r
  join platform.apps a on a.slug = r.app_slug
  join platform.record_types t on t.type = r.type
  left join platform.app_type_grants g on g.app_slug = r.app_slug and g.type = r.type
  where (select platform.is_admin())
  order by t.type, g.priority nulls last, a.name;
$$;

-- Grants (up to the requested level) or, with null, revokes an app's access to a type.
create function platform.admin_suite_grant(p_app text, p_type text, p_access text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested text;
begin
  perform platform.require_recent_admin();
  select access into v_requested from platform.app_type_requests
  where app_slug = p_app and type = p_type;
  if v_requested is null then
    raise exception 'not_requested' using errcode = '22023';
  end if;
  if p_access is null then
    delete from platform.app_type_grants where app_slug = p_app and type = p_type;
  elsif platform.access_level(p_access) = 0
     or platform.access_level(p_access) > platform.access_level(v_requested) then
    raise exception 'invalid_access' using errcode = '22023';
  else
    insert into platform.app_type_grants (app_slug, type, access, granted_by)
    values (p_app, p_type, p_access, (select auth.uid()))
    on conflict (app_slug, type) do update
      set access = excluded.access, granted_by = excluded.granted_by, granted_at = now();
  end if;
  insert into platform.audit_log (actor_id, app_slug, action, detail)
  values ((select auth.uid()), p_app, 'suite.grant',
    jsonb_build_object('type', p_type, 'access', p_access));
end;
$$;

-- Sets the priority order of the apps that write a type (first = strongest).
create function platform.admin_suite_priority(p_type text, p_apps text[]) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.require_recent_admin();
  update platform.app_type_grants g set priority = o.pos * 10
  from unnest(p_apps) with ordinality as o(slug, pos)
  where g.type = p_type and g.app_slug = o.slug;
  insert into platform.audit_log (actor_id, action, detail)
  values ((select auth.uid()), 'suite.priority',
    jsonb_build_object('type', p_type, 'apps', to_jsonb(p_apps)));
end;
$$;

-- Records deleted more than 30 days ago are removed for good (called by the API cron).
create function platform.suite_purge_bin() returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from platform.records where deleted_at < now() - interval '30 days' returning 1
  ), cols as (
    delete from platform.collections where deleted_at < now() - interval '30 days' returning 1
  )
  select (select count(*)::integer from gone) + (select count(*)::integer from cols);
$$;

revoke execute on function platform.suite_family_access(text), platform.my_collections(),
  platform.readable_types(), platform.collection_gate(text, integer),
  platform.field_value(jsonb, text), platform.identity_hash(text, jsonb)
  from public, anon;
grant execute on function platform.suite_family_access(text), platform.my_collections(),
  platform.readable_types(), platform.collection_gate(text, integer),
  platform.field_value(jsonb, text), platform.identity_hash(text, jsonb)
  to authenticated;
revoke execute on function platform.access_level(text), platform.suite_access(text),
  platform.collection_role(uuid), platform.suite_priority(text, text),
  platform.personal_collection(text), platform.suite_collections(text),
  platform.collection_create(text, text, text), platform.collection_set_member(uuid, uuid, text),
  platform.collection_leave(uuid), platform.identity_value(jsonb, text),
  platform.suite_upsert(text, jsonb, text, uuid, uuid), platform.suite_delete(uuid),
  platform.register_app_suite(text, jsonb), platform.admin_suite_matrix(),
  platform.admin_suite_grant(text, text, text), platform.admin_suite_priority(text, text[]),
  platform.suite_purge_bin()
  from public, anon;
grant execute on function platform.access_level(text), platform.suite_access(text),
  platform.collection_role(uuid), platform.suite_priority(text, text),
  platform.personal_collection(text), platform.suite_collections(text),
  platform.collection_create(text, text, text), platform.collection_set_member(uuid, uuid, text),
  platform.collection_leave(uuid), platform.identity_value(jsonb, text),
  platform.suite_upsert(text, jsonb, text, uuid, uuid), platform.suite_delete(uuid),
  platform.admin_suite_matrix(), platform.admin_suite_grant(text, text, text),
  platform.admin_suite_priority(text, text[])
  to authenticated;
grant execute on function platform.register_app_suite(text, jsonb), platform.suite_purge_bin()
  to service_role;
