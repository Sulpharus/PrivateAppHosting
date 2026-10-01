---
id: forms
title: Formulare und Eingaben
summary: Validierung, deutsche Zahlen und Daten, Entwürfe, Pflichtfelder
order: 12
---

## Feature: forms and input

- One form per sheet (`mn-sheet` with `mn-form`); labels above fields, required fields marked
  with "(Pflicht)" in the label, never only with colour or an asterisk.
- Validate on submit and on blur of a touched field, not on every keystroke. Show the message
  under the field (`aria-describedby`), move focus to the first invalid field, and keep what
  was typed.
- German numbers: accept "12,50", "12.50" and "1.234,56"; parse with one helper and store
  numbers, not strings. Money is stored in cents (integer). Show with `Intl.NumberFormat('de-DE')`.
- Dates use `<input type="date">`/`type="time"`; store `YYYY-MM-DD` and `HH:MM`. Offer quick
  choices ("Heute", "Morgen", "Nächste Woche") as chips next to the field.
  - The App Kit shows these fields as German parts (Tag · Monat · Jahr, Stunde : Minute) in
    every browser. Do not build your own date pickers.
  - Show dates as "01. Okt. 2026" (`mnui.date.format`) and amounts as "1.234,50 €".
- Use the right keyboard: `inputmode="decimal"` for amounts, `inputmode="numeric"` for
  counts, `type="email"`, `type="tel"`, `autocomplete` where it applies.
- Long forms save a draft in kv (`draft:<form>`) every few seconds and restore it with a
  "Entwurf wiederhergestellt · Verwerfen" banner. Closing a changed form asks "Änderungen
  verwerfen?".
- Primary button "Speichern" at the end, disabled while saving (with a spinner), never
  disabled because of invalid input: pressing it shows what is missing.
