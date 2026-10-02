---
id: game-opponent
title: Computergegner
summary: KI-Gegner für Brett- und Kartenspiele in mehreren Stärken
order: 104
group: spiele
---

## Feature: computer opponent

- Board games: minimax with alpha-beta pruning and iterative deepening under a time budget
  (e.g. 300 ms); a transposition table keyed by a Zobrist hash for games with repeating
  positions. Card games: rule-based heuristics, or Monte Carlo sampling of the hidden cards.
- Strength levels: "Leicht" (depth 1, 30 % random moves), "Mittel" (depth 3), "Schwer" (full
  budget). The level is chosen before the match and shown during it.
- Run the search in a Web Worker (`new Worker('/ai-worker.js')` from the app's own origin;
  CSP allows `'self'`). The UI stays responsive and shows "Computer denkt nach …".
- The move generator and the rules are shared by player and computer (one module); the
  computer never sees hidden information it should not have.
- Add a short delay (400–700 ms) before showing the computer's move, animated with `transform`
  only, and announce it in an `aria-live` region ("Computer zieht e7 nach e5").
- Report results as `'win'`, `'loss'` or `'draw'` from the player's view; add the strength to
  the stat id if the leaderboard should compare like with like.
- Never call the AI proxy for moves: it is slow, costs budget and is not needed for games.
