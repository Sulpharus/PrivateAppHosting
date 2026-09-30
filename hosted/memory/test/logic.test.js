import { describe, expect, it } from 'vitest';
import { flip, foundPairs, hideMisses, newGame, PAIRS, shuffle } from '../logic.js';

// A fixed "random" so the deck order is known: shuffle keeps the order with random() = 0.999.
const keep = () => 0.999999;

describe('memory rules', () => {
  it('deals every shape twice', () => {
    const game = newGame();
    expect(game.cards).toHaveLength(PAIRS * 2);
    const counts = {};
    for (const c of game.cards) counts[c.shape] = (counts[c.shape] ?? 0) + 1;
    expect(Object.values(counts).every((n) => n === 2)).toBe(true);
    expect(shuffle([1, 2, 3], keep)).toEqual([1, 2, 3]);
  });

  it('counts moves, keeps matches open and hides misses', () => {
    let s = newGame(keep); // circle, circle, square, square, …
    let r = flip(s, 0);
    expect(r.event).toBe('first');
    r = flip(r.state, 2);
    expect(r.event).toBe('miss');
    expect(r.state.moves).toBe(1);
    expect(flip(r.state, 4).event).toBe('ignored');
    s = hideMisses(r.state);
    expect(s.cards[0].open).toBe(false);
    r = flip(flip(s, 0).state, 1);
    expect(r.event).toBe('match');
    expect(foundPairs(r.state)).toBe(1);
    expect(flip(r.state, 0).event).toBe('ignored');
  });

  it('reports the win after the last pair', () => {
    let s = newGame(keep);
    let last;
    for (let i = 0; i < PAIRS * 2; i += 2) {
      last = flip(flip(s, i).state, i + 1);
      s = last.state;
    }
    expect(last.event).toBe('won');
    expect(s.moves).toBe(PAIRS);
  });
});
