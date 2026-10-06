-- Haushalt: bookings, fixed costs, categories, import rules and tax profiles as real tables
-- (ADR 0022). Until now each one was a private mn.kv entry (tx:<date>:<id>, rec:<id>, profile:<year>,
-- and the categories and rules inside one `settings` entry). The app copies them into these tables
-- the first time it is opened and leaves the kv entries in place as a backup.
--
-- Ids stay text (uuids, `r-<fixed cost>-<month>` for booked fixed costs, `i<hash>` for imports).
-- The primary key is (owner_id, id), so two people never collide. Money is integer cents, a day
-- a `date`, a month the first day of it. Bookings keep the category as plain text on purpose: a
-- category can be deleted and the old bookings still show "deleted category".

select platform.create_app_schema('haushalt');

create table app_haushalt.bookings (
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,90}$'),
  owner_id uuid references auth.users (id) on delete cascade,
  booked_on date not null,
  cents bigint not null check (cents >= 0 and cents < 100000000000),
  kind text not null default 'expense' check (kind in ('expense', 'income', 'transfer')),
  cat text not null default '' check (char_length(cat) <= 60),
  text text not null default '' check (char_length(text) <= 200),
  party text not null default '' check (char_length(party) <= 120),
  -- Tax form field the booking counts for; null = the category's default, 'none' = counts nowhere.
  tax_field text check (char_length(tax_field) <= 60),
  tax_cents bigint check (tax_cents >= 0 and tax_cents < 100000000000),
  -- Path of the receipt in the private file bucket (mn.files).
  receipt text check (receipt like 'belege/%' and receipt not like '%..%' and char_length(receipt) <= 200),
  source text check (source in ('import', 'rec')),
  -- The fixed cost this booking pays, found on import or booked by it.
  rec_id text check (rec_id ~ '^[A-Za-z0-9_-]{1,60}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create index bookings_owner_day_idx on app_haushalt.bookings (owner_id, booked_on);
create index bookings_rec_idx on app_haushalt.bookings (owner_id, rec_id) where rec_id is not null;
create trigger bookings_touch before update on app_haushalt.bookings
  for each row execute function platform.touch_updated_at();
select platform.secure_table('haushalt', 'bookings', 'private');

create table app_haushalt.recurring (
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,60}$'),
  owner_id uuid references auth.users (id) on delete cascade,
  text text not null default '' check (char_length(text) <= 200),
  cents bigint not null check (cents >= 0 and cents < 100000000000),
  kind text not null default 'expense' check (kind in ('expense', 'income', 'transfer')),
  cat text not null default '' check (char_length(cat) <= 60),
  -- Every 1, 3, 6 or 12 months, on this day of the month.
  every smallint not null default 1 check (every in (1, 3, 6, 12)),
  day smallint not null default 1 check (day between 1 and 28),
  -- Months, stored as the first day of the month.
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (extract(day from end_month) = 1),
  -- Booked up to and including this month.
  until_month date check (extract(day from until_month) = 1),
  type text not null default 'sonstiges' check (
    type in ('wohnen', 'abo', 'versicherung', 'mobilitaet', 'kredit', 'ruecklage', 'spende', 'einnahme', 'sonstiges')
  ),
  -- Words that identify its payments in a bank import ("NETFLIX|NETFLIX.COM").
  match text not null default '' check (char_length(match) <= 200),
  -- Price changes: [{"from": "2026-03", "cents": 1299}], from this month on; read as a whole.
  changes jsonb not null default '[]' check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) <= 24),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create trigger recurring_touch before update on app_haushalt.recurring
  for each row execute function platform.touch_updated_at();
select platform.secure_table('haushalt', 'recurring', 'private');

create table app_haushalt.categories (
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,60}$'),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'expense' check (kind in ('expense', 'income', 'transfer')),
  budget_cents bigint not null default 0 check (budget_cents >= 0 and budget_cents < 100000000000),
  -- Tax form field the category counts for by default (empty: none).
  tax_field text not null default '' check (char_length(tax_field) <= 60),
  -- Order in the lists.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create trigger categories_touch before update on app_haushalt.categories
  for each row execute function platform.touch_updated_at();
select platform.secure_table('haushalt', 'categories', 'private');

-- "Contains" rules for the bank import, tried in order; several words are separated by "|".
-- The id is the position as text, so saving the list rewrites rows 0..n-1.
create table app_haushalt.rules (
  id text not null check (id ~ '^[0-9]{1,6}$'),
  owner_id uuid references auth.users (id) on delete cascade,
  match text not null check (char_length(match) between 1 and 200),
  cat text not null default '' check (char_length(cat) <= 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create trigger rules_touch before update on app_haushalt.rules
  for each row execute function platform.touch_updated_at();
select platform.secure_table('haushalt', 'rules', 'private');

-- The tax-return answers of one year.
create table app_haushalt.tax_profiles (
  id text not null check (id ~ '^[0-9]{4}$'),
  owner_id uuid references auth.users (id) on delete cascade,
  year smallint not null check (year between 1900 and 2200 and year::text = id),
  commute_km numeric(8, 2) not null default 0 check (commute_km between 0 and 1000),
  commute_days numeric(6, 2) not null default 0 check (commute_days between 0 and 366),
  homeoffice_days numeric(6, 2) not null default 0 check (homeoffice_days between 0 and 366),
  children numeric(4, 1) not null default 0 check (children between 0 and 20),
  married boolean not null default false,
  car boolean not null default false,
  income numeric(16, 2) not null default 0 check (income between 0 and 100000000000),
  employee boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create trigger tax_profiles_touch before update on app_haushalt.tax_profiles
  for each row execute function platform.touch_updated_at();
select platform.secure_table('haushalt', 'tax_profiles', 'private');
