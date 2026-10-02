---
id: editor
title: Notizen und Texteditor
summary: Mehrzeilige Texte, Markdown, Checklisten, sicheres Anzeigen, Entwurf sichern
group: daten
order: 61
---

## Feature: notes and text editing

- Keep it a plain `<textarea>` with a small toolbar of real buttons (fett, Liste, Checkliste,
  Link). Store the text as Markdown or plain text, never as HTML.
- Render Markdown yourself with a small, bundled parser, and **escape everything**: never use
  `innerHTML` with user text, never allow `javascript:` links, open links with
  `rel="noopener noreferrer"`. Another user of a shared app must not be able to run script in
  your session.
- Autosave a draft to `mn.kv` (`draft:<id>`) after about 800 ms without typing, and save the real
  item on blur or on "Fertig". After a reload, offer "Entwurf wiederherstellen".
- Checklists: `- [ ]` and `- [x]` lines toggle from the rendered view without opening the editor.
- Show the character or word count when a limit exists, and say what is cut when it is exceeded.
- Search finds notes by title and body; highlight hits with `<mark>` built from text nodes.
- Long notes: keep the list light by storing a short `preview` with each note and loading the
  full body only when it is opened.
