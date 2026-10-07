-- Birthdays tab (ADR 0022, 0025): people typed in here, per-person settings and gift ideas.
-- Birthdays of people on MiniNode come from mn.birthdays() and those of Aether contacts from the
-- suite; nothing of them is copied into these tables except the key that names them
-- ("mn:<user id>", "aether:birthday:<contact>", "own:<id>").

create table app_wunschliste.birthday_people (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  year smallint check (year between 1900 and 2100),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 30 February and friends do not exist; 29 February needs a year that is a leap year (or none).
  check (day <= case
    when month in (4, 6, 9, 11) then 30
    when month = 2 then case
      when year is null then 29
      when (year % 4 = 0 and year % 100 <> 0) or year % 400 = 0 then 29
      else 28
    end
    else 31
  end)
);
create trigger birthday_people_touch before update on app_wunschliste.birthday_people
  for each row execute function platform.touch_updated_at();
select platform.secure_table('wunschliste', 'birthday_people', 'private');

-- What the person wants for one birthday person: how many days before to remind (null = the
-- default in the settings), a budget per year, and whether to hide the person from the list.
create table app_wunschliste.birthday_prefs (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  person_key text not null check (char_length(person_key) between 1 and 200),
  days_before smallint check (days_before between 0 and 60),
  budget_cents integer check (budget_cents between 0 and 100000000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, person_key)
);
create trigger birthday_prefs_touch before update on app_wunschliste.birthday_prefs
  for each row execute function platform.touch_updated_at();
select platform.secure_table('wunschliste', 'birthday_prefs', 'private');

create table app_wunschliste.gift_ideas (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  person_key text not null check (char_length(person_key) between 1 and 200),
  title text not null check (char_length(title) between 1 and 200),
  note text not null default '' check (char_length(note) <= 1000),
  url text check (url ~ '^https?://' and char_length(url) <= 2000),
  price_cents integer check (price_cents between 0 and 100000000),
  status text not null default 'idea' check (status in ('idea', 'bought', 'given')),
  gifted_year smallint check (gifted_year between 1900 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gift_ideas_person_idx on app_wunschliste.gift_ideas (owner_id, person_key);
create trigger gift_ideas_touch before update on app_wunschliste.gift_ideas
  for each row execute function platform.touch_updated_at();
select platform.secure_table('wunschliste', 'gift_ideas', 'private');
