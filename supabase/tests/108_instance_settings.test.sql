-- Settings for the whole installation (Verwaltung → Einstellungen): everyone signed in reads them,
-- only an admin with a recent sign-in changes them.
begin;
select plan(7);
select tests.reset();

select tests.create_user('admin@example.com', 'Admin') as admin_id \gset
select tests.create_user('user@example.com', 'User') as user_id \gset
update platform.profiles set role = 'admin' where user_id = :'admin_id';

select tests.login(:'user_id');
select is((select external_viewer from platform.instance_settings), false,
  'a user reads the settings; the viewer for outside websites starts off');
update platform.instance_settings set external_viewer = true;

select tests.login(:'admin_id');
select is((select external_viewer from platform.instance_settings), false,
  'a user''s update changed nothing');
update platform.instance_settings set external_viewer = true;
select is((select updated_by from platform.instance_settings), :'admin_id'::uuid,
  'the admin switches it on and is recorded');

select tests.login(:'admin_id', 3600);
select throws_ok($$update platform.instance_settings set external_viewer = false$$,
  '42501', null, 'a change needs a recent sign-in');

select tests.login(:'admin_id');
select throws_ok($$insert into platform.instance_settings (id) values (2)$$,
  '42501', null, 'nobody adds a second row');
select throws_ok($$delete from platform.instance_settings$$, '42501', null, 'nobody deletes the row');
select tests.logout();
select ok(not has_table_privilege('anon', 'platform.instance_settings', 'SELECT'), 'anon gets nothing');

select * from finish();
rollback;
