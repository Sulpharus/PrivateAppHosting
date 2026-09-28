---
id: scanning
title: Kamera und Scannen
summary: Barcodes und QR-Codes scannen, Dokumente fotografieren, Texterkennung per KI
order: 18
---

## Feature: camera and scanning

- Barcodes/QR: use `BarcodeDetector` where available (Chrome, Android); otherwise a
  photo input (`<input type="file" accept="image/*" capture="environment">`) and decode the
  still image with the same detector or let the user type the code. Never load a scanning
  library from a CDN; bundle one only if the app depends on scanning on iPhone.
- Live camera: `getUserMedia({ video: { facingMode: 'environment' } })` inside a sheet with a
  viewfinder frame, a torch toggle when the track supports it, and a "Abbrechen" button that
  stops all tracks. Ask for the camera only after the user pressed "Scannen".
- Document photos: crop to the page with a simple four-corner editor, scale to at most 2000 px
  and store via the files module.
- Text from photos (receipts, labels): send the scaled image to `mn.ai.json` with a JSON
  schema for the fields you need, then show the result in the form for the user to check;
  never save extracted data without confirmation.
- Product lookups by EAN go through `mn.ai` or are typed in; no third-party APIs without an
  entry in `mininode.json` and the admin's approval.
