---
id: readonly-content
title: Inhalte vom Admin
summary: Nur der Admin pflegt die Inhalte, alle anderen lesen, etwa Termine oder Regeln
when: Nimm das, wenn nur du Inhalte pflegst und alle anderen sie nur lesen, etwa Vereinstermine oder Regeln.
order: 95
group: teilen
---

## Feature: content the admin maintains

Use it when one person (the admin) maintains content and everyone else only reads it: a club's
dates, a recipe collection of the family, rules, a price list.

- Data mode `readonly` in `mininode.json`: everyone with the app reads every row, only admins
  write. The database enforces it; the app only decides what to show.
- `await mn.auth.role()`: admins see "Bearbeiten", "Neu" and the editor sheets; everyone else gets
  the same views without those controls (not disabled controls).
- Tables as usual (`platform.secure_table('<slug>', '<table>', 'readonly')`); `mn.table` reads
  offline for everyone. A refused write shows a clear message.
- Show when the content was last updated ("Stand: 01. Okt. 2026") from the newest `updated_at`.
- Personal extras of readers (favourites, "gelesen") are not possible in this mode; if the brief
  needs them, use `group` mode with a role check in the UI and say so in the README.
