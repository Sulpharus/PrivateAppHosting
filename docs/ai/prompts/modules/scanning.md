---
id: scanning
title: Kamera und Scannen
summary: Barcodes und QR-Codes per Foto erkennen, Dokumente fotografieren
order: 18
group: daten
---

## Feature: camera and scanning

- MiniNode apps cannot open a live camera stream (`getUserMedia` is blocked by the platform's
  Permissions-Policy). Take photos with a file input instead:
  `<input type="file" accept="image/*" capture="environment">` opens the camera on phones and a
  file picker on desktops.
- Barcodes/QR: decode the photo with `BarcodeDetector` where available (Chrome, Android):
  `await new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128'] }).detect(bitmap)`.
  Where it is missing (iPhone, Firefox) let the user type the code; bundle a decoding library
  only if the app depends on scanning everywhere. Never load one from a CDN.
- Document photos: crop to the page with a simple four-corner editor, scale to at most 2000 px
  and store via the files module.
- Text on photos (receipts, labels): `mn.ai` accepts text only, so there is no image
  recognition on the platform yet. Show the photo next to the form and let the user type the
  few fields that matter; pasted text (e.g. from the phone's own text recognition) can go
  through `mn.ai.json` to fill the form, always shown for confirmation before saving.
- Product lookups by EAN are typed in or found via `mn.ai`; no third-party APIs without the
  admin's approval.
