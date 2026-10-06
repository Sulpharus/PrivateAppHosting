begin;
select plan(7);
select tests.reset();

select tests.create_user('admin@example.com', 'Wolfram') as admin_id \gset
select tests.create_user('lena@example.com', 'Lena') as lena_id \gset
update platform.profiles set role = 'admin' where user_id = :'admin_id';
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('kalender', 'Kalender', 'x', 'static', 'cloudflare', '{}', 'online'),
  ('sport', 'Sport', 'x', 'static', 'cloudflare', '{}', 'online');
insert into platform.app_grants (user_id, app_slug)
  select :'lena_id'::uuid, s from unnest(array['kalender', 'sport']) s;
select platform.register_app_suite('kalender', '[{"type": "event", "access": "delete", "why": "Termine"}]');
select platform.register_app_suite('sport', '[{"type": "activity", "access": "write", "why": "Einheiten"}]');
select tests.login(:'admin_id');
select platform.admin_suite_grant('kalender', 'event', 'delete');
select platform.admin_suite_grant('sport', 'activity', 'write');

select is((select schema -> 'properties' -> 'image' ->> 'type' from platform.record_types where type = 'event'),
  'string', 'events can carry an image');
select is((select schema -> 'properties' -> 'image' ->> 'type' from platform.record_types where type = 'activity'),
  'string', 'sport sessions can carry an image');

select tests.login(:'lena_id');
select tests.as_app('sport');
select (platform.suite_upsert('activity',
  '{"title": "Bouldern", "starts_at": "2026-10-02T18:00:00Z",
    "data": {"sport": "Klettern", "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="}}') -> 'record' ->> 'id') as act \gset
select is((select data ->> 'image' from platform.records where id = :'act'),
  'data:image/jpeg;base64,/9j/4AAQSkZJRg==', 'a small inline image is stored');
select throws_ok($$select platform.suite_upsert('activity', '{"title": "x", "starts_at": "2026-10-02T18:00:00Z",
  "data": {"image": "https://example.com/a.jpg"}}')$$, '22023', null, 'a link is not an image');
select throws_ok($$select platform.suite_upsert('activity', '{"title": "x", "starts_at": "2026-10-02T18:00:00Z",
  "data": {"image": "data:text/html;base64,PHNjcmlwdD4="}}')$$, '22023', null, 'only picture types');
select throws_ok(format($$select platform.suite_upsert('activity', '{"title": "x", "starts_at": "2026-10-02T18:00:00Z",
  "data": {"image": "data:image/jpeg;base64,%s"}}')$$, repeat('A', 16100)), '22023', null,
  'a big picture does not belong in a record');

select tests.as_app('kalender');
select lives_ok($$select platform.suite_upsert('event', '{"title": "Kino", "starts_at": "2026-10-05T19:00:00Z",
  "data": {"image": "data:image/png;base64,iVBORw0KGgo="}}')$$, 'the Kalender can give an event a picture');

select * from finish();
rollback;
