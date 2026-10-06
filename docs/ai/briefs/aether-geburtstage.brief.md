---
name: Aether Notes
type: crm
audience: me
accent: teal
builder: ai-studio
modules: suite, birthdays, dates, errors
ai: false
---
**This is a small change to an existing app, not a new one.** Aether Notes (slug `aether-notes`)
already has contacts ("Personen") with an optional `birthday` field (`YYYY-MM-DD` or `MM-DD`), and
already publishes meetups to the Kalender through `src/suite.ts` (`events.upsert(fields, { sourceKey })`,
with a "wanted" map, a diff and deletes for records that are gone). **Attach the app's current source
folder and edit it; keep everything else exactly as it is.**

## What to add

Publish the birthday of every contact as a **yearly, all-day suite `event`**, so the Kalender shows
birthdays and the Wunschliste can list them (it reads events with `source_key` starting with
`birthday:`).

- One record per contact with a birthday: `sourceKey = 'birthday:<contact id>'`, `title` = the
  contact's name (for example "Lena Meier"), `starts_at` = the birthday in the current year at 00:00
  local time as an ISO string with zone (use the real year when `YYYY-MM-DD` is given: the
  record's date is the original birth date so the age can be computed; for `MM-DD` use year 1900),
  `data: { all_day: true, recurrence: 'FREQ=YEARLY', category: 'birthday', aether_contact: '<id>' }`.
  Follow the field rules of the suite `event` type exactly (docs: only fields of the type are allowed
  in `data`; times are ISO strings with a zone; read the existing meetup code for the style).
- Extend the existing "wanted" map in `suite.ts` with these records, so the same diff, upsert and
  delete logic keeps them in sync: a changed birthday or name updates the record, a removed birthday
  or deleted contact deletes it. A device that is offline with an empty local list must not delete
  anything (keep the existing `listsRead` guard).
- A contact whose birthday is invalid (month 13, 30 February) is skipped without an error; 29
  February is valid.
- The manifest `suite.uses` for `event` must already allow `create` or `write`; keep it and extend
  the `why` text to mention birthdays ("Treffen und Geburtstage im Kalender zeigen").
- A setting in the app, "Geburtstage im Kalender zeigen" (default on), with one sentence explaining
  that the Wunschliste and the Kalender use them; switching it off deletes the birthday records.
- No other behaviour changes. Add a unit test for the new "wanted" entries (valid, `MM-DD`, invalid,
  leap day, removed contact) in the style of the existing tests, and add the new texts to
  `public/i18n/de.json` and `public/i18n/en.json`.
