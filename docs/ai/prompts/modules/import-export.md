---
id: import-export
title: Import und Export
summary: JSON-Sicherung, CSV-Import mit Spaltenzuordnung, CSV-Export
order: 50
group: daten
---

## Feature: import and export

- **Backup:** "Sicherung exportieren" writes one JSON file
  (`{ app: '<slug>', version: 1, exportedAt, …data }`) and "Sicherung importieren" reads it
  back. Imports merge by id and never delete; show a summary toast ("12 Einträge importiert").
- **Validate everything imported:** coerce every field to its type, drop unknown fields, check
  dates with a regex, cap string lengths. A bad file must never break rendering.
- **CSV import:** detect separator (`;` or `,`), quotes, German numbers (`1.234,56`) and dates
  (`24.09.2026`), UTF-8 or Windows-1252. Show a preview with column mapping selects and the
  first five rows before saving. Re-importing the same file skips what exists (derive an id
  from the row's content).
- **CSV export:** `;`-separated, UTF-8 with BOM, German number format, one file per year or
  view.
- Downloads use a `blob:` URL on an `<a download>` created in the click handler.
- Put the backup controls in a `mn-card` on the settings view, with the date of the last
  export.
