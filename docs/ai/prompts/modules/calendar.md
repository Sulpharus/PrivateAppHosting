---
id: calendar
title: Kalender und Termine
summary: Wochenleiste, Monatsraster, Wiederholungen, Tagesansicht
order: 30
group: anbindungen
---

## Feature: calendar and dates

- Dates are stored as `YYYY-MM-DD` strings in local time, times as `HH:MM`; never store
  `Date` objects or UTC timestamps for all-day things.
- Weeks start on Monday. Use the kit's week strip (`mn-week`) for day-based views and the
  month grid (`mn-cal` in a `mn-card`) for the calendar, with dots for entries (filled =
  available, outlined = planned).
- On desktop put the month grid and the selected day's list side by side
  (`mn-split mn-split--start`).
- Repeating entries are stored as a rule (weekdays, every n weeks, a date range, exceptions)
  and expanded for the visible range only; cache the expansion per day and clear it on change.
- Format with `Intl.DateTimeFormat('de-DE', …)`: "Mo., 28. Sept.", "17:00–22:00".
- A "Zurück zu heute" link appears whenever another week or month is shown.
