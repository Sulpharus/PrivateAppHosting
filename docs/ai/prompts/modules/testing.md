---
id: testing
title: Tests und Übergabe-Prüfung
summary: Logik testen, Manifest prüfen, Ansichten bei 360 und 1280 px kontrollieren
when: Nimm das, wenn die App Rechenregeln oder Logik hat, die mit Tests abgesichert werden sollen.
group: qualitaet
order: 94
---

## Feature: tests and the hand-over check

- Put the rules of the app (calculations, parsing, sorting, state machines) into plain modules
  without DOM and test them with Vitest: normal cases, empty input, limits, and every bug you fix
  gets a test first.
- Date-dependent code takes "today" as a parameter, so tests do not break at month ends.
- Randomness takes a random function as a parameter; tests pass a seeded one.
- Working in the MiniNode repository: `pnpm mininode doctor hosted/<slug>` must say `ok` and
  `pnpm check` must pass; add one e2e test under `e2e/` that opens the app, does the main action
  and checks the result.
- Working elsewhere (a chat or app builder): run the unit tests if the tool can, and list in the
  summary which checks you ran and which the owner should run after the upload.
- Check by hand before handing over: 360, 768 and 1280 px, light and dark, German and English,
  empty app, app with 100 entries, offline, keyboard only.
- Do not commit generated files, `node_modules`, installers or secrets. The README says what the
  app does, what it stores and how to run the tests.
