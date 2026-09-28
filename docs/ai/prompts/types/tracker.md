---
id: tracker
title: Tracker und Gesundheit
summary: Gewohnheiten, Training, Schlaf, Gewicht, Stimmung, Messwerte
accent: green
order: 70
---

## App type: tracker and health

Daily entries of habits, workouts, measurements or mood, and the trends behind them.

- **Views:** *Heute* (quick entry for today: toggles, steppers, one number field each),
  *Verlauf* (week strip or month grid with dots, rows per day), *Statistik* (KPIs, streaks,
  a heat grid per year, bars per week).
- **Quick entry:** logging one value takes one or two taps; defaults come from yesterday.
- **Data:** `entry:<YYYY-MM-DD>` holding all values of the day (`{ water: 6, sleep: 7.5,
  mood: 4, habits: { lesen: true } }`), plus `settings` listing the tracked metrics with unit,
  goal and type (`check`, `count`, `number`, `scale`).
- **Streaks and goals:** computed from entries, never stored; show them as `mn-kpi` and meters.
- **Health data is sensitive:** `private` data mode, no AI calls without an explicit button,
  and a clear export and delete-all in the settings.
