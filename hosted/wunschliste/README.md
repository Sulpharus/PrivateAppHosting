# Wunschliste

Shared wishlists for family and friends. Every user keeps their own list, sees everyone else's,
and can reserve a wish to give it. Who reserves what is hidden from the list's owner, so no
surprise is spoiled. Static HTML with ES modules, no build; the look is the MiniNode App Kit
with the rose accent. Built on MiniNode (not ported from an export).

## What it does

- **Geburtstage:** a tab that counts down to birthdays (`birthday-view.js`, pure logic in
  `birthdays.js`, tests in `test/birthdays.test.js`). Three sources, merged into one list (one row per
  person, MiniNode first): people on MiniNode who shared their birthday in "Dein Konto"
  (`mn.birthdays()`, ADR 0025), contacts of Aether Notes (yearly all-day suite events with the key
  `birthday:…`, read with `suite.uses` `event` `read`, which the admin approves; year 1904 means "no
  year") and people typed in here (`birthday_people`). Per person: reminder (days before, default
  14, 9:00, `mn.push`, one per person and year), budget, hide, and gift ideas with status
  idea/bought/given (`gift_ideas`, `birthday_prefs`, see `db/004_birthdays.sql`). The settings
  default lives in `mn.kv` (`birthday-settings`).

- **Meine Liste:** add wishes by hand or from a link. An Amazon link is shortened to
  `amazon.<tld>/dp/<ASIN>` (tracking removed), and its readable part becomes the title
  (`amazon.js`; nothing is fetched from Amazon). Optional price, priority (Sehr gern / Gern /
  Nur eine Idee), note and image address. A wish stays until its owner deletes it. "Teilen"
  shares a link that opens the owner's list directly (`?person=<id>`).
- **Sortieren und Kategorien:** above *Meine Liste* and another person's list: sort by priority
  (default), name, price, website or category, up or down, and show one category (or the wishes
  without one). The order is kept in `mn.kv` (`list-view`); the category choice is per visit. Each
  wish has an optional free-text category (editor, with the ones already used as suggestions;
  `db/005_wish_category.sql`, also returned by `wishlist()`). Pure logic in `sort.js`, tests in
  `test/sort.test.js`.
- **Sichtbarkeit:** above *Meine Liste* the owner switches between "Alle mit der App" (default) and
  "Nur Whitelist". The whitelist sheet finds people by name (parts in any order, without accents or
  case, initials, one typo per longer word; `people-search.js`, tests in `test/people-search.test.js`)
  over `mn.people()`, or by an exact e-mail address through `find_person()`, which never returns an
  address. `db/006_list_access.sql`: `list_settings` (visibility) and `list_viewers` (the
  whitelist), both private to the owner; `can_see()` is asked by `people()`, `wishlist()` and
  `reserve()` (callers cannot ask `can_see()` themselves), so a list one may not see looks empty
  and its wishes cannot be reserved. Known gap: uploaded photos stay in the shared folder under
  random names, which every app user may read (the sheet says so; tracked in docs/STATUS.md).
  `find_person` tells someone who already knows an address whether it uses the app, and under
  which name (accepted for an invite-only group).
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
- **PDF export** ("Als PDF" on *Meine Liste*): the list as it is on screen (same order and category)
  on A4 pages: two cards side by side and as many rows as fit (picture or initial, title, price,
  priority tag, category, two lines of note, link to the shop), laid out by `wishlist-pdf.js` on
  `pdf.js`, a small PDF writer (standard fonts, JPEG pictures, links, check boxes; no library).
  Sorted by category, the cards come in sections with a heading per category (repeated with
  "Fortsetzung" after a page break; the cards then leave the category out). Every card has a form
  check box, only the small circle in its top right corner: ticking it in a PDF viewer (most
  desktop viewers: Chrome, Firefox, Acrobat; phone viewers often cannot) fills the circle with a
  check; saved and passed on, the file shows people without an account what is already taken. The
  box covers only the circle, because many viewers give form fields priority over links: the shop
  links stay clickable. Uploaded photos come
  from storage; image links through `mn.image` (`GET /image` on api.<domain>), because the page's CSP
  and most shops' missing CORS headers keep the browser from reading them. Every picture is shrunk to
  480 px and embedded; one that cannot be read gets the initial. `test/pdf.test.js` checks the file
  structure and the two columns, `e2e/wunschliste.spec.ts` the download.

## Languages

German and English (`i18n/de.json`, `i18n/en.json`, declared under `i18n` in `mininode.json`). The person's choice in Konto → Sprache applies; an unknown key falls back to German. New texts need a key in both files; `pnpm mininode doctor hosted/wunschliste` checks them (ADR 0017).
