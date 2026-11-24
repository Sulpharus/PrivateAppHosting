---
id: settings
title: Einstellungen und Kategorien
summary: Einstellungsseite, eigene Kategorien und Listen pflegen, Standardwerte
when: Nimm das, wenn die App Einstellungen, eigene Kategorien oder einen Bereich zum Sichern und Löschen der Daten braucht.
order: 56
group: daten
---

## Feature: settings and editable lists

- One settings view (last tab or a gear in the header) grouped into sections: Allgemein,
  Kategorien, Benachrichtigungen, Daten, Konto, Hilfe.
- Settings live in `mn.kv` under `settings` (private) or `settings` with `'shared'` for app-wide
  defaults in group apps; merge with defaults in code so new settings work without migration.
- Categories, tags and similar lists are a table (`categories`: `id`, `name`, `colour` from the
  kit's `data-cat` names, `position`, `archived boolean`): add, rename, recolour, reorder with
  up/down buttons (and drag on desktop), archive instead of delete when items still use them.
  Items reference the category by id, so renaming changes every item at once.
- Every setting takes effect immediately (no "Speichern" button), confirmed with a short
  toast only when the effect is not visible.
- The "Daten" section offers export and import (see the import/export module) and "Alle Daten
  dieser App löschen" behind a confirmation that asks to type "löschen".
- The "Konto" section links to the portal's account page (`mn.auth.accountUrl()`: name, password,
  language, notifications) and offers "Abmelden" (`await mn.auth.signOut()`); the app has no
  account screens of its own. The "Alle Apps" link of the shell points to `mn.config.portalUrl`.
