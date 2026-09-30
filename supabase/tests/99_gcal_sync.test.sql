begin;
select plan(34);
select tests.reset();

select tests.create_user('lena@example.com', 'Lena') as lena_id \gset
select tests.create_user('tom@example.com', 'Tom') as tom_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('kalender', 'Kalender', 'x', 'static', 'cloudflare', '{}', 'online'),
  ('sportplaner', 'Sportplaner', 'x', 'static', 'cloudflare', '{}', 'online');
select platform.register_app_suite('kalender', '[
  {"type": "event", "access": "delete", "why": "x"}, {"type": "activity", "access": "read", "why": "x"}]');
insert into platform.app_type_grants (app_slug, type, access) values
  ('kalender', 'event', 'delete'), ('kalender', 'activity', 'read');
insert into platform.app_grants (user_id, app_slug) values (:'lena_id', 'kalender'), (:'tom_id', 'kalender');
insert into platform.gcal_sync (user_id, enabled) values (:'lena_id', true);

-- Nobody but the API (service role) reaches the sync.
select tests.login(:'lena_id');
select throws_ok(format('select platform.gcal_begin(%L)', :'lena_id'), '42501', null,
  'users cannot run the sync');
select throws_ok('select * from platform.gcal_links', '42501', null, 'nor read its links');
select tests.logout();

select isnt(platform.gcal_begin(:'lena_id'), null, 'a sync starts');
select is(platform.gcal_begin(:'lena_id'), null, 'and runs once at a time');
insert into platform.gcal_sync (user_id, enabled) values (:'tom_id', true);
delete from platform.app_grants where user_id = :'tom_id';
select is(platform.gcal_begin(:'tom_id'), null, 'not for someone who may not use the Kalender');
insert into platform.app_grants (user_id, app_slug) values (:'tom_id', 'kalender');

-- The Google calendar list becomes collections; read-only ones only to look at.
select platform.gcal_calendars_sync(:'lena_id', 'mn-target', '[
  {"google_id": "lena@gmail.com", "name": "Lena", "color": "blue", "writable": true},
  {"google_id": "feiertage", "name": "Feiertage", "color": "green", "writable": false}]');
select collection_id as work from platform.gcal_calendars where google_id = 'lena@gmail.com' \gset
select collection_id as holidays from platform.gcal_calendars where google_id = 'feiertage' \gset
select is((select role from platform.collection_members where collection_id = :'holidays'), 'viewer',
  'read-only calendars cannot be edited');
select is((select target_calendar_id from platform.gcal_sync where user_id = :'lena_id'), 'mn-target',
  'the target calendar is stored');

-- Pulling events: new ones, changes, a moved occurrence, a cancelled one.
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[
  {"event_id": "g1", "etag": "e1", "updated": "2026-10-01T08:00:00Z", "fields": {"title": "Chor",
   "starts_at": "2026-10-01T17:00:00Z", "ends_at": "2026-10-01T19:00:00Z",
   "data": {"recurrence": {"rrule": "FREQ=WEEKLY"}}}},
  {"event_id": "g2", "etag": "e2", "updated": "2026-10-01T08:00:00Z", "fields": {"title": "Zahnarzt",
   "starts_at": "2026-10-02T08:00:00Z", "ends_at": "2026-10-02T09:00:00Z", "data": {}}}]',
  'token-1', null, array['g1', 'g2']);
select is((select count(*)::int from platform.records where collection_id = :'work'), 2, 'events come in');
select is((select sync_token from platform.gcal_calendars where google_id = 'lena@gmail.com'), 'token-1',
  'the sync token is kept');
select id as chor from platform.records where title = 'Chor' \gset
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[
  {"event_id": "g1_x", "etag": "e3", "updated": "2026-10-02T08:00:00Z", "master_event_id": "g1",
   "exdate_key": "2026-10-08T19:00", "fields": {"title": "Chor (Probe)",
   "starts_at": "2026-10-08T18:00:00Z", "ends_at": "2026-10-08T20:00:00Z", "data": {}}},
  {"event_id": "g1_y", "deleted": true, "master_event_id": "g1", "exdate_key": "2026-10-15T19:00"}]',
  'token-2');
select is((select data -> 'recurrence' -> 'exdates' from platform.records where id = :'chor'),
  '["2026-10-08T19:00", "2026-10-15T19:00"]'::jsonb, 'moved and cancelled occurrences leave the series');
select is((select count(*)::int from platform.records where title = 'Chor (Probe)'), 1,
  'the moved one is its own event');

-- Our own write coming back changes nothing; a newer local change wins over an older one.
select version as v0 from platform.records where id = :'chor' \gset
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[
  {"event_id": "g1", "etag": "e1", "updated": "2026-10-03T08:00:00Z", "fields": {"title": "anders",
   "starts_at": "2026-10-01T17:00:00Z", "ends_at": "2026-10-01T19:00:00Z", "data": {}}}]', 't');
select is((select version from platform.records where id = :'chor'), :'v0'::int, 'an echo is ignored');
update platform.records set title = 'Chor lokal', version = version + 1, updated_at = now()
  where id = :'chor';
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[
  {"event_id": "g1", "etag": "e9", "updated": "2026-01-01T08:00:00Z", "fields": {"title": "Chor alt",
   "starts_at": "2026-10-01T17:00:00Z", "ends_at": "2026-10-01T19:00:00Z", "data": {}}}]', 't');
select is((select title from platform.records where id = :'chor'), 'Chor lokal', 'the newer local change stays');

-- The plan: the local change goes back to Google, chosen sources go to "MiniNode".
insert into platform.collections (name, family, owner_id, personal) values ('Mein Sport', 'sport', :'lena_id', true)
  returning id as sport \gset
insert into platform.collection_members values (:'sport', :'lena_id', 'owner');
insert into platform.records (type, collection_id, title, starts_at, ends_at, data, source_app, created_by_app, created_by)
  values ('activity', :'sport', 'Bouldern', now() + interval '1 day', now() + interval '1 day 2 hours', '{}',
    'sportplaner', 'sportplaner', :'lena_id') returning id as act \gset
select is(jsonb_array_length(platform.gcal_push_plan(:'lena_id', 50) -> 'upserts'), 1,
  'only the local change is due while no source is chosen');
update platform.gcal_sync set push_sources = array['app:sportplaner:activity'] where user_id = :'lena_id';
select is((select jsonb_agg(u -> 'record' ->> 'title' order by u -> 'record' ->> 'title')
  from jsonb_array_elements(platform.gcal_push_plan(:'lena_id', 50) -> 'upserts') u),
  '["Bouldern", "Chor lokal"]'::jsonb, 'a chosen source is mirrored');
select is(jsonb_array_length(platform.gcal_push_plan(:'lena_id', 1) -> 'upserts'), 1, 'within the limit');

select platform.gcal_save_links(:'lena_id', format('[{"record_id": "%s", "calendar_id": "mn-target",
  "event_id": "p1", "etag": "x1", "version": 1, "kind": "push"}]', :'act')::jsonb, '[]');
select is(jsonb_array_length(platform.gcal_push_plan(:'lena_id', 50) -> 'upserts'), 1, 'pushed records rest');

-- Changes in "MiniNode" to another app's record are undone; a new event there comes in.
select platform.gcal_apply(:'lena_id', 'mn-target', 'push', '[
  {"event_id": "p1", "etag": "x2", "updated": "2026-10-03T08:00:00Z", "record_id": "x",
   "fields": {"title": "Bouldern?", "starts_at": "2026-10-04T17:00:00Z", "ends_at": "2026-10-04T19:00:00Z", "data": {}}},
  {"event_id": "p2", "etag": "x3", "updated": "2026-10-03T08:00:00Z",
   "fields": {"title": "Neu in Google", "starts_at": "2026-10-05T17:00:00Z", "ends_at": "2026-10-05T18:00:00Z", "data": {}}}]',
  'mn-token');
select is((select title from platform.records where id = :'act'), 'Bouldern', 'other apps keep their data');
select is((select synced_version from platform.gcal_links where record_id = :'act'), -1, 'and push it again');
select is((select c.personal from platform.records r join platform.collections c on c.id = r.collection_id
  where r.title = 'Neu in Google'), true, 'events made in "MiniNode" land in the personal calendar');

select ok((select push_sources from platform.gcal_sync where user_id = :'lena_id')
  @> array['col:' || platform.gcal_personal(:'lena_id')], 'which is then mirrored');

-- Unchosen sources and deleted records leave Google.
update platform.gcal_sync set push_sources = array['col:' || platform.gcal_personal(:'lena_id')]
  where user_id = :'lena_id';
select is((select jsonb_agg(d ->> 'record_id') from jsonb_array_elements(platform.gcal_push_plan(:'lena_id', 50) -> 'deletes') d),
  format('["%s"]', :'act')::jsonb, 'an unchosen source is removed from Google');


-- A viewer's Google edits never change the series (review B1).
insert into platform.collections (name, family, owner_id, personal) values ('Toms Termine', 'kalender', :'tom_id', false)
  returning id as toms \gset
insert into platform.collection_members values (:'toms', :'tom_id', 'owner'), (:'toms', :'lena_id', 'viewer');
insert into platform.records (type, collection_id, title, starts_at, ends_at, data, source_app, created_by_app, created_by)
  values ('event', :'toms', 'Toms Serie', now(), now() + interval '1 hour',
    '{"recurrence": {"rrule": "FREQ=WEEKLY"}}', 'kalender', 'kalender', :'tom_id') returning id as tseries \gset
select platform.gcal_save_links(:'lena_id', format('[{"record_id": "%s", "calendar_id": "mn-target",
  "event_id": "t1", "etag": "y1", "version": 1, "kind": "push"}]', :'tseries')::jsonb, '[]');
select platform.gcal_apply(:'lena_id', 'mn-target', 'push', '[
  {"event_id": "t1_x", "deleted": true, "master_event_id": "t1", "exdate_key": "2026-10-12T10:00"}]', 'mn2');
select is((select data -> 'recurrence' -> 'exdates' from platform.records where id = :'tseries'), null,
  'a viewer cannot exclude occurrences through Google');

-- A moved occurrence of a mirrored series becomes its own event; deleting it removes that one (S1, S2).
update platform.gcal_sync set push_sources = push_sources || ('col:' || platform.gcal_personal(:'lena_id'))
  where user_id = :'lena_id';
select id as nig from platform.records where title = 'Neu in Google' \gset
update platform.records set data = '{"recurrence": {"rrule": "FREQ=DAILY"}}' where id = :'nig';
select platform.gcal_apply(:'lena_id', 'mn-target', 'push', format('[
  {"event_id": "p2_x", "etag": "z1", "updated": "2030-01-01T00:00:00Z", "record_id": "%s",
   "master_event_id": "p2", "exdate_key": "2026-10-06T19:00",
   "fields": {"title": "Neu verschoben", "starts_at": "2026-10-06T18:00:00Z", "ends_at": "2026-10-06T19:00:00Z", "data": {}}}]', :'nig')::jsonb, 'mn3');
select is((select count(*)::int from platform.records where title = 'Neu verschoben' and deleted_at is null), 1,
  'a moved occurrence of a mirrored series comes in');
select platform.gcal_apply(:'lena_id', 'mn-target', 'push', '[
  {"event_id": "p2_x", "deleted": true, "master_event_id": "p2", "exdate_key": "2026-10-06T19:00"}]', 'mn4');
select is((select count(*)::int from platform.records where title = 'Neu verschoben' and deleted_at is null), 0,
  'and leaves when it is deleted in Google');

-- Old history counts as seen in a fresh listing (S3), and pages continue later (S6).
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[{"event_id": "g2", "skip": true}]',
  null, 'page-2');
select is((select page_token from platform.gcal_calendars where google_id = 'lena@gmail.com'), 'page-2',
  'an unfinished listing continues on the next page');
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[]', 'token-3', null,
  array['g1', 'g2', 'g1_x']);
select is((select count(*)::int from platform.records where collection_id = :'work' and deleted_at is null), 3,
  'skipped events are not taken for gone');
select is((select sync_token from platform.gcal_calendars where google_id = 'lena@gmail.com'), 'token-3',
  'the listing ends with its sync token');

-- Deleting a Google calendar in MiniNode switches it off; nothing is deleted in Google (B2).
select platform.gcal_save_links(:'lena_id', '[]', '[]');
update platform.records set deleted_at = now() where collection_id = :'work';
update platform.collections set deleted_at = now() where id = :'work';
select is((select count(*)::int from jsonb_array_elements(platform.gcal_push_plan(:'lena_id', 50) -> 'deletes') d
  where d ->> 'kind' = 'pull'), 0, 'a deleted Google calendar is not emptied in Google');
select platform.gcal_calendars_sync(:'lena_id', 'mn-target', '[
  {"google_id": "lena@gmail.com", "name": "Lena", "color": "blue", "writable": true},
  {"google_id": "feiertage", "name": "Feiertage", "color": "green", "writable": false}]');
select is((select enabled from platform.gcal_calendars where google_id = 'lena@gmail.com'), false,
  'but switched off');

-- The cron waits longer after a failure (S5).
update platform.gcal_sync set locked_until = null, status = 'error', last_attempt_at = now() - interval '10 minutes'
  where user_id = :'lena_id';
select is((select count(*)::int from platform.gcal_due(10) u where u = :'lena_id'), 0, 'failed syncs back off');
update platform.gcal_sync set status = 'idle' where user_id = :'lena_id';
select is((select count(*)::int from platform.gcal_due(10) u where u = :'lena_id'), 1, 'others are due after five minutes');

-- Switching a calendar off, then the sync.
select platform.gcal_set_calendar(:'lena_id', 'feiertage', false);
select isnt((select deleted_at from platform.collections where id = :'holidays'), null,
  'a switched-off calendar goes to the bin');
select platform.gcal_disable(:'lena_id');
select is((select count(*)::int from platform.gcal_links where user_id = :'lena_id'), 0, 'switching off forgets the links');

select * from finish();
rollback;
