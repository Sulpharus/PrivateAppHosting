import { describe, expect, it } from 'vitest';
import { best, canMove, newGame, play, slide, slideLine, spawn } from '../logic.js';

describe('2048 sliding', () => {
  it('slides and merges towards the front', () => {
    expect(slideLine([2, 0, 2, 0])).toEqual({ line: [4, 0, 0, 0], gained: 4 });
    expect(slideLine([0, 0, 0, 2]).line).toEqual([2, 0, 0, 0]);
  });

  it('merges a tile only once per move', () => {
    expect(slideLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], gained: 8 });
    expect(slideLine([4, 2, 2, 0]).line).toEqual([4, 4, 0, 0]);
    expect(slideLine([2, 2, 4, 0]).line).toEqual([4, 4, 0, 0]);
  });

  it('plays all four directions', () => {
    const b = new Array(16).fill(0);
    b[5] = 2;
    b[6] = 2;
    expect(slide(b, 'left').board[4]).toBe(4);
    expect(slide(b, 'right').board[7]).toBe(4);
    const c = new Array(16).fill(0);
    c[1] = 8;
    c[9] = 8;
    expect(slide(c, 'up').board[1]).toBe(16);
    expect(slide(c, 'down').board[13]).toBe(16);
  });

  it('reports a move that changes nothing as not moved', () => {
    const b = new Array(16).fill(0);
    b[0] = 2;
    expect(slide(b, 'left').moved).toBe(false);
    expect(slide(b, 'down').moved).toBe(true);
  });
});

describe('2048 game', () => {
  it('starts with two tiles of 2 or 4', () => {
    const g = newGame();
    const tiles = g.board.filter(Boolean);
    expect(tiles).toHaveLength(2);
    expect(tiles.every((v) => v === 2 || v === 4)).toBe(true);
  });

  it('adds a tile after every move that moved and ignores one that did not', () => {
    const g = newGame(() => 0);
    g.board = new Array(16).fill(0);
    g.board[3] = 2;
    expect(play(g, 'right', () => 0)).toBeNull();
    expect(g.moves).toBe(0);
    expect(play(g, 'left', () => 0)).not.toBeNull();
    expect(g.board.filter(Boolean)).toHaveLength(2);
    expect(g.moves).toBe(1);
  });

  it('counts the merged value as score', () => {
    const g = newGame();
    g.board = new Array(16).fill(0);
    g.board[0] = 1024;
    g.board[1] = 1024;
    play(g, 'left');
    expect(g.score).toBe(2048);
    expect(best(g.board)).toBe(2048);
  });

  it('ends when the board is full and nothing merges', () => {
    const g = newGame();
    g.board = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 0, 4, 2, 8];
    expect(canMove(g.board)).toBe(true);
    // Sliding left leaves one empty cell; the new tile fills it and nothing can merge.
    const result = play(g, 'left', () => 0);
    expect(result).not.toBeNull();
    expect(g.over).toBe(true);
    expect(play(g, 'left')).toBeNull();
  });

  it('spawn returns -1 on a full board', () => {
    expect(spawn(new Array(16).fill(2))).toBe(-1);
  });
});
