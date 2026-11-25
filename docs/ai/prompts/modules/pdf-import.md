---
id: pdf-import
title: PDFs einlesen
summary: Kontoauszüge, Rechnungen und andere PDFs auslesen und als Einträge übernehmen
when: Nimm das, wenn Daten aus PDFs übernommen werden sollen, etwa Kontoauszüge oder Rechnungen.
order: 72
group: daten
---

## Feature: reading PDFs (statements, invoices)

Use it when people upload PDFs whose content the app should take over, e.g. bank statements or
invoices.

- Read the text in the browser with `pdfjs-dist` from npm (bundled, with its worker as a module
  file of the app; never from a CDN). `page.getTextContent()` gives the text items with positions;
  group them into lines by their `y` value, then into columns by `x`.
- Write one parser per known layout (a bank, a shop) as a pure function with tests on sample text,
  and detect the layout from typical words. Unknown layouts: show the lines and let the person map
  the columns once (like the CSV import), then remember the mapping in a table `layouts`.
- Always show a preview of what was found (date, text, amount) with checkboxes before saving, and
  skip rows that already exist (derive the id from date, amount and text).
- Scanned PDFs without a text layer cannot be read (no OCR): say so and offer manual entry.
- Keep the PDF itself in `mn.files` only when the person wants it as a receipt.
- Free-form documents can go through `mn.ai.json(text, schema)` after the text is extracted;
  never send the PDF file to the AI.
