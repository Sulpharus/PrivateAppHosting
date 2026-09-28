---
id: familie
title: Familie und Haushalt
summary: Einkaufsliste, Putzplan, Essensplan, Aufgaben im Haushalt verteilen
accent: teal
order: 15
---

## App type: family and household

Several people share one data set and use it on their phones, often in a hurry (in the shop,
at the door). Data mode `group` (everyone with the app) or `shared-account` (the household
owner's data); say in the brief which one.

- **Views:** *Heute* (whose turn is what, what is missing), the main list (shopping, chores or
  meals), *Plan* (week view: meals or duties per day and person), *Mitglieder* in settings.
- **Data:** one kv key per item (`item:<id>`) with `addedBy`, `doneBy`, `doneAt`; people are
  referenced by user id and shown with name and initials. Rotations (chores) are a rule
  (`order: [userIds], every: 'week'`) evaluated per day, not pre-generated.
- **Interactions:** adding is one field with autocomplete from earlier entries; checking off is
  one tap and shows who did it. Live updates (collaboration module) so two people in the shop
  do not buy the same thing twice.
- **Fairness:** a small statistic per person (done this week) without ranking or blame.
- Offline matters here (supermarket basements): pair with the offline module.
