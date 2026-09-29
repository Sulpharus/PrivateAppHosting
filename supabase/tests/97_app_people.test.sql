begin;
select plan(6);
select tests.reset();

select tests.create_user('admin@example.com', 'Wolfram') as admin_id \gset
select tests.create_user('lena@example.com', 'Lena') as lena_id \gset
select tests.create_user('tom@example.com', 'Tom') as tom_id \gset
select tests.create_user('mia@example.com', 'Mia') as mia_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('medien', 'Medien', 'x', 'spa', 'cloudflare', '{}', 'online'),
  ('other', 'Andere', 'x', 'spa', 'cloudflare', '{}', 'online');
insert into platform.app_grants (user_id, app_slug) values
  (:'lena_id', 'medien'), (:'tom_id', 'medien');

select tests.login(:'lena_id');
select tests.as_app('medien');
select is((select array_agg(display_name order by display_name) from platform.app_people('medien')),
  array['Tom', 'Wolfram'], 'people with access, without the caller and without others');
select tests.as_app('other');
select is((select count(*)::int from platform.app_people('medien')), 0,
  'only from the app''s own page');
select tests.as_app('medien');
select tests.logout();
update platform.apps set allowed_roles = array['admin']::platform.user_role[] where slug = 'medien';
select tests.login(:'admin_id');
select is((select count(*)::int from platform.app_people('medien')), 0,
  'people whose role the app does not allow are left out');
select tests.logout();
update platform.apps set allowed_roles = default, status = 'disabled' where slug = 'medien';
select tests.login(:'admin_id');
select is((select count(*)::int from platform.app_people('medien')), 0,
  'nobody for a disabled app');
select tests.logout();
update platform.apps set status = 'online' where slug = 'medien';
select tests.login(:'mia_id');
select is((select count(*)::int from platform.app_people('medien')), 0,
  'nothing for people without access');
select tests.logout();
set local role anon;
select throws_ok($$select * from platform.app_people('medien')$$, '42501', null,
  'not for anonymous callers');
reset role;

select * from finish();
rollback;
