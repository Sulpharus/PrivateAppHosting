begin;
select plan(57);
select tests.reset();

select tests.create_user('admin@example.com', 'Wolfram') as admin_id \gset
select tests.create_user('lena@example.com', 'Lena') as lena_id \gset
select tests.create_user('tom@example.com', 'Tom') as tom_id \gset
update platform.profiles set role = 'admin' where user_id = :'admin_id';
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('kalender', 'Kalender', 'x', 'static', 'cloudflare', '{}', 'online'),
  ('sport', 'Sport', 'x', 'static', 'cloudflare', '{}', 'online'),
  ('notes', 'Notizen', 'x', 'static', 'cloudflare', '{}', 'online');
insert into platform.app_grants (user_id, app_slug)
  select u, s from unnest(array[:'lena_id', :'tom_id']::uuid[]) u,
    unnest(array['kalender', 'sport', 'notes']) s;

-- Requests come from deploys; the admin grants at most what was asked.
select lives_ok($$select platform.register_app_suite('kalender', '[
  {"type": "event", "access": "delete", "why": "Termine verwalten"},
  {"type": "activity", "access": "read", "why": "Sport im Kalender"}]')$$, 'deploys register requests');
select platform.register_app_suite('sport', '[
  {"type": "activity", "access": "write", "why": "Einheiten"},
  {"type": "event", "access": "create", "why": "Kurstermine"}]');
select tests.login(:'lena_id');
select throws_ok($$select platform.register_app_suite('notes', '[]')$$, '42501', null,
  'only deploys register requests');
select throws_ok($$select platform.admin_suite_grant('kalender', 'event', 'delete')$$, '42501', null,
  'only the admin grants');
select tests.login(:'admin_id');
select throws_ok($$select platform.admin_suite_grant('sport', 'activity', 'delete')$$, '22023',
  'invalid_access', 'never more than requested');
select throws_ok($$select platform.admin_suite_grant('notes', 'event', 'read')$$, '22023',
  'not_requested', 'nothing that was not requested');
select platform.admin_suite_grant('kalender', 'event', 'delete');
select platform.admin_suite_grant('kalender', 'activity', 'read');
select platform.admin_suite_grant('sport', 'activity', 'write');
select platform.admin_suite_grant('sport', 'event', 'create');
select platform.admin_suite_priority('event', array['kalender', 'sport']);
select is((select count(*)::int from platform.admin_suite_matrix()), 4, 'the admin sees the matrix');

-- Writing needs an approved app.
select tests.login(:'lena_id');
select tests.as_app('notes');
select throws_ok($$select platform.suite_upsert('event', '{"title": "x", "starts_at": "2026-10-01T10:00:00Z"}')$$,
  '42501', null, 'an app without a grant writes nothing');
select tests.as_app(null);
select throws_ok($$select platform.suite_upsert('event', '{"title": "x"}')$$, '42501', null,
  'nor does the portal');

select tests.as_app('kalender');
select (platform.suite_upsert('event',
  '{"title": "Zahnarzt", "starts_at": "2026-10-01T10:00:00Z", "ends_at": "2026-10-01T11:00:00Z",
    "data": {"description": "Kontrolle", "reminders": [{"offset": "-PT1H"}]}}') -> 'record' ->> 'id') as ev \gset
select is((select title from platform.records where id = :'ev'), 'Zahnarzt', 'a record is written');
select is((select c.name from platform.records r join platform.collections c on c.id = r.collection_id where r.id = :'ev'),
  'Meine Termine', 'into the personal collection of its family');
select throws_ok($$select platform.suite_upsert('event', '{"title": "x", "data": {"colour": "red"}}')$$,
  '22023', null, 'data is checked against the type schema');
select throws_ok($$select platform.suite_upsert('event', '{"owner": "x"}')$$, '22023', null,
  'unknown common fields are refused');

-- Identity keys merge instead of duplicating (title case and time format do not matter).
select is((platform.suite_upsert('event',
  '{"title": " zahnarzt", "starts_at": "2026-10-01T12:00:00+02:00", "data": {"url": "https://praxis.example"}}')
  ->> 'merged')::boolean, true, 'a matching create is merged');
select is((select count(*)::int from platform.records where type = 'event'), 1, 'no duplicate');
select is((select data ->> 'url' from platform.records where id = :'ev'), 'https://praxis.example',
  'the new field is added');

-- Source keys make writes idempotent.
select tests.as_app('sport');
select (platform.suite_upsert('activity', '{"title": "Bouldern", "starts_at": "2026-10-02T18:00:00Z",
  "data": {"plan_status": "planned"}}', 'act-1#2026-10-02') -> 'record' ->> 'id') as act \gset
select platform.suite_upsert('activity', '{"title": "Bouldern", "starts_at": "2026-10-02T18:00:00Z",
  "data": {"plan_status": "done"}}', 'act-1#2026-10-02');
select is((select data ->> 'plan_status' from platform.records where type = 'activity'), 'done',
  'the same source key updates the record');
select is((select count(*)::int from platform.records where type = 'activity'), 1, 'once');

-- Reading: the app needs read access, the person needs membership.
select tests.as_app('kalender');
select is((select count(*)::int from platform.records), 2, 'the calendar reads events and activities');
select tests.as_app('notes');
select is((select count(*)::int from platform.records), 0, 'another app reads nothing');
select tests.login(:'tom_id');
select tests.as_app('kalender');
select is((select count(*)::int from platform.records), 0, 'another person reads nothing');

-- Priority and write access across apps.
select tests.login(:'lena_id');
select tests.as_app('sport');
select is(platform.suite_upsert('event', '{"title": "Zahnarzt", "starts_at": "2026-10-01T10:00:00Z",
  "data": {"description": "anders", "busy": true}}') -> 'rejectedFields',
  '["data.description"]'::jsonb, 'a create-level app only fills empty fields of foreign records');
select is((select data ->> 'busy' from platform.records where id = :'ev'), 'true', 'empty ones it may fill');
select throws_ok(format('select platform.suite_delete(%L)', :'ev'), '42501', null,
  'nor may it delete them');
select tests.as_app('kalender');
select throws_ok(format($$select platform.suite_upsert('activity', '{"title": "x"}', null, null, %L)$$, :'act'),
  '42501', null, 'a read-only app does not write');

-- Sharing: a family calendar with an editor and a viewer.
select tests.as_app('kalender');
select platform.collection_create('Familienkalender', 'kalender', 'rose') as fam \gset
select platform.collection_set_member(:'fam', :'tom_id', 'viewer');
select (platform.suite_upsert('event', '{"title": "Oma besuchen", "starts_at": "2026-10-04T14:00:00Z"}',
  null, :'fam') -> 'record' ->> 'id') as famev \gset
select tests.login(:'tom_id');
select tests.as_app('kalender');
select is((select array_agg(title) from platform.records), array['Oma besuchen'],
  'members see the shared collection only');
select throws_ok(format($$select platform.suite_upsert('event', '{"title": "x", "starts_at": "2026-10-05T10:00:00Z"}', null, %L)$$, :'fam'),
  '42501', null, 'viewers cannot write');
select throws_ok(format($$select platform.collection_set_member(%L, %L, 'editor')$$, :'fam', :'tom_id'),
  '42501', null, 'only the owner manages members');
select is((select role from platform.suite_collections('kalender') where id = :'fam'), 'viewer',
  'collections list the role');
select tests.login(:'lena_id');
select tests.as_app('kalender');
select platform.collection_set_member(:'fam', :'tom_id', 'editor');
select tests.login(:'tom_id');
select tests.as_app('kalender');
select lives_ok(format($$select platform.suite_upsert('event', '{"title": "Kino", "starts_at": "2026-10-05T19:00:00Z"}', null, %L)$$, :'fam'),
  'editors write');

-- Apps without access to a family see none of its collections.
select tests.as_app('notes');
select throws_ok($$select platform.personal_collection('kalender')$$, '42501', null,
  'an app without access gets no collection');
select is((select count(*)::int from platform.suite_collections()), 0, 'nor lists any');
select is((select count(*)::int from platform.collections), 0, 'nor reads them');
select throws_ok(format('select platform.collection_leave(%L)', :'fam'), '42501', null,
  'nor leaves them');

-- Members: never the owner, never a personal collection, only people on the platform.
select tests.login(:'lena_id');
select tests.as_app('kalender');
select throws_ok(format($$select platform.collection_set_member(%L, %L, 'viewer')$$, :'fam', :'lena_id'),
  '22023', 'owner_cannot_change', 'the owner stays owner');
select throws_ok(format($$select platform.collection_set_member(%L, %L, 'owner')$$, :'fam', :'tom_id'),
  '22023', 'invalid_role', 'there is one owner');
select throws_ok(format($$select platform.collection_set_member(%L, gen_random_uuid(), 'viewer')$$, :'fam'),
  '22023', 'unknown_user', 'members are people on the platform');
select throws_ok(format($$select platform.collection_set_member(%L, %L, 'viewer')$$,
  platform.personal_collection('kalender'), :'tom_id'), '42501', 'personal_collection',
  'personal collections are not shared');

-- Identity: all keys are needed to merge; the own app may still change a title's case.
select is((platform.suite_upsert('event', '{"title": "Zahnarzt"}') ->> 'merged')::boolean, false,
  'no merge without all identity keys');
select platform.suite_upsert('event', '{"title": "ZAHNARZT"}', null, null, :'ev');
select is((select title from platform.records where id = :'ev'), 'ZAHNARZT', 'case-only edits are kept');

-- Source keys are per type; a stronger app with delete access deletes foreign records.
select tests.as_app('sport');
select (platform.suite_upsert('event', '{"title": "Kurs", "starts_at": "2026-10-06T18:00:00Z"}',
  'act-1#2026-10-02') -> 'record' ->> 'id') as sev \gset
select is((select count(*)::int from platform.records where source_key = 'act-1#2026-10-02'), 2,
  'a source key is per type');
select tests.as_app('kalender');
select lives_ok(format('select platform.suite_delete(%L)', :'sev'),
  'the stronger app deletes foreign records');

-- A deleted source key comes back when the app writes it again.
select tests.as_app('sport');
select platform.suite_delete(:'act');
select is(platform.suite_upsert('activity', '{"title": "Bouldern", "starts_at": "2026-10-02T18:00:00Z"}',
  'act-1#2026-10-02') -> 'record' ->> 'id', :'act'::text, 'a deleted source key comes back');

-- Two writing apps: the order the admin sets decides per field.
select tests.logout();
select platform.register_app_suite('notes', '[{"type": "activity", "access": "write", "why": "Notizen"}]');
select tests.login(:'admin_id');
select platform.admin_suite_grant('notes', 'activity', 'write');
select platform.admin_suite_priority('activity', array['sport', 'notes']);
select tests.login(:'lena_id');
select tests.as_app('notes');
select is(platform.suite_upsert('activity', '{"title": "Klettern", "data": {"notes": "Halle"}}', null, null,
  :'act') -> 'rejectedFields', '["title"]'::jsonb, 'fields of a stronger app stay');
select tests.login(:'admin_id');
select platform.admin_suite_priority('activity', array['notes', 'sport']);
select tests.login(:'lena_id');
select tests.as_app('notes');
select is(platform.suite_upsert('activity', '{"title": "Klettern"}', null, null, :'act')
  -> 'rejectedFields', '[]'::jsonb, 'the stronger app overwrites');

-- The matrix is for admins, and changes need a recent sign-in.
select tests.as_app(null);
select is((select count(*)::int from platform.admin_suite_matrix()), 0, 'others see an empty matrix');
select tests.login(:'admin_id', 3600);
select throws_ok($$select platform.admin_suite_grant('notes', 'activity', null)$$, '42501', null,
  'granting needs a recent sign-in');

-- Deleting: the bin.
select tests.login(:'lena_id');
select tests.as_app('kalender');
select lives_ok(format('select platform.suite_delete(%L)', :'famev'), 'the calendar deletes');
select is((select count(*)::int from platform.records where id = :'famev'), 0, 'deleted records are hidden');
select tests.logout();
select isnt((select deleted_at from platform.records where id = :'famev'), null, 'and kept in the bin');
update platform.records set deleted_at = now() - interval '31 days' where id = :'famev';
select is(platform.suite_purge_bin(), 1, 'the bin is emptied after 30 days');

-- Leaving: members go; the owner's shared collection goes to the bin with its records.
select tests.login(:'tom_id');
select tests.as_app('kalender');
select platform.collection_leave(:'fam');
select is((select count(*)::int from platform.records), 0, 'a member who leaves sees nothing');
select tests.login(:'lena_id');
select tests.as_app('kalender');
select throws_ok(format('select platform.collection_leave(%L)', platform.personal_collection('kalender')),
  '42501', 'personal_collection', 'the personal collection stays');
select platform.collection_leave(:'fam');
select is((select count(*)::int from platform.suite_collections('kalender') where id = :'fam'), 0,
  'the owner deletes a shared collection');
select tests.logout();
select is((select count(*)::int from platform.records where collection_id = :'fam' and deleted_at is null),
  0, 'its records go to the bin');

-- Registering fewer rights lowers the grant.
select platform.register_app_suite('sport', '[{"type": "activity", "access": "read", "why": "nur lesen"}]');
select is((select array_agg(type || ':' || access order by type) from platform.app_type_grants where app_slug = 'sport'),
  array['activity:read'], 'grants follow the requests down');
select is((select count(*)::int from platform.audit_log where action = 'suite.grant_lowered'
  and app_slug = 'sport'), 2, 'lowered and dropped grants are audited');

set local role anon;
select throws_ok($$select * from platform.records$$, '42501', null, 'not for anonymous callers');
reset role;

select * from finish();
rollback;
