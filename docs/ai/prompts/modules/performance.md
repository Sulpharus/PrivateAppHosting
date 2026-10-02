---
id: performance
title: Große Datenmengen
summary: Tausende Einträge, Seitenweise laden, schnelle Listen, Indizes
order: 96
group: daten
---

## Feature: large amounts of data

- Up to about 2 000 small items kv is fine (one key per item, `mn.kv.list(prefix)` once on start,
  then keep them in memory). Beyond that, or when items are large, use `mn.db` tables with
  indexes on the columns you filter and sort by.
- Load pages of 50 with `range(from, to)` and "Mehr laden" or an `IntersectionObserver` at the
  end of the list; keep the scroll position when returning from a detail view.
- Render long lists with windowing (only visible rows plus a buffer) once they exceed about
  300 rows; keep row heights fixed for that.
- Compute statistics incrementally or in SQL (`group by`), not by loading everything.
- Debounce search (150 ms), batch writes (one `set` per item, not per keystroke), and never
  block the first paint on a full data load: show skeletons, then fill in.
