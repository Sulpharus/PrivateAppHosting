---
id: rework
title: Bestehende App übernehmen
summary: Vorhandene App, Export oder Tabelle auf MiniNode und das App Kit umbauen
order: 5
group: qualitaet
---

## Situation: rebuilding an existing app

The owner already has a version of this app (another tool's export, a spreadsheet, an older
MiniNode app or a screenshot). Keep what works, move the rest onto the platform:

- Start by listing the existing views, data fields and actions (from the attached files or
  screenshots) and keep all of them unless the brief says otherwise; do not silently drop
  features.
- Move storage to `mn.kv` (or tables) with the same field names where possible and write an
  import for the old data (JSON or CSV, see the import/export module), run once from settings.
- Replace the old layout with the App Kit shell and components; keep the owner's wording for
  labels and categories.
- Remove everything the platform provides: own login screens, API keys, backend calls to other
  services, CDN scripts, analytics.
- List at the end what changed, what was dropped and why, and how to import the old data.
