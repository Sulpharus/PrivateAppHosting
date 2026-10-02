---
id: sharing
title: Weitergeben und Teilen nach außen
summary: Text, Links oder Dateien per Messenger teilen, Einträge kopieren
order: 82
group: teilen
---

## Feature: sharing outside MiniNode

- "Teilen" uses the Web Share API (`navigator.share({ title, text, url })`) where available and
  falls back to "Kopieren" (`navigator.clipboard.writeText`) with a toast "Kopiert".
- Share readable text, not links into the app (people outside MiniNode cannot open them):
  e.g. a shopping list as lines with "–", an event as "Sa., 4. Okt., 18:00 · Ort".
- Files: `navigator.share({ files })` when `navigator.canShare({ files })` says yes (images,
  PDFs from the print module); otherwise download.
- Events can be exported as an `.ics` file (one `VEVENT`, `TZID=Europe/Berlin`), contacts as
  `.vcf`.
- Never create public links to data; MiniNode has no anonymous access.
