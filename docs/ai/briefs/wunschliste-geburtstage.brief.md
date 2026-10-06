---
name: Wunschliste
type: familie
audience: me
accent: rose
builder: ai-studio
modules: birthdays, tables, offline, suite, push, notifications, dates, search, undo, errors
ai: false
---
**This is a change to an existing app, not a new one.** The Wunschliste (slug `wunschliste`) already
exists with the tabs "Meine Liste", "Bei anderen" and "Einkaufsliste", its own tables
(`wishes`, `reservations`, functions `people()`, `wishlist()`, `reserve()` in `db/`), language packages
and PDF export. Keep all of it working and unchanged in look and behaviour; **attach the app's current
source folder to this prompt and edit it**, do not rewrite it from scratch. Keep the slug, the manifest
fields and every existing file; add new files and new numbered SQL files only (`db/004_…sql`).

## What to add: a "Geburtstage" tab

A fourth tab "Geburtstage" (a calm list with a countdown) so you know when to give someone a present.
It shows the **upcoming birthdays**, nearest first, from three sources, merged into one list:

1. **People on MiniNode** who entered their birthday in "Dein Konto" and allowed sharing:
   `await mn.birthdays()` returns `{ id, name, month, day, year | null }` for the other people who can
   use the Wunschliste (module "Geburtstage"). If a person left out the year, show no age.
2. **Contacts that are not on MiniNode** (from Aether Notes): Aether Notes publishes the birthday of
   each contact as a yearly all-day suite `event` with `source_app: 'aether-notes'` and
   `source_key` starting with `birthday:` (a separate task adds that on the Aether side). Read them with
   `mn.suite.type('event').list({ limit: 5000 })`, keep those records, and take the title (the person's
   name) and the date from `starts_at` (year 1900 or an unknown year means "no year"). Declare
   `"suite": { "uses": [{ "type": "event", "access": "read", "why": "Geburtstage deiner Kontakte aus
   Aether Notes anzeigen" }] }`. Until the admin approves it, the call is refused: then show the other
   sources and a quiet hint "Kontakt-Geburtstage brauchen die Freigabe des Admins", not an error.
3. **People typed in the Wunschliste itself** (name, day, month, optional year): for anyone who is in
   neither source. A small "+ Person" form; edit and delete.

**Merging:** one row per person. If a person appears in two sources with the same normalised name
(case, accents and spaces ignored) and the same day and month, show them once and prefer the MiniNode
entry. A person may be hidden ("Ausblenden", reversible under "Ausgeblendete anzeigen"); store hidden
keys and manual links ("das ist dieselbe Person wie …") in the app's own table, never change the other
sources.

**Each row:** name, the date ("14. März", with the age they turn when the year is known), a countdown
chip ("heute", "morgen", "in 12 Tagen"), a source chip (MiniNode / Aether / selbst), and actions:
- "Wunschliste ansehen" for people on MiniNode: opens the existing "Bei anderen" view of that person
  (use the existing `?person=` handling and `people()`/`wishlist()` functions; do not build a second
  one) so you can pick a present;
- "Geschenkidee" opens the gift notes of that person.
Group by "Diese Woche", "Dieser Monat", "Später im Jahr"; a header strip "Als Nächstes: Lena in 4 Tagen".
A filter chip row: Alle, MiniNode, Kontakte, Selbst eingetragen.

## Gift notes (own table)

For every person (any source) the user can keep **Geschenkideen**: title, note, link, approximate price
(integer cents), status ("Idee", "Gekauft", "Verschenkt"), budget per person per year, and which
year it was gifted (so you do not give the same thing twice). For people on MiniNode, their reserved or
visible wishes stay in the existing views; here only your own notes. Show "Letztes Jahr geschenkt:
…" on the person's sheet.

## Reminders

Per person (default for all in settings): remind **N days before** (default 14, options 0, 3, 7, 14, 30)
at 09:00 local time with `mn.push` ("Lena hat in 14 Tagen Geburtstag. Noch keine Geschenkidee."), with a
stable key `birthday:<source>:<id>:<year>` so it is scheduled once per person and year; reschedule when
the setting changes, cancel when the person is hidden. Also a bell notification on the day itself.
Use the module "Erinnerungen". Do not send reminders for your own birthday (the source excludes it).

## Data (module "Eigene Tabellen", mode stays `private`)

New numbered SQL file `db/004_birthdays.sql`, tables in `app_wunschliste` with `platform.secure_table(
'wunschliste', '<table>', 'private')`, uuid ids made by the app, real column types and checks:
`birthday_people` (name, month, day, year nullable with a valid-date check, note), `birthday_hidden`
(source, source_key), `birthday_links` (a source key linked to another), `gift_ideas` (person_key,
title, note, url, price_cents, status, gifted_year, created_at), `birthday_settings` (one row:
default_days_before, budget_cents). `person_key` is `mn:<user id>`, `aether:<source_key>` or
`own:<id>`. Use `mn.table` (offline). All texts in `i18n/de.json` and `i18n/en.json`, the same keys in
both; dates and numbers follow `mnI18n.locale`.

## Quality bar

Mobile first, 44 px targets, a visible focus style, light and dark, no emoji, no gradients (the existing
design). Edge cases: 29 February in non-leap years (show 28 February), a birthday today (show "heute"
and put it on top), a birthday that passed this year (next year), people without a year, two people with
the same name on the same day, offline use (everything except `mn.birthdays()` and the suite read comes
from the local copy; show the last known list), an empty state per source.
