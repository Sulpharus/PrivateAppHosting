---
id: lists
title: Listen und Aufgaben
summary: Checklisten, Unteraufgaben, Reihenfolge, Erledigt-Bereich, Einkaufslisten
order: 22
group: daten
---

## Feature: lists and tasks

- A list item is a row with a large checkbox (44 px target), title, optional due date chip and
  a chevron to the detail sheet. Tapping the text opens the sheet; tapping the box toggles.
- Adding is one field at the top or bottom of the list ("Neuer Eintrag …", Enter saves and
  keeps focus for the next one). Parse simple extras from the text: "morgen", "fr 14:00", "#tag".
- Completed items move to a collapsible "Erledigt (5)" section with a subtle strike-through;
  "Erledigte löschen" clears them.
- Order: manual order via `position` (fractional values between neighbours so a move writes one
  item), changed with drag on desktop and "Nach oben/unten" in the item's menu on touch.
- Subtasks are one level deep only; the parent shows "2/5".
- Shopping-style lists group by category and remember past entries for autocomplete.
- In shared lists show who added or completed an item (small initials), and update live via the
  collaboration module.
