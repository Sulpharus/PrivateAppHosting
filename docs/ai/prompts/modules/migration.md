---
id: migration
title: Datenformat-Versionen und Migration
summary: Gespeicherte Daten später erweitern, ohne alte Einträge zu verlieren
when: Nimm das, wenn die App lange benutzt wird und sich das Datenformat später ändern kann.
group: qualitaet
order: 98
---

## Feature: data versions and migration

- Put `schemaVersion` into the settings in `mn.kv` from the first release on. Start at 1.
- Table changes go into a **new numbered file** (`db/002_add_notes.sql`); never edit an applied
  one. Each file runs once, inside one transaction: keep it to statements that work in a
  transaction (so no `create index concurrently`, no `vacuum`), and let it fail as a whole.
- Change columns by expand and contract: add the new column nullable or with a default, write
  both for a while (or backfill it in the same file with an `update`), switch reads, and drop the
  old column in a later file.
- Data in `mn.kv` (settings, small state) and `jsonb` columns: add a **migration function per
  version** (`migrate1to2(value)`) and run it when the value is read; write it back lazily.
  Reading old data must never throw; unknown fields are kept untouched.
- Keep an export of the data in the app (see Import und Export) so the person can save a copy
  before a big change, and test migrations with a sample of old-format data.
