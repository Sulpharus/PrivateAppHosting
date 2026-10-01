begin;
select plan(29);
select tests.reset();

-- The first user becomes admin (bootstrap).
select tests.create_user('admin@example.com') as admin_id \gset
select tests.create_user('anna@example.com') as anna_id \gset
select tests.create_user('ben@example.com') as ben_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('wetter', 'Wetter', 'x', 'spa', 'cloudflare', '{}', 'online'),
  ('garten', 'Garten', 'x', 'spa', 'cloudflare', '{}', 'online');
insert into platform.app_grants (user_id, app_slug) values
  (:'anna_id', 'wetter'), (:'anna_id', 'garten'), (:'ben_id', 'garten');

-- ---------- uploads ----------
insert into platform.submissions (kind, filename, size_bytes, storage_path, created_by)
values ('webapp', 'sentinel.zip', 1000, 'abc/sentinel.zip', :'admin_id');
select tests.login(:'admin_id');
select is((select count(*)::int from platform.submissions), 1, 'the admin sees uploads');
select throws_ok($$insert into platform.submissions (kind, filename, size_bytes, storage_path) values ('webapp', 'x.zip', 1, 'x')$$,
  '42501', null, 'the admin writes through the API only');
select tests.login(:'anna_id');
select is((select count(*)::int from platform.submissions), 0, 'users do not see uploads');
select tests.logout();
select throws_ok($$insert into platform.submissions (kind, filename, size_bytes, storage_path, status) values ('webapp', 'x.zip', 1, 'x', 'bogus')$$,
  '23514', null, 'unknown states are refused');
select is((select public from storage.buckets where id = 'submissions'), false, 'the upload bucket is private');

-- ---------- drawers ----------
select tests.login(:'anna_id');
insert into platform.user_drawers (name) values ('Alltag');
select id as drawer_id from platform.user_drawers \gset
select is((select count(*)::int from platform.user_drawers), 1, 'a user creates a drawer');
select lives_ok(format($$insert into platform.user_drawer_items (drawer_id, app_slug, position) values (%L, 'wetter', 0)$$, :'drawer_id'),
  'an app the user may open goes into the drawer');
select tests.login(:'ben_id');
select is((select count(*)::int from platform.user_drawers), 0, 'drawers are private');
select throws_ok($$insert into platform.user_drawers (user_id, name) values ((select user_id from platform.profiles where display_name = 'anna'), 'Fremd')$$,
  '42501', null, 'nobody creates drawers for someone else');
select throws_ok(format($$insert into platform.user_drawer_items (drawer_id, app_slug) values (%L, 'garten')$$, :'drawer_id'),
  '42501', null, 'nobody fills someone else''s drawer');
insert into platform.user_drawers (name) values ('Ben');
select id as ben_drawer from platform.user_drawers \gset
select throws_ok(format($$insert into platform.user_drawer_items (drawer_id, app_slug) values (%L, 'wetter')$$, :'ben_drawer'),
  '42501', null, 'an app without a grant cannot go into a drawer');
select throws_ok($$insert into platform.user_drawers (name) values ('   ')$$, '23514', null,
  'a drawer needs a name');
select throws_ok($$insert into platform.user_drawers (name, area) values ('Spiele', 'oben')$$, '23514', null,
  'a drawer belongs to apps or games');
insert into platform.user_drawers (name) select 'D' || n from generate_series(1, 29) n;
select throws_ok($$insert into platform.user_drawers (name) values ('zu viele')$$, '54000', null,
  'at most 30 drawers per area');
select lives_ok($$insert into platform.user_drawers (name, area) values ('Spiele', 'games')$$,
  'the limit counts per area');

-- ---------- order ----------
select lives_ok($$insert into platform.user_app_order (scope, slugs) values ('all', '{garten,wetter}')$$,
  'a user saves an order');
select throws_ok($$insert into platform.user_app_order (scope, slugs) values ('x y', '{a}')$$, '23514', null,
  'a scope is a short word with an optional id');
select throws_ok($$insert into platform.user_app_order (scope, slugs) values ('favorites', '{"a b"}')$$, '23514', null,
  'only app addresses are stored');
select tests.login(:'anna_id');
select is((select count(*)::int from platform.user_app_order), 0, 'an order belongs to its owner');

-- ---------- API keys: site-wide or personal ----------
select tests.logout();
select platform.register_app_apis('wetter', '[{"id":"owm","name":"OpenWeatherMap","baseUrl":"https://api.openweathermap.org/data/2.5","auth":{"type":"query","param":"appid"},"docs":"https://openweathermap.org/api","reason":"Wetter"}]');
select is((select key_mode from platform.api_services where id = 'owm'), 'sitewide', 'keys are site-wide by default');
select tests.login(:'anna_id');
select is((select count(*)::int from platform.my_api_keys()), 0, 'site-wide APIs ask nobody for a key');
select tests.logout();
update platform.api_services set key_mode = 'personal' where id = 'owm';
select tests.login(:'anna_id');
select is((select count(*)::int from platform.my_api_keys()), 1, 'a personal API is listed for someone with the app');
select is((select key_hint from platform.my_api_keys()), null, 'without a key yet');
select tests.login(:'ben_id');
select is((select count(*)::int from platform.my_api_keys()), 0, 'not for someone without an app that needs it');
select tests.logout();
insert into platform.user_api_keys (user_id, service_id, key_enc, key_hint) values (:'anna_id', 'owm', 'cipher', 'wxyz');
select tests.login(:'anna_id');
select is((select key_hint from platform.my_api_keys()), 'wxyz', 'the user sees the hint of their own key');
select throws_ok('select key_enc from platform.user_api_keys', '42501', null, 'no client reads the ciphertext');
select tests.login(:'admin_id');
select is((select users::int from platform.admin_personal_key_counts() where service_id = 'owm'), 1,
  'the admin sees how many keys are entered');
select tests.login(:'ben_id');
select is((select count(*)::int from platform.admin_personal_key_counts()), 0, 'users see no counts');
select tests.logout();
select platform.register_app_apis('wetter', '[{"id":"owm","name":"OpenWeatherMap","baseUrl":"https://other.example.com","auth":{"type":"bearer"},"reason":"Wetter"}]');
select is((select count(*)::int from platform.user_api_keys), 0, 'a changed target drops every personal key');

select * from finish();
rollback;
