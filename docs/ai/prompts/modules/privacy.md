---
id: privacy
title: Sensible Daten und Datenschutz
summary: Gesundheits-, Finanz- oder Personendaten sparsam und nachvollziehbar speichern
order: 95
---

## Feature: sensitive data

- Store only what the feature needs; no free-text fields for things that should not be
  written down (passwords, full card or ID numbers). Mask IBANs and account numbers in lists
  (`DE12 •••• 3456`).
- Data mode `private` unless sharing is the point; in shared apps say in the UI who can see
  an item ("Sichtbar für alle im Haushalt").
- No data leaves MiniNode except through `mn.ai` (and only what the user explicitly sends; say
  so next to AI buttons: "Wird zur Auswertung an die KI gesendet").
- A "Daten" section in settings exports everything the user stored in this app as JSON and can
  delete all of it.
- Screens with sensitive numbers get a "Beträge ausblenden" toggle (blur via CSS class),
  remembered in kv.
- Push notifications and bell entries show on the lock screen: keep their text neutral
  ("Neue Buchung", "Termin morgen"), never amounts, diagnoses or names of third parties.
- Never log data to the console in production code.
