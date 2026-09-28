---
id: collaboration
title: Teilen und Echtzeit
summary: Gemeinsame Daten für Familie oder Gruppe, Live-Aktualisierung
order: 80
---

## Feature: sharing and realtime

- Choose the data mode in `mininode.json` by who shares what:
  `shared-account` (trusted users work on the owner's data, e.g. a household),
  `group` (everyone with the app shares all data, e.g. a club), `private` otherwise.
- Show who changed what: store `by` (display name) and `at` on each item and show them in the
  detail view ("Geändert von Jana, gestern").
- Live updates: `mn.realtime('<channel>')` broadcasts small events (`{ type: 'changed', id }`);
  on receipt, reload that item from kv. Never broadcast the data itself.
- Conflicts: keep `updatedAt` on each item; when saving an item that changed meanwhile,
  reload it and ask which version to keep.
- Also reload when the tab becomes visible again (`visibilitychange`), at most every 30 s.
