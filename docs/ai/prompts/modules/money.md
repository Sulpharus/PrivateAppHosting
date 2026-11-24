---
id: money
title: Geld und Beträge
summary: Beträge in Cent, Zahlen je nach Sprache, Summen, Aufteilen und Runden
when: Nimm das, sobald Geldbeträge vorkommen. Dann wird genau in Cent gerechnet und richtig gerundet.
group: daten
order: 57
---

## Feature: money and amounts

- Store every amount as an **integer in cents** (`amount_cents integer`, `1999` = 19,99 €) plus a
  currency code when more than one is possible. Never keep money in floating point; convert only
  for display and when reading what the person typed.
- Show amounts for the person's language: `new Intl.NumberFormat(mnI18n.locale, { style:
  'currency', currency: 'EUR' })` gives "1.234,50 €" in German and "€1,234.50" in English. Accept
  typed input with comma or dot ("12,5", "1.234,50") and say what was understood next to the
  field. Reject more than two decimals.
- Sums are sums of integers. When something is split (shared costs, a price spread over sessions),
  divide with `Math.floor` and give the remainder cent by cent to the first parts, so the parts
  always add up to the total.
- Positive and negative amounts need a visible meaning ("Einnahme", "Ausgabe"), not only a colour
  or a minus sign. Use `.mn-num` (tabular figures) and right-align amount columns.
- Percentages and tax: calculate from cents and round once at the end (`Math.round`), and show
  the rounding rule in the detail view when it matters (net, tax, gross).
- Month and year totals group by the local date (Europe/Berlin), not by UTC; in SQL use
  `booked_on` (a `date`) or `(at at time zone 'Europe/Berlin')::date`.
