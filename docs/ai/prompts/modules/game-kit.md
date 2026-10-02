---
id: game-kit
title: Spiele im Repository (mnGame-Helfer)
summary: Login, Spielzeit, Ergebnis und Bestenliste mit window.mnGame statt eigenem Code
group: spiele
order: 109
---

## Feature: the mnGame kit helper (games built in the repository)

Games in `hosted/<slug>/` can load `/_mininode/game.js` (after `ui.js`, before the SDK) and get
the Gaming Hub shell for free as `window.mnGame`:

- `const mn = await mnGame.connect({ player: '#player', hub: '#hub' })` loads the SDK client,
  requires login, links the hub and greets the player ("Du spielst als …", or a link to set the
  name). It resolves to `null` offline; the game must still work.
- `const clock = mnGame.timer({ onTick, mn: () => mn })`: `clock.start()` on the first move
  (starts playtime tracking once), `stop()` returns the seconds, `penalty(30)` adds time for a
  hint, `reset()` starts over; call `clock.attach()` after `connect` resolves.
- `await mnGame.report(mn, 'win' | 'loss' | 'draw' | 'done', { time: 91 }, seconds)` saves a
  round and shows a toast when saving fails.
- `await mnGame.leaders(mn, '#leaders', { stat: 'time', format: mnGame.format.seconds })` renders
  the leaderboard and returns the player's own record.
- `mnGame.format.seconds(75)` gives `1:15`, `mnGame.format.number(12345)` gives `12.345`,
  `mnGame.random(n)` gives a crypto random integer below `n`.
- Keep the rules in a pure `logic.js` with tests, the drawing in `app.js`. Reference games:
  `hosted/memory`, `hosted/minensucher`, `hosted/sudoku`.
- Declare the `game` block in `mininode.json` as in the Gaming Hub module; stat ids you report must
  exist there and stay inside their `min`..`max`.
