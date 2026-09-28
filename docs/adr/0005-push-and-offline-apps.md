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
  (dropping them when the user lost access), `push_claim()` takes each new notification exactly
  once, and the API sends it to all of the user's devices. Web Push is implemented with Web
  Crypto (RFC 8291 aes128gcm payload encryption, RFC 8292 VAPID), verified against the reference
  implementation `http_ece` in tests. Dead subscriptions (404/410) are deleted.
- A tap opens `https://<slug>.mininode.app<path>`.

**Every app is a PWA.** The gate serves `/_mininode/manifest.webmanifest` (name, colours, a
generated SVG icon, or the app's own `icon-192.png`/`icon-512.png`) and adds the manifest link
and `/_mininode/pwa.js` to every HTML page it serves. `pwa.js` registers `/_mininode/sw.js`
(served with `Service-Worker-Allowed: /`). The worker caches pages network-first (the gate still
checks access online; redirects are never cached) and files stale-while-revalidate, so an app
opens offline once it has been opened online. The portal has its own worker with the same shell
caching plus push, and keeps the last app list per user for the start page.

**Offline data in `mn.kv`.** The SDK keeps a local copy of kv data per app and user in IndexedDB
and a queue of changes made without a connection. Reads answer from the server when online
(refreshing the copy) and from the copy offline; writes apply locally at once and are sent in
order when the device is online again (`online` event, next start, or `mn.offline.sync()`). The
last change that reaches the server wins; apps store one item per key to keep conflicts small.
`mn.offline` exposes `online()`, `onChange()`, `pending()`, `onSynced()` and `sync()`.
`mn.auth.requireLogin()` accepts the stored session while offline. `mn.db` and `mn.files` stay
online-only; apps show those views read-only offline.

## Consequences

- Pushes arrive within about a minute (cron granularity), also for `mn.notify`.
- The VAPID key pair is a deploy secret; replacing it invalidates every subscription.
- Every existing app becomes installable and works offline for kv data without changes; apps
  that use tables need their own offline handling (documented in the prompt module).
- A change refused by the server when it is finally sent (e.g. access removed meanwhile) is
  dropped with a console warning rather than blocking the queue.
- On shared devices, the local copy lives in a database per user; signing out of an app also
  clears the app's cached pages.
