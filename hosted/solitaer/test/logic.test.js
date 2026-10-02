import { describe, expect, it } from 'vitest';
import {
  autoStep,
  canAutoFinish,
  cardsAt,
  deck,
  draw,
  foundationMove,
  move,
  newDeal,
  tableauMove,
  undo,
} from '../logic.js';

const c = (s, r, up = true) => ({ s, r, up });
const empty = () => {
  const g = newDeal(() => 0.5);
  g.stock = [];
  g.waste = [];
  g.foundations = [[], [], [], []];
  g.tableau = [[], [], [], [], [], [], []];
  g.score = 0;
  g.moves = 0;
  g.history = [];
  return g;
};

describe('solitaer deal', () => {
  it('deals 28 cards to seven piles and keeps 24 in the stock', () => {
    const g = newDeal();
    expect(g.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.stock).toHaveLength(24);
    for (const pile of g.tableau) {
      expect(pile.filter((x) => x.up)).toHaveLength(1);
      expect(pile[pile.length - 1].up).toBe(true);
    }
    const all = [...g.stock, ...g.tableau.flat()];
    expect(new Set(all.map((x) => `${x.s}-${x.r}`)).size).toBe(52);
    expect(deck()).toHaveLength(52);
  });
});

describe('solitaer stock', () => {
  it('draws one card face up and recycles the waste', () => {
    const g = empty();
    g.stock = [c(0, 1, false), c(1, 2, false)];
    expect(draw(g)).toBe(true);
    expect(g.waste).toEqual([c(1, 2, true)]);
    draw(g);
    expect(g.stock).toHaveLength(0);
    expect(draw(g)).toBe(true); // recycle
    expect(g.stock.map((x) => [x.s, x.r, x.up])).toEqual([
      [0, 1, false],
      [1, 2, false],
    ]);
    expect(g.waste).toHaveLength(0);
  });

  it('cannot draw from nothing', () => {
    expect(draw(empty())).toBe(false);
  });
});

describe('solitaer moves', () => {
  it('builds down in alternating colours', () => {
    const g = empty();
    g.tableau[0] = [c(0, 7)]; // black 7
    g.tableau[1] = [c(1, 6)]; // red 6
    g.tableau[2] = [c(3, 6)]; // black 6
    expect(move(g, { pile: 't', i: 2, from: 0 }, { pile: 't', i: 0 })).toBe(false);
    expect(move(g, { pile: 't', i: 1, from: 0 }, { pile: 't', i: 0 })).toBe(true);
    expect(g.tableau[0]).toHaveLength(2);
    expect(g.moves).toBe(1);
  });

  it('moves a run together and turns over the card below (+5)', () => {
    const g = empty();
    g.tableau[0] = [c(2, 9, false), c(0, 5), c(1, 4)];
    g.tableau[1] = [c(1, 6)];
    expect(move(g, { pile: 't', i: 0, from: 1 }, { pile: 't', i: 1 })).toBe(true);
    expect(g.tableau[1].map((x) => x.r)).toEqual([6, 5, 4]);
    expect(g.tableau[0][0].up).toBe(true);
    expect(g.score).toBe(5);
  });

  it('cannot pick up a face-down card', () => {
    const g = empty();
    g.tableau[0] = [c(0, 9, false), c(1, 8)];
    expect(cardsAt(g, { pile: 't', i: 0, from: 0 })).toBeNull();
  });

  it('puts only kings on an empty pile', () => {
    const g = empty();
    g.tableau[0] = [c(0, 12)];
    g.tableau[1] = [c(1, 13)];
    expect(move(g, { pile: 't', i: 0, from: 0 }, { pile: 't', i: 2 })).toBe(false);
    expect(move(g, { pile: 't', i: 1, from: 0 }, { pile: 't', i: 2 })).toBe(true);
  });

  it('builds the foundations by suit from the ace (+10)', () => {
    const g = empty();
    g.tableau[0] = [c(2, 2)];
    g.tableau[1] = [c(2, 1)];
    expect(move(g, { pile: 't', i: 0, from: 0 }, { pile: 'f' })).toBe(false);
    expect(move(g, { pile: 't', i: 1, from: 0 }, { pile: 'f' })).toBe(true);
    expect(move(g, { pile: 't', i: 0, from: 0 }, { pile: 'f' })).toBe(true);
    expect(g.foundations[2]).toHaveLength(2);
    expect(g.score).toBe(20);
  });

  it('scores waste to tableau +5 and foundation back -15, never below zero', () => {
    const g = empty();
    g.tableau[0] = [c(0, 7)];
    g.waste = [c(1, 6)];
    move(g, { pile: 'w' }, { pile: 't', i: 0 });
    expect(g.score).toBe(5);
    const h = empty();
    h.foundations[1] = [c(1, 1)];
    h.tableau[0] = [c(0, 2)];
    expect(move(h, { pile: 'f', i: 1 }, { pile: 't', i: 0 })).toBe(true);
    expect(h.score).toBe(0);
  });

  it('finds the foundation and the tableau for a tapped card', () => {
    const g = empty();
    g.waste = [c(1, 1)];
    expect(foundationMove(g, { pile: 'w' })).toEqual({ pile: 'f' });
    g.waste = [c(1, 6)];
    g.tableau[3] = [c(0, 7)];
    expect(tableauMove(g, { pile: 'w' })).toEqual({ pile: 't', i: 3 });
  });

  it('undoes a move with its score and flipped card', () => {
    const g = empty();
    g.tableau[0] = [c(2, 9, false), c(0, 5)];
    g.tableau[1] = [c(1, 6)];
    move(g, { pile: 't', i: 0, from: 1 }, { pile: 't', i: 1 });
    expect(undo(g)).toBe(true);
    expect(g.tableau[0][0].up).toBe(false);
    expect(g.tableau[1]).toHaveLength(1);
    expect(g.score).toBe(0);
    expect(g.moves).toBe(0);
    expect(undo(g)).toBe(false);
  });
});

describe('solitaer ending', () => {
  it('finishes by itself once everything is face up and wins', () => {
    const g = empty();
    for (let s = 0; s < 4; s++) {
      for (let r = 1; r <= 13; r++) g.tableau[s].push(c(s, 14 - r)); // each suit as a run K..A
    }
    expect(canAutoFinish(g)).toBe(true);
    let steps = 0;
    while (autoStep(g) && steps < 100) steps++;
    expect(steps).toBe(52);
    expect(g.status).toBe('won');
    expect(move(g, { pile: 'w' }, { pile: 'f' })).toBe(false);
  });

  it('is not offered while a card is hidden or the stock is full', () => {
    const g = empty();
    g.tableau[0] = [c(0, 5, false), c(1, 4)];
    expect(canAutoFinish(g)).toBe(false);
    const h = empty();
    h.stock = [c(0, 1, false)];
    expect(canAutoFinish(h)).toBe(false);
  });
});
