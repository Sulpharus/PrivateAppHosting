-- Sportplaner: activities and membership tariffs as real tables (ADR 0022). Until now each one was
-- a private mn.kv entry (act:<id>, plan:<id>); the app copies them into these tables the first
-- time it is opened and leaves the kv entries in place as a backup.
--
-- Ids stay text: existing entries use uuids and, from older versions, other strings. The primary
-- key is (owner_id, id) so two people importing the same backup never collide.
-- Structured parts the app only reads as a whole (slots, season, planned, quota) are jsonb with a
-- type check; everything the app filters or sums by is a typed column.

select platform.create_app_schema('sportplaner');

create table app_sportplaner.activities (
  id text not null check (char_length(id) between 1 and 100),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 500),
  category text not null default '' check (char_length(category) <= 500),
  provider text not null default '' check (char_length(provider) <= 500),
  description text not null default '' check (char_length(description) <= 20000),
  location text not null default '' check (char_length(location) <= 500),
  address text not null default '' check (char_length(address) <= 500),
  signup_url text not null default '' check (char_length(signup_url) <= 2000),
  signup_notes text not null default '' check (char_length(signup_notes) <= 5000),
  cost text not null default '' check (char_length(cost) <= 500),
  level text not null default '' check (char_length(level) <= 200),
  contact text not null default '' check (char_length(contact) <= 500),
  website text not null default '' check (char_length(website) <= 2000),
  notes text not null default '' check (char_length(notes) <= 20000),
  signup text not null default 'none' check (signup in ('none', 'advance', 'checkin', 'membership')),
  visit_price numeric(10, 2) not null default 0 check (visit_price >= 0),
  access_guest boolean not null default false,
  access_students boolean not null default false,
  access_membership boolean not null default false,
  equipment text[] not null default '{}',
  -- Days with a visit and days the offer was cancelled.
  done date[] not null default '{}',
  cancelled date[] not null default '{}',
  geo_lat double precision check (geo_lat between -90 and 90),
  geo_lon double precision check (geo_lon between -180 and 180),
  geo_label text,
  geo_q text,
  course_from date,
  course_until date,
  course_price numeric(10, 2) check (course_price > 0),
  course_price_type text check (course_price_type in ('total', 'month')),
  -- Weekly or dated times, the season of the offer and the plan to take part: read as a whole.
  slots jsonb not null default '[]' check (jsonb_typeof(slots) = 'array'),
  season jsonb not null default '{"type": "all"}' check (jsonb_typeof(season) = 'object'),
  planned jsonb not null default '{"mode": "none"}' check (jsonb_typeof(planned) = 'object'),
  -- References into the private file bucket (mn.files) and their small previews.
  photos text[] not null default '{}',
  thumbs jsonb not null default '{}' check (jsonb_typeof(thumbs) = 'object'),
  -- Fields of older versions the app does not know any more; kept, never filtered on.
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  -- When the app last edited the entry (milliseconds, from the device).
  edited_ms bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  check (course_from is null or course_until is null or course_from <= course_until)
);
create trigger activities_touch before update on app_sportplaner.activities
  for each row execute function platform.touch_updated_at();
select platform.secure_table('sportplaner', 'activities', 'private');

create table app_sportplaner.plans (
  id text not null check (char_length(id) between 1 and 100),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 500),
  provider text not null default '' check (char_length(provider) <= 500),
  category text not null default '' check (char_length(category) <= 500),
  notes text not null default '' check (char_length(notes) <= 20000),
  type text not null default 'recurring' check (type in ('recurring', 'once', 'visit', 'card')),
  unit text not null default 'month' check (unit in ('day', 'week', 'month', 'year')),
  every integer not null default 1 check (every between 1 and 100),
  visits integer not null default 10 check (visits >= 1),
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  start_on date,
  end_on date,
  -- Ids of the activities the tariff covers.
  activities text[] not null default '{}',
  -- Credits or visits per month, and what each activity costs within it (absent: no allowance).
  quota jsonb check (jsonb_typeof(quota) = 'object'),
  links jsonb check (jsonb_typeof(links) = 'object'),
  edited_ms bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create trigger plans_touch before update on app_sportplaner.plans
  for each row execute function platform.touch_updated_at();
select platform.secure_table('sportplaner', 'plans', 'private');
