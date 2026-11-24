---
id: timer
title: Timer und Zeiterfassung
summary: Stoppuhr, Countdown, Zeiten erfassen, Bildschirm wach halten
when: Nimm das für Stoppuhr, Countdown oder Zeiterfassung, etwa beim Training oder Kochen.
order: 58
group: offline
---

## Feature: timers and time tracking

- Store the start time, not a running counter: `{ startedAt, pausedMs }` in `mn.kv` for the one
  running timer, and compute the elapsed time on every frame. That survives reloads, sleeping
  phones and other devices.
- Update the display with `requestAnimationFrame` (seconds only) and stop updating when the
  page is hidden.
- `navigator.wakeLock.request('screen')` while a workout or cooking timer runs, released when it
  stops or the page is hidden; re-acquire on `visibilitychange`.
- A countdown that must alert with the app closed uses `mn.push.schedule` (push module) with
  the end time; cancel it when the timer is stopped.
- Sound on finish: a short WebAudio beep, only after the person interacted with the page, and a
  vibration (`navigator.vibrate`) where supported; both optional in settings.
- Time entries go to a table `entries` (`id`, `started_at timestamptz not null`, `ended_at
  timestamptz`, `note`, `tag`); show daily totals and a week sum, and format durations for the
  language ("1 Std. 25 Min." / "1 h 25 min", keys in the language packages).
