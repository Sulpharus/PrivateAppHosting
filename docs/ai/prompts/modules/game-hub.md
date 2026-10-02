---
id: game-hub
title: Gaming Hub anbinden
summary: Spielzeit, Ergebnisse, Rekorde und Bestenliste, ein Spielername für alle Spiele
order: 101
group: spiele
---

## Feature: Gaming Hub (every game)

- Declare the game in `mininode.json` (ADR 0009); without this block the platform records
  nothing:
  ```json
  "game": {
    "genre": "puzzle",
    "players": "solo",
    "stats": [
      { "id": "score", "label": "Punkte", "better": "higher", "min": 0, "max": 100000 },
      { "id": "time", "label": "Zeit", "better": "lower", "format": "seconds", "min": 1 }
    ]
  }
  ```
  - `genre`: `puzzle`, `arcade`, `karten`, `brett`, `quiz`, `wort`, `strategie`, `sonstiges`.
  - At most six stats; ids in `snake_case`. `min` defaults to 0; set a realistic `max`,
    because values outside the range are dropped.
- Playtime: `const stop = mn.game.track()` when play starts (first move, not on the title
  screen); `stop()` on the menu or game over. Hidden tabs never count.
- Results: `await mn.game.result('win' | 'loss' | 'draw' | 'done', { score, time }, seconds)`
  once per finished round. Solo puzzles that are solved report `'win'`. Catch errors and show a
  toast ("Das Ergebnis konnte nicht gespeichert werden"); the game must keep working offline.
- Username: `await mn.game.username()` (null when none). Greet with "Du spielst als …";
  without one, link to `new URL('/games', mn.config.portalUrl)` ("Namen festlegen"). Only the
  portal sets the name; never ask for it in the game and never show e-mail addresses.
- Records and leaderboard: `mn.game.stats()` gives `records` per stat;
  `mn.game.leaderboard('score', 10)` gives `{ rank, username, value, mine }`. Show them after a
  round and on a *Bestenliste* view; mark `mine` with weight and "(du)", not colour only.
- Link "Gaming Hub" in the top bar to `mn.game.hubUrl()`.
- Do not keep your own leaderboard in kv. `mn.kv` stays for saved games and settings.
- Leaderboards are client-reported and not cheat-proof. Keep the stats plausible and
  bounded; never promise prizes.
