---
id: settings
title: Einstellungen und Kategorien
summary: Einstellungsseite, eigene Kategorien und Listen pflegen, Standardwerte
order: 56
group: daten
---

## Feature: settings and editable lists

- One settings view (last tab or a gear in the header) grouped into sections with
  `group-head`s: Allgemein, Kategorien, Benachrichtigungen, Daten, Hilfe.
- Settings live in kv under `settings` (private) or `settings` with `'shared'` for app-wide
  defaults in group apps; merge with defaults in code so new settings work without migration.
- Categories, tags and similar lists: add, rename, recolour (from the six kit accents), reorder
  with up/down buttons (and drag on desktop), archive instead of delete when items still use
  them. Renaming updates all items.
- Every setting takes effect immediately (no "Speichern" button), confirmed with a short
  toast only when the effect is not visible.
- The "Daten" section offers export and import (see the import/export module) and "Alle Daten
  dieser App löschen" behind a confirmation that asks to type "löschen".
