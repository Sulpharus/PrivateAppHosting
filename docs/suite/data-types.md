# Suite data types (catalog)

This is the catalog of shared record types (ADR 0002). Each type uses some of the **common
columns** and keeps the rest in `data`.

- **Identity keys** decide when a create merges into an existing record instead of
  duplicating it. Matching is always within the same collection.
- **Calendar** shows a record in the universal calendar; **Map** shows it on the map.
- **Stage** is the planned rollout: 1 = first release, 2 = with the first apps that need
  it, 3 = later.

Common columns: `title`, `starts_at`, `ends_at`, `due_at`, `status`,
`amount_cents` + `currency`, `geo` + `place_name`.

## Organisation

| Type | Common columns | `data` | Identity keys | Calendar / Map | Stage |
|---|---|---|---|---|---|
| `task` | title, due_at, status (open/done/cancelled) | notes, priority (1–3), recurrence (RRULE), checklist[], assignee (user id in shared collections), reminder | source key | due date / – | 1 |
| `event` | title, starts_at, ends_at, geo, place_name | all_day, recurrence, reminders[], attendees[] (contact ids), url, color | title + starts_at | yes / if geo | 1 |
| `note` | title | body (Markdown), pinned | source key | – / – | 2 |
| `list_item` | title, status | quantity, unit, list name, added_by | title + list name while open | – / – | 2 (Einkauf) |
| `tag` | title | color | title (case-insensitive) | – / – | 1 |

## People and CRM

| Type | Common columns | `data` | Identity keys | Calendar / Map | Stage |
|---|---|---|---|---|---|
| `contact` | title (display name) | given/family name, emails[], phones[], birthday, addresses[], organization (record id), notes, photo (media id) | any email, any phone | birthday (yearly) / address geo | 1 |
| `organization` | title | website, industry, addresses[], vat_id | website domain, vat_id | – / address geo | 2 |
| `interaction` | title, starts_at | kind (call/meeting/mail/visit), contact ids[], summary, next_step | source key | yes / if geo | 2 |
| `deal` | title, status (stage), amount_cents | probability, expected_close, contact/organization ids | source key | expected close / – | 3 |

## Finance

| Type | Common columns | `data` | Identity keys | Calendar / Map | Stage |
|---|---|---|---|---|---|
| `account` | title | kind (giro/card/cash/depot), iban_last4, bank | iban_last4 + bank | – / – | 2 |
| `transaction` | title, starts_at (booking date), amount_cents (signed) | account id, category, counterparty, purpose, tax_field, tax_cents, transfer | date + amount + counterparty + account | yes (list view) / – | 2 (Haushalt) |
| `budget` | title, amount_cents | category, period (month/year) | category + period | – / – | 2 |
| `contract` | title, starts_at, ends_at, amount_cents | kind (subscription/insurance/rent/membership), interval, notice_period, cancel_by (derived), provider (organization id) | provider + title | payment dates, cancellation deadline / – | 2 (Haushalt, Sportplaner tariffs) |
| `receipt` | title, starts_at, amount_cents | file (file id), vendor, tax_field | file content hash | – / – | 2 |

## Places, trips and media

| Type | Common columns | `data` | Identity keys | Calendar / Map | Stage |
|---|---|---|---|---|---|
| `place` | title, geo, place_name | address, kind (home/work/venue/sight), url | geo within 50 m + title | – / yes | 2 |
| `trip` | title, starts_at, ends_at | places[] (ids), travellers[] (contact/user ids), cover (media id) | title + starts_at | span over days / route of places | 2 |
| `media` | title, starts_at (taken at), geo | file id, kind (photo/video), width, height, duration, camera, album ids[] | file content hash | day of capture ("Fotos von diesem Tag") / yes | 2 |
| `album` | title, starts_at, ends_at | cover (media id), description | title | span / centre of its media | 2 |
| `file` | title | storage path, mime, size, sha256 | sha256 | – / – | 1 (attachments) |

Holiday photo walk: a `trip` links (`part_of`) to `album`s and `place`s. `media` has
`taken_at` + `geo`, so the universal calendar shows photos on their day and the map shows
them where they were taken, without the calendar knowing about photos.

Images inside any type: a record references `media`/`file` ids in `data` or through
`attachment_of` links. Storage is one bucket per collection, and access follows the
collection membership.

## Health and sport

| Type | Common columns | `data` | Identity keys | Calendar / Map | Stage |
|---|---|---|---|---|---|
| `activity` | title, starts_at, ends_at, geo | sport, provider, cost link (transaction/contract), plan (planned/done) | source key | yes / venue | 2 (Sportplaner) |
| `measurement` | starts_at | kind (weight/sleep/steps/…), value, unit | kind + starts_at | chart only / – | 3 |

## Games

| Type | Common columns | `data` | Identity keys | Calendar / Map | Stage |
|---|---|---|---|---|---|
| `game_profile` | title (game name) | level, xp, currency, inventory, settings, last_played | one per user + game | – / – | 2 |
| `achievement` | title, starts_at (earned at) | game, icon, rarity | game + achievement id | earned date / – | 3 |
| `score` | starts_at, amount (score) | game, mode, duration | source key | – / – | 2 (leaderboards via shared collection) |

A leaderboard is a shared collection ("Spieleabend") where every member's `score` records are
visible. The game server is not needed: the rules of the collection and the app's priority
settings keep scores honest enough for friends. Anti-cheat is out of scope.

## Home and everyday life

| Type | Common columns | `data` | Identity keys | Calendar / Map | Stage |
|---|---|---|---|---|---|
| `recipe` | title | ingredients[], steps[], servings, tags, photo (media id) | title | – / – | 3 |
| `meal_plan` | starts_at | recipe id, meal (breakfast/lunch/dinner) | date + meal | yes / – | 3 |
| `item` (inventory) | title, amount_cents (value) | location, bought_at, warranty_until, receipt (id), serial | serial | warranty end / – | 3 |

## Collaboration (coworking)

| Type | Common columns | `data` | Identity keys | Calendar / Map | Stage |
|---|---|---|---|---|---|
| `comment` | – | body, on (record id), mentions[] | – | – / – | 2 |
| `workspace` | title | description, members via collection, pinned records[] | title | – / – | 3 |

Live presence (who is viewing or editing what) is not stored. It goes through
`mn.suite.subscribe` / Supabase Realtime presence on the collection channel.

## Rules for new types

- Add a type only when two apps need it. Data of a single app stays in that app (`mn.kv` or
  its tables).
- Reuse common columns before adding `data` fields. Anything with a time gets `starts_at`,
  `ends_at` or `due_at`; anything with a place gets `geo`.
- Every type defines identity keys, or states "source key only".
- Schema changes bump `type@version` and ship with a forward migration of existing `data`.
