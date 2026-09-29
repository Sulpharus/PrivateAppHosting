begin;
select plan(18);
select tests.reset();

select tests.create_user('owner@example.com') as owner_id \gset
select tests.create_user('user@example.com') as user_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('wetter', 'Wetter', 'x', 'spa', 'cloudflare', '{}', 'online'),
  ('garten', 'Garten', 'x', 'spa', 'cloudflare', '{}', 'online');

-- Deploy registers the APIs (service role).
select lives_ok($$select platform.register_app_apis('wetter', '[{"id":"openweathermap","name":"OpenWeatherMap","baseUrl":"https://api.openweathermap.org/data/2.5","auth":{"type":"query","param":"appid"},"docs":"https://openweathermap.org/api","reason":"Wetter"}]')$$,
  'an app registers an API');
select lives_ok($$select platform.register_app_apis('garten', '[{"id":"openweathermap","name":"OpenWeatherMap","baseUrl":"https://api.openweathermap.org/data/2.5","auth":{"type":"query","param":"appid"},"reason":"Frost-Warnung"}]')$$,
  'a second app with the same API');
select is((select count(*)::int from platform.api_services), 1, 'the same API is one entry');
select is((select count(*)::int from platform.app_api_services where service_id = 'openweathermap'), 2,
  'both apps are listed for it');
select is((select docs_url from platform.api_services), 'https://openweathermap.org/api',
  'a missing docs link does not erase a known one');
select throws_ok($$select platform.register_app_apis('garten', '[{"id":"openweathermap","name":"X","baseUrl":"https://evil.example.com","auth":{"type":"bearer"},"reason":"x"}]')$$,
  '23505', null, 'another definition for a shared id stops the deploy');
select platform.register_app_apis('garten', '[]');
select is((select count(*)::int from platform.app_api_services where app_slug = 'garten'), 0,
  'dropping the API from the manifest removes the request');

-- A changed target drops the stored key (it was entered for the old host).
update platform.api_services set key_enc = 'secret', key_hint = 'abcd';
select platform.register_app_apis('wetter', '[]');
select platform.register_app_apis('garten', '[{"id":"openweathermap","name":"X","baseUrl":"https://evil.example.com","auth":{"type":"header","name":"X-Steal"},"reason":"x"}]');
select is((select key_enc from platform.api_services), null,
  'taking over an unused entry with another baseUrl drops the key');
update platform.api_services set key_enc = 'secret', key_hint = 'abcd';
select platform.register_app_apis('garten', '[{"id":"openweathermap","name":"X","baseUrl":"https://evil.example.com","auth":{"type":"header","name":"X-Steal"},"reason":"y"}]');
select is((select key_hint from platform.api_services where id = 'openweathermap'), 'abcd', 'an unchanged target keeps the key');
select throws_ok($$select platform.register_app_apis('garten', '[{"id":"x-ip","name":"X","baseUrl":"https://127.0.0.1","auth":{"type":"bearer"},"reason":"x"}]')$$,
  '23514', null, 'IP literals are refused');
select throws_ok($$select platform.register_app_apis('garten', '[{"id":"x-hdr","name":"X","baseUrl":"https://a.example.com","auth":{"type":"header","name":"Cookie"},"reason":"x"}]')$$,
  '23514', null, 'forbidden header names are refused');
select throws_ok($$delete from platform.api_services where id = 'openweathermap'$$, '23503', null,
  'an entry in use cannot be removed');
select lives_ok($$select platform.register_app_apis('garten', '[{"id":"openlibrary","name":"Open Library","baseUrl":"https://openlibrary.org","auth":{"type":"none"},"reason":"Buchdaten"}]')$$,
  'keyless APIs are accepted');
select throws_ok($$select platform.register_app_apis('garten', '[{"id":"openlibrary","name":"Open Library","baseUrl":"https://openlibrary.org","auth":{"type":"none","param":"key"},"reason":"Buchdaten"}]')$$,
  '23514', null, 'a keyless API carries no key placement');
select platform.register_app_apis('garten', '[{"id":"openweathermap","name":"OpenWeatherMap","baseUrl":"https://api.openweathermap.org/data/2.5","auth":{"type":"query","param":"appid"},"reason":"Wetter"}]');

-- Visibility: admins see the list without the ciphertext; users see nothing.
update platform.api_services set key_enc = 'secret', key_hint = 'abcd';
select tests.login(:'owner_id');
select is((select key_hint from platform.api_services where id = 'openweathermap'), 'abcd', 'the admin sees the key hint');
select throws_ok('select key_enc from platform.api_services', '42501', null,
  'nobody reads the encrypted key through the API');
select tests.login(:'user_id');
select is((select count(*)::int from platform.api_services), 0, 'users do not see the list');
select throws_ok($$select platform.register_app_apis('wetter', '[]')$$, '42501', null,
  'only deploys register APIs');

select * from finish();
rollback;
