---
id: readonly-content
title: Feste Inhalte (nur lesen)
summary: Inhalte kommen mit der App und werden nur gelesen, etwa Regeln, Preislisten, Nachschlagewerke
when: Nimm das, wenn die Inhalte fest zur App gehören und niemand sie in der App ändert, etwa Vereinsregeln, eine Preisliste oder ein Nachschlagewerk.
order: 95
group: teilen
---

## Feature: fixed content everyone reads

Use it when the content belongs to the app and nobody edits it inside the app: rules, a price
list, a reference work, a fixed catalogue.

- Data mode `readonly` in `mininode.json`: every person with the app reads every row; **nobody
  writes from the app, admins included** (the database grants only `select`). Do not build editor
  screens, "Neu" buttons or forms that save.
- The content is seed data in the app's SQL files: tables as usual
  (`platform.secure_table('<slug>', '<table>', 'readonly')`), rows inserted in `db/001_init.sql`
  (`insert into app_<slug>.<table> (…) values (…)`). A change is a new numbered file
  (`db/002_preise_2027.sql` with `update`/`insert`), uploaded as a new version of the app.
- Read with `mn.table('<table>').list()` (works offline) or `mn.db` for filters and search.
- Show when the content was last changed ("Stand: 01. Okt. 2026") from the newest `updated_at`.
- Personal extras (favourites, "gelesen") go to `mn.kv` per person (`settings.favourites`: an
  array of ids); they are not part of the shared content.
- If people should add or edit entries in the app, this is the wrong mode: use `group` (everyone
  writes) or `shared-account` (trusted people write), and say in the README that hiding edit
  controls by `mn.auth.role()` is only a convenience, not a protection.
