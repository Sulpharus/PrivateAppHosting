---
id: roles
title: Rollen und Rechte in der App
summary: Admin, vertraute Nutzer und Nutzer unterscheiden, Bearbeiten nur für Berechtigte
group: teilen
order: 83
---

## Feature: roles and permissions in the app

- `await mn.auth.role()` returns `'admin' | 'trusted' | 'user'`. Use it to decide what to show
  (edit buttons, settings, delete), never as a security measure: the real protection is the data
  mode in `mininode.json` and the database rules.
- Pick the data mode that already says who may write: `readonly` (everyone reads, only the admin
  writes), `shared-account` (trusted users work on the owner's data), `group`, `private`.
- Hide what a person may not do; do not show disabled controls without a reason. Where it helps,
  show a short note ("Nur Admins können Kategorien ändern").
- Handle a refused write (the server says no) with a clear message and reload the item; the UI
  may have been out of date.
- Do not build your own user list, invitations or roles. People come from the platform:
  `mn.people()`.
