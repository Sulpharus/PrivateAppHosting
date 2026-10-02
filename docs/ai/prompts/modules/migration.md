---
id: migration
title: Datenformat-Versionen und Migration
summary: Gespeicherte Daten später erweitern, ohne alte Einträge zu verlieren
group: qualitaet
order: 98
---

## Feature: data versions and migration

- Put `schemaVersion` into the stored data (`settings` item, or on each item) from the first
  release on. Start at 1.
- When the format changes, add a **migration function per version** (`migrate1to2(item)`) and run
  it when the item is read. Write the migrated item back lazily. Reading old data must never
  throw; unknown fields are kept untouched.
- Do not rename or remove a field in one step: add the new one, write both for a while, switch
  reads, then drop the old one (expand and contract).
- Table changes go into a **new numbered file** (`db/002_add_notes.sql`); never edit an applied
  one. Add columns as nullable or with a default; create indexes `concurrently` on big tables.
- Keep an export of the data in the app (see Import und Export) so the user can save a copy
  before a big change, and test migrations with a sample of old-format data.
