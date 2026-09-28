---
id: search
title: Suche, Filter und Sortierung
summary: Schnellsuche, Filter-Chips, Sortierung, gemerkte Ansicht
order: 14
---

## Feature: search, filters and sorting

- A search field at the top of list views (`type="search"`, placeholder "Suchen …"), filtering
  as you type with a 150 ms debounce. Match case- and accent-insensitively
  (`normalize('NFKD')` without combining marks, `toLocaleLowerCase('de')`), across the fields a
  user would expect (title, notes, tags).
- Filters as chips under the search (`mn-chips`, `aria-pressed`): status, category, tag,
  period. Show the count per chip when cheap. "Filter zurücksetzen" appears once any filter
  is active.
- Sorting in a small select ("Neueste zuerst", "A–Z", "Fällig zuerst"); sort with
  `Intl.Collator('de')`.
- Remember search, filters and sorting per view in the URL query (so back/forward and links
  work) and the last choice in kv (`view:<name>`).
- The result list says how many match ("12 Einträge") in an `aria-live="polite"` region; the
  empty result has its own state ("Nichts gefunden für „…“" plus "Suche löschen").
- Highlight the matched text with `<mark>` built from text nodes, never via `innerHTML`.
- For more than a few thousand items use `mn.db` with an index and server-side `ilike`
  instead of filtering in memory (see the tables module).
