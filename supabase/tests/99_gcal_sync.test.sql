begin;
select plan(23);
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
insert into platform.gcal_sync (user_id, enabled) values (:'lena_id', true);

-- Nobody but the API (service role) reaches the sync.
select tests.login(:'lena_id');
select throws_ok(format('select platform.gcal_begin(%L)', :'lena_id'), '42501', null,
  'users cannot run the sync');
select throws_ok('select * from platform.gcal_links', '42501', null, 'nor read its links');
select tests.logout();

select isnt(platform.gcal_begin(:'lena_id'), null, 'a sync starts');
select is(platform.gcal_begin(:'lena_id'), null, 'and runs once at a time');

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
  'token-1', true);
select is((select count(*)::int from platform.records where collection_id = :'work'), 2, 'events come in');
select is((select sync_token from platform.gcal_calendars where google_id = 'lena@gmail.com'), 'token-1',
  'the sync token is kept');
select id as chor from platform.records where title = 'Chor' \gset
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[
  {"event_id": "g1_x", "etag": "e3", "updated": "2026-10-02T08:00:00Z", "master_event_id": "g1",
   "exdate_key": "2026-10-08T19:00", "fields": {"title": "Chor (Probe)",
   "starts_at": "2026-10-08T18:00:00Z", "ends_at": "2026-10-08T20:00:00Z", "data": {}}},
  {"event_id": "g1_y", "deleted": true, "master_event_id": "g1", "exdate_key": "2026-10-15T19:00"}]',
  'token-2', false);
select is((select data -> 'recurrence' -> 'exdates' from platform.records where id = :'chor'),
  '["2026-10-08T19:00", "2026-10-15T19:00"]'::jsonb, 'moved and cancelled occurrences leave the series');
select is((select count(*)::int from platform.records where title = 'Chor (Probe)'), 1,
  'the moved one is its own event');

-- Our own write coming back changes nothing; a newer local change wins over an older one.
select version as v0 from platform.records where id = :'chor' \gset
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[
  {"event_id": "g1", "etag": "e1", "updated": "2026-10-03T08:00:00Z", "fields": {"title": "anders",
   "starts_at": "2026-10-01T17:00:00Z", "ends_at": "2026-10-01T19:00:00Z", "data": {}}}]', 't', false);
select is((select version from platform.records where id = :'chor'), :'v0'::int, 'an echo is ignored');
update platform.records set title = 'Chor lokal', version = version + 1, updated_at = now()
  where id = :'chor';
select platform.gcal_apply(:'lena_id', 'lena@gmail.com', 'pull', '[
  {"event_id": "g1", "etag": "e9", "updated": "2026-01-01T08:00:00Z", "fields": {"title": "Chor alt",
   "starts_at": "2026-10-01T17:00:00Z", "ends_at": "2026-10-01T19:00:00Z", "data": {}}}]', 't', false);
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
  'mn-token', false);
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

-- Switching a calendar off, then the sync.
select platform.gcal_set_calendar(:'lena_id', 'feiertage', false);
select isnt((select deleted_at from platform.collections where id = :'holidays'), null,
  'a switched-off calendar goes to the bin');
select platform.gcal_disable(:'lena_id');
select is((select count(*)::int from platform.gcal_links where user_id = :'lena_id'), 0, 'switching off forgets the links');

select * from finish();
rollback;
