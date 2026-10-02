# Codeknacker

Mastermind for the Gaming Hub (ADR 0009): a secret code of 4 symbols out of 6 (repeats allowed),
10 guesses.

- **Rules** in `logic.js` without DOM (tested in `test/logic.test.js`): feedback as "exact"
  (right symbol and place) and "near" (right symbol, wrong place), counted so a symbol is never
  used twice.
- **Input:** pad buttons or keys 1–6, Backspace removes the last symbol, Enter guesses. The six
  symbols differ in shape as well as colour; feedback is written out ("2 genau, 1 nah").
- **Gaming Hub:** a win reports `guesses` and `time` (fewer is better); a lost round reports
  `loss`. The leaderboard is by guesses. Login, playtime, saving and leaderboard come from the kit
  helper `/_mininode/game.js`.
- **Data:** none (`data.mode: none`). A running round is not saved.

## Languages

German and English (`i18n/de.json`, `i18n/en.json`, declared under `i18n` in `mininode.json`). The person's choice in Konto → Sprache applies; an unknown key falls back to German. New texts need a key in both files; `pnpm mininode doctor hosted/codeknacker` checks them (ADR 0017).
