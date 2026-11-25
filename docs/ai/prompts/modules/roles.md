---
id: roles
title: Rollen und Rechte in der App
summary: Admin, vertraute Nutzer und Nutzer unterscheiden, Bearbeiten nur für Berechtigte
when: Nimm das, wenn nicht alle dasselbe dürfen, etwa nur Admins Kategorien ändern.
group: teilen
order: 83
---

## Feature: roles and permissions in the app

- `await mn.auth.role()` returns `'admin' | 'trusted' | 'user'`. Use it to decide what to show
  (edit buttons, settings, delete), never as a security measure: the real protection is the data
  mode in `mininode.json` and the database rules.
- Pick the data mode that already says who may write: `shared-account` (trusted people work on the
  owner's data), `group` (everyone with the app), `private` (each their own), `team` (members by
  role) or `readonly` (nobody writes from the app; the content ships in the app's SQL files, module
  *Feste Inhalte*). There is no mode in which only admins write from the app: hiding edit controls
  from non-admins is a convenience, not a protection; say so in the README.
- Hide what a person may not do; do not show disabled controls without a reason. Where it helps,
  show a short note ("Nur Admins können Kategorien ändern").
- Handle a refused write (the server says no) with a clear message and reload the item; the UI
  may have been out of date.
- Do not build your own user list, invitations or roles. People come from the platform:
  `mn.people()`.
