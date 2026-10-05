# Kalender

One calendar for everything on MiniNode: your own and shared calendars plus every record with a
date from other apps (sport sessions, due contracts, tasks), mixed and coloured as you like.

## Data

Nothing app-specific: the calendar works only on suite records (ADR 0002, `mn.suite`).

- **Own events** are records of type `event` in collections of the family `kalender`: the
  personal "Meine Termine" plus any shared calendars (members as viewer or editor).
- **Other apps** show up read-only, grouped as "App · Type" (e.g. "Sportplaner · Sporteinheit").
  The admin decides in Verwaltung → Gemeinsame Daten which types the calendar may read
  (`suite.uses` in `mininode.json`). Bookings (`transaction`) start hidden.
- **Preferences** (visible sources, colours, default calendar) live in `mn.kv` under `prefs`.

## Map (`map.js`, `route.js`)

Events with a place as numbered pins (Leaflet from `/vendor`), for a day, a week or seven weeks. Places without
coordinates are looked up with Nominatim (one request per second, cached in `mn.kv` under `geo`); the editor's
"Ort prüfen" stores the point on the record (`lat`, `lon`). Layer, way of travelling, buffer and start point live in
`prefs.map`. Routes come from `routing.openstreetmap.de` (car, bike, foot) through the platform proxy (`apis` in
`mininode.json`, both without a key); `route.js` holds the pure parts (legs of a day, judging the time between two
appointments) and is covered by `test/route.test.js`. Shortcut: O.

## Features

- Month, week, day, list (six weeks) and **map** views; mini month and source list on wide screens.
- Events with all-day flag, place, description, link, colour and status (tentative, cancelled).
- Repeating events (daily to yearly, interval, weekdays, count or end date). Changes and deletes
  ask for "Nur dieser Termin", "Dieser und alle folgenden" or "Alle Termine der Serie".
- Drag to move or resize (mouse and pen) in week and day views, drag between days in the month.
- Reminders via `mn.push`: the next occurrence is scheduled on save and on every start.
- Search by title, ICS import (4 at a time, source key `ics:<UID>` so re-imports update) and export.
- Google Kalender (button in the header, ADR 0010): chosen calendars and app sources appear in
  a Google calendar "MiniNode"; your Google calendars appear here. Changes go both ways; the API
  syncs every five minutes, when the app opens and after each change.
- Shortcuts: T today, J/N next, K/P back, M/W/D/L views, C new event, / search.

## Files

| File | Content |
|---|---|
| `app.js` | UI: views, detail, editor, calendars, search, import and export |
| `items.js` | records → sources and calendar items (occurrences in a range) |
| `edit.js` | series edits (shift, end before, exclude), reminder times, form values |
| `rrule.js` | RRULE subset with EXDATE, German descriptions |
| `ics.js` | iCalendar import and export |
| `layout.js` | lanes for overlapping events, week and month grids |

## Develop

```bash
pnpm --filter @mininode-hosted/kalender test   # logic (Europe/Berlin)
pnpm mininode dev hosted/kalender --port 8799    # behind the local gate
pnpm e2e kalender                                # end to end
```

Reminders for a series are refreshed when the app is opened; a series reminded only on closed
devices fires for its next occurrence and then waits for the next start.

## Languages

German and English (`i18n/de.json`, `i18n/en.json`, declared under `i18n` in `mininode.json`). The person's choice in Konto → Sprache applies; an unknown key falls back to German. New texts need a key in both files; `pnpm mininode doctor hosted/kalender` checks them (ADR 0017). Month and weekday names, the repeat summary (`describeRule(rule, t, locale)`) and all texts follow the language; `test/rrule.test.js` checks both.
