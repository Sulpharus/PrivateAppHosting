---
id: dates
title: Datum, Zeit und Wiederholungen
summary: Deutsche Datumsformate, Zeitzonen, Fristen, wiederkehrende Einträge
group: daten
order: 59
---

## Feature: dates, times and recurrence

- Store dates as ISO strings: `2026-10-01` for a day, a full ISO string with offset for a moment
  (`2026-10-01T18:30:00+02:00`). Never store a formatted German date.
- Show full dates as "01. Okt. 2026" (`Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short',
  year: 'numeric' })`), times in 24 hours. Never show ISO strings or `dd.mm.yyyy` to users.
- Use plain `<input type="date|month|time">`: the App Kit shows them as Tag · Monat · Jahr or
  Stunde : Minute. Do not build your own date picker.
- "Today" and "this week" are computed in Europe/Berlin. Weeks start on Monday. Compare days as
  strings (`'2026-10-01' < '2026-10-02'`), not as timestamps, so daylight saving cannot shift
  them.
- Recurrence: store a small rule (`{ every: 1, unit: 'week', weekdays: [1, 3], until: '2026-12-31' }`)
  and compute the occurrences for the visible range; never store hundreds of copies. An edit
  asks "Nur dieses" or "Dieses und alle folgenden". A monthly rule on the 31st falls on the last day
  of shorter months.
- Deadlines show relative text ("morgen", "in 3 Tagen", "seit 2 Tagen überfällig") together with
  the date, and overdue items get a label as well as a colour.
- Anything with a date can appear in the Kalender app through the *Gemeinsame Daten* module.
