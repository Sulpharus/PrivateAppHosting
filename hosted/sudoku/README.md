# Sudoku

Sudoku for the Gaming Hub (ADR 0009) with a scripted generator and five levels: Sehr leicht,
Leicht, Mittel, Schwer, Extrem. Every puzzle is made on the spot, never looked up.

- **Generator** (`logic.js`, no DOM, tested in `test/logic.test.js`):
  1. Fill a random full grid with a randomised backtracking solver.
  2. Dig holes in symmetric pairs, in random order. A hole stays only while the puzzle still has
     exactly one solution (solution counter stops at two) and is rated at or below the level.
  3. Accept the puzzle when its rating equals the wanted level; otherwise try another grid
     (up to 400 tries, the closest one is the fallback).
- **Rating** is by technique, not by clue count: 1 naked singles; 2 + hidden singles; 3 + locked
  candidates and naked pairs; 4 + hidden pairs, naked triples and X-Wing; 5 needs more than that.
- **Worker:** `generator-worker.js` builds puzzles off the main thread (Extrem and Schwer can take
  a second). The next puzzle of the level is made while the player plays. Without Worker support
  the page builds on the main thread.
- **Input:** number pad or keys 1–9, notes (N), erase, undo (Z), arrow keys. Repeated digits are
  marked with an underline as well as the colour. A hint fills the selected cell and adds 30 s.
- **Gaming Hub:** stats `time_1` … `time_5` (fewer seconds is better, hints included). Login,
  playtime, saving and the leaderboard come from the kit helper `/_mininode/game.js`.
- **Data:** none (`data.mode: none`). A running puzzle is not saved.
