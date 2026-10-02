// Minensucher: the board and its input. Rules are in logic.js, the Gaming Hub parts in the kit's
// game.js (login, playtime, results, leaderboard).
import { chord, LEVELS, minesLeft, neighbors, newBoard, reveal, toggleFlag } from './logic.js';

const $ = (s) => document.querySelector(s);
const { format } = window.mnGame;

let mn = null;
let level = 'leicht';
let board = newBoard(level);
let mode = 'open';
let focus = 0;
const clock = window.mnGame.timer({
  onTick: (s) => {
    $('#time').textContent = format.seconds(s);
  },
  mn: () => mn,
});

function cellLabel(i) {
  const c = board.cells[i];
  const where = `Reihe ${Math.floor(i / board.cols) + 1}, Spalte ${(i % board.cols) + 1}`;
  if (c.flag) return `${where}, Flagge`;
  if (!c.open) return `${where}, verdeckt`;
  if (c.mine) return `${where}, Mine`;
  return c.count ? `${where}, ${c.count} Minen in der Nähe` : `${where}, leer`;
}

function build() {
  const host = $('#board');
  host.replaceChildren();
  host.style.setProperty('--cols', String(board.cols));
  host.setAttribute('aria-rowcount', String(board.rows));
  host.setAttribute('aria-colcount', String(board.cols));
  for (let r = 0; r < board.rows; r++) {
    const row = document.createElement('div');
    row.className = 'ms-row';
    row.setAttribute('role', 'row');
    for (let c = 0; c < board.cols; c++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ms-cell';
      btn.setAttribute('role', 'gridcell');
      btn.dataset.i = String(r * board.cols + c);
      row.append(btn);
    }
    host.append(row);
  }
}

function paint() {
  const buttons = document.querySelectorAll('.ms-cell');
  board.cells.forEach((c, i) => {
    const btn = buttons[i];
    let text = '';
    if (c.flag && !(board.status === 'lost' && c.mine === false)) text = '⚑';
    else if (c.open && c.mine) text = '✱';
    else if (c.open && c.count) text = String(c.count);
    if (board.status === 'lost' && c.flag && !c.mine) text = '✕';
    btn.textContent = text;
    btn.className = 'ms-cell';
    if (c.open) btn.classList.add('open');
    if (c.open && !c.mine && c.count) btn.classList.add(`n${c.count}`);
    if (c.flag) btn.classList.add('flag');
    if (i === board.exploded) btn.classList.add('boom');
    btn.setAttribute('aria-label', cellLabel(i));
    btn.tabIndex = i === focus ? 0 : -1;
  });
  $('#left').textContent = String(minesLeft(board));
}

function setMode(next) {
  mode = next;
  for (const b of document.querySelectorAll('#mode button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
}

function newGame() {
  clock.reset();
  board = newBoard(level);
  focus = Math.floor(board.cells.length / 2);
  $('#end').hidden = true;
  $('#announce').textContent = `Neues Spiel, ${LEVELS[level].label}.`;
  build();
  paint();
}

function chooseLevel(next) {
  level = next;
  for (const b of document.querySelectorAll('#levels button')) {
    b.setAttribute('aria-pressed', String(b.dataset.level === level));
  }
  newGame();
  void showRecords();
}

async function ended(won) {
  const seconds = Math.max(1, clock.stop());
  const title = $('#end-title');
  const text = $('#end-text');
  if (won) {
    title.textContent = 'Geschafft!';
    text.textContent = `${LEVELS[level].label} in ${format.seconds(seconds)} gelöst.`;
  } else {
    title.textContent = 'Boom!';
    text.textContent = `Auf eine Mine getreten nach ${format.seconds(seconds)}. Neues Spiel?`;
  }
  $('#end').hidden = false;
  $('#end').focus();
  $('#announce').textContent = `${title.textContent} ${text.textContent}`;
  if (won) await window.mnGame.report(mn, 'win', { [`time_${level}`]: seconds }, seconds);
  else await window.mnGame.report(mn, 'loss', {}, seconds);
  void showRecords();
}

function act(i, how) {
  if (board.status === 'won' || board.status === 'lost') return;
  focus = i;
  let result = 'ignored';
  const cell = board.cells[i];
  if (how === 'flag') {
    if (toggleFlag(board, i)) result = 'flag';
  } else if (cell.open) result = chord(board, i);
  else {
    if (!clock.running) clock.start();
    result = reveal(board, i);
  }
  paint();
  if (result === 'boom') void ended(false);
  if (result === 'won') void ended(true);
}

async function showRecords() {
  const best = await window.mnGame.leaders(mn, '#leaders', {
    stat: `time_${level}`,
    format: format.seconds,
  });
  $('#record').textContent =
    best === undefined ? '' : `${LEVELS[level].label}: dein Rekord ${format.seconds(best)}.`;
}

// Long press flags on touch screens; a plain tap follows the chosen mode.
let pressTimer = 0;
let longPressed = false;
const board$ = $('#board');
board$.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('.ms-cell');
  if (!btn || e.pointerType === 'mouse') return;
  longPressed = false;
  pressTimer = setTimeout(() => {
    longPressed = true;
    act(Number(btn.dataset.i), 'flag');
  }, 450);
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
  board$.addEventListener(type, () => clearTimeout(pressTimer));
}
board$.addEventListener('click', (e) => {
  const btn = e.target.closest('.ms-cell');
  if (!btn) return;
  if (longPressed) {
    longPressed = false;
    return;
  }
  act(Number(btn.dataset.i), mode === 'flag' ? 'flag' : 'open');
});
board$.addEventListener('contextmenu', (e) => {
  const btn = e.target.closest('.ms-cell');
  if (!btn) return;
  e.preventDefault();
  act(Number(btn.dataset.i), 'flag');
});
board$.addEventListener('keydown', (e) => {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: board.cols, ArrowUp: -board.cols };
  if (e.key in step) {
    e.preventDefault();
    const x = focus % board.cols;
    if ((e.key === 'ArrowRight' && x === board.cols - 1) || (e.key === 'ArrowLeft' && x === 0))
      return;
    const next = focus + step[e.key];
    if (next < 0 || next >= board.cells.length) return;
    focus = next;
    paint();
    document.querySelectorAll('.ms-cell')[next].focus();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    act(focus, 'flag');
  }
});
// Space and Enter on a focused cell fire click, which follows the chosen mode.

$('#restart').addEventListener('click', newGame);
for (const b of document.querySelectorAll('#mode button')) {
  b.addEventListener('click', () => setMode(b.dataset.mode));
}
const levelsHost = $('#levels');
for (const [key, def] of Object.entries(LEVELS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.level = key;
  b.setAttribute('aria-pressed', String(key === level));
  b.textContent = `${def.label} (${def.cols}×${def.rows}, ${def.mines})`;
  b.addEventListener('click', () => chooseLevel(key));
  levelsHost.append(b);
}
newGame();
// Neighbours are used by keyboard hints only; kept imported for clarity of the rules module.
void neighbors;

(async () => {
  mn = await window.mnGame.connect({ player: '#player', hub: '#hub' });
  void showRecords();
})();
