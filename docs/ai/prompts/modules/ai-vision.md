---
id: ai-vision
title: Fotos statt Abtippen (KI-Bilderkennung folgt)
summary: Foto als Beleg neben einer bequemen Eingabe; die Bilderkennung folgt später
when: Nimm das, wenn Fotos (Belege, Etiketten) Werte liefern sollen. Die KI kann noch keine Bilder lesen, deshalb baut die KI eine bequeme Eingabe mit dem Foto daneben.
group: anbindungen
order: 26
---

## Feature: photos instead of typing (AI on images is not available yet)

`mn.ai` takes text only: a message's `content` is a string, and there is no way to send a
picture. Build the feature so it is complete without image recognition:

- The manual path is the real feature: a form to type or correct everything the photo would have
  provided, with the photo (stored via `mn.files`) shown next to the form as a reference.
- Keep the recognition behind one function `readImage(file)` that returns `null` today and is not
  called over the network. The UI then opens the form with the photo next to it, without an error
  message. Never put an image or base64 data into a prompt.
- Text the person already has (copied from the phone's own text recognition, a pasted mail) can go
  through `mn.ai.json(text, schema)` to fill the form; always show the result for confirmation and
  mark the filled fields.
- Never invent values and never pretend that something was recognised.
- Resize photos before upload (long edge 1600 px, JPEG 0.8) to keep files small.
- On-device text recognition libraries are out of scope; do not add OCR libraries.
