---
id: suite
title: Gemeinsame Daten
summary: Termine, Aufgaben und Co. mit anderen Apps teilen, etwa für den Kalender
order: 81
group: anbindungen
---

## Feature: shared suite data (ADR 0002)

- Use it when other apps should see the data. Anything with a date shows in the Kalender app.
  Everything private to this app stays in `mn.kv`.
- Declare what the app needs; the admin approves it before it works:
  ```json
  "suite": { "uses": [
    { "type": "event", "access": "create", "why": "Kurstermine im Kalender zeigen" }
  ] }
  ```
  - Types: `event`, `task`, `reminder`, `project`, `activity`, `contract`, `transaction`.
  - Access levels: `read`, `create` (own records), `write` (also others'), `delete`.
- Write with a stable source key, so repeated syncs update instead of duplicating:
  `await mn.suite.type('event').upsert({ title, starts_at, ends_at, data: { all_day: false } },
  { sourceKey: 'course-12#2026-10-05' })`.
  - Times are ISO strings with a zone.
  - Only the type's fields are allowed in `data`; unknown ones are refused.
  - The result has `merged` and `rejectedFields`. Show a short note when fields were
    rejected: another app owns them.
- Remove what no longer exists with `mn.suite.type(t).delete(id)` (it goes to a 30-day bin).
  Keep a map `sourceKey → id` in `mn.kv` to find the id.
- Read with `mn.suite.range({ from, to })` or `mn.suite.type(t).list()`. The result only
  contains types the admin granted for reading.
- Sharing uses collections, not the app:
  - `mn.suite.collections(family)` lists them;
  - `createCollection(name, family)` creates one;
  - `setMember(id, userId, 'editor' | 'viewer' | null)` manages members, with people from
    `mn.people()`.
- The suite is online only. When offline, keep the change in kv and sync it later.
