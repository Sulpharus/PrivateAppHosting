---
id: print
title: Drucken und PDF
summary: Druckansicht, Listen und Berichte als PDF über den Browser
order: 52
group: daten
---

## Feature: printing and PDF

- Printing uses the browser (`window.print()`); "Als PDF speichern" is the same dialog. No
  PDF library unless the app must produce files without the dialog.
- A dedicated print view per report (route `/drucken/<report>`), rendered with the data
  already loaded, then `print()`; `@media print` hides navigation, buttons and the FAB, uses
  black text on white, `break-inside: avoid` for cards and rows, and repeats table headers.
- Page header with the app name, the report title and the date range; footer with the print
  date. Set `@page { margin: 16mm }`.
- Numbers in tables are right-aligned with tabular figures; totals in bold with a rule above.
- Offer "Drucken" only where a paper copy makes sense (lists to take along, yearly reports,
  forms for the tax office).
