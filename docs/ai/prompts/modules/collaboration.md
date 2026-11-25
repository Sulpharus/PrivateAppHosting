---
id: collaboration
title: Teilen und Echtzeit
summary: Gemeinsame Daten für Familie oder Gruppe, Live-Aktualisierung
when: Nimm das, wenn mehrere Leute gleichzeitig an denselben Daten arbeiten und Änderungen sofort sehen sollen.
order: 80
group: teilen
---

## Feature: sharing and realtime

- Choose the data mode in `mininode.json` by who shares what:
  `shared-account` (trusted people work on the owner's data, e.g. a household),
  `group` (everyone with the app shares all data, e.g. a club), `team` (several small teams with
  roles, each seeing only its own data, e.g. projects; module `teams`), `readonly` (fixed content
  from the app's SQL files, nobody writes from the app), `private` otherwise.
- Show who changed what: tables have `updated_at`; add `updated_by uuid` and show the name from
  `mn.people()` in the detail view ("Geändert von Jana, gestern").
- Live updates: `mn.realtime('<channel>')` broadcasts small events (`{ type: 'changed', id }`);
  on receipt, reload that row (`mn.table('<table>').get(id)`). Never broadcast the data itself.
- Conflicts: when saving a row whose `updated_at` changed since it was loaded, reload it and ask
  which version to keep.
- Also reload when the tab becomes visible again (`visibilitychange`), at most every 30 s.
- Sharing single items with chosen people in a `private` app (ADR 0008):
  - `mn.people()` lists the others who may use the app: `[{ id, name }]`.
  - Keep shared copies in an app table (`db/*.sql`) with `owner_id`, `recipients uuid[]` and
    a `payload`, secured with `secure_table(slug, table, 'private')`. Recipients read through
    a `security definer` function (`set search_path = ''`) that checks
    `platform.app_access('<slug>')` and `auth.uid() = any (recipients)`; no hand-written
    policies. Never use shared kv for this: every person with the app can read and overwrite it.
  - Show the sender from `owner_id` (looked up in `mn.people()`), never from the payload.
  - Leave private notes out of the copy, or say in the share dialog that they are shared.
