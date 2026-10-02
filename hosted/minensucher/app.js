// Minensucher: the board and its input. Rules are in logic.js, the Gaming Hub parts in the kit's
// game.js (login, playtime, results, leaderboard).
import { chord, LEVELS, minesLeft, newBoard, reveal, toggleFlag } from './logic.js';

const $ = (s) => document.querySelector(s);
const { format } = window.mnGame;
const t = (key, params) => window.mnI18n.t(key, params);
const levelName = (id) => t(`level.${id}`);
// The packages must be there before the first text is made.
await window.mnI18n.ready;

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
  const where = t('cell.where', { row: Math.floor(i / board.cols) + 1, col: (i % board.cols) + 1 });
  if (c.flag) return t('cell.flag', { where });
  if (!c.open) return t('cell.covered', { where });
  if (c.mine) return t('cell.mine', { where });
  return c.count ? t('cell.count', { where, n: c.count }) : t('cell.empty', { where });
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
  $('#announce').textContent = t('announce.new', { level: levelName(level) });
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
    title.textContent = t('end.won');
    text.textContent = t('end.wonText', { level: levelName(level), time: format.seconds(seconds) });
  } else {
    title.textContent = t('end.lost');
    text.textContent = t('end.lostText', { time: format.seconds(seconds) });
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
    best === undefined
      ? ''
      : t('record.best', { level: levelName(level), time: format.seconds(best) });
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
  // Android sends contextmenu after the long press that already set the flag.
  if (longPressed) return;
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
const levelButton = (key, def) =>
  t('level.button', { name: levelName(key), cols: def.cols, rows: def.rows, mines: def.mines });
const levelsHost = $('#levels');
for (const [key, def] of Object.entries(LEVELS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.level = key;
  b.setAttribute('aria-pressed', String(key === level));
  b.textContent = levelButton(key, def);
  b.addEventListener('click', () => chooseLevel(key));
  levelsHost.append(b);
}
newGame();
window.mnI18n.onChange(() => {
  window.mnI18n.apply();
  levelsHost.querySelectorAll('button').forEach((b) => {
    b.textContent = levelButton(b.dataset.level, LEVELS[b.dataset.level]);
  });
  paint();
  void showRecords();
});

(async () => {
  mn = await window.mnGame.connect({ player: '#player', hub: '#hub' });
  clock.attach();
  void showRecords();
})();
