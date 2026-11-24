---
id: rework
title: Bestehende App übernehmen
summary: Vorhandene App, Export oder Tabelle auf MiniNode und das App Kit umbauen
when: Nimm das, wenn es die App schon gibt, etwa als Export aus einem anderen Werkzeug, als Tabelle oder als alte Version, und sie umgebaut werden soll.
order: 5
group: qualitaet
---

## Situation: rebuilding an existing app

The owner already has a version of this app (another tool's export, a spreadsheet, an older
MiniNode app or a screenshot). Keep what works, move the rest onto the platform:

- Start by listing the existing views, data fields and actions (from the attached files or
  screenshots) and keep all of them unless the brief says otherwise; do not silently drop
  features.
- Move storage onto the platform: every list of entries becomes a table (`db/001_init.sql`,
  `mn.table`) with the same field names where possible, settings go to `mn.kv`. Write an import
  for the old data (JSON or CSV, see the import/export module), run once from settings.
- Replace the old layout with the App Kit shell and components; keep the owner's wording for
  labels and categories.
- Move every text for people into the German and English language packages while you rebuild
  (`i18n/de.json`, `i18n/en.json`, `data-i18n` and `mnI18n.t()`, see the language package guide);
  keep the owner's German wording as the German text.
- Remove everything the platform provides: own login screens, API keys, backend calls to other
  services, CDN scripts, analytics, own fallbacks for "when MiniNode is not there".
- List at the end what changed, what was dropped and why, and how to import the old data.
