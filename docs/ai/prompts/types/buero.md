---
id: buero
title: Büro und Dokumente
summary: Notizen, Dokumente, Vorlagen, Protokolle, Wissenssammlung
when: Nimm das für Notizen, Protokolle, Vorlagen oder eine kleine Wissenssammlung, also überall dort, wo vor allem Text geschrieben und wiedergefunden wird.
accent: blue
audience: me
modules: tables, editor, search, import-export
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
- **Data:** a table `docs` (`id`, `title text not null`, `body text`, `preview text` (the first
  200 characters, for lists), `folder text`, `tags text[]`, `pinned boolean not null default
  false`, timestamps) and a table `templates` (`id`, `title`, `body`). Keep a body below about
  200 kB; attachments go to `mn.files`. Index `updated_at` and `folder`.
- **Templates:** "Neu aus Vorlage" fills title and body from a `templates` row.
- **Export:** each document as `.md`, the whole collection as a JSON backup.
