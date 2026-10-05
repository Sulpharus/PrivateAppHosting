# Wunschliste

Shared wishlists for family and friends. Every user keeps their own list, sees everyone else's,
and can reserve a wish to give it. Who reserves what is hidden from the list's owner, so no
surprise is spoiled. Static HTML with ES modules, no build; the look is the MiniNode App Kit
with the rose accent. Built on MiniNode (not ported from an export).

## What it does

- **Meine Liste:** add wishes by hand or from a link. An Amazon link is shortened to
  `amazon.<tld>/dp/<ASIN>` (tracking removed), and its readable part becomes the title
  (`amazon.js`; nothing is fetched from Amazon). Optional price, priority (Sehr gern / Gern /
  Nur eine Idee), note and image address. A wish stays until its owner deletes it. "Teilen"
  shares a link that opens the owner's list directly (`?person=<id>`).
- **Andere:** everyone with a wish, then their list. "Ich schenke das" reserves a wish; others
  see it as *Geschenkt* and cannot pick it; 30 days after the reservation it disappears for
  them. The owner never sees any of this.
- **Einkaufsliste:** the caller's reservations, grouped by recipient, until they are ticked off
  as *Gekauft*. A reservation keeps a copy of the wish, so it stays even when the recipient
  deletes the wish (marked "Nicht mehr auf der Liste").

## Data

`db/001_init.sql`, schema `app_wunschliste`:

| Object | Access |
|---|---|
| `wishes` | `private` (secure_table): only the owner reads and writes their wishes |
| `reservations` | `private` for the giver; insert only through `reserve()`, update only `purchased_at` |
| `people()` | users with at least one wish and their display names |
| `wishlist(owner)` | another user's wishes with `status` `frei` / `von-dir` / `geschenkt`; no rows for the owner's own list |
| `reserve(wish)` | creates the reservation with a copy of the wish; refuses own wishes and wishes already taken |

The owner can only edit a wish's content, not its `id` (a foreign-key error would reveal a
reservation). The shopping list shows initials instead of the wish's picture, because loading an
image address the owner controls could tell them that, and from where, a wish was reserved. One
such channel remains: "Ansehen" on the shopping list opens the copied shop link, so an owner who
points that link at their own server could notice the click. Keep links to real shops.

The three functions are `security definer` and check `platform.app_access('wunschliste')`, so
they only answer the signed-in user from this app's page. `test/db.integration.test.js` checks
the privacy rules against the local stack; `e2e/wunschliste.spec.ts` runs the whole flow with
three users.

`access.default` is true: every user gets the app (existing users on the first deploy).

## Photos and PDF

- **Photo upload** (editor → "Bild und Notiz" → Foto): chosen from the gallery or camera, shrunk in the
  browser to a JPEG of at most 1280 px and stored in `mn.files` in the *shared* scope as
  `wishes/<uuid>.jpg` (so the people who see the list can load it; everyone with the app can read the
  folder, which is the same audience as the lists themselves). `db/002_wish_images.sql` adds
  `wishes.image_path` and returns it from `wishlist()`. A photo wins over an image link; replacing or
  removing it, or deleting the wish, deletes the file. Signed addresses expire after an hour: they are
  made on demand and kept for 50 minutes (`pictureUrl`). The shopping list still shows initials.
- **PDF export** ("Als PDF" on *Meine Liste*): `wishlist-pdf.js` lays out A4 pages (title, one card per
  wish with picture or initial, price, priority tag, note, link to the shop) on `pdf.js`, a small PDF
  writer (standard fonts, JPEG pictures, links; no library). Pictures are fetched, shrunk to 700 px and
  embedded; an image link whose site does not allow cross-origin reads is left out (initial instead).
  `test/pdf.test.js` checks the file structure, `e2e/wunschliste.spec.ts` the download.

## Languages

German and English (`i18n/de.json`, `i18n/en.json`, declared under `i18n` in `mininode.json`). The person's choice in Konto → Sprache applies; an unknown key falls back to German. New texts need a key in both files; `pnpm mininode doctor hosted/wunschliste` checks them (ADR 0017).
