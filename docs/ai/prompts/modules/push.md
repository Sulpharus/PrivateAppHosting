---
id: push
title: Push-Benachrichtigungen
summary: Nachrichten aufs Handy und den PC, auch wenn die App geschlossen ist, geplante Erinnerungen
order: 62
---

## Feature: push notifications

MiniNode delivers push notifications for every app through the portal: the user switches them
on once per device under *Dein Konto → Benachrichtigungen* (on iPhone only after adding
MiniNode to the home screen). Apps never register their own service worker for push, never ask
for `Notification.requestPermission()` and never handle VAPID keys.

- **Now:** `await mn.notify(title, body, path)` puts the message into the portal's bell and
  pushes it to all of the user's devices that have notifications on. `path` is the app route
  that opens on tap (`'/heute'`).
- **Later, even with the app closed:** `await mn.push.schedule({ key, at, title, body, path })`
  delivers at `at` (a `Date` or ISO string; arrives within about a minute, at most 400 days
  ahead, up to 500 pending per user). The same `key` replaces the
  earlier schedule, so derive it from the item (`task:<id>`) and call `schedule` again whenever
  the item's date changes. `await mn.push.cancel(key)` when the item is done or deleted;
  `await mn.push.list()` returns this user's pending schedules for this app.
- **Status:** `await mn.push.status()` is `'on'` when the user has notifications on on at least
  one device (messages go to all of them), `'off'` or `'unsupported'`. When it is `'off'` and the
  feature matters, show a quiet hint with a link to
  `mn.push.settingsUrl()` ("Benachrichtigungen einschalten"), never a blocking dialog.
- Offer reminders per item (a "Erinnern" field with presets: "Am Tag um 8:00", "1 Stunde
  vorher", "Keine") and a global on/off switch in the app's settings (kv `settings.push`);
  respect it before scheduling.
- Keep titles short and specific ("Müll rausbringen", "Anna hat Geburtstag"), the body
  optional, German, without emoji. At most a few per day; bundle several due items into one
  message ("3 Aufgaben fällig").
- Repeating things (daily habits, weekly chores): schedule only the next occurrence and
  schedule the following one when the app is opened or the item is completed.
- Messages for other users are not possible; in shared apps notify only the current user.
