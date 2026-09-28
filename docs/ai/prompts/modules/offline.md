---
id: offline
title: Offline nutzbar
summary: App öffnet ohne Internet, Einträge offline anlegen, Abgleich bei Verbindung
order: 64
---

## Feature: offline use and sync

Every MiniNode app can be installed (it is a PWA: *Zum Startbildschirm* on the phone,
*Installieren* in the desktop browser). The platform caches the app's files, so it opens
without internet once it has been opened online. The app makes its data work offline:

- **Use `mn.kv` for everything that must work offline.** It keeps a local copy (IndexedDB):
  `get`/`list` answer from it when offline, `set`/`delete` apply locally at once and are sent
  when the connection is back. Conflicts: the last change that reaches the server wins, so store
  one item per key (`task:<id>`) instead of one big array, and add `updatedAt` to items.
- `mn.db` tables and `mn.files` uploads need a connection. Show their views read-only from what
  the app last loaded (keep it in memory or in kv under `cache:<view>`), and disable adding
  with the hint "Offline nicht möglich". Photos taken offline: keep them in the item as a
  `pendingUpload` blob in IndexedDB and upload on reconnect.
- Do not write your own service worker or manifest; the platform adds them to every app.
- `mn.offline.online()` tells the current state; `mn.offline.onChange(cb)` fires on changes;
  `await mn.offline.pending()` counts writes still waiting; `mn.offline.onSynced(cb)` fires
  after the queue was sent, so reload the current view then.
- UI: a slim `mn-banner` at the top while offline ("Offline: Änderungen werden später
  übertragen · 2 ausstehend"); no error toasts for requests that were queued. Buttons that need
  the network (AI, Google, sharing) are disabled with a tooltip, not hidden.
- Never block start-up on the network: render from kv first, then refresh. `mn.auth.requireLogin()`
  works offline with the last session.
- IDs are created on the device (`crypto.randomUUID()`), never by the server, so offline items
  keep their identity after sync.
