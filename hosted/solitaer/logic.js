// Solitaer (Klondike, draw one): the rules without any DOM, so they are tested on their own.
// A card is { s: suit 0..3 (spades, hearts, diamonds, clubs), r: rank 1..13, up: face up }.
// Names of suits and ranks belong to the language packages (suit.<s>, rank.<r>).
//
// Scoring: waste to tableau +5, any card to a foundation +10, turning over a tableau card +5,
// a card from a foundation back to the tableau -15. The score never drops below 0.

export const SUITS = ['♠', '♥', '♦', '♣'];

export const isRed = (card) => card.s === 1 || card.s === 2;

export function deck() {
  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ s, r, up: false });
  return cards;
}

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newDeal(random = Math.random) {
  const cards = shuffle(deck(), random);
  const tableau = [];
  for (let i = 0; i < 7; i++) {
    const pile = cards.splice(0, i + 1);
    pile[i].up = true;
    tableau.push(pile);
  }
  return {
    stock: cards,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    score: 0,
    moves: 0,
    status: 'playing',
    history: [],
  };
}

const snapshot = (g) => ({
  stock: structuredClone(g.stock),
  waste: structuredClone(g.waste),
  foundations: structuredClone(g.foundations),
  tableau: structuredClone(g.tableau),
  score: g.score,
  moves: g.moves,
});

export function undo(g) {
  const last = g.history.pop();
  if (!last || g.status !== 'playing') return false;
  Object.assign(g, last);
  return true;
}

const bump = (g, points) => {
  g.score = Math.max(0, g.score + points);
};

/** Turns the next stock card onto the waste; an empty stock takes the waste back. */
export function draw(g) {
  if (g.status !== 'playing' || (!g.stock.length && !g.waste.length)) return false;
  g.history.push(snapshot(g));
  if (g.stock.length) {
    const card = g.stock.pop();
    card.up = true;
    g.waste.push(card);
  } else {
    g.stock = g.waste.reverse().map((c) => ({ ...c, up: false }));
    g.waste = [];
  }
  g.moves++;
  return true;
}

export function canFoundation(g, card) {
  const pile = g.foundations[card.s];
  return card.r === pile.length + 1;
}

export function canTableau(g, card, i) {
  const pile = g.tableau[i];
  if (!pile.length) return card.r === 13;
  const top = pile[pile.length - 1];
  return top.up && isRed(top) !== isRed(card) && top.r === card.r + 1;
}

/** The cards a source would move, or null when it cannot be picked up. */
export function cardsAt(g, src) {
  if (src.pile === 'w') return g.waste.length ? [g.waste[g.waste.length - 1]] : null;
  if (src.pile === 'f') {
    const pile = g.foundations[src.i];
    return pile.length ? [pile[pile.length - 1]] : null;
  }
  const cards = g.tableau[src.i].slice(src.from);
  return cards.length && cards.every((c) => c.up) ? cards : null;
}

/**
 * Moves a card or a run. src: { pile: 'w' } | { pile: 'f', i } | { pile: 't', i, from }.
 * dst: { pile: 'f' } (the card's own suit pile) | { pile: 't', i }. True when it was legal.
 */
export function move(g, src, dst) {
  if (g.status !== 'playing') return false;
  const cards = cardsAt(g, src);
  if (!cards) return false;
  const first = cards[0];
  if (dst.pile === 'f') {
    if (cards.length !== 1 || src.pile === 'f' || !canFoundation(g, first)) return false;
  } else if (
    dst.pile !== 't' ||
    (src.pile === 't' && src.i === dst.i) ||
    !canTableau(g, first, dst.i)
  ) {
    return false;
  }

  g.history.push(snapshot(g));
  if (src.pile === 'w') g.waste.pop();
  else if (src.pile === 'f') g.foundations[src.i].pop();
  else g.tableau[src.i].splice(src.from, cards.length);

  if (dst.pile === 'f') {
    g.foundations[first.s].push(first);
    bump(g, 10);
  } else {
    g.tableau[dst.i].push(...cards);
    if (src.pile === 'w') bump(g, 5);
    else if (src.pile === 'f') bump(g, -15);
  }
  if (src.pile === 't') {
    const pile = g.tableau[src.i];
    const top = pile[pile.length - 1];
    if (top && !top.up) {
      top.up = true;
      bump(g, 5);
    }
  }
  g.moves++;
  if (g.foundations.every((p) => p.length === 13)) g.status = 'won';
  return true;
}

/** Where a tapped card goes by itself: its foundation when possible, else null. */
export function foundationMove(g, src) {
  const cards = cardsAt(g, src);
  if (cards?.length !== 1 || src.pile === 'f') return null;
  return canFoundation(g, cards[0]) ? { pile: 'f' } : null;
}

/** The first tableau pile that takes the run (used when a card is tapped twice). */
export function tableauMove(g, src) {
  const cards = cardsAt(g, src);
  if (!cards) return null;
  for (let i = 0; i < 7; i++) {
    if (src.pile === 't' && src.i === i) continue;
    // A king that already sits at the bottom of its pile gains nothing from moving.
    if (src.pile === 't' && src.from === 0 && cards[0].r === 13 && !g.tableau[i].length) continue;
    if (canTableau(g, cards[0], i)) return { pile: 't', i };
  }
  return null;
}

/** True when nothing is hidden or waiting any more: the rest is a matter of moving cards up. */
export function canAutoFinish(g) {
  return (
    g.status === 'playing' &&
    !g.stock.length &&
    !g.waste.length &&
    g.tableau.every((p) => p.every((c) => c.up))
  );
}

/** One move to a foundation from a tableau top or the waste. False when none is left. */
export function autoStep(g) {
  const sources = [
    { pile: 'w' },
    ...g.tableau.map((p, i) => ({ pile: 't', i, from: p.length - 1 })),
  ];
  for (const src of sources) {
    if (src.pile === 't' && src.from < 0) continue;
    const dst = foundationMove(g, src);
    if (dst && move(g, src, dst)) return true;
  }
  return false;
}
