---
id: undo
title: Rückgängig und Papierkorb
summary: Löschen mit Rückgängig, Papierkorb, Änderungsverlauf
order: 54
group: daten
---

## Feature: undo, trash and history

- Deleting never asks "Wirklich löschen?" for single items: delete at once and show a toast
  "Gelöscht · Rückgängig" for about 6 seconds (`mnui.toast` with an action). Bulk deletes and
  deleting things with children ask first and say how many are affected.
- Soft delete: set `deletedAt` instead of removing; a "Papierkorb" view in settings lists
  deleted items for 30 days with "Wiederherstellen" and "Endgültig löschen". Purge older items
  when the app opens.
- Files belonging to a deleted item are removed only when the item is purged.
- Optional history for important items: keep the last 20 versions in kv
  (`history:<id>` with `{ at, by, changes }`) and show "Verlauf" in the item's sheet.
- Undo applies to the last action only; keep it simple and predictable.
