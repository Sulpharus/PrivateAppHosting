begin;
select plan(15);
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
select platform.push_subscribe('https://push.example/abc', 'p256', 'auth', 'Firefox');
select is(platform.push_device_count(), 1, 'a device is registered for the caller');
select throws_ok(
  $$insert into platform.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://x', 'p', 'a')$$,
  '42501', null, 'devices are only added through push_subscribe');
select tests.login(:'ben_id');
select is((select count(*)::int from platform.push_subscriptions), 0, 'others'' devices are invisible');
select platform.push_subscribe('https://push.example/abc', 'p256b', 'authb', 'Firefox');
select tests.login(:'anna_id');
select is(platform.push_device_count(), 0, 'a shared device moves to the user who subscribed last');

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
select platform.push_schedule('todo', 'task:2', now() + interval '1 hour', 'Zwei');
select platform.push_cancel('todo', 'task:2');
select is((select count(*)::int from platform.push_list('todo')), 1, 'cancel removes a reminder');
select throws_ok($$select * from platform.push_claim(10)$$, '42501', null, 'users cannot claim pushes');

-- Delivery (API cron, service role)
select tests.logout();
insert into platform.scheduled_pushes (user_id, app_slug, key, due_at, title)
values (:'owner_id', 'todo', 'x', now() - interval '1 minute', 'Kein Zugriff');
-- owner is admin (first user): admins may use every app, so this one is delivered too.
insert into platform.scheduled_pushes (user_id, app_slug, key, due_at, title)
values (:'anna_id', 'andere', 'y', now() - interval '1 minute', 'Ohne Freigabe');
update platform.scheduled_pushes set due_at = now() - interval '1 minute' where key = 'task:1';
select is(platform.push_release_due(), 2, 'due reminders move into the bell, not for apps without a grant');
select is((select count(*)::int from platform.scheduled_pushes), 0, 'released and dropped reminders are gone');
select is((select count(*)::int from platform.push_claim(10)), 2, 'new notifications are claimed for pushing');
select is((select count(*)::int from platform.push_claim(10)), 0, 'each notification is pushed once');

select * from finish();
rollback;
