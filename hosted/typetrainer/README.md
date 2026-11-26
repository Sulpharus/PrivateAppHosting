# Typetrainer

Touch typing and fast coding, for QWERTZ, QWERTY and the Neo family (Neo 2, Bone, Noted). Every
person has their own data (data mode `private`). Static app, no build step. Blue accent.

All practice texts are made by script; AI is optional and only runs when the person presses
"Text mit KI vorschlagen" in the text editor.

## What it does

- **Üben**: continue the learning path (next unlocked level, stars), today's minutes against the
  daily goal, the practice streak and best speed; the **Tagesaufgabe** (daily challenge: the same
  text for everyone on a Berlin date, the first attempt counts, its own streak and a countdown);
  **free practice** with random prose or code (Leicht, Mittel, Schwer; Python, JavaScript, Java);
  a drill for the **weakest keys** of the last 40 runs.
- **Lernpfad**: one course per layout and per programming language. Layout courses are derived
  from the layout data: home row finger by finger, then top and bottom row, the remaining letters,
  capitals, numbers, punctuation, brackets and symbols, whole sentences and a speed level (target
  12 to 45 WPM). Code courses go from brackets and operators via names, values, conditions, loops,
  functions and classes to idioms and small programs (target 16 to 32 WPM). One star (90 %
  accuracy) unlocks the next level; two need the target speed at 94 %, three 1.3 × the target at
  97 %.
- **Typing screen**: the text in three visible lines (five for code), the caret, wrong characters
  marked by colour and underline, live WPM, accuracy and progress, an on-screen keyboard that shows
  the next key, its modifier (Shift on the other hand, AltGr or M3) and the active layer, and a line
  naming key and finger. A mistake either stops until the right key is typed or is passed over
  (Backspace corrects), as set. After a line break in code the indentation is filled in. Esc
  cancels. Input goes through a hidden text field (`beforeinput`, composition for dead keys), and
  every keystroke updates only the spans that changed.
- **Texte**: own practice texts (prose or code) with categories, quick add (paste and Enter),
  search, manual order (drag on desktop, "Nach oben/unten" in the detail sheet), a "Gemeistert"
  section, multi-select with Shift ranges (move to a category, delete), an editor with validation,
  a draft in kv (`draft:text`) and an optional AI suggestion marked "KI-Vorschlag".
- **Statistik**: year stepper; best and average speed, accuracy, practice time; speed per week for
  12 weeks; a heat grid of practice days; weak keys; best speed per course; badges; the latest
  runs. Everything is computed from the stored runs.
- **Einstellungen**: layout, language of the practice texts (like the app, German, English),
  behaviour on mistakes, on-screen keyboard, daily goal; categories (rename, colour, order,
  archive, delete when unused); CSV export of runs and texts, CSV import of texts (`Titel;Text`),
  "Alle Daten dieser App löschen" after typing the confirmation word; account link and sign-out;
  help and the shortcut sheet.

Shortcuts outside input fields: `n` next lesson (on Texte: new text), `p` random practice,
`d` daily challenge, `?` help; on Texte `/` search, `j`/`k` next/previous, `e` edit. In a run
Esc cancels; on the result Enter goes on.

## What it stores

| Where | What |
| --- | --- |
| table `sessions` | every finished run: mode, course, level, layout, difficulty, WPM, accuracy, characters, mistakes, duration, stars, date, per-character counts (`details.keys`) |
| table `texts` | own texts: title, body, kind, programming language, category, position, mastered |
| table `categories` | name, colour (`data-cat` names), position, archived |
| kv `settings` | layout, text language, mistake mode, keyboard, daily goal, practice choices, last course |
| kv `progress` | the daily challenge: date of the last ranked attempt (Berlin), its result, streak, longest streak |
| kv `draft:text` | the unsaved new text, removed on save |

Stars and unlocked levels are not stored separately: they are derived from the lesson runs in
`sessions`, so two devices never overwrite each other's progress. The app loads all runs at start
(with `details`); at a few runs a day that stays small for years. If it ever grows too large, load
only the year in view plus the last 40 runs (the weak-key window) through `mn.db`.

SQL: `db/001_init.sql`.

## Adding a layout or a programming language

- Layout: one entry in `LAYOUTS` (`js/layouts.js`) with the characters per key for layer 1, Shift
  and the third layer, and the keys that select the third layer. The on-screen keyboard, the
  fingers and the lessons follow from it. The Neo, Bone and Noted data match the xkb definitions
  (`/usr/share/X11/xkb/symbols/de`, variants `neo`, `bone`, `noted`).
- Programming language: one entry in `CODE_LANGUAGES` (`js/code.js`) with templates for the same
  level ids.

## Try it

`pnpm mininode dev hosted/typetrainer` with the local stack, then open the printed address.
Unit tests: `pnpm --filter @mininode-hosted/typetrainer test`. End to end: `e2e/typetrainer.spec.ts`.

The logo is `icon.svg`; Verwaltung → Apps → "Logo hochladen" replaces it at any time.
