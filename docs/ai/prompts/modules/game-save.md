---
id: game-save
title: Spielstand speichern
summary: Laufendes Spiel fortsetzen, Versionen, Aufräumen
group: spiele
order: 106
---

## Feature: saved games

- Save the running game to `mn.kv` as `game:current` after every move (small object, no DOM
  state): `{ v: 1, startedAt, seed, moves, state }`. Do not save when the game is over; remove the
  key then.
- On start, offer "Weiterspielen" and "Neues Spiel" when a save exists. A save with an unknown `v`
  is ignored, never crashes the game.
- Save what the rules need to rebuild the position, not the screen. A seed plus the list of moves
  is often smaller and replayable.
- Keep the clock honest: store elapsed play time, not a start timestamp, so a pause overnight does
  not count. Playtime tracking (`mn.game.track()`) restarts when play resumes.
- Finished rounds go to the Gaming Hub with `mn.game.result`, not into kv.
- Games that people play offline queue the result: catch the error, keep the finished round in kv
  (`pending-result`) and send it at the next start.
