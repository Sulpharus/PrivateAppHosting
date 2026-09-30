// Memory rules without any DOM: a shuffled deck of pairs and the state after each flip.

export const PAIRS = 8;
export const SHAPES = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'star',
  'heart',
  'hexagon',
  'cross',
];

/** Fisher–Yates with crypto randomness (fair shuffles, see the game type rules). */
export function shuffle(list, random = cryptoRandom) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function cryptoRandom() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

export function newGame(random) {
  const deck = shuffle(
    SHAPES.slice(0, PAIRS).flatMap((shape) => [shape, shape]),
    random,
  );
  return {
    cards: deck.map((shape) => ({ shape, open: false, found: false })),
    picked: [],
    moves: 0,
  };
}

/**
 * Flips card `i`. Returns the next state and what happened: 'ignored' (already open or two cards
 * showing), 'first', 'match', 'miss' (the two cards stay open until `hideMisses`) or 'won'.
 */
export function flip(state, i) {
  const card = state.cards[i];
  if (!card || card.open || card.found || state.picked.length === 2)
    return { state, event: 'ignored' };
  const cards = state.cards.map((c, k) => (k === i ? { ...c, open: true } : c));
  const picked = [...state.picked, i];
  if (picked.length === 1) return { state: { ...state, cards, picked }, event: 'first' };
  const moves = state.moves + 1;
  const [a, b] = picked;
  if (cards[a].shape === cards[b].shape) {
    const done = cards.map((c, k) => (k === a || k === b ? { ...c, found: true } : c));
    const won = done.every((c) => c.found);
    return { state: { cards: done, picked: [], moves }, event: won ? 'won' : 'match' };
  }
  return { state: { cards, picked, moves }, event: 'miss' };
}

/** Turns the two unmatched cards face down again. */
export function hideMisses(state) {
  return {
    ...state,
    cards: state.cards.map((c, k) =>
      state.picked.includes(k) && !c.found ? { ...c, open: false } : c,
    ),
    picked: [],
  };
}

export const foundPairs = (state) => state.cards.filter((c) => c.found).length / 2;
