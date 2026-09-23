begin;
select plan(9);

select tests.create_user('owner@example.com') as owner_id \gset
select tests.create_user('trusted@example.com') as trusted_id \gset
select tests.create_user('user@example.com') as user_id \gset
update platform.profiles set role = 'trusted' where user_id = :'trusted_id';

insert into platform.apps (slug, name, description, kind, target, manifest, data_mode, owner_id, status) values
  ('todo', 'Todo', 'Tasks', 'spa', 'cloudflare', '{}', 'private', null, 'online'),
  ('kasse', 'Kasse', 'Shared', 'spa', 'cloudflare', '{}', 'shared-account', :'owner_id', 'online');
insert into platform.app_grants (user_id, app_slug) values
  (:'user_id', 'todo'), (:'trusted_id', 'todo'), (:'trusted_id', 'kasse'), (:'user_id', 'kasse');

select tests.login(:'user_id');
insert into platform.app_kv (app_slug, owner_id, key, value) values ('todo', :'user_id', 'list', '["a"]');
insert into platform.app_kv (app_slug, owner_id, key, value) values ('todo', null, 'motd', '"hi"');
select throws_ok(
  format($$insert into platform.app_kv (app_slug, owner_id, key, value) values ('todo', %L, 'x', '1')$$, :'trusted_id'),
  '42501', null, 'cannot write another user''s kv rows');

select tests.login(:'trusted_id');
select is((select count(*)::int from platform.app_kv where app_slug = 'todo'), 1, 'only shared kv rows of others are visible');
insert into platform.app_kv (app_slug, owner_id, key, value) values ('kasse', :'owner_id', 'saldo', '10');
select is((select count(*)::int from platform.app_kv where app_slug = 'kasse'), 1, 'trusted writes shared-account kv as owner');

select tests.login(:'user_id');
select is((select count(*)::int from platform.app_kv where app_slug = 'kasse'), 0, 'plain user cannot see owner kv');
select throws_ok(
  $$insert into platform.app_kv (app_slug, owner_id, key, value) values ('fremd', null, 'x', '1')$$,
  '42501', null, 'no kv access to apps without grant');

select ok(platform.may_access_app_file('todo/' || :'user_id' || '/a.png'), 'own file path allowed');
select ok(platform.may_access_app_file('todo/shared/a.png'), 'shared file path allowed');
select ok(not platform.may_access_app_file('todo/' || :'trusted_id' || '/a.png'), 'foreign file path denied');
select tests.login(:'trusted_id');
select ok(platform.may_access_app_file('kasse/' || :'owner_id' || '/beleg.pdf'), 'trusted may use owner files in shared-account app');
select tests.logout();

select * from finish();
rollback;
