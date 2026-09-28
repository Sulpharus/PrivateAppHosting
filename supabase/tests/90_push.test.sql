begin;
select plan(24);
select tests.reset();

select tests.create_user('owner@example.com') as owner_id \gset
select tests.create_user('anna@example.com') as anna_id \gset
select tests.create_user('ben@example.com') as ben_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('todo', 'Todo', 'Tasks', 'spa', 'cloudflare', '{}', 'online'),
  ('andere', 'Andere', 'Other', 'spa', 'cloudflare', '{}', 'online');
insert into platform.app_grants (user_id, app_slug) values (:'anna_id', 'todo'), (:'ben_id', 'todo');

-- Devices
select tests.login(:'anna_id');
select platform.push_subscribe('https://fcm.googleapis.com/fcm/send/abc', 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAA', 'Chrome');
select is(platform.push_device_count(), 1, 'a device is registered for the caller');
select throws_ok(
  $$insert into platform.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://x', 'p', 'a')$$,
  '42501', null, 'devices are only added through push_subscribe');
select tests.login(:'ben_id');
select is((select count(*)::int from platform.push_subscriptions), 0, 'others'' devices are invisible');
select platform.push_subscribe('https://fcm.googleapis.com/fcm/send/abc', 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAA', 'Chrome');
select tests.login(:'anna_id');
select is(platform.push_device_count(), 0, 'a shared device moves to the user who subscribed last');
select throws_ok(
  $$select platform.push_subscribe('https://evil.example/x', 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAA')$$,
  '23514', null, 'only browser push services are accepted');
select throws_ok(
  $$select platform.push_subscribe('https://fcm.googleapis.com/fcm/send/k', 'short', 'AAAAAAAAAAAAAAAAAAAAAA')$$,
  '23514', null, 'malformed keys are refused');
select platform.push_subscribe('https://fcm.googleapis.com/fcm/send/d' || n, 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAA')
from generate_series(1, 12) n;
select is(platform.push_device_count(), 10, 'at most ten devices per user');

-- Scheduling from the app itself only
select tests.as_app('andere');
select throws_ok($$select platform.push_schedule('todo', 'k', now() + interval '1 hour', 'Hi')$$,
  '42501', null, 'another app cannot schedule under this app''s name');
select tests.as_app('todo');
select lives_ok($$select platform.push_schedule('todo', 'task:1', now() + interval '1 hour', 'Müll')$$,
  'the app schedules a reminder');
select platform.push_schedule('todo', 'task:1', now() + interval '2 hours', 'Müll rausbringen');
select is((select count(*)::int from platform.push_list('todo')), 1, 'the same key replaces the reminder');
select is((select title from platform.push_list('todo')), 'Müll rausbringen', 'with the new content');
select throws_ok($$select platform.push_schedule('todo', 'k', now() + interval '2 years', 'Hi')$$,
  '22023', null, 'reminders more than 400 days ahead are refused');
select throws_ok($$select platform.push_schedule('todo', 'k', now(), 'Hi', null, '//evil.example/x')$$,
  '22023', null, 'links to other sites are refused');
select platform.push_schedule('todo', 'task:2', now() + interval '1 hour', 'Zwei');
select platform.push_cancel('todo', 'task:2');
select is((select count(*)::int from platform.push_list('todo')), 1, 'cancel removes a reminder');
select throws_ok($$select * from platform.push_claim(10)$$, '42501', null, 'users cannot claim pushes');

-- Delivery (API cron, service role)
select tests.logout();
-- owner is admin (first user): admins may use every app, so this one is delivered too.
insert into platform.scheduled_pushes (user_id, app_slug, key, due_at, title)
values (:'owner_id', 'todo', 'x', now() - interval '1 minute', 'Admin');
-- anna has no grant for "andere": dropped.
insert into platform.scheduled_pushes (user_id, app_slug, key, due_at, title)
values (:'anna_id', 'andere', 'y', now() - interval '1 minute', 'Ohne Freigabe');
update platform.scheduled_pushes set due_at = now() - interval '1 minute' where key = 'task:1';
select is(platform.push_release_due(), 2, 'due reminders move into the bell, not for apps without a grant');
select is((select count(*)::int from platform.scheduled_pushes), 0, 'released and dropped reminders are gone');
insert into platform.notifications (user_id, app_slug, title, created_at)
values (:'anna_id', 'todo', 'Alt', now() - interval '2 hours');
select is((select count(*)::int from platform.push_claim(10)), 2, 'new notifications are claimed, old ones skipped');
select is((select count(*)::int from platform.push_claim(10)), 0, 'a claimed notification is not claimed again');
select platform.push_unclaim(array(select id from platform.notifications where title = 'Admin'));
select is((select count(*)::int from platform.push_claim(10)), 1, 'a failed send is retried');
select platform.push_unclaim(array(select id from platform.notifications where title = 'Admin'));
select platform.push_claim(10);
select platform.push_unclaim(array(select id from platform.notifications where title = 'Admin'));
select is((select count(*)::int from platform.push_claim(10)), 0, 'after three attempts it gives up');
select throws_ok(
  format($$insert into platform.notifications (user_id, title, url) values (%L, 'x', '/\evil.example')$$, :'anna_id'),
  '23514', null, 'bell links cannot point to another site');

-- Refused subscriptions (401/403) are counted and removed at the fifth refusal.
select id as device_id from platform.push_subscriptions order by endpoint limit 1 \gset
select platform.push_reject(array[:'device_id'::uuid]) from generate_series(1, 4);
select is((select rejected_count::int from platform.push_subscriptions where id = :'device_id'), 4,
  'refusals are counted');
select platform.push_reject(array[:'device_id'::uuid]);
select is((select count(*)::int from platform.push_subscriptions where id = :'device_id'), 0,
  'the fifth refusal removes the subscription');

select * from finish();
rollback;
