---
id: collaboration
title: Teilen und Echtzeit
summary: Gemeinsame Daten für Familie oder Gruppe, Live-Aktualisierung
order: 80
---

## Feature: sharing and realtime

- Choose the data mode in `mininode.json` by who shares what:
  `shared-account` (trusted users work on the owner's data, e.g. a household),
  `group` (everyone with the app shares all data, e.g. a club), `private` otherwise.
- Show who changed what: store `by` (display name) and `at` on each item and show them in the
  detail view ("Geändert von Jana, gestern").
- Live updates: `mn.realtime('<channel>')` broadcasts small events (`{ type: 'changed', id }`);
  on receipt, reload that item from kv. Never broadcast the data itself.
- Conflicts: keep `updatedAt` on each item; when saving an item that changed meanwhile,
  reload it and ask which version to keep.
- Also reload when the tab becomes visible again (`visibilitychange`), at most every 30 s.
- Sharing single items with chosen people in a `private` app (ADR 0008):
  - `mn.people()` lists the others who may use the app: `[{ id, name }]`.
  - Keep shared copies in an app table (`db/*.sql`) with `owner_id`, `recipients uuid[]` and
    a `payload`, secured with `secure_table(slug, table, 'private')`. Recipients read through
    a `security definer` function (`set search_path = ''`) that checks
    `platform.app_access('<slug>')` and `auth.uid() = any (recipients)`; no hand-written
    policies. Never use shared kv for this: every user of the app can read and overwrite it.
  - Show the sender from `owner_id` (looked up in `mn.people()`), never from the payload.
  - Leave private notes out of the copy, or say in the share dialog that they are shared.
