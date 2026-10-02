import { describe, expect, it } from 'vitest';
import {
  conflicts,
  countSolutions,
  generate,
  hasUniqueSolution,
  hint,
  isConsistent,
  newGame,
  placed,
  randomSolution,
  rate,
  setValue,
  solve,
  toggleNote,
  undo,
} from '../logic.js';

/** A small deterministic random source, so failures can be replayed. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const parse = (s) => [...s].map((c) => (c === '.' ? 0 : Number(c)));
// A classic puzzle that naked and hidden singles solve.
const EASY = parse(
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79',
);
const EASY_SOLUTION = parse(
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
);

describe('sudoku solver', () => {
  it('solves a puzzle and finds it unique', () => {
    expect(solve(EASY)).toEqual(EASY_SOLUTION);
    expect(hasUniqueSolution(EASY)).toBe(true);
  });

  it('counts two solutions for an empty grid and none for a broken one', () => {
    expect(countSolutions(new Array(81).fill(0), 2)).toBe(2);
    const broken = [...EASY];
    broken[2] = 5; // a second 5 in the first row
    expect(isConsistent(broken)).toBe(false);
    expect(countSolutions(broken)).toBe(0);
    expect(solve(broken)).toBeNull();
  });

  it('builds different valid full grids', () => {
    const a = randomSolution(seeded(1));
    const b = randomSolution(seeded(2));
    expect(isConsistent(a) && a.every(Boolean)).toBe(true);
    expect(a).not.toEqual(b);
  });
});

describe('sudoku rating', () => {
  it('rates a singles-only puzzle as 1 or 2', () => {
    expect(rate(EASY)).toBeLessThanOrEqual(2);
  });

  it('rates a nearly empty grid as beyond the techniques', () => {
    const sparse = new Array(81).fill(0);
    sparse[0] = 1;
    expect(rate(sparse)).toBe(5);
  });
});

describe('sudoku generator', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    it(`makes a unique puzzle of level ${level}`, () => {
      const random = seeded(level * 101);
      const made = generate(level, random);
      expect(made.level).toBe(level);
      expect(hasUniqueSolution(made.puzzle)).toBe(true);
      expect(solve(made.puzzle)).toEqual(made.solution);
      expect(rate(made.puzzle)).toBe(level);
    }, 20000);
  }

  it('gives easier puzzles more clues than harder ones', () => {
    const clues = (l) => generate(l, seeded(7)).puzzle.filter(Boolean).length;
    expect(clues(1)).toBeGreaterThan(clues(4));
  }, 20000);

  it('digs symmetrically', () => {
    const { puzzle } = generate(2, seeded(5));
    for (let i = 0; i < 81; i++) expect(Boolean(puzzle[i])).toBe(Boolean(puzzle[80 - i]));
  });
});

describe('sudoku game', () => {
  const fresh = () => newGame(EASY, EASY_SOLUTION);

  it('keeps the givens fixed', () => {
    const g = fresh();
    expect(setValue(g, 0, 9)).toBe(false);
    expect(g.values[0]).toBe(5);
  });

  it('places digits, flags repeats and undoes', () => {
    const g = fresh();
    expect(setValue(g, 2, 5)).toBe(true); // second 5 in row 1
    expect(conflicts(g).has(2) && conflicts(g).has(0)).toBe(true);
    expect(undo(g)).toBe(true);
    expect(g.values[2]).toBe(0);
    expect(conflicts(g).size).toBe(0);
    expect(undo(g)).toBe(false);
  });

  it('removes a placed digit from the notes of its peers, and undo brings them back', () => {
    const g = fresh();
    toggleNote(g, 3, 4);
    toggleNote(g, 3, 7);
    setValue(g, 2, 4);
    expect(g.notes[3]).toBe(1 << 6); // only the 7 is left
    undo(g);
    expect(g.notes[3]).toBe((1 << 3) | (1 << 6));
  });

  it('takes notes only on empty cells', () => {
    const g = fresh();
    expect(toggleNote(g, 0, 3)).toBe(false);
    expect(toggleNote(g, 2, 3)).toBe(true);
    expect(toggleNote(g, 2, 3)).toBe(true);
    expect(g.notes[2]).toBe(0);
  });

  it('wins when the last digit is set, then locks', () => {
    const g = fresh();
    const empty = EASY.flatMap((d, i) => (d ? [] : [i]));
    for (const i of empty) setValue(g, i, EASY_SOLUTION[i]);
    expect(g.status).toBe('won');
    expect(setValue(g, empty[0], 1)).toBe(false);
  });

  it('a hint fills the right digit and counts', () => {
    const g = fresh();
    expect(hint(g, 2)).toBe(4);
    expect(g.hints).toBe(1);
    expect(hint(g, 2)).toBe(0);
    expect(placed(g)[4]).toBeGreaterThan(0);
  });
});
