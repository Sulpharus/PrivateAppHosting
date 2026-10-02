---
id: game-generator
title: Rätsel selbst erzeugen
summary: Eindeutige Rätsel per Skript, Schwierigkeit messen, im Worker erzeugen
group: spiele
order: 108
---

## Feature: generating puzzles

- Generate every puzzle with a script, never from a stored list. Build it **from the solution**:
  create a full valid solution with a randomised solver, then remove parts one at a time.
- **Unique solution:** after each removal count solutions with a backtracking solver that stops
  at two; keep the removal only when exactly one remains. Keep the solver in the same module as
  the generator.
- **Difficulty by what the player needs to do**, not by how much is given: rate a puzzle by the
  hardest technique a human solver needs (level 1 = only the simplest rule, level 5 = needs more
  than the listed techniques). Dig only while the rating stays at or below the wanted level and
  accept the puzzle when the rating equals the level; otherwise retry with a new solution, up to a
  limit, and use the closest one as the fallback.
- Run generation in a module Web Worker (`new Worker(new URL('./worker.js', import.meta.url),
  { type: 'module' })`) and fall back to the main thread if it fails. Prepare the next puzzle of
  the level while the player plays. Show "Rätsel wird erzeugt …" and keep the old board inactive.
- Take the random function as a parameter: `crypto.getRandomValues` in the app, a seeded one in
  tests. A daily puzzle uses a seed derived from the date (Europe/Berlin), so everyone gets the
  same one.
- Test: every generated puzzle has one solution, its rating equals the level, symmetry or
  structure rules hold, and the solver finds the stored solution. Measure the slowest level.
- Hints cost something (time penalty or a flag); say so before use and report it in the result.
