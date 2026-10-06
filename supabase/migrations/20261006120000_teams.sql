-- Teams: data that belongs to a project or a group of friends, shared with chosen people only
-- (ADR 0023). `group` shares with everyone who may use the app and `private` with nobody; a team is
-- in between: rows carry a `team_id`, and the people in `platform.team_members` see them according
-- to their role (viewer reads, editor writes, owner also manages the team).
--
-- Apps never touch the two platform tables. They use the functions below (`mn.team`), and their
-- own tables get their policies from `platform.secure_table(slug, table, 'team')`.

alter type platform.data_mode add value if not exists 'team';

create type platform.team_role as enum ('viewer', 'editor', 'owner'); -- in this order

create table platform.teams (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index teams_app_idx on platform.teams (app_slug);

create table platform.team_members (
  team_id uuid not null references platform.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role platform.team_role not null default 'editor',
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on platform.team_members (user_id);

-- Only the functions below read or write these tables.
alter table platform.teams enable row level security;
alter table platform.teams force row level security;
alter table platform.team_members enable row level security;
alter table platform.team_members force row level security;
revoke all on platform.teams, platform.team_members from public, anon, authenticated;
grant all on platform.teams, platform.team_members to service_role;

-- The caller's role in a team of this app; null when not a member or not on that app's page.
create function platform.team_role_in(p_team uuid, p_slug text)
returns platform.team_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from platform.team_members m
  join platform.teams t on t.id = m.team_id
  where m.team_id = p_team
    and m.user_id = (select auth.uid())
    and t.app_slug = p_slug
    and (select platform.app_access(p_slug));
$$;

-- Does the caller have at least this role in the team (a team of the app that sent the request)?
create function platform.team_can(p_team uuid, p_min platform.team_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select platform.team_role_in(p_team, t.app_slug) >= p_min
     from platform.teams t where t.id = p_team),
    false);
$$;

-- Files of a team live under `<slug>/team-<team id>/…`; the same rule for rows and files.
create function platform.team_can_file(p_name text, p_min platform.team_role)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if split_part(p_name, '/', 2) !~ '^team-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_team := substr(split_part(p_name, '/', 2), 6)::uuid;
  return coalesce((select platform.team_role_in(v_team, split_part(p_name, '/', 1)) >= p_min), false);
end;
$$;

-- Whether another user could use the app (the same rule as has_grant, for any user).
create function platform.user_may_use_app(p_user uuid, p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from platform.apps a
    join platform.profiles p on p.user_id = p_user
    where a.slug = p_slug
      and a.status <> 'disabled'
      and p.role = any (a.allowed_roles)
      and (
        p.role = 'admin'
        or exists (select 1 from platform.app_grants g where g.app_slug = a.slug and g.user_id = p.user_id)
      )
  );
$$;

create function platform.team_create(p_slug text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not (select platform.app_access(p_slug)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(btrim(p_name)) = 0 then
    raise exception 'a team needs a name' using errcode = '22023';
  end if;
  -- A generous cap, so an automated caller cannot fill the table.
  if (select count(*) from platform.teams where app_slug = p_slug and created_by = (select auth.uid())) >= 50 then
    raise exception 'too many teams' using errcode = '54000';
  end if;
  insert into platform.teams (app_slug, name, created_by)
  values (p_slug, btrim(p_name), (select auth.uid()))
  returning id into v_id;
  insert into platform.team_members (team_id, user_id, role, added_by)
  values (v_id, (select auth.uid()), 'owner', (select auth.uid()));
  return v_id;
end;
$$;

create function platform.team_list(p_slug text)
returns table (id uuid, name text, role platform.team_role, member_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, m.role,
    (select count(*)::int from platform.team_members x where x.team_id = t.id)
  from platform.teams t
  join platform.team_members m on m.team_id = t.id and m.user_id = (select auth.uid())
  where t.app_slug = p_slug and (select platform.app_access(p_slug))
  order by t.name, t.created_at;
$$;

create function platform.team_members_of(p_team uuid)
returns table (user_id uuid, display_name text, role platform.team_role)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.display_name, m.role
  from platform.team_members m
  join platform.profiles p on p.user_id = m.user_id
  where m.team_id = p_team and (select platform.team_can(p_team, 'viewer'))
  order by m.role desc, p.display_name;
$$;

create function platform.team_rename(p_team uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select platform.team_can(p_team, 'owner')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update platform.teams set name = btrim(p_name) where id = p_team;
end;
$$;

create function platform.team_delete(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select platform.team_can(p_team, 'owner')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- The rows of the team in the app's tables go with it (their foreign key cascades).
  delete from platform.teams where id = p_team;
end;
$$;

-- Adds a person or changes their role (owners only). Only people who may use the app can join.
create function platform.team_set_member(p_team uuid, p_user uuid, p_role platform.team_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if not (select platform.team_can(p_team, 'owner')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- One owner change at a time per team, so two owners cannot demote each other to zero owners.
  select app_slug into v_slug from platform.teams where id = p_team for update;
  if not platform.user_may_use_app(p_user, v_slug) then
    raise exception 'this person cannot use the app' using errcode = '22023';
  end if;
  if p_role <> 'owner'
    and exists (select 1 from platform.team_members where team_id = p_team and user_id = p_user and role = 'owner')
    and (select count(*) from platform.team_members where team_id = p_team and role = 'owner') = 1 then
    raise exception 'a team needs an owner' using errcode = '22023';
  end if;
  insert into platform.team_members (team_id, user_id, role, added_by)
  values (p_team, p_user, p_role, (select auth.uid()))
  on conflict (team_id, user_id) do update set role = excluded.role;
end;
$$;

-- Removes a person (owners), or the caller leaves (anyone). The last owner cannot go.
create function platform.team_remove_member(p_team uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is distinct from (select auth.uid()) then
    if not (select platform.team_can(p_team, 'owner')) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  elsif not (select platform.team_can(p_team, 'viewer')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform 1 from platform.teams where id = p_team for update;
  if exists (select 1 from platform.team_members where team_id = p_team and user_id = p_user and role = 'owner')
    and (select count(*) from platform.team_members where team_id = p_team and role = 'owner') = 1 then
    raise exception 'a team needs an owner' using errcode = '22023';
  end if;
  delete from platform.team_members where team_id = p_team and user_id = p_user;
end;
$$;

-- A bell notification (and push) for a team member, e.g. "Anna assigned you a task". The sender
-- must be an editor, the receiver a member; the app name is the caller's own page.
create function platform.team_notify(p_team uuid, p_user uuid, p_title text, p_body text default null, p_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if not (select platform.team_can(p_team, 'editor')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'a notification needs a title' using errcode = '22023';
  end if;
  -- Only a link inside MiniNode: a relative path, never another site or a script.
  if p_url is not null and p_url !~ '^/[^/\\]' and p_url <> '/' then
    raise exception 'the link must be a path on this site' using errcode = '22023';
  end if;
  select app_slug into v_slug from platform.teams where id = p_team;
  if not exists (select 1 from platform.team_members where team_id = p_team and user_id = p_user) then
    raise exception 'not a member' using errcode = '22023';
  end if;
  if p_user is distinct from (select auth.uid()) then
    insert into platform.notifications (user_id, app_slug, title, body, url)
    values (p_user, v_slug, left(p_title, 200), left(p_body, 1000), left(p_url, 500));
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'team_role_in(uuid, text)', 'team_can(uuid, platform.team_role)',
    'team_can_file(text, platform.team_role)', 'user_may_use_app(uuid, text)',
    'team_create(text, text)', 'team_list(text)', 'team_members_of(uuid)', 'team_rename(uuid, text)',
    'team_delete(uuid)', 'team_set_member(uuid, uuid, platform.team_role)',
    'team_remove_member(uuid, uuid)', 'team_notify(uuid, uuid, text, text, text)'
  ] loop
    execute format('revoke execute on function platform.%s from public, anon', f);
    execute format('grant execute on function platform.%s to authenticated, service_role', f);
  end loop;
  -- Internal helper: not a public entry point.
  revoke execute on function platform.user_may_use_app(uuid, text) from authenticated;
end;
$$;

-- Files of a team: readable by viewers, writable by editors. Everything else as before.
create function platform.may_write_app_file(p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 2) like 'team-%' then (select platform.team_can_file(p_name, 'editor'))
    else (select platform.may_access_app_file(p_name))
  end;
$$;
revoke execute on function platform.may_write_app_file(text) from public, anon;
grant execute on function platform.may_write_app_file(text) to authenticated;

create or replace function platform.may_access_app_file(p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 2) like 'team-%' then (select platform.team_can_file(p_name, 'viewer'))
    else (select platform.app_access(split_part(p_name, '/', 1)))
      and (
        split_part(p_name, '/', 2) = 'shared'
        or split_part(p_name, '/', 2) = (select platform.effective_owner(split_part(p_name, '/', 1)))::text
      )
  end;
$$;

drop policy app_files_insert on storage.objects;
drop policy app_files_update on storage.objects;
drop policy app_files_delete on storage.objects;
create policy app_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'app-files' and (select platform.may_write_app_file(name)));
create policy app_files_update on storage.objects for update to authenticated
  using (bucket_id = 'app-files' and (select platform.may_write_app_file(name)))
  with check (bucket_id = 'app-files' and (select platform.may_write_app_file(name)));
create policy app_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'app-files' and (select platform.may_write_app_file(name)));

-- Tables of apps with data mode `team`: every row carries `team_id` (foreign key to the team, rows
-- go with it). Viewers read, editors write. `created_by` is filled with the author when the table
-- has that column.
create or replace function platform.secure_table(p_slug text, p_table text, p_mode platform.data_mode)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_schema text := platform.app_schema_name(p_slug);
  v_grant text := format('(select platform.app_access(%L))', p_slug);
  v_owner text;
  v_rel regclass := format('%I.%I', v_schema, p_table)::regclass;
begin
  execute format('alter table %s enable row level security', v_rel);
  execute format('alter table %s force row level security', v_rel);
  execute format('revoke all on %s from public, anon, authenticated', v_rel);

  if p_mode = 'team' then
    if not exists (
      select 1 from pg_attribute
      where attrelid = v_rel and attname = 'team_id' and not attisdropped
        and atttypid = 'uuid'::regtype and attnotnull
    ) then
      raise exception '%.% needs a team_id uuid not null column for mode team', v_schema, p_table;
    end if;
    if not exists (
      select 1 from pg_constraint c
      where c.conrelid = v_rel and c.contype = 'f' and c.confrelid = 'platform.teams'::regclass
        and c.confdeltype = 'c'
    ) then
      execute format(
        'alter table %s add constraint %I foreign key (team_id) references platform.teams (id) on delete cascade',
        v_rel, p_table || '_team_fk');
    end if;
    execute format('create index if not exists %I on %s (team_id)', p_table || '_team_id_idx', v_rel);
    if exists (
      select 1 from pg_attribute
      where attrelid = v_rel and attname = 'created_by' and not attisdropped and atttypid = 'uuid'::regtype
    ) then
      execute format('alter table %s alter column created_by set default auth.uid()', v_rel);
    end if;
    execute format('grant select, insert, update, delete on %s to authenticated', v_rel);
    execute format('create policy %I on %s for select to authenticated using (%s and (select platform.team_can(team_id, ''viewer'')))',
      p_table || '_team_read', v_rel, v_grant);
    execute format(
      'create policy %I on %s for insert to authenticated with check (%s and (select platform.team_can(team_id, ''editor'')))',
      p_table || '_team_insert', v_rel, v_grant);
    execute format(
      'create policy %I on %s for update to authenticated using (%s and (select platform.team_can(team_id, ''editor''))) with check (%s and (select platform.team_can(team_id, ''editor'')))',
      p_table || '_team_update', v_rel, v_grant, v_grant);
    execute format(
      'create policy %I on %s for delete to authenticated using (%s and (select platform.team_can(team_id, ''editor'')))',
      p_table || '_team_delete', v_rel, v_grant);

  elsif p_mode in ('private', 'shared-account') then
    if not exists (
      select 1 from pg_attribute
      where attrelid = v_rel and attname = 'owner_id' and not attisdropped
        and atttypid = 'uuid'::regtype
    ) then
      raise exception '%.% needs an owner_id uuid column for mode %', v_schema, p_table, p_mode;
    end if;

    v_owner := case p_mode
      when 'private' then '(select auth.uid())'
      else format('(select platform.effective_owner(%L))', p_slug)
    end;

    execute format('alter table %s alter column owner_id set default %s', v_rel,
      case p_mode when 'private' then 'auth.uid()' else format('platform.effective_owner(%L)', p_slug) end);
    execute format('alter table %s alter column owner_id set not null', v_rel);
    execute format('create index if not exists %I on %s (owner_id)', p_table || '_owner_id_idx', v_rel);
    execute format('grant select, insert, update, delete on %s to authenticated', v_rel);
    execute format(
      'create policy %I on %s for all to authenticated using (%s and owner_id = %s) with check (%s and owner_id = %s)',
      p_table || '_' || replace(p_mode::text, '-', '_'), v_rel, v_grant, v_owner, v_grant, v_owner);

    if p_mode = 'shared-account' then
      execute format(
        'create trigger %I after insert or update or delete on %s for each row execute function platform.audit_shared_write(%L)',
        p_table || '_audit', v_rel, p_slug);
    end if;

  elsif p_mode = 'group' then
    execute format('grant select, insert, update, delete on %s to authenticated', v_rel);
    execute format('create policy %I on %s for all to authenticated using (%s) with check (%s)',
      p_table || '_group', v_rel, v_grant, v_grant);

  elsif p_mode = 'readonly' then
    execute format('grant select on %s to authenticated', v_rel);
    execute format('create policy %I on %s for select to authenticated using (%s)',
      p_table || '_readonly', v_rel, v_grant);

  else
    raise exception 'mode % has no table template', p_mode;
  end if;

  execute format('grant all on %s to service_role', v_rel);
end;
$$;
revoke execute on function platform.secure_table(text, text, platform.data_mode) from public, anon, authenticated;
