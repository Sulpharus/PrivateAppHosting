---
id: organisation
title: Organisation und Planung
summary: Aufgaben, Termine, Routinen, Listen, Wochenpläne
when: Nimm das für Aufgaben, Termine, Routinen und Wochenpläne, also eine App, die du mehrmals am Tag kurz öffnest, um zu sehen, was als Nächstes dran ist.
accent: blue
audience: me
modules: tables, lists, dates, notifications
order: 10
---

## App type: organisation and planning

Tasks, dates, routines, lists and plans. People open it several times a day for a few seconds,
so the first view answers "what is next?".

- **Views:** *Heute* (week strip, then "Fällig" and "Geplant" sections), *Liste* or *Projekte*
  (filter chips by list or status), *Kalender* (month grid with dots plus the selected day's
  list), optionally *Erledigt* or *Statistik*.
- **Data:** a table `tasks` (`id`, `title text not null`, `due date`, `due_time time`, `list
  text`, `done_on date`, `repeat jsonb` (a rule, see the dates module), `notes text`, `position
  double precision`), and `settings` in `mn.kv`. Index `due` and `done_on`.
- **Interactions:** checking an item off is one tap on a round `mn-tile-action` or a row
  checkbox and shows a toast with "Rückgängig". Adding needs only a title; everything else is
  optional and sits under `details.mn-more`.
- **Repeats** are generated from the rule when a day is shown; never pre-create months of copies.
- **Empty states** explain the first step: "Noch keine Aufgaben. Leg die erste an, z. B.
  „Müll rausbringen“."
