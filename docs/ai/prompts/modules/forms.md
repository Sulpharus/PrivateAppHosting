---
id: forms
title: Formulare und Eingaben
summary: Prüfung der Eingaben, Zahlen und Daten je nach Sprache, Entwürfe, Pflichtfelder
when: Nimm das, wenn die App viele Eingaben hat, etwa Beträge, Daten oder Pflichtfelder, die geprüft werden sollen.
order: 12
group: daten
---

## Feature: forms and input

- One form per sheet (`mn-sheet` with `mn-form`); labels above fields, required fields marked
  with "(Pflicht)" / "(required)" in the label, never only with colour or an asterisk.
- Validate on submit and on blur of a touched field, not on every keystroke. Show the message
  under the field (`aria-describedby`), move focus to the first invalid field, and keep what
  was typed.
- Numbers: accept "12,50", "12.50" and "1.234,56" (and "1,234.56" in English); parse with one
  helper and store numbers, not strings. Money is stored in cents (integer). Show numbers with
  `Intl.NumberFormat(mnI18n.locale)`.
- Dates use `<input type="date">`/`type="time"`; store `YYYY-MM-DD` and `HH:MM`. Offer quick
  choices ("Heute", "Morgen", "Nächste Woche") as chips next to the field.
  - The App Kit shows these fields as parts (Tag · Monat · Jahr, Stunde : Minute; in English Day ·
    Month · Year) in every browser. Do not build your own date pickers.
  - Show dates with `mnui.date.format(iso)` ("01. Okt. 2026" / "01 Oct 2026") and amounts with
    `Intl.NumberFormat(mnI18n.locale, { style: 'currency', currency: 'EUR' })`.
- Use the right keyboard: `inputmode="decimal"` for amounts, `inputmode="numeric"` for
  counts, `type="email"`, `type="tel"`, `autocomplete` where it applies.
- Long forms save a draft in kv (`draft:<form>`, one key per form, removed on save) every few
  seconds and restore it with a "Entwurf wiederhergestellt · Verwerfen" banner. Closing a changed
  form asks "Änderungen verwerfen?".
- Primary button "Speichern" at the end, disabled while saving (with a spinner), never
  disabled because of invalid input: pressing it shows what is missing.
