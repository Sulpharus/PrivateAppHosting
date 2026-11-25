---
id: readonly-content
title: Admin pflegt, alle lesen
summary: Nur Admins pflegen die Inhalte in der App, alle anderen lesen, etwa Termine, Regeln, Preislisten
when: Nimm das, wenn nur du (als Admin) die Inhalte in der App pflegst und alle anderen sie nur lesen, etwa Vereinstermine, Regeln oder eine Preisliste.
order: 95
group: teilen
---

## Feature: content the admin maintains

Use it when admins maintain the content inside the app and everyone else reads it: a club's dates,
rules, a price list, a family recipe collection, a reference work.

- Data mode `readonly` in `mininode.json`: everyone with the app reads every row; **only admins
  write** (insert, update, delete). The database enforces it (ADR 0031), and a write works only from
  the app's own page.
- Tables as usual (`platform.secure_table('<slug>', '<table>', 'readonly')`, no `owner_id` needed);
  read with `mn.table('<table>').list()` (offline too) or `mn.db` for filters and search; admins
  write with `mn.table('<table>').upsert(row)` and `.remove(id)`.
- `await mn.auth.role()` decides what to show: admins see "Neu", "Bearbeiten" and the editor
  sheets; everyone else gets the same views without them (not disabled controls). A refused write
  (someone lost the admin role) shows a clear message and reloads.
- Starting content can come with the app as rows in `db/001_init.sql`; later changes are made in
  the app.
- Show when the content was last changed ("Stand: 01. Okt. 2026") from the newest `updated_at`.
- Personal extras of readers (favourites, "gelesen") go to `mn.kv` per person (`settings.favourites`:
  an array of ids); they are not part of the shared content.
- If several people (not only admins) should edit, use `group` (everyone writes) or
  `shared-account` (trusted people work on the owner's data) instead.
