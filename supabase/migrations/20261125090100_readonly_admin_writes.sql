-- Data mode readonly: everyone with the app reads, and admins can now write from the app (ADR 0031).
-- Before, readonly tables granted only select, so content could only come from the app's own SQL
-- files. secure_table now adds admin write policies for new tables, and the loop below adds them to
-- every readonly table that already exists. Each policy keeps platform.app_access (ADR 0002), so an
-- admin writes only through the app's own page.

/** Insert, update and delete for admins on one readonly table (idempotent). */
create function platform.readonly_admin_policies(p_rel regclass, p_table text, p_grant text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_check text := format('(%s and (select platform.is_admin()))', p_grant);
begin
  execute format('drop policy if exists %I on %s', p_table || '_admin_insert', p_rel);
  execute format('drop policy if exists %I on %s', p_table || '_admin_update', p_rel);
  execute format('drop policy if exists %I on %s', p_table || '_admin_delete', p_rel);
  execute format('create policy %I on %s for insert to authenticated with check %s',
    p_table || '_admin_insert', p_rel, v_check);
  execute format('create policy %I on %s for update to authenticated using %s with check %s',
    p_table || '_admin_update', p_rel, v_check, v_check);
  execute format('create policy %I on %s for delete to authenticated using %s',
    p_table || '_admin_delete', p_rel, v_check);
end;
$$;
revoke execute on function platform.readonly_admin_policies(regclass, text, text)
  from public, anon, authenticated;

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
    -- Everyone with the app reads; only admins write (ADR 0031).
    execute format('grant select, insert, update, delete on %s to authenticated', v_rel);
    execute format('create policy %I on %s for select to authenticated using (%s)',
      p_table || '_readonly', v_rel, v_grant);
    perform platform.readonly_admin_policies(v_rel, p_table, v_grant);

  else
    raise exception 'mode % has no table template', p_mode;
  end if;

  execute format('grant all on %s to service_role', v_rel);
end;
$$;
revoke execute on function platform.secure_table(text, text, platform.data_mode)
  from public, anon, authenticated;

-- Existing readonly tables: the select policy is named <table>_readonly (secure_table above).
do $$
declare
  r record;
  v_slug text;
begin
  for r in
    select p.schemaname, p.tablename
    from pg_policies p
    where p.schemaname like 'app\_%' and p.policyname = p.tablename || '_readonly'
  loop
    select a.slug into v_slug from platform.apps a
    where platform.app_schema_name(a.slug) = r.schemaname;
    if v_slug is null then
      continue;
    end if;
    execute format('grant insert, update, delete on %I.%I to authenticated', r.schemaname, r.tablename);
    perform platform.readonly_admin_policies(
      format('%I.%I', r.schemaname, r.tablename)::regclass,
      r.tablename,
      format('(select platform.app_access(%L))', v_slug));
  end loop;
end;
$$;
