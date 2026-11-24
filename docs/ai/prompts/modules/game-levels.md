---
id: game-levels
title: Level, Schwierigkeit und Tagesrätsel
summary: Fortschritt über Level, Schwierigkeitsstufen und ein tägliches Rätsel für alle
when: Nimm das, wenn das Spiel Level, Schwierigkeitsstufen oder ein tägliches Rätsel für alle haben soll.
order: 103
group: spiele
---

## Feature: progression and daily challenge

- Levels: data-driven (`levels.js` with an array of level definitions), unlocked in order;
  store progress in `mn.kv` (`progress`: `{ unlocked, stars: { [level]: 0..3 }, daily: { last,
  streak } }`). A level select view shows locked levels with a lock icon and a text label.
- Difficulty: `Leicht`, `Mittel`, `Schwer` as a segmented control before the round. Keep
  records comparable: report the difficulty in the stat id (`score_leicht`, `score_schwer`) or
  offer only one ranked mode.
- Daily challenge ("Tagesrätsel"): the same puzzle for everyone on a day. Seed a small PRNG
  (e.g. mulberry32) with the date in Europe/Berlin (`YYYYMMDD`); one ranked attempt per day
  (`progress.daily.last` holds the date of the last ranked attempt), practice rounds unranked.
  Show a countdown to the next one.
- Streaks: keep the count in `progress.daily.streak`; the Gaming Hub already shows the overall
  streak, so do not duplicate it across games.
- Hints and undo cost points or are unranked; say so before they are used.
- Tutorials: the first level teaches one mechanic at a time with a short hint line, and can be
  skipped.
