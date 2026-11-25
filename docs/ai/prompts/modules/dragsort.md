---
id: dragsort
title: Sortieren per Ziehen
summary: Reihenfolge ändern mit Maus, Touch und Tastatur, gespeichert pro Nutzer
when: Nimm das, wenn die Reihenfolge von Einträgen selbst bestimmt werden soll, per Ziehen oder per Knopf.
group: daten
order: 63
---

## Feature: manual ordering by dragging

- Dragging is an extra; **every reorder must also work with buttons** ("Nach oben", "Nach unten"
  with an accessible name that includes the item) and with the keyboard (focus the item handle,
  Space picks it up, arrows move it, Space drops, Escape cancels). Announce each step in an
  `aria-live` region ("Position 3 von 8").
- Use pointer events (`pointerdown/move/up`) with `touch-action: none` on the handle only, so the
  list still scrolls. Start the drag after a short move (6 px) or a 250 ms hold on touch screens.
- Animate only `transform`; show the drop position with a line, not by shifting every row.
- Store the order where it belongs:
  - the same order for everyone: a `position double precision` column on the table; a move writes
    only the moved row, with a value between its new neighbours (renumber all rows when the gap
    gets smaller than 1e-9);
  - an own order per person on shared rows: one `mn.kv` key `order:<list>` with the array of ids.
    Ids missing from it go to the end sorted by name; ids that no longer exist are ignored.
- Offer "Eigene Reihenfolge" next to the other sorts.
