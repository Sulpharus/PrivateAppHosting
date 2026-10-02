# Solitär

Klondike solitaire for the Gaming Hub (ADR 0009), one card drawn at a time.

- **Rules** in `logic.js` without DOM (tested in `test/logic.test.js`): deal, draw and recycle,
  building down in alternating colours, runs, kings on empty piles, foundations by suit, undo,
  scoring, and the "automatic finish" once nothing is hidden and the stock is empty.
- **Scoring:** waste to tableau +5, card to a foundation +10, card turned over +5, foundation
  back to the tableau −15 (never below 0).
- **Input:** tap a card, then the target; a second tap on the same card sends it to its
  foundation or the first pile that takes it; double click goes to the foundation. Keyboard:
  arrows move a roving cursor, Enter and Space pick up and put down, F foundation, D draw,
  Z undo, Escape lets go. Suits show as symbols as well as colour. Cards are at least 44 px wide;
  on a very narrow phone the table scrolls sideways.
- **Gaming Hub:** a win reports `time`, `moves` and `score`; "Aufgeben" reports a loss. The
  leaderboard is by score. Login, playtime, saving and leaderboard come from the kit helper
  `/_mininode/game.js`.
- **Data:** none (`data.mode: none`). A running game is not saved.
