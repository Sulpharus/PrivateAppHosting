-- CAD: projects (a 2D drawing and a 3D model each), the person's own categories and the version
-- history of every project. Everything is private per person (data mode `private`).
--
-- The drawing and the model are read and written as a whole by the editor, so they live in one
-- typed jsonb column (`model`, an object with `sketch` and `solids`); everything the app filters or
-- sorts by is a column of its own. Imported meshes and G-code stay in mn.files under
-- `projects/<project id>/`, never in the row.

select platform.create_app_schema('cad');

create table app_cad.categories (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  colour text not null default 'gray'
    check (colour in ('green', 'blue', 'violet', 'amber', 'rose', 'teal', 'gray')),
  position integer not null default 0,
  archived boolean not null default false,
  sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_touch before update on app_cad.categories
  for each row execute function platform.touch_updated_at();
select platform.secure_table('cad', 'categories', 'private');

create table app_cad.projects (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 5000),
  category_id uuid references app_cad.categories (id) on delete set null,
  -- What the project is for; only a filter and a default for exports.
  purpose text not null default 'print' check (purpose in ('print', 'cnc', 'drawing')),
  units text not null default 'mm' check (units in ('mm', 'in')),
  model jsonb not null default '{}' check (jsonb_typeof(model) = 'object'),
  -- Example project from "Mit Beispieldaten ausprobieren"; removed in one step.
  sample boolean not null default false,
  -- Soft delete: the Papierkorb keeps a project for 30 days.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger projects_touch before update on app_cad.projects
  for each row execute function platform.touch_updated_at();
select platform.secure_table('cad', 'projects', 'private');
create index projects_category_id_idx on app_cad.projects (category_id);
create index projects_deleted_at_idx on app_cad.projects (deleted_at);

-- Version history: a snapshot of the model whenever an editing session ends (the app keeps the
-- last 20 per project).
create table app_cad.history (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  item_id uuid not null references app_cad.projects (id) on delete cascade,
  at timestamptz not null default now(),
  by uuid,
  changes jsonb not null default '{}' check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger history_touch before update on app_cad.history
  for each row execute function platform.touch_updated_at();
select platform.secure_table('cad', 'history', 'private');
create index history_item_id_at_idx on app_cad.history (item_id, at desc);
