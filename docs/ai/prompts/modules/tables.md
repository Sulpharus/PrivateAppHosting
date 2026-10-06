---
id: tables
title: Eigene Tabellen
summary: Listen als SQL-Tabellen mit Typen und Regeln, offline über mn.table
order: 70
group: daten
---

## Feature: own tables

Every list of entries (items, bookings, plans, contacts, …) is a table, not one kv key per
entry (ADR 0022). `mn.kv` stays for settings and small state.

- Follow the spec's "Tables" section exactly: `db/001_init.sql`, schema `app_<slug>`,
  `platform.secure_table` for every table, `owner_id` filled by the database.
- Give columns real types and constraints: `not null`, `check`, foreign keys with
  `on delete cascade` between related tables. Money is integer cents, a day is a `date`, a moment a
  `timestamptz`. A `details jsonb` column holds only the free-form rest, never what you filter by.
- `id uuid primary key` is made by the app: `mn.table('<table>').newId()`.
- Use `mn.table('<table>')` for `list`, `get`, `upsert`, `upsertMany`, `remove`: it works offline like
  kv (local copy, queue, `mn.offline.onSynced`). Use `mn.db.from('<table>')` for server-side
  filters, sums and paging (online only).
- Index the columns you filter and sort by.
- Changes go into new numbered files (`db/002_add_rating.sql`); never edit an applied file.
