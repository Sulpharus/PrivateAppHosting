-- Typetrainer: every finished run, the person's own practice texts and their categories.
-- All three are private per person (secure_table fills owner_id and adds the policies).
-- Progress through the learning path (stars, daily challenge, streak) and the settings are small
-- state in mn.kv (`progress`, `settings`), not tables.

select platform.create_app_schema('typetrainer');

-- Categories for own texts (Einstellungen → Kategorien). Archived instead of deleted while texts
-- still use them.
create table app_typetrainer.categories (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  colour text not null default 'blue'
    check (colour in ('green', 'blue', 'violet', 'amber', 'rose', 'teal', 'gray')),
  position double precision not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_touch before update on app_typetrainer.categories
  for each row execute function platform.touch_updated_at();
select platform.secure_table('typetrainer', 'categories', 'private');

-- Own practice texts (prose or code), in a manual order; "mastered" moves one to the done section.
create table app_typetrainer.texts (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  category_id uuid references app_typetrainer.categories (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 5000),
  kind text not null default 'text' check (kind in ('text', 'code')),
  code_language text check (code_language in ('python', 'javascript', 'java')),
  position double precision not null default 0,
  mastered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'code' or code_language is null)
);
create trigger texts_touch before update on app_typetrainer.texts
  for each row execute function platform.touch_updated_at();
select platform.secure_table('typetrainer', 'texts', 'private');
create index texts_category_id_idx on app_typetrainer.texts (category_id);

-- One row per finished run. Statistics are computed from these rows, never stored.
create table app_typetrainer.sessions (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  -- lesson: a level of the learning path; practice: random text; daily: the daily challenge;
  -- weak: practice of the weakest keys; text: one of the own texts.
  mode text not null check (mode in ('lesson', 'practice', 'daily', 'weak', 'text')),
  -- 'layout:<id>' or 'code:<language>' for lessons, 'text' / 'code' for the rest.
  course text not null check (char_length(course) between 1 and 40),
  level smallint check (level between 1 and 99),
  layout text not null check (char_length(layout) between 1 and 40),
  difficulty text check (difficulty in ('leicht', 'mittel', 'schwer')),
  ranked boolean not null default false,
  wpm numeric(5, 1) not null check (wpm between 0 and 400),
  accuracy numeric(5, 2) not null check (accuracy between 0 and 100),
  chars integer not null check (chars between 1 and 100000),
  errors integer not null default 0 check (errors >= 0),
  duration_ms integer not null check (duration_ms > 0),
  stars smallint check (stars between 0 and 3),
  practised_on date not null,
  -- Per expected character: [typed, wrong]. Only read as a whole for the weak-key statistics.
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sessions_touch before update on app_typetrainer.sessions
  for each row execute function platform.touch_updated_at();
select platform.secure_table('typetrainer', 'sessions', 'private');
create index sessions_practised_on_idx on app_typetrainer.sessions (practised_on);
create index sessions_course_idx on app_typetrainer.sessions (course, level);
