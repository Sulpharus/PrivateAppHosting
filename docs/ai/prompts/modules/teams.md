---
id: teams
title: Teams und Projekte
summary: Daten nur mit ausgewählten Personen teilen, Rollen, Dateien und Hinweise je Team
order: 81
group: teilen
---

## Feature: teams (data mode `team`)

Use it when several groups of 2 to 6 people each work on their own data inside one app (projects,
trips, a band). Everything is in ADR 0023.

- `mininode.json`: `"data": { "mode": "team" }`.
- Every table of the app has `team_id uuid not null` (the platform adds the foreign key and the
  policies when you call `platform.secure_table('<slug>', '<table>', 'team')`; rows go when the
  team is deleted). Add `created_by uuid` to see who wrote a row. Index what you filter by.
- Teams through `mn.team`: `list()`, `create(name)`, `members(id)`, `setMember(id, userId, role)`
  (roles `viewer`, `editor`, `owner`; add people from `mn.people()`), `removeMember(id, userId)`
  (also "leave"), `rename`, `remove`, `notify(id, userId, title, body, url)`.
- Show only what the role allows: viewers get no edit controls, only owners see "Team verwalten".
  The database enforces it anyway; handle a refused write with a clear message.
- Rows: `mn.table('<table>')` as usual (offline too); filter by `team_id` in the app, and keep the
  selected team in `mn.kv` (`settings`). Team files: `mn.files.upload(path, blob, { team })`.
- Live: after a change `mn.realtime('team:<id>').send({ type: 'broadcast', event: 'changed', payload: { id } })`
  and reload that item on receipt; also reload when the tab becomes visible again. Never send data.
- Assigning someone: store `assignee_id`, then `mn.team.notify(...)`. Publish the tasks assigned
  to the signed-in person to the Kalender as suite `task` records with `due_at` (module `suite`).
- Leaving, removing a person and deleting a team ask for confirmation and say what happens.
