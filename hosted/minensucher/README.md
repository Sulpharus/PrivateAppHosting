# Minensucher

Minesweeper for the Gaming Hub (ADR 0009), in three levels: Leicht 9×9 with 10 mines, Mittel
16×16 with 40, Schwer 30×16 with 99.

- **Rules** in `logic.js` without DOM (tested in `test/logic.test.js`): mines are laid after the
  first tap (never on it or next to it), flood fill for empty areas, flags, chording on a
  number whose flags match, win and loss.
- **Input:** tap or click uncovers; mode switch "Flagge", long press, right click or key F flags;
  tapping an opened number chords. Arrow keys move, Enter and Space act. Every cell has a label
  ("Reihe 3, Spalte 4, 2 Minen in der Nähe"). Cells are 44 px on touch screens; the wide Schwer
  board scrolls sideways on a phone.
- **Gaming Hub:** the stats `time_leicht`, `time_mittel` and `time_schwer` (fewer seconds is
  better) get a win; a lost round is reported as `loss`. Login, playtime, saving and the
  leaderboard come from the kit helper `/_mininode/game.js`.
- **Data:** none (`data.mode: none`).

## Languages

German and English (`i18n/de.json`, `i18n/en.json`, declared under `i18n` in `mininode.json`). The person's choice in Konto → Sprache applies; an unknown key falls back to German. New texts need a key in both files; `pnpm mininode doctor hosted/minensucher` checks them (ADR 0017).
