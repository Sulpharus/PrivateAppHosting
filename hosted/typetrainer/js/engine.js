// The typing engine: pure state and arithmetic, no DOM. The view calls input() and backspace()
// and redraws only the positions they report as changed, which keeps every keystroke cheap.

export const PENDING = 0;
export const OK = 1;
export const WRONG = 2;
/** Typed correctly after a mistake at the same position. */
export const FIXED = 3;
/** Indentation after a line break: filled in automatically. */
export const AUTO = 4;

/**
 * @param {string} text
 * @param {{ stopOnError?: boolean }} options  stopOnError: a wrong key does not move on (default)
 */
export function createRun(text, { stopOnError = true } = {}) {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  return {
    text: clean,
    status: new Uint8Array(clean.length),
    missed: new Uint8Array(clean.length),
    pos: 0,
    stopOnError,
    keystrokes: 0,
    errors: 0,
    startedAt: 0,
    lastAt: 0,
    keys: {},
  };
}

function count(run, ch, wrong) {
  const entry = run.keys[ch] ?? [0, 0];
  entry[0] += 1;
  if (wrong) entry[1] += 1;
  run.keys[ch] = entry;
}

/** After a line break, the leading spaces of the next line are typed for the person. */
function skipIndent(run, changed) {
  if (run.pos === 0 || run.text[run.pos - 1] !== '\n') return;
  while (run.text[run.pos] === ' ') {
    run.status[run.pos] = AUTO;
    changed.push(run.pos);
    run.pos += 1;
  }
}

export const isDone = (run) => run.pos >= run.text.length;

/**
 * One typed character. Returns the positions whose look changed, and whether it was right.
 * @returns {{ changed: number[], correct: boolean, done: boolean } | null}
 */
export function input(run, ch, now) {
  if (isDone(run)) return null;
  if (!run.startedAt) run.startedAt = now;
  run.lastAt = now;
  const expected = run.text[run.pos];
  // A typographic space (no-break) counts as a space; so does Enter for a line break.
  const typed = ch === ' ' ? ' ' : ch === '\r' ? '\n' : ch;
  const correct = typed === expected;
  run.keystrokes += 1;
  count(run, expected, !correct);
  const changed = [run.pos];
  if (correct) {
    run.status[run.pos] = run.missed[run.pos] ? FIXED : OK;
    run.pos += 1;
    skipIndent(run, changed);
  } else {
    run.errors += 1;
    run.missed[run.pos] = 1;
    if (run.stopOnError) {
      run.status[run.pos] = WRONG;
    } else {
      run.status[run.pos] = WRONG;
      run.pos += 1;
      skipIndent(run, changed);
    }
  }
  if (run.pos < run.text.length) changed.push(run.pos);
  return { changed, correct, done: isDone(run) };
}

/** The word that starts at the caret, or null when the caret is inside a word. */
export function wordAt(run) {
  if (run.pos > 0 && /\p{L}/u.test(run.text[run.pos - 1])) return null;
  const match = /^\p{L}+/u.exec(run.text.slice(run.pos));
  return match ? match[0] : null;
}

/**
 * A chord typed the whole word at the caret (and the space after it). Counts as one keystroke.
 * @returns {{ changed: number[], done: boolean }}
 */
export function inputWord(run, word, now) {
  if (wordAt(run) !== word) return null;
  if (!run.startedAt) run.startedAt = now;
  run.lastAt = now;
  run.keystrokes += 1;
  const changed = [];
  const end = run.pos + word.length + (run.text[run.pos + word.length] === ' ' ? 1 : 0);
  // Not counted per character: the key statistics are about typing letter by letter.
  for (; run.pos < end; run.pos++) {
    run.status[run.pos] = run.missed[run.pos] ? FIXED : OK;
    changed.push(run.pos);
  }
  if (run.pos < run.text.length) changed.push(run.pos);
  return { changed, done: isDone(run) };
}

/** A chord that does not fit the word at the caret: one mistake, the caret stays. */
export function chordMiss(run, now) {
  if (isDone(run)) return null;
  if (!run.startedAt) run.startedAt = now;
  run.lastAt = now;
  run.keystrokes += 1;
  run.errors += 1;
  run.missed[run.pos] = 1;
  run.status[run.pos] = WRONG;
  return { changed: [run.pos] };
}

/** Back one position (only when going on after mistakes); skips automatic indentation. */
export function backspace(run) {
  if (run.stopOnError || run.pos === 0 || isDone(run)) return null;
  const changed = [];
  if (run.pos < run.text.length) changed.push(run.pos);
  let auto = false;
  do {
    run.pos -= 1;
    auto = run.status[run.pos] === AUTO;
    run.status[run.pos] = PENDING;
    changed.push(run.pos);
  } while (auto && run.pos > 0);
  return { changed };
}

/** Characters the person typed correctly (automatic indentation does not count). */
export function correctChars(run) {
  let n = 0;
  for (let i = 0; i < run.pos; i++) if (run.status[i] === OK || run.status[i] === FIXED) n += 1;
  return n;
}

/** Words per minute: five characters are one word. */
export function wpm(chars, ms) {
  if (ms <= 0) return 0;
  return chars / 5 / (ms / 60000);
}

/** Share of keystrokes that were right, in per cent. */
export function accuracy(run) {
  if (run.keystrokes === 0) return 100;
  return ((run.keystrokes - run.errors) / run.keystrokes) * 100;
}

/** Live figures while typing. */
export function live(run, now) {
  const ms = run.startedAt ? Math.max(1, now - run.startedAt) : 0;
  return {
    wpm: ms ? wpm(correctChars(run), ms) : 0,
    accuracy: accuracy(run),
    progress: run.text.length ? run.pos / run.text.length : 0,
    ms,
  };
}

/** The result of a finished run. */
export function result(run) {
  const ms = Math.max(1, run.lastAt - run.startedAt);
  const chars = correctChars(run);
  return {
    wpm: Math.round(wpm(chars, ms) * 10) / 10,
    accuracy: Math.round(accuracy(run) * 100) / 100,
    chars: Math.max(1, chars),
    errors: run.errors,
    ms,
    keys: run.keys,
  };
}

/** Stars for a level: 1 = finished with 90 % accuracy, 2 = target speed at 94 %, 3 = 1.3 × target at 97 %. */
export function stars(res, target) {
  if (res.accuracy < 90) return 0;
  if (res.wpm >= target * 1.3 && res.accuracy >= 97) return 3;
  if (res.wpm >= target && res.accuracy >= 94) return 2;
  return 1;
}
