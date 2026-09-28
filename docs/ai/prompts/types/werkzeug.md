---
id: werkzeug
title: Rechner und Werkzeuge
summary: Rechner, Umrechner, Generatoren, kleine Helfer mit wenig Daten
accent: teal
order: 80
---

## App type: calculators and tools

A single-purpose helper: open, enter, read the result. Little or no stored data (data mode
`none` or `private` for saved presets and history).

- **Layout:** input and result on one screen without scrolling on a phone; the result is large
  and updates as you type (no "Berechnen" button unless the calculation is expensive).
- **Inputs:** German number parsing (forms module), units shown next to fields, sensible
  defaults filled in, a "Zurücksetzen" link.
- **Explain the result:** a collapsible "So wird gerechnet" section with the formula and the
  inputs used; cite the source for legal or tax values and the year they apply to.
- **History and presets (optional):** the last 20 results in kv with a copy button; named
  presets for repeated calculations.
- Pure functions for the calculation in their own module with unit tests; the UI only calls them.
