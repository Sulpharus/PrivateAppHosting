# Memory

Find the eight pairs with as few moves as possible. A small real game for the Gaming Hub
(ADR 0009) and a reference for AI-built games.

- **Rules** in `logic.js` without DOM (tested in `test/logic.test.js`). Decks are shuffled with
  `crypto.getRandomValues`.
- **Gaming Hub:** the manifest's `game` block declares the stats `moves` and `time` (fewer is
  better, with min and max so impossible values are dropped). The game calls
  `mn.game.track()` from the first card (playtime counts only while visible) and
  `mn.game.result('win', { moves, time }, seconds)` at the end. The username and the
  leaderboard come from `mn.game.username()` and `mn.game.leaderboard('moves')`.
- **Access:** keyboard play with arrow keys, Enter and Space. Every card has a label ("Karte 3:
  Stern, gefunden"), moves are announced, and the flip animation is off with reduced motion.
- **Data:** none of its own (`data.mode: none`); everything is in the platform's game tables.

## Languages

German and English (`i18n/de.json`, `i18n/en.json`, declared under `i18n` in `mininode.json`). The person's choice in Konto → Sprache applies; an unknown key falls back to German. New texts need a key in both files; `pnpm mininode doctor hosted/memory` checks them (ADR 0017).
