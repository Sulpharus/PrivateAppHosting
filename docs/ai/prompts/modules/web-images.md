---
id: web-images
title: Bilder aus dem Netz
summary: Bild von einem Link übernehmen (Produkt, Buch, Rezept), auch für PDFs
when: Nimm das, wenn Leute einen Link einfügen und das Bild dazu in der App behalten wollen, etwa bei einer Wunschliste.
order: 45
group: anbindungen
---

## Feature: pictures from other websites

The page may not read files from other hosts (the CSP and most shops' missing CORS headers block
`fetch`). `mn.image(url)` fetches a public picture on the server and returns it as a `Blob`
(JPEG, PNG, GIF, WebP or AVIF, at most 8 MB).

- Use it when a person pastes a product, book or recipe link and wants its picture kept, or when
  a picture must go into a PDF or onto a canvas. Showing a remote picture as `<img src>` works
  without it, but the link can break; keep a copy for anything that matters.
- Keep a copy: `const blob = await mn.image(url)`, scale it on a canvas (long edge 1600 px), then
  `mn.files.upload('bilder/<itemId>/<uuid>.jpg', blob, { contentType: 'image/jpeg' })` and store the
  path on the row (module *Fotos und Dateien*). Store the source link too, for "Quelle".
- It throws for addresses that are not public `https`, not a picture or too large: show "Das Bild
  konnte nicht geladen werden" and let the person upload one instead.
- Ask only for pictures the person chose; never crawl pages or load many pictures in a loop.
- A link preview (title and picture of a page) is not available: the page's HTML cannot be read.
  Let the person type the title, or fill it with `mn.ai.search` only when the brief asks for it.
