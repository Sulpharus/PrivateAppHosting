---
id: tracker
title: Tracker und Gesundheit
summary: Gewohnheiten, Training, Schlaf, Gewicht, Stimmung, Messwerte
when: Nimm das, wenn du jeden Tag etwas festhalten willst, etwa Gewohnheiten, Training, Schlaf, Gewicht oder Stimmung, und den Verlauf sehen möchtest.
accent: green
audience: me
modules: tables, stats, privacy
order: 70
---

## App type: tracker and health

Daily entries of habits, workouts, measurements or mood, and the trends behind them.

- **Views:** *Heute* (quick entry for today: toggles, steppers, one number field each),
  *Verlauf* (week strip or month grid with dots, rows per day), *Statistik* (KPIs, streaks,
  a heat grid per year, bars per week).
- **Quick entry:** logging one value takes one or two taps; defaults come from yesterday.
- **Data:** a table `metrics` (`id`, `name text not null`, `unit`, `goal numeric`, `kind text
  check (kind in ('check','count','number','scale'))`, `position`) and a table `readings` (`id`,
  `metric_id … references metrics on delete cascade`, `day date not null`, `value numeric`,
  `unique (owner_id, metric_id, day)`); index `day`. Use a deterministic id per metric and day
  so two devices write the same row.
- **Streaks and goals:** computed from the values, never stored; show them as `mn-kpi` and meters.
- **Health data is sensitive:** `private` data mode, no AI calls without an explicit button,
  and a clear export and delete-all in the settings (module *Sensible Daten*).
