---
id: birthdays
title: Geburtstage
summary: Geburtstage der Personen auf MiniNode (freiwillig freigegeben) und eigener Kontakte
order: 83
group: teilen
---

## Feature: birthdays (ADR 0025)

- People enter their birthday under "Dein Konto → Geburtstag" and decide whether others see it.
  `await mn.birthdays()` returns the shared ones of the people who can use this app:
  `{ id, name, month, day, year | null }` (no year: do not compute an age). Never ask for or store
  these birthdays yourself.
- Days until the next birthday: build the date in the person's year, move to next year when it has
  passed, count whole days with dates at local midnight (not milliseconds), and treat 29 February
  as 28 February in non-leap years. Show "heute", "morgen", "in 12 Tagen".
- Sort by the next birthday, group "Diese Woche", "Dieser Monat", "Später". Never show a person
  without a birthday as "0 days".
- Birthdays of people outside MiniNode are typed in (name, day, month, optional year) and live in
  the app's own table; offer to hide a person without deleting them.
- Remind with `mn.push` a few days before (default 7, setting per person) at 09:00 local time;
  one reminder per person and year (stable key `birthday:<id>:<year>`).
