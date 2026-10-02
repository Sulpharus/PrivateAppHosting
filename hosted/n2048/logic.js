// 2048: the rules without any DOM. The board is 16 numbers (0 = empty), row by row; a tile is its
// value (2, 4, 8, ...). A move slides everything one way, merging equal neighbours once per move.

export const SIZE = 4;

export function newBoard() {
  return new Array(SIZE * SIZE).fill(0);
}

/** Slides one line towards index 0 and merges. Returns the new line and the points gained. */
export function slideLine(line) {
  const tiles = line.filter(Boolean);
  const out = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tiles[i + 1]) {
      out.push(tiles[i] * 2);
      gained += tiles[i] * 2;
      i++;
    } else out.push(tiles[i]);
  }
  while (out.length < SIZE) out.push(0);
  return { line: out, gained };
}

const lineIndexes = (dir, n) => {
  const at = [];
  for (let k = 0; k < SIZE; k++) {
    if (dir === 'left') at.push(n * SIZE + k);
    else if (dir === 'right') at.push(n * SIZE + (SIZE - 1 - k));
    else if (dir === 'up') at.push(k * SIZE + n);
    else at.push((SIZE - 1 - k) * SIZE + n);
  }
  return at;
};

/** Plays a move. { board, gained, moved }; the input board is not changed. */
export function slide(board, dir) {
  const next = [...board];
  let gained = 0;
  for (let n = 0; n < SIZE; n++) {
    const at = lineIndexes(dir, n);
    const result = slideLine(at.map((i) => board[i]));
    gained += result.gained;
    at.forEach((i, k) => {
      next[i] = result.line[k];
    });
  }
  return { board: next, gained, moved: next.some((v, i) => v !== board[i]) };
}

/** Puts a 2 (90%) or a 4 on a random empty cell. Returns its index, or -1 when the board is full. */
export function spawn(board, random = Math.random) {
  const empty = [];
  board.forEach((v, i) => {
    if (!v) empty.push(i);
  });
  if (!empty.length) return -1;
  const i = empty[Math.floor(random() * empty.length)];
  board[i] = random() < 0.9 ? 2 : 4;
  return i;
}

export function canMove(board) {
  return ['left', 'right', 'up', 'down'].some((dir) => slide(board, dir).moved);
}

export const best = (board) => Math.max(0, ...board);

export function newGame(random = Math.random) {
  const g = { board: newBoard(), score: 0, moves: 0, over: false, history: [] };
  spawn(g.board, random);
  spawn(g.board, random);
  return g;
}

/** One move of a game: slide, add a tile, check for the end. Returns the new tile index or null. */
export function play(g, dir, random = Math.random) {
  if (g.over) return null;
  const result = slide(g.board, dir);
  if (!result.moved) return null;
  g.board = result.board;
  g.score += result.gained;
  g.moves++;
  const added = spawn(g.board, random);
  if (!canMove(g.board)) g.over = true;
  return { added, gained: result.gained };
}
