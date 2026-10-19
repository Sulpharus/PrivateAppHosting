---
name: Reiseplaner
type: reisen
audience: group
accent: teal
builder: claude-code
modules: teams, tables, offline, files, places, calendar, dates, money, suite, push, notifications, sharing, search, undo, dragsort, import-export, print, onboarding, errors, accessibility
ai: false
---
A trip planner for holidays, weekend trips and day trips, alone or with people on MiniNode. Planned
on the desktop, used on the phone on the way, often without a good connection. German and English,
mobile first, light and dark.

It reuses what the platform already has and does not duplicate it:

- The Kalender shows trips and stops.
- Bill the Splitter handles shared costs.
- The Kalender's map and routing code draws the route.

The only new things are the trip itself, its stops, its bookings and its documents.

## Trips

- A trip has:
  - a title, a start and end date (a day trip is one day), and one or more destinations;
  - a cover photo, a colour, a status (Idee, geplant, gebucht, unterwegs, vorbei), and notes.
- The overview shows upcoming trips first and past ones below, folded by year. A countdown chip on
  the next trip ("in 23 Tagen").
- During a trip, the app opens straight on that trip's **Heute** view.
- Duplicate a trip as a template ("Wie letztes Jahr, nur im Juli").

## Travellers and sharing

- Data mode `team`: a trip is a team, and its members are viewer or editor. Members are picked
  from the people with access to the app (`mn.team`, `mn.people()`).
- Travellers who are not on MiniNode are plain names on the trip (e.g. children, friends without
  an account). They have no access but count for rooms, tickets and the packing list.
- Share a read-only day programme as text or a link with fellow travellers (sharing module).

## Programme (the core)

- **Day by day:** one column or section per day, with entries in time order. Entries are moved by
  drag and drop or with keyboard buttons, within a day or to another day.
- There are four kinds of entry:
  - **Anreise / Weiterreise** (`trip_leg`): mode (flight, train, car, bus, ferry, walk), from and
    to, departure and arrival, carrier, number, seat, booking reference.
  - **Unterkunft** (`accommodation`): name, address, check-in and check-out times, booking
    reference, contact, price. It spans its nights and shows on every day it covers.
  - **Programmpunkt** (`itinerary_item`): sight, restaurant, activity or appointment, with a time
    or "irgendwann am Tag", place, duration, price, link, note, and a ticket.
  - **Notiz:** free text for a day ("Markt nur samstags").
- **Ideenliste:** places and ideas not yet given a day. Drag one onto a day to plan it.
- Gaps and clashes are marked:
  - an overlap between two timed entries;
  - a night without accommodation;
  - a check-out after the next departure.
- Time zones: departure and arrival keep their own zone, and the day shows local time at the
  destination. [?] Only flights really need this; keep everything else in the trip's zone.

## Map and routes

- Map per trip and per day with all entries that have a place, numbered in day order. A line or
  route connects them, with the travel time between stops (car, bike, foot, public transport where
  available).
- Reuse the Kalender's map code (`hosted/kalender/map.js`, `route.js`: Leaflet from `/vendor`,
  Geoapify through the API key proxy with OpenStreetMap as the fallback, Nominatim lookups cached).
  Do not build a second map stack. [?] Moving that code into `packages/ui/kit` as a shared map
  helper would be the clean way, and the Kalender would then use it too.
- "Ort prüfen" stores coordinates on the entry. Addresses open in the phone's map app with a
  plain link.
- "Was ist in der Nähe?": distance from the accommodation to every stop of the day.

## Bookings and documents

- Each booking, ticket, boarding pass, reservation, insurance or visa document can be:
  - attached to an entry or kept on the trip (`mn.files`, image or PDF, up to 20 MB, thumbnail);
  - given an expiry date where useful.
- **Offline:** everything for today and tomorrow, including the files, is kept on the device. A
  switch "Alles offline verfügbar" covers the whole trip.
- Checklist **Vor der Reise**: per trip and editable, with defaults by trip type:
  - passport or ID valid until the return date;
  - travel insurance;
  - vaccinations, visa and power plug type for abroad;
  - pet or plant care while away.

## Packing list

- Templates (Sommerurlaub, Städtetrip, Wandern, Winter, Baby) copied into a trip and then edited
  per trip. Items can be per person or shared ("Sonnencreme – eine für alle").
- Tick off while packing, and again for the way back ("Rückreise").
- [?] The owner put shopping lists on hold. The packing list is part of the trip, not a general
  list app; leave it for phase 2 if wanted.

## Costs

- **Budget** per trip, with a planned amount per category (Anreise, Unterkunft, Essen, Aktivitäten,
  Sonstiges).
- **Cost summary:** the prices already on entries are summed automatically. Spending on the way
  is entered quickly ("23,50 € Essen").
- **Foreign currency:** amounts in the local currency, with one fixed rate per trip and currency,
  editable. Totals in EUR.
- **Shared costs go to Bill the Splitter:**
  - "Gruppe in Bill the Splitter anlegen" opens it with the trip name and travellers filled in;
  - the trip shows a link to that group.
  - The planner does not split costs itself. [?] Bill the Splitter needs a small addition for
    this: a deep link that pre-fills a new group (it stores groups in `mn.kv`, mode `group`, and
    has no suite type).

## Calendar and reminders

- Suite records with stable source keys, so the Kalender shows them. The person can switch this
  off per trip.
  - The trip as a `trip` record, all-day over its dates.
  - Legs, accommodations and timed programme items as `trip_leg`, `accommodation` and
    `itinerary_item`, each with its place, so the Kalender's map view shows them.
  - These types are in the catalog (`docs/suite/data-types.md` §5) but not yet in the registry. A
    migration adds them, with their schemas and calendar projection (`span`).
- **Push reminders** (`mn.push`), each switchable:
  - check-in opens (24 h before a flight);
  - leave for the station or airport (from the travel time);
  - check-out time;
  - document expiry;
  - "Packliste noch offen" two days before.

## After the trip

- A trip turns into a diary-like view:
  - the planned programme, marked done or skipped;
  - a short note and a rating per stop, and a few photos (`mn.files`).
- "Wieder hin?" flag on places for the next trip.
- Statistics, kept small: trips per year, nights away, countries and cities visited (on the map),
  total cost per trip and per night.

## Data

- Tables in `app_reiseplaner` (ADR 0022), each team-scoped through `secure_table(…, 'team')`:
  `trips`, `travellers`, `legs`, `stays`, `items` (programme, ideas, notes), `documents`,
  `checklist_items`, `packing_items`, `packing_templates`, `expenses`, `rates`.
- Typed columns:
  - dates as `date` and times as `timestamptz` with a zone column;
  - money as integer cents with a currency;
  - coordinates as `lat` and `lon`.
- Checks and keys: end not before start, cents ≥ 0 for planned prices, foreign keys `on delete
  cascade`, indexes on `trip_id` and dates. `mn.kv` holds only settings (default reminder times,
  map style, templates switched on).
- Export: JSON of one trip or all trips (without files), and a printable trip plan (one page per
  day, with booking references and addresses).

## Not in scope (first version)

- No booking or price search: no flights, hotels or affiliate links. Bookings are typed in, or a
  confirmation is attached.
- No AI. [?] A later option: read a booking confirmation (PDF or email text) with `mn.ai.json` and
  fill a leg or stay from it, or suggest sights for a destination with `mn.ai.search`.
- No live flight status.
- No own cost splitting (Bill the Splitter).
- No own calendar (Kalender).

## Phases

1. Trips, travellers (team), day programme with the four entry kinds, ideas list, documents,
   offline for today, suite records for the Kalender.
2. Map and routes (shared map helper), push reminders, Vor der Reise checklist, budget and costs
   with the Bill the Splitter link.
3. Packing list with templates, after-trip view and statistics, print and export, booking import
   with AI.
