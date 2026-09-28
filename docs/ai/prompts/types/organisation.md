---
id: organisation
title: Organisation und Planung
summary: Aufgaben, Termine, Routinen, Listen, Wochenpläne
accent: blue
order: 10
---

## App type: organisation and planning

Tasks, dates, routines, lists and plans. People open it several times a day for a few seconds,
so the first view answers "what is next?".

- **Views:** *Heute* (week strip, then "Fällig" and "Geplant" sections), *Liste* or *Projekte*
  (filter chips by list or status), *Kalender* (month grid with dots plus the selected day's
  list), optionally *Erledigt* or *Statistik*.
- **Data:** one kv key per item (`task:<id>`), plus `settings`. Items carry `title`, `due`
  (`YYYY-MM-DD`), optional `time`, `list`, `done` (date or null), `repeat` (`none`, `daily`,
  `weekly:<weekdays>`, `monthly:<day>`), `notes`.
- **Interactions:** checking an item off is one tap on a round `mn-tile-action` or a row
  checkbox and shows a toast with "Rückgängig". Adding needs only a title; everything else is
  optional and sits under `details.mn-more`.
- **Repeats** are generated from the rule when a day is shown; never pre-create months of copies.
- **Empty states** explain the first step: "Noch keine Aufgaben. Leg die erste an, z. B.
  „Müll rausbringen“."
