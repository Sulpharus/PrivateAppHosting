# 2048

2048 for the Gaming Hub (ADR 0009).

- **Rules** in `logic.js` without DOM (tested in `test/logic.test.js`): sliding and merging once
  per move, a new 2 (90%) or 4 after every move that moved something, game over when nothing can
  move.
- **Input:** arrow keys or W/A/S/D, swipes on the board, and four on-screen arrow buttons (so it
  works without a keyboard or gestures). One move can be taken back.
- **Gaming Hub:** a finished round reports `score` and `tile` (largest tile): `win` when 2048 was
  reached, `loss` when the board is stuck, `done` when the player ends the round ("Beenden" or
  "Neues Spiel" in a running game). The leaderboard is by score. Login, playtime, saving and
  leaderboard come from the kit helper `/_mininode/game.js`.
- **Data:** none (`data.mode: none`). A running game is not saved.

## Languages

German and English (`i18n/de.json`, `i18n/en.json`, declared under `i18n` in `mininode.json`). The person's choice in Konto → Sprache applies; an unknown key falls back to German. New texts need a key in both files; `pnpm mininode doctor hosted/n2048` checks them (ADR 0017).
