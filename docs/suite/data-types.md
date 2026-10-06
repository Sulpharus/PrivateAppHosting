# Suite data types (catalog)

This is the catalog of shared record types (ADR 0002). It is deliberately broad, so that office
apps, CRM, self-organisation, archives, games and everyday tools can use one shared vocabulary
from day one.

## Implemented so far (lean phase, migration `suite_core`)

The registry (`platform.record_types`) holds the stage 1 time types plus what the first apps
need: `event`, `task`, `reminder`, `project`, `activity`, `contract` and `transaction`, each with
its JSON schema, identity keys and calendar projection (`span` or `due`). Collection families:
`kalender`, `aufgaben`, `sport`, `finanzen`. Differences from the catalog below:

- Places are `lat`, `lon` and `place_name` columns (no `geo` type yet).
- Tags, comments, attachments and `record_links` are not built yet.
- A series (`data.recurrence`) is never the target of an identity merge, so a single moved
  occurrence stays its own record.

Further types come with the app that needs them: add them to the registry in a migration.

## How to read it

**Common columns** are the indexed columns every type can use: `title`, `starts_at`, `ends_at`,
`due_at`, `status`, `amount_cents` + `currency`, `geo` + `place_name`. Everything else is in `data`.

**Id** is the identity key. A create that matches an existing record in the same collection is
merged into it instead of duplicated. `src` means "source key only", i.e. the writing app's own
id for the item.

**View** says where the record shows up:
- **K**: universal calendar (from `starts_at`, `ends_at` or `due_at`)
- **M**: map (from `geo`)
- **T**: timeline or feed

**St** is the rollout stage:
- 1: first release (suite core)
- 2: with the first apps that need it
- 3: when an app asks for it

**Refs** are record ids of other types, stored in `data` or as `record_links`. Every record can
also carry tags (`tag`), comments (`comment`), attachments (`file`/`media`) and links to any
other record. None of that is repeated in the tables below.

## Shared value shapes (used inside `data`)

| Shape | Fields |
|---|---|
| `person_ref` | user id or contact id, plus role (e.g. owner, assignee, attendee, player) |
| `money` | `amount_cents` (signed integer), `currency` (ISO 4217) |
| `address` | street, postal_code, city, region, country (ISO 3166), `geo` |
| `recurrence` | RFC 5545 RRULE, plus exceptions[] and a time zone |
| `reminder` | offset (ISO 8601 duration, e.g. `-PT15M`) or an absolute time, plus a channel |
| `duration` | ISO 8601 duration |
| `rating` | value 0–10 in half steps (UI shows 5 stars), plus rated_at |
| `progress` | current, total, unit (pages, minutes, episodes, %) |
| `period` | from, until, open-ended flag |
| `locale_text` | text + language (for multilingual catalog data) |

## 1. Self-organisation

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `task` | title, due_at, status (open/in_progress/waiting/done/cancelled) | notes, priority 1–4, recurrence, checklist[], assignees[], project, estimate, reminders[] | src | K | 1 |
| `project` | title, starts_at, ends_at, status | description, goal, owner, color, archived | title | K | 1 |
| `milestone` | title, due_at, status | project | project + title | K | 2 |
| `list` | title | kind (shopping/packing/todo/other), sort order | title | – | 1 |
| `list_item` | title, status | list, quantity, unit, category, added_by | list + title while open | – | 1 |
| `event` | title, starts_at, ends_at, geo, place_name | all_day, recurrence, reminders[], attendees[] (+ RSVP), url, color, **image**, busy/free, visibility | title + starts_at | K M | 1 |
| `reminder` | title, due_at, status | on (any record), repeat | src | K | 1 |
| `habit` | title, status (active/paused) | schedule (days, times per period), target, unit, streak | title | – | 2 |
| `habit_log` | starts_at, amount | habit, value, note | habit + day | K | 2 |
| `goal` | title, due_at, status | why, measure, progress, parent goal | title | K | 2 |
| `key_result` | title, due_at | goal, start, target, current, unit | goal + title | – | 3 |
| `time_entry` | starts_at, ends_at | project, task, billable, rate (money), note | src | K T | 2 |
| `focus_session` | starts_at, ends_at | task, kind (pomodoro/deep work), interruptions | src | K | 3 |
| `journal_entry` | starts_at | body (Markdown), mood (1–5), gratitude[], weather | date | K T | 2 |
| `note` | title | body (Markdown), pinned, notebook | src | T | 1 |
| `notebook` | title | color, parent | title | – | 2 |
| `bookmark` | title | url, description, favicon, read_later, archived_copy (file) | url | – | 2 |
| `idea` | title, status (new/planned/done/dropped) | body, votes, related[] | src | T | 3 |
| `decision` | title, starts_at | context, options[], chosen, reasons, review_at | src | K | 3 |
| `routine` | title | steps[] (task templates), schedule | title | – | 3 |
| `countdown` | title, due_at | style | title + due_at | K | 3 |

## 2. Office and collaboration

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `document` | title | body (rich text JSON or Markdown), format, template, locked_by | src | T | 2 |
| `document_version` | starts_at | document, body snapshot, author, summary | document + version | T | 2 |
| `file` | title | storage path, mime, size, sha256, pages, preview (media) | sha256 | – | 1 |
| `folder` | title | parent, color | parent + title | – | 2 |
| `spreadsheet` | title | sheets[] (name, cells as sparse map or file), formulas engine version | src | – | 3 |
| `presentation` | title | slides[] or file, theme | src | – | 3 |
| `form` | title, status (draft/open/closed) | fields[] (id, type, label, required, options), closes_at | src | K | 3 |
| `form_response` | starts_at | form, answers{}, respondent | form + respondent (optional) | T | 3 |
| `template` | title | for type, body/defaults | for type + title | – | 2 |
| `meeting` | title, starts_at, ends_at, geo | agenda[], attendees[], video_url, event | event | K M | 2 |
| `meeting_minutes` | title, starts_at | meeting, notes, decisions[], action items → `task` links | meeting | T | 2 |
| `email` | title (subject), starts_at | from, to[], cc[], body_text, message_id, thread, attachments[] | message_id | T | 3 |
| `email_thread` | title | participants[], last_at | thread id | T | 3 |
| `channel` | title | kind (topic/direct/match), members via collection, topic | title | – | 2 |
| `message` | starts_at | channel, body, reply_to, edited_at, reactions{} | src | T | 2 |
| `announcement` | title, starts_at, ends_at | body, audience, pinned | src | K T | 3 |
| `poll` | title, due_at, status | options[], multi, anonymous | src | K | 2 |
| `poll_vote` | starts_at | poll, choices[], voter | poll + voter | – | 2 |
| `whiteboard` | title | elements JSON or file, locked | src | – | 3 |
| `resource` | title, geo | kind (room/car/equipment/desk), capacity, rules | title | M | 3 |
| `booking` | starts_at, ends_at, status | resource, booked_by, purpose | resource + starts_at | K | 3 |
| `comment` | starts_at | on (any record), body, mentions[], resolved | src | T | 2 |
| `reaction` | – | on, emoji code, by | on + by + code | – | 3 |
| `workspace` | title | description, pinned records[], members via collection | title | – | 3 |
| `share_link` | due_at | record, permission (view/comment), token hash | token hash | – | 3 |

## 3. CRM and sales

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `contact` | title (display name) | given/family name, nickname, emails[], phones[], addresses[], birthday, organization, job title, website, socials[], notes, photo, source | any email, any phone | K (birthday) M | 1 |
| `organization` | title | legal name, website, industry, size, addresses[], vat_id, registry_no | website domain, vat_id | M | 2 |
| `relationship` | – | from contact, to contact, kind (partner/child/colleague/manager/friend) | from + to + kind | – | 2 |
| `interaction` | title, starts_at, geo | kind (call/meeting/mail/visit/message), contacts[], summary, next_step, sentiment | src | K M T | 2 |
| `lead` | title, status (new/qualified/lost/converted) | contact, organization, source, score | contact | T | 3 |
| `deal` | title, status (pipeline stage), amount_cents | probability, expected_close, contacts[], organization, pipeline, lost_reason | src | K | 3 |
| `pipeline` | title | stages[] (id, name, probability) | title | – | 3 |
| `product` | title, amount_cents (list price) | sku, unit, tax_rate, description, active | sku | – | 3 |
| `quote` | title, starts_at, due_at, amount_cents, status | deal, lines[] (product, qty, price, discount), valid_until | number | K | 3 |
| `order` | title, starts_at, amount_cents, status | customer, lines[], delivery | number | K | 3 |
| `invoice` | title, starts_at, due_at, amount_cents, status (draft/sent/paid/overdue) | number, customer or vendor, lines[], tax, payment terms, file | number + party | K | 2 |
| `payment` | starts_at, amount_cents | invoice, method, transaction | invoice + date + amount | K | 3 |
| `ticket` | title, status, due_at | requester, assignee, priority, channel, sla | src | K T | 3 |
| `campaign` | title, starts_at, ends_at, status | channel, audience, budget, results | title | K | 3 |
| `consent` | starts_at | contact, purpose, given/withdrawn, proof | contact + purpose | T | 3 |

## 4. Finance

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `account` | title, amount_cents (balance) | kind (giro/savings/card/cash/depot/loan/wallet), bank, iban_last4, currency, closed | bank + iban_last4 | – | 2 |
| `transaction` | title, starts_at (booking date), amount_cents (signed) | account, category, counterparty, purpose, transfer_to, tax_field, tax_cents, split[] | date + amount + counterparty + account | K T | 2 |
| `category` | title | kind (expense/income/transfer), parent, budget, tax_field | title | – | 2 |
| `budget` | title, amount_cents | category, period (month/year), rollover | category + period | – | 2 |
| `contract` | title, starts_at, ends_at, amount_cents | kind (subscription/insurance/rent/membership/utility/loan), interval, notice_period, cancel_by (derived), provider, customer_no, documents[] | provider + customer_no | K | 2 |
| `receipt` | title, starts_at, amount_cents | file, vendor, items[], tax_field, transaction | sha256 of file | K | 2 |
| `holding` | title, amount_cents (value) | account, isin/symbol, quantity, cost basis | account + isin | – | 3 |
| `price_quote` | starts_at, amount_cents | symbol, source | symbol + day | – | 3 |
| `savings_goal` | title, due_at, amount_cents (target) | saved, account, image | title | K | 2 |
| `loan` | title, starts_at, ends_at, amount_cents | lender/borrower, rate, schedule[] | src | K | 3 |
| `shared_expense` | title, starts_at, amount_cents | paid_by, shares[] (person, amount), category, group | src | K | 2 |
| `settlement` | starts_at, amount_cents | from, to, group, method | src | K | 2 |
| `tax_item` | title, starts_at, amount_cents | year, form, field, deductible, source record | source record + field | – | 2 |

`shared_expense` and `settlement` in a shared collection form a flat-share or trip money pot.

## 5. Places, travel and media

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `place` | title, geo, place_name | address, kind (home/work/venue/sight/restaurant/shop), opening hours, url, visited[] | geo within 50 m + title | M | 2 |
| `trip` | title, starts_at, ends_at | destinations[] (places), travellers[], budget, cover (media), status | title + starts_at | K M | 2 |
| `trip_leg` | starts_at, ends_at, geo | trip, mode (flight/train/car/bus/ferry/walk), from/to places, carrier, number, seat, booking ref | booking ref or carrier + number + date | K M | 2 |
| `accommodation` | title, starts_at, ends_at, geo, amount_cents | trip, booking ref, check-in/out times, contact | booking ref | K M | 2 |
| `itinerary_item` | title, starts_at, ends_at, geo | trip, day, notes, ticket (file) | src | K M | 2 |
| `track` | title, starts_at, ends_at, geo (start) | points file (GPX/GeoJSON), distance, elevation, activity | sha256 of file | K M | 2 |
| `check_in` | starts_at, geo, place_name | place, note, with[] | place + minute | K M T | 3 |
| `media` | title, starts_at (captured), geo | file, kind (photo/video/audio/scan), width/height/duration, camera, albums[], people[], faces (optional), caption | file sha256 | K M | 2 |
| `album` | title, starts_at, ends_at | cover, description, trip, sort | title | K M | 2 |
| `story` | title, starts_at | ordered media[] + text blocks (e.g. a holiday photo walk) | src | K T | 3 |

`image` (on `event` and `activity`): a tiny inline picture (a `data:image/jpeg|png|webp;base64,…` string of
at most 16,000 characters, about 64 px wide, 2–3 KB) that the Kalender shows in its list, its day view and as a pin on the
map. The app that owns the big picture makes the small one; no app needs access to another app's files.
**Cost:** a record per occurrence carries its own copy (a daily session over 97 days is about 250 KB of pictures that
the calendar and the owning app load), so keep it small and send it only for what people look at.

A holiday photo walk: `trip` → `album`/`story` → `media`. Each `media` has `starts_at` + `geo`,
so the universal calendar shows photos on their day and the map shows them where they were
taken, without the calendar or map knowing about photos. Images inside any type are `media`
records linked with `attachment_of`, and access follows the collection.

## 6. Archive and collections (books, films, music, games, …)

Two layers keep shared catalogs and personal progress apart:

- **Works** describe *what* something is. A family library can share them.
- **Logs** describe *what I did with it*. They are always per person, even inside a shared
  collection.

**Works:**

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `book` | title | authors[], isbn13, publisher, year, language, pages, series + index, cover, genres[], edition | isbn13, else title + first author | – | 2 |
| `film` | title, starts_at (release) | directors[], cast[], year, runtime, genres[], poster, external ids (imdb/tmdb) | external id, else title + year | – | 2 |
| `series` | title | creators[], seasons, status (running/ended), poster, external ids | external id | – | 2 |
| `episode` | title, starts_at (air date) | series, season, number, runtime | series + season + number | K | 2 |
| `music_album` | title, starts_at | artists[], tracks[], label, cover, external ids (musicbrainz) | external id, else artist + title | – | 3 |
| `music_track` | title | artists[], album, duration, isrc | isrc | – | 3 |
| `podcast` | title | publisher, feed url, cover | feed url | – | 3 |
| `podcast_episode` | title, starts_at | podcast, duration, url | guid | K | 3 |
| `game_title` | title, starts_at | platforms[], developers[], genres[], players (min/max), cover, external ids, kind (video/board/card) | external id, else title + year | – | 2 |
| `article` | title, starts_at | url, site, author, excerpt, archived copy | url | T | 2 |
| `collectible` | title, amount_cents (value) | kind (coin/stamp/lego/vinyl/…), set/series, condition, acquired, storage location | kind + catalogue no | – | 3 |
| `wine` | title | producer, vintage, region, grape, bottles, cellar location, drink_from/until | producer + title + vintage | – | 3 |

**Personal layer:**

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `media_log` | starts_at, ends_at, status (wishlist/planned/in_progress/done/abandoned/paused) | work (any work above), rating, progress, times (re-reads/re-watches), format (print/ebook/audio/stream/cinema), where, with[] | work + person + ends_at | K T | 2 |
| `review` | starts_at | work, rating, body, spoilers, public in collection | work + person | T | 2 |
| `highlight` | starts_at | work, text, location (page/timestamp), note | work + location | T | 3 |
| `loan_out` | starts_at, due_at, status | item (work or collectible), to (contact), returned_at | item + to + starts_at | K | 2 |
| `wishlist_item` | title, amount_cents | item or url, for (person), priority, reserved_by | item + for | – | 2 |

## 7. Health and sport

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `activity` | title, starts_at, ends_at, geo | sport, provider, plan status (planned/done), **image**, cost (transaction/contract), track | src | K M | 2 |
| `workout` | title, starts_at, ends_at | exercises[] (exercise, sets[] reps/weight/duration), rpe, notes | src | K | 2 |
| `exercise` | title | muscle groups[], equipment, instructions, media | title | – | 3 |
| `measurement` | starts_at | kind (weight/body fat/blood pressure/sleep/steps/heart rate/…), value, unit, source device | kind + starts_at | K (chart) | 2 |
| `medication` | title, status | dose, unit, schedule (recurrence), stock, prescriber | title | – | 3 |
| `medication_dose` | starts_at, status (taken/skipped) | medication, amount | medication + scheduled time | K | 3 |
| `symptom_log` | starts_at | symptoms[], severity, notes | src | K | 3 |
| `meal` | title, starts_at | foods[] (name, amount, kcal, macros), photo, recipe | src | K | 3 |
| `mood_log` | starts_at | mood 1–5, energy, tags | day + time | K | 3 |

## 8. Home, family and everyday life

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `inventory_item` | title, amount_cents (value) | category, room/location, bought_at, receipt, warranty_until, serial, manual (file), lent_to | serial, else title + bought_at | K (warranty) | 2 |
| `maintenance` | title, due_at, status | for (item/vehicle/home), recurrence, cost, provider | for + title | K | 2 |
| `meter_reading` | starts_at | meter (electricity/gas/water/heat), value, unit, photo | meter + starts_at | K | 2 |
| `vehicle` | title | plate, make, model, year, vin, insurance (contract), inspection_due | vin, plate | K | 3 |
| `vehicle_log` | starts_at, amount_cents | vehicle, kind (fuel/service/repair/toll/parking), odometer, litres/kWh | src | K | 3 |
| `plant` | title | species, location, water every, fertilize every, last_care, photo | title + location | K (care) | 3 |
| `pet` | title | species, breed, birthday, chip no, vet (contact), feeding plan, vaccinations[] | chip no | K | 3 |
| `recipe` | title | ingredients[] (name, amount, unit), steps[], servings, time, tags, photo, source url | source url, else title | – | 2 |
| `meal_plan` | starts_at | recipe, meal (breakfast/lunch/dinner/snack), servings, cook | date + meal | K | 2 |
| `chore` | title, due_at, status | rotation[] (persons), recurrence, points | title | K | 2 |
| `gift_idea` | title, amount_cents | for (contact), occasion, url, status (idea/bought/given) | for + title | – | 2 |
| `celebration` | title, starts_at, geo | guests[] + RSVP, menu, budget, tasks | title + starts_at | K M | 3 |
| `emergency_info` | title | kind (doctor/insurance/allergy/blood type/…), value, visible to | kind + title | – | 3 |

## 9. Learning and knowledge

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `course` | title, starts_at, ends_at, status | provider, url, lessons[], certificate | provider + title | K | 3 |
| `lesson` | title, starts_at, status | course, notes, materials[] | course + title | K | 3 |
| `flashcard_deck` | title | language pair / subject, settings | title | – | 2 |
| `flashcard` | title (front) | deck, back, hints, media | deck + front | – | 2 |
| `flashcard_review` | starts_at | card, grade, interval, ease, due_next | card + starts_at | K | 2 |
| `skill` | title | level, evidence[] | title | – | 3 |
| `certificate` | title, starts_at, ends_at | issuer, id, file | issuer + id | K | 3 |
| `glossary_term` | title | definition, language, related[] | title + language | – | 3 |

## 10. Games (including multiplayer)

Game state that must survive a reload is stored in records. Live state (moves in flight, who
is online) goes over the collection's realtime channel.

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `game_title` | see §6 | | | | 2 |
| `game_profile` | title (game) | level, xp, currency{}, stats{}, settings, avatar, last_played | person + game | – | 2 |
| `game_item` | title | game, kind, rarity, quantity, attributes{} | person + game + item id | – | 3 |
| `achievement` | title, starts_at (earned) | game, icon, rarity, progress | person + game + achievement id | K T | 2 |
| `score` | starts_at | game, mode, points, level, duration, replay (file) | src | T | 2 |
| `match` | title, starts_at, ends_at, status (lobby/running/finished/abandoned) | game, mode, players[] (person, seat, team, result), state (serialised), turn (person), version, winner, rules | src | K T | 2 |
| `match_move` | starts_at | match, player, move (JSON), turn no, state hash | match + turn no | – | 2 |
| `lobby_invite` | starts_at, due_at, status | match, from, to, message | match + to | – | 2 |
| `tournament` | title, starts_at, ends_at, status | game, bracket, participants[], rules, prizes | title + starts_at | K | 3 |
| `leaderboard` | title | game, mode, period (all-time/season/week), sort (high/low) | game + mode + period | – | 2 |
| `season` | title, starts_at, ends_at | game, rewards | game + title | K | 3 |

How multiplayer fits the platform:
- A match is a record in a shared collection. The collection is the group of players, e.g.
  "Spieleabend" or one collection per match.
- Turn-based games write `match_move` records. `version` on `match` gives optimistic
  locking: a move is accepted only for the current version, so two players cannot both
  move at once.
- Real-time games use Supabase Realtime broadcast and presence on the collection channel,
  and write `match` (state snapshots) and `score` at checkpoints.
- Leaderboards are queries over `score` in the collection.
- Cheating is out of scope for friends and family. If a game ever needs server authority, a
  referee endpoint in the API Worker validates moves with the service role, and the game gets
  `create` on `match_move` only through it.

## 11. Platform and meta types

| Type | Common columns | `data` | Id | View | St |
|---|---|---|---|---|---|
| `tag` | title | color, parent (hierarchical tags) | title (case-insensitive) | – | 1 |
| `saved_view` | title | for type, filters, sort, columns, layout (list/board/calendar/map/gallery) | for type + title | – | 2 |
| `import_batch` | starts_at | source (e.g. bank CSV, Goodreads, Letterboxd, vCard, iCal, GPX), file, counts, errors[] | sha256 of file | T | 2 |
| `automation` | title, status | trigger (record created/changed, time), conditions, actions (create task, notify, link) | title | – | 3 |
| `external_account` | title | provider, scopes, last sync (tokens never stored here; secrets stay in Workers) | provider + account id | – | 3 |

Import formats worth supporting early, each mapped to the types above:
- **iCal/ICS:** `event`, `task`
- **vCard:** `contact`
- **bank CSV and CAMT:** `transaction`
- **GPX:** `track`
- **EXIF:** `media`
- **Goodreads and Letterboxd CSV:** `book`/`film` + `media_log`
- **OPML:** `podcast`

## Cross-app examples

- **Notizen → Kalender:** a line `☐ Steuer bis 31.7.` becomes a `task` with `due_at`. It
  links back with `derived_from` and shows in the calendar.
- **Sportplaner → Haushalt:** a tariff becomes a `contract`, its payments become
  `transaction`s, and visits become `activity` records linked to the contract, which gives
  the cost per visit.
- **Haushalt → Steuer:** a `receipt` + `transaction` with a `tax_field` feeds a `tax_item`.
- **Reise-App → Fotos → Kalender/Karte:** a `trip` with `trip_leg`s and `accommodation`s;
  `media` from the trip days lands in its `album`.
- **Lese-App ↔ Familienbibliothek:** `book` in the shared "Bücherregal" collection, and each
  person's `media_log` with rating; `loan_out` when a book is lent to a friend.
- **CRM ↔ Kalender ↔ Rechnungen:** a `meeting` with a `contact` produces `meeting_minutes`
  → `task`s; a `deal` produces a `quote` → `invoice` → `payment` → `transaction`.
- **Spiele:** a quiz app and a board game share `game_profile` (level, xp) and
  `leaderboard`s in the family collection.

## Rules for new types

- A type belongs in the catalog when two apps need it, or when it is an obvious shared concept
  (people, time, place, money, files). Data of a single app stays in that app (`mn.kv` or its
  tables).
- Reuse common columns before adding `data` fields. Anything with a time gets `starts_at`,
  `ends_at` or `due_at`; anything with a place gets `geo`; any amount of money uses cents
  + currency.
- Every type defines identity keys, or states "src" (source key only).
- Personal progress is a separate log type (like `media_log`), so shared catalogs never mix
  with one person's state.
- Schema changes bump `type@version` and ship with a forward migration of existing `data`.
- Stage 1 types are built in phase 4. Later stages are added to the registry together with
  the first app that uses them, so every type in the registry has a real user.
