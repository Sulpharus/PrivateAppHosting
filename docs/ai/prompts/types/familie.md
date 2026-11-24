---
id: familie
title: Familie und Haushalt
summary: Einkaufsliste, Putzplan, Essensplan, Aufgaben im Haushalt verteilen
when: Nimm das, wenn mehrere Leute im Haushalt dieselben Listen benutzen, etwa Einkauf, Putzplan oder Essensplan, oft schnell unterwegs auf dem Handy.
accent: teal
audience: household
modules: tables, lists, collaboration, offline
order: 15
---

## App type: family and household

Several people share one data set and use it on their phones, often in a hurry (in the shop,
at the door). Data mode `shared-account` (the household works on the owner's data) or `group`
(everyone with the app); the brief's "who uses it" line says which.

- **Views:** *Heute* (whose turn is what, what is missing), the main list (shopping, chores or
  meals), *Plan* (week view: meals or duties per day and person), *Mitglieder* in settings.
- **Data:** a table per kind of entry, e.g. `items` (`id`, `list text`, `title text not null`,
  `category`, `added_by uuid`, `done_by uuid`, `done_at timestamptz`, `position double
  precision`); people are referenced by user id (from `mn.people()`) and shown with name and
  initials. Rotations (chores) are a row in `rotations` (`order uuid[]`, `every text`) evaluated
  per day, not pre-generated.
- **Interactions:** adding is one field with autocomplete from earlier entries; checking off is
  one tap and shows who did it. Live updates (collaboration module) so two people in the shop
  do not buy the same thing twice.
- **Fairness:** a small statistic per person (done this week) without ranking or blame.
- Offline matters here (supermarket basements): `mn.table` works offline; see the offline module.
