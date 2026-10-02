---
id: dragsort
title: Sortieren per Ziehen
summary: Reihenfolge ändern mit Maus, Touch und Tastatur, gespeichert pro Nutzer
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
- Store the order as one array of ids (`order:<list>` in `mn.kv`), not as a number on every item,
  so one write saves it. Items missing from the array go to the end sorted by name; ids that no
  longer exist are ignored.
- Offer "Eigene Reihenfolge" next to the other sorts, and keep it per user unless the app is
  shared on purpose.
