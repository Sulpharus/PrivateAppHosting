---
id: stats
title: Statistik und Diagramme
summary: Kennzahlen, Balken, Jahresübersicht, Heatmap
order: 90
---

## Feature: statistics and charts

- Start with 2 to 4 `mn-kpi` values for the chosen period (year stepper or month stepper in
  the header tools), then breakdowns as `mn-bar` rows with `mn-meter` (width via
  `--mn-value`), then trends.
- Trends: a simple bar or column chart in SVG or CSS grid, 12 months or 7 days, with a legend
  and an `aria-label` that states the numbers. Colours from tokens only (`--mn-accent`,
  `--mn-ok`, `--mn-surface-2` for tracks); no chart library unless the chart is complex.
- Activity over a year: the kit's `mn-heat` grid (`l1` to `l3`).
- Every number has a label and a unit; percentages are rounded to whole numbers.
- Compute statistics from the stored data on the fly; never store derived numbers.
