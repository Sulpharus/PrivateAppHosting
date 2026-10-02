---
id: onboarding
title: Erster Start und Hilfe
summary: Leere Zustände, Beispieldaten, kurze Einführung, Hilfetexte
order: 16
group: qualitaet
---

## Feature: first start and help

- The first view on an empty app is a useful empty state, not a tour: one sentence what the
  app is for, one primary button ("Erste Aufgabe anlegen"), and optionally "Mit Beispieldaten
  ausprobieren".
- Sample data is clearly marked (a "Beispiel" chip on each item) and removable in one step
  ("Beispieldaten entfernen" in settings and in a banner while they exist).
- At most three short hints on first use, each shown once next to the thing it explains
  (remember in kv `seen:<hint>`); never a modal carousel.
- Every view that has something non-obvious gets a small "?" button that opens a sheet with
  two to five sentences of help in plain German.
- A "Was ist neu" note after an update only when behaviour changed; keep the version in kv.
- Settings contain "Hilfe und Tipps erneut anzeigen".
