---
id: errors
title: Fehler, Laden und Wiederholen
summary: Leere, ladende und fehlerhafte Zustände, verständliche Meldungen, erneut versuchen
group: qualitaet
order: 93
---

## Feature: loading, empty and error states

- Every view has four states and the code makes them explicit: **loading** (a skeleton in the
  shape of the content, after 200 ms, never a bare spinner on a blank page), **empty** (what this
  is, the one action to start), **error** (what failed, what the user can do), **content**.
- Error messages are German, short and concrete: "Die Rezepte konnten nicht geladen werden.
  Prüfe deine Verbindung." with a "Erneut versuchen" button. No stack traces, no codes. Log the
  technical error with `console.error` only.
- A failed save keeps the user's input in the form and says what to do. Optimistic changes are
  rolled back with a toast when the server refuses them.
- Wrap each network call: set the state before, handle `catch`, always reset the state in
  `finally`. Do not leave buttons disabled after an error.
- Distinguish offline from broken: when `mn.offline.online()` is false, say "Du bist offline",
  not "Fehler".
- One top-level error boundary (React) or `window.onerror` handler shows a "Etwas ist schiefgelaufen.
  Neu laden" screen instead of a blank page; user data in kv is never wiped by it.
- Forms validate on blur and on submit, name the field and the rule ("Name: mindestens 2
  Zeichen"), and focus the first invalid field.
