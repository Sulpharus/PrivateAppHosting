---
id: tables
title: Eigene Tabellen
summary: SQL-Tabellen statt Key-Value, für Abfragen und große Listen
order: 70
---

## Feature: own tables

Use tables only when kv is not enough: relations, filtering on the server, sorting large
lists, or thousands of rows.

- Follow the spec's "Tables" section exactly: `db/001_init.sql`, schema `app_<slug>`,
  `platform.secure_table` for every table, `owner_id` filled by the database.
- Index the columns you filter and sort by; add `created_at timestamptz default now()`.
- Query with `mn.db.from('<table>')` and page long lists with `.range(from, to)`.
- Changes go into new numbered files (`db/002_add_rating.sql`); never edit an applied file.
- Keep the kv store for settings and small state.
