---
id: reisen
title: Reisen und Ausflüge
summary: Reiseplanung, Packlisten, Tagesprogramm, Ausgaben unterwegs, Erinnerungen
when: Nimm das für Reisen und Ausflüge, die du zu Hause planst und unterwegs auf dem Handy nutzt, auch ohne gutes Netz.
accent: teal
audience: me
modules: tables, places, dates, offline, sharing
order: 45
---

## App type: travel and trips

Planned at home on the desktop, used on the phone on the way, often without a good connection.

- **Views:** *Reisen* (upcoming first, past below), per trip *Programm* (days with entries:
  travel, stay, activity, each with time, place and booking reference), *Packliste*
  (templates plus trip-specific items), *Ausgaben* (amounts in the local currency with a fixed
  rate per trip, split per person if shared), *Dokumente* (tickets, bookings via `mn.files`).
- **Data:** tables `trips` (`id`, `title`, `starts_on date`, `ends_on date`, `currency`, `rate`),
  `entries` (`trip_id … on delete cascade`, `day date`, `time time`, `kind`, `place jsonb`
  (`{ name, address, lat, lng }`), `booking_ref`, `note`), `packing` (`trip_id`, `title`, `packed
  boolean`) and `expenses` (`trip_id`, `amount_cents`, `paid_by`, `note`). Packing templates are
  rows without `trip_id` copied into a trip.
- **On the way:** the current trip's today view opens first during a trip; places show on a map
  and link to directions (places module); everything needed on the day works offline.
- Share the day's programme as text with fellow travellers (sharing module). Trips with several
  people use data mode `team` (module *Teams und Projekte*).
