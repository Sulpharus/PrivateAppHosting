// Codeknacker (Mastermind): the rules without any DOM. A code is LENGTH symbols out of SYMBOLS
// (numbers 0..5), repeats allowed. The feedback for a guess is "exact" (right symbol, right place)
// and "near" (right symbol, wrong place), counted the usual way so a symbol is never counted twice.

export const SYMBOLS = 6;
export const LENGTH = 4;
export const MAX_GUESSES = 10;

export function randomCode(random = Math.random) {
  return Array.from({ length: LENGTH }, () => Math.floor(random() * SYMBOLS));
}

export function feedback(code, guess) {
  let exact = 0;
  const left = new Array(SYMBOLS).fill(0);
  const open = new Array(SYMBOLS).fill(0);
  for (let i = 0; i < LENGTH; i++) {
    if (code[i] === guess[i]) exact++;
    else {
      left[code[i]]++;
      open[guess[i]]++;
    }
  }
  let near = 0;
  for (let s = 0; s < SYMBOLS; s++) near += Math.min(left[s], open[s]);
  return { exact, near };
}

export function newGame(random = Math.random) {
  return { code: randomCode(random), guesses: [], status: 'playing' };
}

/** Plays a guess. Returns its feedback, or null when it is not a full valid guess or the round is over. */
export function guess(g, symbols) {
  if (g.status !== 'playing' || symbols.length !== LENGTH) return null;
  if (!symbols.every((s) => Number.isInteger(s) && s >= 0 && s < SYMBOLS)) return null;
  const result = feedback(g.code, symbols);
  g.guesses.push({ symbols: [...symbols], ...result });
  if (result.exact === LENGTH) g.status = 'won';
  else if (g.guesses.length >= MAX_GUESSES) g.status = 'lost';
  return result;
}
