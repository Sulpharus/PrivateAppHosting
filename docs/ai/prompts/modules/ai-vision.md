---
id: ai-vision
title: KI mit Bildern (noch nicht verfügbar)
summary: Scans, Fotos und Belege auswerten, mit Rückfall auf Handeingabe
group: anbindungen
order: 26
---

## Feature: AI on images (not available on the platform yet)

The AI proxy forwards text only. A request with images fails with `AiError` code
`images_unsupported`. Build the feature so it works today and switches on later:

- The manual path is the real feature: a form to type or correct everything the image would
  have provided. The photo (via `mn.files`) is only attached as proof.
- Wrap the call in one function `readImage(file)`. Today it catches `images_unsupported` and
  returns `null`; the UI then says "Die automatische Erkennung ist noch nicht verfügbar. Trag die
  Werte bitte selbst ein." and opens the form with the photo shown next to it.
- Never invent values when the call fails, and never pretend that something was recognised.
- When it is available, always show the result in the form for the user to confirm, with
  uncertain fields marked.
- Resize photos before upload (long edge 1600 px, JPEG 0.8) to keep files small.
- On-device text recognition in the browser is out of scope; do not add OCR libraries.
