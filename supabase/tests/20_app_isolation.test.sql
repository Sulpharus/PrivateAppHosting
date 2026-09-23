begin;
select plan(15);

select tests.create_user('owner@example.com', 'Owner') as owner_id \gset
select tests.create_user('trusted@example.com', 'Trusted') as trusted_id \gset
select tests.create_user('user@example.com', 'User') as user_id \gset
update platform.profiles set role = 'trusted' where user_id = :'trusted_id';

insert into platform.apps (slug, name, description, kind, target, manifest, data_mode, owner_id, status)
values
  ('rezepte', 'Rezepte', 'Recipes', 'spa', 'cloudflare', '{}', 'private', null, 'online'),
  ('haushalt', 'Haushalt', 'Household', 'spa', 'cloudflare', '{}', 'shared-account', :'owner_id', 'online'),
  ('pinnwand', 'Pinnwand', 'Board', 'spa', 'cloudflare', '{}', 'group', null, 'online');

insert into platform.app_grants (user_id, app_slug) values
  (:'trusted_id', 'rezepte'), (:'trusted_id', 'haushalt'), (:'trusted_id', 'pinnwand'),
  (:'user_id', 'rezepte'), (:'user_id', 'haushalt');

-- Apps create their schema and tables exactly like hosted/<slug>/db migrations do.
select platform.create_app_schema('rezepte');
create table app_rezepte.recipes (id uuid primary key default gen_random_uuid(), owner_id uuid, title text not null);
select platform.secure_table('rezepte', 'recipes', 'private');

select platform.create_app_schema('haushalt');
create table app_haushalt.entries (id uuid primary key default gen_random_uuid(), owner_id uuid, label text not null);
select platform.secure_table('haushalt', 'entries', 'shared-account');

select platform.create_app_schema('pinnwand');
create table app_pinnwand.notes (id uuid primary key default gen_random_uuid(), body text not null);
select platform.secure_table('pinnwand', 'notes', 'group');

-- private: each user sees only their own rows
select tests.login(:'user_id');
insert into app_rezepte.recipes (title) values ('Linsensuppe');
select tests.login(:'trusted_id');
insert into app_rezepte.recipes (title) values ('Pasta');
select is((select count(*)::int from app_rezepte.recipes), 1, 'private rows are invisible to others');
select throws_ok(
  format('insert into app_rezepte.recipes (owner_id, title) values (%L, %L)', :'user_id', 'Fake'),
  '42501', null, 'cannot write rows owned by someone else');

-- shared-account: trusted users act on the owner's rows, plain users on their own
select tests.login(:'owner_id');
insert into app_haushalt.entries (label) values ('Strom');
select tests.login(:'trusted_id');
select is((select count(*)::int from app_haushalt.entries), 1, 'trusted user sees the owner rows');
insert into app_haushalt.entries (label) values ('Wasser');
select is((select owner_id from app_haushalt.entries where label = 'Wasser'), :'owner_id'::uuid,
  'trusted user writes as the owner');
select tests.login(:'user_id');
select is((select count(*)::int from app_haushalt.entries), 0, 'plain user does not see shared-account rows');
select tests.logout();
select is(
  (select count(*)::int from platform.audit_log where app_slug = 'haushalt' and actor_id = :'trusted_id'
     and acting_as = :'owner_id'),
  1, 'shared-account writes are audited with the real actor');

-- group: everyone with a grant; users without the grant see nothing
select tests.login(:'trusted_id');
insert into app_pinnwand.notes (body) values ('Hallo');
select is((select count(*)::int from app_pinnwand.notes), 1, 'group rows visible with grant');
select tests.login(:'user_id');
select is((select count(*)::int from app_pinnwand.notes), 0, 'group rows invisible without grant');
select throws_ok($$insert into app_pinnwand.notes (body) values ('x')$$, '42501', null,
  'no writes without grant');

-- revoking the grant cuts access immediately
select tests.logout();
delete from platform.app_grants where user_id = :'user_id' and app_slug = 'rezepte';
select tests.login(:'user_id');
select is((select count(*)::int from app_rezepte.recipes), 0, 'revoked grant hides own rows too');
select tests.logout();

-- disabled apps are closed for everyone
update platform.apps set status = 'disabled' where slug = 'pinnwand';
select tests.login(:'trusted_id');
select is((select count(*)::int from app_pinnwand.notes), 0, 'disabled app hides all rows');
select tests.logout();

-- Meta checks over every app schema in the database (fixtures above and applied hosted apps).
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname like 'app\_%' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'every app table has RLS enabled');
select is(
  (select count(*)::int from pg_policies
    where schemaname like 'app\_%'
      and coalesce(qual, '') || coalesce(with_check, '') not like '%has_grant%'),
  0, 'every app policy checks platform.has_grant');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema like 'app\_%' and grantee in ('anon', 'PUBLIC')),
  0, 'anon and PUBLIC have no privileges on app tables');
select is(
  (select count(*)::int from pg_namespace n
    where n.nspname like 'app\_%' and has_schema_privilege('anon', n.oid, 'USAGE')),
  0, 'anon cannot use app schemas');

select * from finish();
rollback;
