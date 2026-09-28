---
id: timer
title: Timer und Zeiterfassung
summary: Stoppuhr, Countdown, Zeiten erfassen, Bildschirm wach halten
order: 58
---

## Feature: timers and time tracking

- Store the start time, not a running counter: `{ startedAt, pausedMs }` in kv, and compute
  the elapsed time on every frame. That survives reloads, sleeping phones and other devices.
- Update the display with `requestAnimationFrame` (seconds only) and stop updating when the
  page is hidden.
- `navigator.wakeLock.request('screen')` while a workout or cooking timer runs, released when it
  stops or the page is hidden; re-acquire on `visibilitychange`.
- A countdown that must alert with the app closed uses `mn.push.schedule` (push module) with
  the end time; cancel it when the timer is stopped.
- Sound on finish: a short WebAudio beep, only after the user interacted with the page, and a
  vibration (`navigator.vibrate`) where supported; both optional in settings.
- Time entries: `{ id, start, end, note, tag }`; show daily totals and a week sum, format
  durations as "1 Std. 25 Min.".
