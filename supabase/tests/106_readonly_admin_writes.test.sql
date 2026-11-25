-- Data mode readonly (ADR 0031): everyone with the app reads, only admins write, and only from
-- the app's own page.
begin;
select plan(13);
select tests.reset();

select tests.create_user('admin@example.com', 'Admin') as admin_id \gset
select tests.create_user('user@example.com', 'User') as user_id \gset
update platform.profiles set role = 'admin' where user_id = :'admin_id';

insert into platform.apps (slug, name, description, kind, target, manifest, data_mode, owner_id, status)
values ('vereinsregeln', 'Vereinsregeln', 'Rules', 'spa', 'cloudflare', '{}', 'readonly', null, 'online');
insert into platform.app_grants (user_id, app_slug) values
  (:'admin_id', 'vereinsregeln'), (:'user_id', 'vereinsregeln');

select platform.create_app_schema('vereinsregeln');
create table app_vereinsregeln.rules (id uuid primary key default gen_random_uuid(), title text not null);
select platform.secure_table('vereinsregeln', 'rules', 'readonly');
insert into app_vereinsregeln.rules (title) values ('Seed aus db/001_init.sql');

select tests.login(:'admin_id');
select tests.as_app('vereinsregeln');
select lives_ok(
  $$insert into app_vereinsregeln.rules (title) values ('Neue Regel')$$,
  'an admin adds a row from the app');
select lives_ok(
  $$update app_vereinsregeln.rules set title = 'Geändert' where title = 'Neue Regel'$$,
  'an admin changes a row');
select is((select count(*)::int from app_vereinsregeln.rules where title = 'Geändert'), 1,
  'the change is stored');

select tests.login(:'user_id');
select is((select count(*)::int from app_vereinsregeln.rules), 2, 'a reader sees every row');
select throws_ok(
  $$insert into app_vereinsregeln.rules (title) values ('Nicht erlaubt')$$,
  '42501', null, 'a reader cannot add rows');
update app_vereinsregeln.rules set title = 'Überschrieben';
select is((select count(*)::int from app_vereinsregeln.rules where title = 'Überschrieben'), 0,
  'a reader cannot change rows');
delete from app_vereinsregeln.rules;
select is((select count(*)::int from app_vereinsregeln.rules), 2, 'a reader cannot delete rows');

-- Not from another page: the admin's write needs the app's own origin (platform.app_access).
select tests.login(:'admin_id');
select tests.as_app(null);
select throws_ok(
  $$insert into app_vereinsregeln.rules (title) values ('Von außen')$$,
  '42501', null, 'an admin cannot write without the app''s origin');

select tests.logout();
select ok(
  (select count(*) = 4 from pg_policies
   where schemaname = 'app_vereinsregeln' and tablename = 'rules'),
  'one read and three admin write policies');

-- A readonly table made before ADR 0031 (select only, serial id) gets the admin writes from the
-- retrofit the migration runs.
insert into platform.apps (slug, name, description, kind, target, manifest, data_mode, owner_id, status)
values ('preise', 'Preise', 'Prices', 'spa', 'cloudflare', '{}', 'readonly', null, 'online');
insert into platform.app_grants (user_id, app_slug) values (:'admin_id', 'preise');
select platform.create_app_schema('preise');
create table app_preise.items (id serial primary key, title text not null);
alter table app_preise.items enable row level security;
grant select on app_preise.items to authenticated;
create policy items_readonly on app_preise.items for select to authenticated
  using ((select platform.app_access('preise')));
select ok(platform.retrofit_readonly_admin_writes() >= 1, 'the retrofit finds the old table');
select is(
  (select count(*)::int from pg_policies where schemaname = 'app_preise' and tablename = 'items'),
  4, 'the old table now has the admin write policies');
select tests.login(:'admin_id');
select tests.as_app('preise');
select lives_ok($$insert into app_preise.items (title) values ('Kaffee')$$,
  'an admin adds a row to a table with a serial id');
select tests.logout();
select ok(
  not has_table_privilege('anon', 'app_preise.items', 'SELECT'),
  'anon gets nothing on readonly tables');

select * from finish();
rollback;
