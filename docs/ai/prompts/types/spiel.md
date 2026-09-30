---
id: spiel
title: Spiel
summary: Kleine Spiele, Rätsel, Quiz, mit Punkten und Bestenliste
accent: teal
order: 60
---

## App type: game

Small games: puzzles, quizzes, card or board games, reflex games.

- **Views:** *Spielen* (the board or round, full width, big touch targets), *Bestenliste*
  (`mn-list` rows with rank, name, score), *Profil* (level, stats as KPIs), *Regeln*.
- **Game screen:** the playing field may use its own drawing (canvas or SVG) but takes every
  colour from the `--mn-*` tokens so light and dark both work. Controls are real buttons of at
  least 44 px; keyboard play where it makes sense (arrow keys, Enter).
- **State:** the running game lives in memory and is saved to `mn.kv` (`game:current`) after
  each move, so a reload resumes. Finished games go to `result:<date>:<id>`.
- **Scores and levels:** `profile` in `mn.kv` holds `xp`, `level` and unlocked content.
  Compute the level from xp with a fixed formula and show progress with `mn-meter`.
- **Gaming Hub:** add the `game` block to `mininode.json` and report playtime and rounds with
  `mn.game` (module "Gaming Hub anbinden"). The username comes from the hub; leaderboards come
  from `mn.game.leaderboard()`, not from your own kv keys.
- **Motion:** short `transform` animations for moves; everything stays playable with
  `prefers-reduced-motion`.
- **Fairness:** randomness from `crypto.getRandomValues`, scoring rules shown on *Regeln*.
