# ADR 0005: Push notifications, installable apps and offline data

- Status: accepted
- Date: 2026-09-28

## Context

MiniNode apps are used on phones: reminders should arrive with the app closed, apps should
open from the home screen, and data entered without a connection (in a basement, on a train)
must not be lost. Every app lives on its own subdomain, service workers are per origin, and
iPhones only allow web push for web apps added to the home screen.

## Decision

**Push through the portal.** The portal (`mininode.app`) has the only push-capable service
worker. Under *Dein Konto → Benachrichtigungen* the user switches push on per device;
`platform.push_subscribe` stores the subscription (one user per endpoint, so a shared device
moves to whoever switched it on last; signing out removes it). Apps never ask for notification
permission.

- `mn.notify(title, body, path)` (unchanged API) writes the bell notification; new rows are
  `push_pending`.
- `mn.push.schedule({ key, at, title, body, path })` stores a reminder in
  `platform.scheduled_pushes` (same key replaces; only from the app's own origin via
  `app_access`; at most 500 per user and app, at most 400 days ahead). `cancel`, `list` and
  `status` complete the API.
- The API cron now runs every minute: `push_release_due()` moves due reminders into the bell
  (dropping them when the user lost access), `push_claim()` takes new notifications (skipping
  ones older than an hour, e.g. from before push was configured), and the API sends them to all
  of the user's devices within a send budget per run (default 35, for the Workers Free limit of
  50 subrequests, leaving room for the database calls and the five-minute maintenance;
  `PUSH_SEND_BUDGET`). What does not fit goes back to the queue; a notification
  that failed on every device is retried, at most three attempts (at-least-once is not
  guaranteed beyond that). The VAPID JWT is signed once per push service and run.
- Subscriptions are accepted only for the browsers' push services (FCM, Mozilla, Apple, WNS),
  with well-formed keys, at most ten devices per user; 404/410 deletes a subscription, five
  401/403 in a row (e.g. after a key change) as well. `/push/test` is rate-limited.
- Links stay on the platform: paths must not start with `//` or `/\`, the API resolves them
  only to the portal or its apps, and the service worker opens nothing else.
- Web Push is implemented with Web Crypto (RFC 8291 aes128gcm payload encryption, RFC 8292
  VAPID), verified against the reference implementation `http_ece` in tests.
- A tap opens `https://<slug>.mininode.app<path>`.
- Apps sign out through the portal's `/logout` (only from the portal or its apps, checked by
  referrer), which also switches the device's push off; on start the portal switches off a
  browser subscription that the server says belongs to another user (never on network errors).

**Every app is a PWA.** The gate serves `/_mininode/manifest.webmanifest` (name, colours, a
generated SVG icon, or the app's own `icon-192.png`/`icon-512.png`) and adds the manifest link
and `/_mininode/pwa.js` to every HTML page it serves. `pwa.js` registers `/_mininode/sw.js`
(served with `Service-Worker-Allowed: /`), stamped with a new version on every deploy so old
caches are dropped. The worker serves pages and unhashed files network-first (the gate still
checks access online; redirects are never cached) and hashed `/assets/*` cache-first, so an app
opens offline once it has been opened online and never mixes new pages with old scripts. The
portal has its own worker with the same shell caching plus push, and keeps the last app list per
user for the start page.

**Offline data in `mn.kv`.** The SDK keeps a local copy of kv data per app and user in IndexedDB
and a queue of changes made without a connection. Reads answer from the server when online
(refreshing the copy) and from the copy offline; writes apply locally at once and are sent in
order when the device is online again (`online` event, next start, or `mn.offline.sync()`), one
tab at a time (Web Locks). The last change that reaches the server wins; apps store one item per
key to keep conflicts small. Network errors, 5xx, 401, 408 and 429 keep a change queued; only a
refusal (403, 4xx validation, RLS) drops it, and the local copy then takes the server's value
again. The SDK remembers the last confirmed user of the app, so the local copy stays reachable
when the access token expires offline.
`mn.offline` exposes `online()`, `onChange()`, `pending()`, `onSynced()` and `sync()`.
`mn.auth.requireLogin()` works offline with the remembered user, but only while the shared
session cookie still names that user (signing out anywhere removes it, so the next person on a
shared device does not open the previous user's data). `mn.db` and `mn.files` stay
online-only; apps show those views read-only offline.

## Consequences

- Pushes arrive within about a minute (cron granularity), also for `mn.notify`; under heavy load
  later, since each run sends at most the budget.
- The VAPID key pair is a deploy secret; replacing it invalidates every subscription.
- Every existing app becomes installable and works offline for kv data without changes; apps
  that use tables need their own offline handling (documented in the prompt module).
- A change refused by the server when it is finally sent (e.g. access removed meanwhile) is
  dropped with a console warning rather than blocking the queue.
- On shared devices, the local copy lives in a database per user; signing out of an app also
  clears the app's cached pages.
