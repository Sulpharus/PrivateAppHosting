import { describe, expect, it } from 'vitest';
import { feedback, guess, LENGTH, MAX_GUESSES, newGame, randomCode, SYMBOLS } from '../logic.js';

describe('codeknacker feedback', () => {
  it('counts exact and near hits', () => {
    expect(feedback([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ exact: 4, near: 0 });
    expect(feedback([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ exact: 0, near: 4 });
    expect(feedback([0, 1, 2, 3], [0, 2, 1, 5])).toEqual({ exact: 1, near: 2 });
    expect(feedback([0, 1, 2, 3], [4, 4, 5, 5])).toEqual({ exact: 0, near: 0 });
  });

  it('never counts a symbol twice', () => {
    expect(feedback([1, 1, 2, 3], [1, 4, 1, 1])).toEqual({ exact: 1, near: 1 });
    expect(feedback([0, 0, 1, 1], [0, 0, 0, 0])).toEqual({ exact: 2, near: 0 });
    expect(feedback([0, 1, 2, 3], [0, 0, 0, 0])).toEqual({ exact: 1, near: 0 });
    expect(feedback([5, 5, 5, 0], [0, 5, 5, 5])).toEqual({ exact: 2, near: 2 });
  });
});

describe('codeknacker game', () => {
  it('makes codes of four symbols out of six', () => {
    for (let n = 0; n < 50; n++) {
      const code = randomCode();
      expect(code).toHaveLength(LENGTH);
      expect(code.every((s) => s >= 0 && s < SYMBOLS)).toBe(true);
    }
  });

  it('wins on the right guess', () => {
    const g = newGame();
    g.code = [1, 2, 3, 4];
    expect(guess(g, [0, 0, 0, 0])).toEqual({ exact: 0, near: 0 });
    expect(g.status).toBe('playing');
    expect(guess(g, [1, 2, 3, 4])).toEqual({ exact: 4, near: 0 });
    expect(g.status).toBe('won');
    expect(g.guesses).toHaveLength(2);
    expect(guess(g, [0, 0, 0, 0])).toBeNull();
  });

  it('loses after the last guess', () => {
    const g = newGame();
    g.code = [0, 0, 0, 0];
    for (let n = 0; n < MAX_GUESSES; n++) guess(g, [1, 1, 1, 1]);
    expect(g.status).toBe('lost');
    expect(g.guesses).toHaveLength(MAX_GUESSES);
  });

  it('rejects incomplete or invalid guesses', () => {
    const g = newGame();
    expect(guess(g, [0, 1, 2])).toBeNull();
    expect(guess(g, [0, 1, 2, 9])).toBeNull();
    expect(guess(g, [0, 1, 2, 1.5])).toBeNull();
    expect(g.guesses).toHaveLength(0);
  });
});
