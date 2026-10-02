// Sudoku: solver, difficulty rating, generator and the game state. No DOM, so it also runs in the
// generator worker and in the tests. A grid is an array of 81 numbers, 0 = empty, row by row.
//
// Difficulty is rated by the techniques a person needs, not by the number of clues:
//   1 naked singles                      4 + hidden pairs, naked triples, X-Wing
//   2 + hidden singles                   5 needs more than level 4 (guessing or chains)
//   3 + locked candidates, naked pairs
// The generator digs holes into a random solution one symmetric pair at a time and keeps a hole
// only while the solution stays unique and the puzzle stays at or below the wanted level.

export const LEVELS = {
  1: { label: 'Sehr leicht', clues: 40 },
  2: { label: 'Leicht', clues: 34 },
  3: { label: 'Mittel' },
  4: { label: 'Schwer' },
  5: { label: 'Extrem' },
};

const ALL = 0x1ff;
const bit = (d) => 1 << (d - 1);
const count = (m) => {
  let n = 0;
  for (let x = m; x; x &= x - 1) n++;
  return n;
};
const digitsOf = (m) => {
  const out = [];
  for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d);
  return out;
};

export const row = (i) => Math.floor(i / 9);
export const col = (i) => i % 9;
export const box = (i) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const cells = [];
  for (let k = 0; k < 9; k++)
    cells.push((Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3));
  UNITS.push(cells);
}
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const set = new Set();
  for (const unit of UNITS) if (unit.includes(i)) for (const j of unit) if (j !== i) set.add(j);
  return [...set];
});

/** Fisher-Yates with the given random source (() => [0, 1)). */
export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** True when no digit repeats in a row, column or box. */
export function isConsistent(grid) {
  for (const unit of UNITS) {
    let seen = 0;
    for (const i of unit) {
      const d = grid[i];
      if (!d) continue;
      if (seen & bit(d)) return false;
      seen |= bit(d);
    }
  }
  return true;
}

// ---- backtracking solver ---------------------------------------------------------------

function masksOf(grid) {
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const d = grid[i];
    if (!d) continue;
    rows[row(i)] |= bit(d);
    cols[col(i)] |= bit(d);
    boxes[box(i)] |= bit(d);
  }
  return { rows, cols, boxes };
}

/**
 * Counts solutions up to `limit`. With `random`, digits are tried in random order and the first
 * solution found is copied into `out` (used to build full grids).
 */
export function countSolutions(grid, limit = 2, random = null, out = null) {
  const g = [...grid];
  const { rows, cols, boxes } = masksOf(g);
  let found = 0;
  const go = () => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const free = ALL & ~(rows[row(i)] | cols[col(i)] | boxes[box(i)]);
      const n = count(free);
      if (n < bestCount) {
        best = i;
        bestMask = free;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      found++;
      if (out && found === 1) for (let i = 0; i < 81; i++) out[i] = g[i];
      return found >= limit;
    }
    if (bestCount === 0) return false;
    const options = random ? shuffle(digitsOf(bestMask), random) : digitsOf(bestMask);
    for (const d of options) {
      g[best] = d;
      rows[row(best)] |= bit(d);
      cols[col(best)] |= bit(d);
      boxes[box(best)] |= bit(d);
      const stop = go();
      rows[row(best)] &= ~bit(d);
      cols[col(best)] &= ~bit(d);
      boxes[box(best)] &= ~bit(d);
      g[best] = 0;
      if (stop) return true;
    }
    return false;
  };
  if (isConsistent(g)) go();
  return found;
}

/** The solved grid, or null when there is none. */
export function solve(grid) {
  const out = new Array(81).fill(0);
  return countSolutions(grid, 1, null, out) === 1 ? out : null;
}

export const hasUniqueSolution = (grid) => countSolutions(grid, 2) === 1;

export function randomSolution(random = Math.random) {
  const out = new Array(81).fill(0);
  countSolutions(new Array(81).fill(0), 1, random, out);
  return out;
}

// ---- technique solver (the rating) -------------------------------------------------------

function start(grid) {
  const values = [...grid];
  const cand = new Array(81).fill(0);
  const s = { values, cand };
  for (let i = 0; i < 81; i++) cand[i] = values[i] ? 0 : ALL;
  for (let i = 0; i < 81; i++) {
    if (values[i]) for (const j of PEERS[i]) cand[j] &= ~bit(values[i]);
  }
  return s;
}

function place(s, i, d) {
  s.values[i] = d;
  s.cand[i] = 0;
  for (const j of PEERS[i]) s.cand[j] &= ~bit(d);
}

function nakedSingle(s) {
  for (let i = 0; i < 81; i++) {
    if (!s.values[i] && count(s.cand[i]) === 1) {
      place(s, i, digitsOf(s.cand[i])[0]);
      return true;
    }
  }
  return false;
}

function hiddenSingle(s) {
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      let only = -1;
      let n = 0;
      for (const i of unit) {
        if (!s.values[i] && s.cand[i] & bit(d)) {
          only = i;
          n++;
        }
      }
      if (n === 1) {
        place(s, only, d);
        return true;
      }
    }
  }
  return false;
}

function eliminate(s, cells, mask) {
  let changed = false;
  for (const i of cells) {
    if (!s.values[i] && s.cand[i] & mask) {
      s.cand[i] &= ~mask;
      changed = true;
    }
  }
  return changed;
}

function lockedCandidates(s) {
  for (let b = 18; b < 27; b++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[b].filter((i) => !s.values[i] && s.cand[i] & bit(d));
      if (spots.length < 2) continue;
      // Pointing: all in one row or column of the box.
      if (spots.every((i) => row(i) === row(spots[0]))) {
        const others = UNITS[row(spots[0])].filter((i) => box(i) !== b - 18);
        if (eliminate(s, others, bit(d))) return true;
      }
      if (spots.every((i) => col(i) === col(spots[0]))) {
        const others = UNITS[9 + col(spots[0])].filter((i) => box(i) !== b - 18);
        if (eliminate(s, others, bit(d))) return true;
      }
    }
  }
  // Claiming: all in one box of a row or column.
  for (let u = 0; u < 18; u++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter((i) => !s.values[i] && s.cand[i] & bit(d));
      if (spots.length < 2) continue;
      if (spots.every((i) => box(i) === box(spots[0]))) {
        const others = UNITS[18 + box(spots[0])].filter((i) => !UNITS[u].includes(i));
        if (eliminate(s, others, bit(d))) return true;
      }
    }
  }
  return false;
}

function combos(list, size) {
  const out = [];
  const go = (from, picked) => {
    if (picked.length === size) {
      out.push([...picked]);
      return;
    }
    for (let k = from; k < list.length; k++) {
      picked.push(list[k]);
      go(k + 1, picked);
      picked.pop();
    }
  };
  go(0, []);
  return out;
}

function nakedSubset(s, size) {
  for (const unit of UNITS) {
    const open = unit.filter(
      (i) => !s.values[i] && count(s.cand[i]) >= 2 && count(s.cand[i]) <= size,
    );
    for (const group of combos(open, size)) {
      const union = group.reduce((m, i) => m | s.cand[i], 0);
      if (count(union) !== size) continue;
      const rest = unit.filter((i) => !group.includes(i));
      if (eliminate(s, rest, union)) return true;
    }
  }
  return false;
}

function hiddenPair(s) {
  for (const unit of UNITS) {
    const where = new Map();
    for (let d = 1; d <= 9; d++) {
      const spots = unit.filter((i) => !s.values[i] && s.cand[i] & bit(d));
      if (spots.length === 2) where.set(d, spots);
    }
    const digits = [...where.keys()];
    for (let a = 0; a < digits.length; a++) {
      for (let b = a + 1; b < digits.length; b++) {
        const [x, y] = [where.get(digits[a]), where.get(digits[b])];
        if (x[0] !== y[0] || x[1] !== y[1]) continue;
        const keep = bit(digits[a]) | bit(digits[b]);
        let changed = false;
        for (const i of x) {
          if (s.cand[i] & ~keep) {
            s.cand[i] &= keep;
            changed = true;
          }
        }
        if (changed) return true;
      }
    }
  }
  return false;
}

function xWing(s) {
  for (let d = 1; d <= 9; d++) {
    for (const byRow of [true, false]) {
      const lines = [];
      for (let k = 0; k < 9; k++) {
        const unit = UNITS[(byRow ? 0 : 9) + k];
        const spots = unit
          .filter((i) => !s.values[i] && s.cand[i] & bit(d))
          .map((i) => (byRow ? col(i) : row(i)));
        if (spots.length === 2) lines.push({ k, spots });
      }
      for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
          if (lines[a].spots[0] !== lines[b].spots[0] || lines[a].spots[1] !== lines[b].spots[1])
            continue;
          let changed = false;
          for (const across of lines[a].spots) {
            const unit = UNITS[(byRow ? 9 : 0) + across];
            const others = unit.filter(
              (i) =>
                (byRow ? row(i) : col(i)) !== lines[a].k &&
                (byRow ? row(i) : col(i)) !== lines[b].k,
            );
            if (eliminate(s, others, bit(d))) changed = true;
          }
          if (changed) return true;
        }
      }
    }
  }
  return false;
}

const TECHNIQUES = [
  [1, nakedSingle],
  [2, hiddenSingle],
  [3, lockedCandidates],
  [3, (s) => nakedSubset(s, 2)],
  [4, hiddenPair],
  [4, (s) => nakedSubset(s, 3)],
  [4, xWing],
];

/** The hardest technique level needed to solve the puzzle (1..4), or 5 when these do not suffice. */
export function rate(grid) {
  const s = start(grid);
  let hardest = 1;
  for (;;) {
    if (s.values.every(Boolean)) return hardest;
    let moved = false;
    for (const [level, run] of TECHNIQUES) {
      if (run(s)) {
        hardest = Math.max(hardest, level);
        moved = true;
        break;
      }
    }
    if (!moved) return 5;
  }
}

// ---- generator ---------------------------------------------------------------------------

function dig(solution, level, random) {
  const puzzle = [...solution];
  // Easy levels stop at a friendly number of clues; harder ones dig until nothing more can go.
  const target = level <= 2 ? LEVELS[level].clues : 0;
  let clues = 81;
  const order = shuffle(
    Array.from({ length: 41 }, (_, i) => i),
    random,
  );
  for (const i of order) {
    if (clues <= target) break;
    const mirror = 80 - i;
    const pair = i === mirror ? [i] : [i, mirror];
    const backup = pair.map((j) => puzzle[j]);
    for (const j of pair) puzzle[j] = 0;
    const ok = hasUniqueSolution(puzzle) && (level === 5 || rate(puzzle) <= level);
    if (ok) clues -= pair.length;
    else
      pair.forEach((j, k) => {
        puzzle[j] = backup[k];
      });
  }
  return puzzle;
}

/**
 * A puzzle of the wanted level with exactly one solution. Tries up to `attempts` random solutions
 * and returns the first puzzle that is rated exactly `level`; when none is, the closest one found
 * (its real rating is in `level`).
 */
export function generate(level, random = Math.random, attempts = 400) {
  let best = null;
  for (let n = 0; n < attempts; n++) {
    const solution = randomSolution(random);
    const puzzle = dig(solution, level, random);
    const rated = rate(puzzle);
    const result = { puzzle, solution, level: rated, wanted: level };
    if (rated === level) return result;
    if (!best || Math.abs(rated - level) < Math.abs(best.level - level)) best = result;
  }
  return best;
}

// ---- game state --------------------------------------------------------------------------

/** Notes are a bit mask per cell (bit d-1 = digit d). */
export function newGame(puzzle, solution) {
  return {
    givens: puzzle.map(Boolean),
    values: [...puzzle],
    notes: new Array(81).fill(0),
    solution,
    history: [],
    hints: 0,
    status: 'playing',
  };
}

const snap = (g, i) => ({
  i,
  value: g.values[i],
  notes: g.notes[i],
  peers: PEERS[i].map((j) => [j, g.notes[j]]),
});

/** Sets a digit (0 clears). Placing a digit removes it from the notes of its peers. */
export function setValue(g, i, d) {
  if (g.status !== 'playing' || g.givens[i] || g.values[i] === d) return false;
  g.history.push(snap(g, i));
  g.values[i] = d;
  g.notes[i] = 0;
  if (d) for (const j of PEERS[i]) g.notes[j] &= ~bit(d);
  if (isSolved(g)) g.status = 'won';
  return true;
}

export function toggleNote(g, i, d) {
  if (g.status !== 'playing' || g.givens[i] || g.values[i]) return false;
  g.history.push(snap(g, i));
  g.notes[i] ^= bit(d);
  return true;
}

export function undo(g) {
  const last = g.history.pop();
  if (!last) return false;
  g.values[last.i] = last.value;
  g.notes[last.i] = last.notes;
  for (const [j, notes] of last.peers) g.notes[j] = notes;
  g.status = 'playing';
  return true;
}

export const noteDigits = (g, i) => digitsOf(g.notes[i]);

/** Cells whose digit repeats in a row, column or box. */
export function conflicts(g) {
  const bad = new Set();
  for (const unit of UNITS) {
    const at = new Map();
    for (const i of unit) {
      const d = g.values[i];
      if (!d) continue;
      if (at.has(d)) {
        bad.add(i);
        bad.add(at.get(d));
      } else at.set(d, i);
    }
  }
  return bad;
}

export function isSolved(g) {
  return g.values.every((d, i) => d === g.solution[i]);
}

/** How many of each digit are placed (for dimming finished digits on the pad). */
export function placed(g) {
  const n = new Array(10).fill(0);
  for (const d of g.values) if (d) n[d]++;
  return n;
}

/** Fills the cell with its solution digit. Returns the digit, or 0 when nothing can be filled. */
export function hint(g, i) {
  if (g.status !== 'playing' || g.givens[i] || g.values[i] === g.solution[i]) return 0;
  setValue(g, i, g.solution[i]);
  g.hints++;
  return g.solution[i];
}

export const DIGITS_OF = digitsOf;
