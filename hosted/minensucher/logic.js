// Minensucher rules without any DOM. A board is changed in place: reveal, flag and chord return
// what happened, the board holds the state.

export const LEVELS = {
  leicht: { label: 'Leicht', cols: 9, rows: 9, mines: 10 },
  mittel: { label: 'Mittel', cols: 16, rows: 16, mines: 40 },
  schwer: { label: 'Schwer', cols: 30, rows: 16, mines: 99 },
};

export function cryptoRandom() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** A new board; the mines are laid after the first reveal, so the first click is never a mine. */
export function newBoard(level) {
  const { cols, rows, mines } = LEVELS[level];
  return {
    level,
    cols,
    rows,
    mines,
    cells: Array.from({ length: cols * rows }, () => ({
      mine: false,
      count: 0,
      open: false,
      flag: false,
    })),
    laid: false,
    status: 'ready', // ready, playing, won, lost
    opened: 0,
    flags: 0,
    exploded: -1,
  };
}

export function neighbors(board, i) {
  const x = i % board.cols;
  const y = Math.floor(i / board.cols);
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < board.cols && ny >= 0 && ny < board.rows) out.push(ny * board.cols + nx);
    }
  return out;
}

/** Lays the mines away from `safe` and its neighbours (as far as the board has room). */
export function layMines(board, safe, random = cryptoRandom) {
  const banned = new Set([safe, ...neighbors(board, safe)]);
  let pool = board.cells.map((_, i) => i).filter((i) => !banned.has(i));
  // A tiny board without room: only the clicked cell stays free.
  if (pool.length < board.mines) pool = board.cells.map((_, i) => i).filter((i) => i !== safe);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  setMines(board, pool.slice(0, board.mines));
}

/** Puts mines on exactly these cells and counts the neighbours (also used by the tests). */
export function setMines(board, indexes) {
  for (const cell of board.cells) cell.mine = false;
  for (const i of indexes) board.cells[i].mine = true;
  board.cells.forEach((cell, i) => {
    cell.count = neighbors(board, i).filter((n) => board.cells[n].mine).length;
  });
  board.laid = true;
}

function lose(board, i) {
  board.status = 'lost';
  board.exploded = i;
  for (const cell of board.cells) if (cell.mine && !cell.flag) cell.open = true;
}

function checkWin(board) {
  if (board.status === 'playing' && board.opened === board.cells.length - board.mines) {
    board.status = 'won';
    for (const cell of board.cells) if (cell.mine) cell.flag = true;
    board.flags = board.mines;
  }
}

/** Opens a cell (and the empty area around a zero). Returns 'ignored', 'open', 'boom' or 'won'. */
export function reveal(board, i, random = cryptoRandom) {
  if (board.status === 'won' || board.status === 'lost') return 'ignored';
  const cell = board.cells[i];
  if (cell.open || cell.flag) return 'ignored';
  if (!board.laid) layMines(board, i, random);
  board.status = 'playing';
  if (cell.mine) {
    lose(board, i);
    return 'boom';
  }
  const stack = [i];
  while (stack.length) {
    const at = stack.pop();
    const c = board.cells[at];
    if (c.open || c.flag) continue;
    c.open = true;
    board.opened++;
    if (c.count === 0) stack.push(...neighbors(board, at));
  }
  checkWin(board);
  return board.status === 'won' ? 'won' : 'open';
}

/** Puts a flag on a covered cell or takes it off; flags may exceed the mine count. */
export function toggleFlag(board, i) {
  if (board.status === 'won' || board.status === 'lost') return false;
  const cell = board.cells[i];
  if (cell.open) return false;
  cell.flag = !cell.flag;
  board.flags += cell.flag ? 1 : -1;
  if (board.status === 'ready') board.status = 'ready';
  return true;
}

/** On an opened number whose flags match it, opens every other neighbour (a wrong flag loses). */
export function chord(board, i, random = cryptoRandom) {
  const cell = board.cells[i];
  if (!cell.open || cell.count === 0 || board.status !== 'playing') return 'ignored';
  const around = neighbors(board, i);
  if (around.filter((n) => board.cells[n].flag).length !== cell.count) return 'ignored';
  let result = 'ignored';
  for (const n of around) {
    if (board.cells[n].flag || board.cells[n].open) continue;
    const r = reveal(board, n, random);
    if (r === 'boom' || r === 'won') return r;
    if (r === 'open') result = 'open';
  }
  return result;
}

export function minesLeft(board) {
  return board.mines - board.flags;
}
