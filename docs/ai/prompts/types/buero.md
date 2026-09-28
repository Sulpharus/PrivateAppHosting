---
id: buero
title: Büro und Dokumente
summary: Notizen, Dokumente, Vorlagen, Protokolle, Wissenssammlung
accent: blue
order: 50
---

## App type: office and documents

Notes, documents, templates, meeting minutes and small knowledge bases.

- **Views:** *Zuletzt* (recent documents as rows), *Ordner* or *Tags* (filter chips), *Suche*
  (full text across titles and bodies), the editor.
- **Editor:** a full-height `mn-sheet--tall` or a dedicated view with a plain `textarea`
  (Markdown) and a preview toggle (`mn-seg`: Schreiben / Vorschau). Render Markdown to DOM
  nodes with a small bundled library and sanitise it; never `innerHTML` raw user text.
  Autosave after 800 ms of no typing and show "Gespeichert" in the header subtitle.
- **Data:** `doc:<id>` with `title`, `body`, `folder`, `tags[]`, `updatedAt`, `pinned`. Keep
  large bodies below ~200 kB per key; attachments go to `mn.files`.
- **Templates:** `template:<id>`; "Neu aus Vorlage" fills title and body.
- **Export:** each document as `.md`, the whole collection as a ZIP or JSON backup.
