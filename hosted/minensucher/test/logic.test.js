import { describe, expect, it } from 'vitest';
import {
  chord,
  LEVELS,
  layMines,
  minesLeft,
  neighbors,
  newBoard,
  reveal,
  setMines,
  toggleFlag,
} from '../logic.js';

/** A predictable "random": the pool keeps its order. */
const keep = () => 0.999999;

function board(level = 'leicht') {
  return newBoard(level);
}

/** A wall of nine mines across the middle (row 4) and one more in the corner. */
const WALL = [36, 37, 38, 39, 40, 41, 42, 43, 44, 80];
function laid() {
  const b = board();
  setMines(b, WALL);
  return b;
}

describe('minensucher', () => {
  it('has three levels with the usual sizes', () => {
    expect(LEVELS.leicht).toMatchObject({ cols: 9, rows: 9, mines: 10 });
    expect(LEVELS.mittel).toMatchObject({ cols: 16, rows: 16, mines: 40 });
    expect(LEVELS.schwer).toMatchObject({ cols: 30, rows: 16, mines: 99 });
  });

  it('knows its neighbours at corners and edges', () => {
    const b = board();
    expect(neighbors(b, 0)).toHaveLength(3);
    expect(neighbors(b, 4)).toHaveLength(5);
    expect(neighbors(b, 40)).toHaveLength(8);
  });

  it('never puts a mine on the first click or next to it', () => {
    for (let n = 0; n < 50; n++) {
      const b = board();
      layMines(b, 40);
      expect(b.cells.filter((c) => c.mine)).toHaveLength(10);
      for (const i of [40, ...neighbors(b, 40)]) expect(b.cells[i].mine).toBe(false);
    }
  });

  it('counts the mines around each cell', () => {
    const b = board();
    layMines(b, 40, keep);
    for (const [i, cell] of b.cells.entries()) {
      expect(cell.count).toBe(neighbors(b, i).filter((n) => b.cells[n].mine).length);
    }
  });

  it('opens the empty area around a zero', () => {
    const b = laid();
    expect(reveal(b, 0)).toBe('open');
    expect(b.cells[0].open).toBe(true);
    expect(b.cells[0].count).toBe(0);
    expect(b.opened).toBeGreaterThan(9);
    expect(b.cells[63].open).toBe(false); // below the wall nothing is open yet
    expect(b.status).toBe('playing');
  });

  it('loses on a mine, shows the others and refuses more moves', () => {
    const b = laid();
    reveal(b, 0);
    const mine = 40;
    expect(reveal(b, mine)).toBe('boom');
    expect(b.status).toBe('lost');
    expect(b.exploded).toBe(mine);
    expect(b.cells.filter((c) => c.mine).every((c) => c.open)).toBe(true);
    expect(reveal(b, 0)).toBe('ignored');
    expect(toggleFlag(b, 0)).toBe(false);
  });

  it('wins when every safe cell is open and flags the mines', () => {
    const b = laid();
    reveal(b, 0);
    let last = 'open';
    for (const [i, c] of b.cells.entries()) if (!c.mine && !c.open) last = reveal(b, i);
    expect(last).toBe('won');
    expect(b.status).toBe('won');
    expect(minesLeft(b)).toBe(0);
    expect(b.cells.filter((c) => c.mine).every((c) => c.flag)).toBe(true);
  });

  it('flags only covered cells and keeps flagged cells closed', () => {
    const b = board();
    expect(toggleFlag(b, 3)).toBe(true);
    expect(minesLeft(b)).toBe(9);
    expect(reveal(b, 3)).toBe('ignored');
    expect(toggleFlag(b, 3)).toBe(true);
    expect(minesLeft(b)).toBe(10);
    const l = laid();
    reveal(l, 0);
    expect(toggleFlag(l, 0)).toBe(false);
  });

  it('chords: opens the neighbours of a number once its flags match', () => {
    const b = laid();
    expect(reveal(b, 31)).toBe('open'); // touches the mines 39, 40 and 41
    expect(b.cells[31].count).toBe(3);
    expect(chord(b, 31)).toBe('ignored'); // no flags yet
    for (const m of [39, 40, 41]) toggleFlag(b, m);
    expect(chord(b, 31)).toBe('open');
    expect(b.cells[30].open && b.cells[32].open).toBe(true);
    expect(b.status).toBe('playing');
  });

  it('a chord with a wrong flag loses', () => {
    const b = laid();
    reveal(b, 31);
    for (const m of [39, 40, 30]) toggleFlag(b, m); // 30 is safe, the mine 41 stays covered
    expect(chord(b, 31)).toBe('boom');
    expect(b.status).toBe('lost');
  });
});
