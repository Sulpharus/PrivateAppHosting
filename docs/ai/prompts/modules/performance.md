---
id: performance
title: Große Datenmengen
summary: Tausende Einträge, Seitenweise laden, schnelle Listen, Indizes
when: Nimm das, wenn es tausende Einträge werden, etwa ein großes Archiv oder viele Jahre Buchungen.
order: 96
group: daten
---

## Feature: large amounts of data

- Lists live in tables (spec, "Tables"). `mn.table('<t>').list()` loads all rows of the person
  into the local copy; that is fine up to a few thousand small rows. Beyond that, or when rows are
  large, read pages and aggregates on the server with `mn.db` (online).
- Load pages of 50 with `mn.db.from('<t>').select('*').order('<col>').range(from, to)` and
  "Mehr laden" or an `IntersectionObserver` at the end of the list; keep the scroll position when
  returning from a detail view.
- Index every column you filter or sort by (`create index on app_<slug>.<t> (<col>)`).
- Render long lists with windowing (only visible rows plus a buffer) once they exceed about
  300 rows; keep row heights fixed for that.
- Compute statistics in SQL (`group by`, a view or a `security invoker` function), not by loading
  everything.
- Debounce search (150 ms), write once per saved item (not per keystroke), and never block the
  first paint on a full data load: show skeletons, then fill in.
