---
id: files
title: Fotos und Dateien
summary: Bilder, Belege und Anhänge in mn.files, mit Vorschaubildern
order: 10
group: daten
---

## Feature: photos and files

- Upload with `mn.files.upload(path, blob, { contentType })`; paths are relative to the app
  and user folder, e.g. `fotos/<itemId>/<uuid>.jpg`. Never trust or reuse the original file
  name as the path.
- Images: decode with `createImageBitmap`, scale on a canvas to at most 1600 px (quality 0.84)
  plus a 640 px thumbnail, and upload both. Show thumbnails in lists and tiles.
- Display: `mn.files.url(path)` returns a signed URL valid for one hour. Fetch it once per
  session, turn it into a `blob:` URL, and cache it in a `Map`; load at most four at a time.
- Keep the file paths in the item (`photos: [path, …]`, `thumbs: { [path]: thumbPath }`); the
  first photo is the cover. Removing an item removes its files.
- Uploads made in an editor that is then cancelled are deleted again.
- PDFs and other documents open in a new tab via their signed URL.
- Files of a team (data mode `team`): `mn.files.upload(path, blob, { team: teamId })`, same for `url`,
  `list` and `remove`; team attachments stay under 5 MB, larger things are linked (Drive or URL).
- Limits: reject files over 20 MB with a clear message; accept `image/*` and
  `application/pdf` unless the app needs more.
