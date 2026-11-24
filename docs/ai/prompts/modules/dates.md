---
id: dates
title: Datum, Zeit und Wiederholungen
summary: Datumsformate je nach Sprache, Zeitzonen, Fristen, wiederkehrende Einträge
when: Nimm das, wenn Fristen, wiederkehrende Termine oder Zeitangaben eine Rolle spielen.
group: daten
order: 59
---

## Feature: dates, times and recurrence

- Store dates as ISO values: a `date` column (`2026-10-01`) for a day, a `timestamptz` for a moment
  (`2026-10-01T18:30:00+02:00`). Never store a formatted date.
- Show full dates with `mnui.date.format(iso)`: "01. Okt. 2026" in German, "01 Oct 2026" in
  English. Other formats use `Intl.DateTimeFormat(mnI18n.locale, …)`; times in 24 hours in both
  languages. Never show ISO strings to people and never hard-code `'de-DE'`.
- Use plain `<input type="date|month|time">`: the App Kit shows them as parts (Tag · Monat · Jahr,
  Stunde : Minute). Do not build your own date picker.
- "Today" and "this week" are computed in Europe/Berlin. Weeks start on Monday. Compare days as
  strings (`'2026-10-01' < '2026-10-02'`), not as timestamps, so daylight saving cannot shift
  them.
- Recurrence: store a small rule (`{ every: 1, unit: 'week', weekdays: [1, 3], until: '2026-12-31' }`,
  a `jsonb` column) and compute the occurrences for the visible range; never store hundreds of
  copies. An edit asks "Nur dieses" or "Dieses und alle folgenden". A monthly rule on the 31st falls
  on the last day of shorter months.
- Deadlines show relative text ("morgen", "in 3 Tagen", "seit 2 Tagen überfällig"; plural forms
  from the language packages) together with the date, and overdue items get a label as well as a
  colour. `Intl.RelativeTimeFormat(mnI18n.locale, { numeric: 'auto' })` helps.
- Anything with a date can appear in the Kalender app through the *Gemeinsame Daten* module.
