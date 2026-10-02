// Sudoku: the board and its input. Rules and generator are in logic.js (generated in a worker),
// the Gaming Hub parts in the kit's game.js (login, playtime, results, leaderboard).
import {
  col,
  conflicts,
  generate,
  hint,
  LEVELS,
  newGame,
  noteDigits,
  PEERS,
  placed,
  row,
  setValue,
  toggleNote,
  undo,
} from './logic.js';

const $ = (s) => document.querySelector(s);
const { format } = window.mnGame;
const t = (key, params) => window.mnI18n.t(key, params);
const levelName = (id) => t(`level.${id}`);
// The packages must be there before the first text is made.
await window.mnI18n.ready;
const HINT_COST = 30;

let mn = null;
let level = 3;
let game = null;
let selected = 40;
let noteMode = false;
let token = 0;

const clock = window.mnGame.timer({
  onTick: (s) => {
    $('#time').textContent = format.seconds(s);
  },
  mn: () => mn,
});

// ---- puzzles: a worker builds them, the next one of the level is made in advance ----------

let worker = null;
const waiting = new Map();
let nextId = 1;
try {
  worker = new Worker(new URL('./generator-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, ...result } = e.data;
    waiting.get(id)?.(result);
    waiting.delete(id);
  };
  worker.onerror = () => {
    worker = null;
    for (const [id, done] of waiting) {
      done(null);
      waiting.delete(id);
    }
  };
} catch {
  worker = null;
}

function build(wanted) {
  if (worker) {
    return new Promise((resolve) => {
      const id = nextId++;
      waiting.set(id, (result) => resolve(result ?? generate(wanted)));
      worker.postMessage({ id, level: wanted });
    });
  }
  return new Promise((resolve) => setTimeout(() => resolve(generate(wanted)), 0));
}

const ready = new Map();
function prefetch(wanted) {
  if (!ready.has(wanted)) ready.set(wanted, build(wanted));
}
function take(wanted) {
  const found = ready.get(wanted) ?? build(wanted);
  ready.delete(wanted);
  return found;
}

// ---- drawing ------------------------------------------------------------------------------

function buildBoard() {
  const host = $('#board');
  host.replaceChildren();
  for (let i = 0; i < 81; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'su-cell';
    btn.setAttribute('role', 'gridcell');
    btn.dataset.i = String(i);
    btn.dataset.r = String(row(i));
    btn.dataset.c = String(col(i));
    host.append(btn);
  }
  const pad = $('#pad');
  pad.replaceChildren();
  for (let d = 1; d <= 9; d++) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'su-key';
    key.dataset.d = String(d);
    key.textContent = String(d);
    key.setAttribute('aria-label', t('pad.digit', { d }));
    pad.append(key);
  }
}

function label(i) {
  const where = t('cell.where', { row: row(i) + 1, col: col(i) + 1 });
  const value = game.values[i];
  if (game.givens[i]) return t('cell.given', { where, value });
  if (value) return t('cell.value', { where, value });
  const notes = noteDigits(game, i);
  return notes.length
    ? t('cell.notes', { where, notes: notes.join(' ') })
    : t('cell.empty', { where });
}

function paint() {
  const bad = conflicts(game);
  const sel = game.values[selected];
  const peers = new Set(PEERS[selected]);
  const buttons = document.querySelectorAll('.su-cell');
  game.values.forEach((v, i) => {
    const btn = buttons[i];
    btn.className = 'su-cell';
    if (game.givens[i]) btn.classList.add('given');
    if (i === selected) btn.classList.add('selected');
    else if (sel && v === sel) btn.classList.add('same');
    else if (peers.has(i)) btn.classList.add('peer');
    if (bad.has(i)) btn.classList.add('bad');
    btn.replaceChildren();
    if (v) btn.textContent = String(v);
    else if (game.notes[i]) {
      const grid = document.createElement('div');
      grid.className = 'su-notes';
      grid.setAttribute('aria-hidden', 'true');
      for (let d = 1; d <= 9; d++) {
        const s = document.createElement('span');
        s.textContent = game.notes[i] & (1 << (d - 1)) ? String(d) : '';
        grid.append(s);
      }
      btn.append(grid);
    }
    btn.setAttribute('aria-label', label(i));
    btn.tabIndex = i === selected ? 0 : -1;
  });
  const count = placed(game);
  for (const key of document.querySelectorAll('.su-key')) {
    key.disabled = count[Number(key.dataset.d)] >= 9 || game.status !== 'playing';
  }
  $('#hints').textContent = String(game.hints);
  $('#notes').setAttribute('aria-pressed', String(noteMode));
  $('#undo').disabled = game.history.length === 0 || game.status !== 'playing';
}

// ---- playing ------------------------------------------------------------------------------

function blank() {
  for (const cell of document.querySelectorAll('.su-cell')) {
    cell.replaceChildren();
    cell.className = 'su-cell';
    cell.setAttribute('aria-label', t('cell.generating'));
  }
  for (const key of document.querySelectorAll('.su-key')) key.disabled = true;
  $('#hints').textContent = '0';
  $('#undo').disabled = true;
}

async function newPuzzle() {
  const mine = ++token;
  // Nothing is playable while the next puzzle is made.
  game = null;
  clock.reset();
  blank();
  $('#end').hidden = true;
  $('#busy').hidden = false;
  document.body.setAttribute('aria-busy', 'true');
  const made = await take(level);
  if (mine !== token) return;
  clock.reset();
  $('#busy').hidden = true;
  document.body.removeAttribute('aria-busy');
  game = newGame(made.puzzle, made.solution);
  selected = 40;
  noteMode = false;
  paint();
  $('#announce').textContent = t('announce.new', { level: levelName(level) });
  prefetch(level);
}

async function finished() {
  const seconds = Math.max(1, clock.stop());
  const done = { level: levelName(level), time: format.seconds(seconds) };
  $('#end-text').textContent = game.hints
    ? t('end.textHints', { ...done, n: game.hints })
    : t('end.text', done);
  $('#end').hidden = false;
  $('#end').focus();
  $('#announce').textContent = t('announce.won', { text: $('#end-text').textContent });
  paint();
  await window.mnGame.report(mn, 'win', { [`time_${level}`]: seconds }, seconds);
  void showRecords();
}

function enter(d) {
  if (game?.status !== 'playing' || game.givens[selected]) return;
  if (!clock.running) clock.start();
  const changed = noteMode && d ? toggleNote(game, selected, d) : setValue(game, selected, d);
  paint();
  if (changed && game.status === 'won') void finished();
}

function askHint() {
  if (game?.status !== 'playing') return;
  if (!clock.running) clock.start();
  if (hint(game, selected)) clock.penalty(HINT_COST);
  paint();
  if (game.status === 'won') void finished();
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

function chooseLevel(next) {
  level = next;
  for (const b of document.querySelectorAll('#levels button')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.level) === level));
  }
  void newPuzzle();
  void showRecords();
}

buildBoard();
$('#board').addEventListener('click', (e) => {
  const btn = e.target.closest('.su-cell');
  if (!btn || !game) return;
  selected = Number(btn.dataset.i);
  paint();
});
$('#board').addEventListener('keydown', (e) => {
  if (!game) return;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 9, ArrowUp: -9 };
  if (e.key in step) {
    e.preventDefault();
    if (
      (e.key === 'ArrowRight' && col(selected) === 8) ||
      (e.key === 'ArrowLeft' && col(selected) === 0)
    )
      return;
    const next = selected + step[e.key];
    if (next < 0 || next > 80) return;
    selected = next;
    paint();
    document.querySelectorAll('.su-cell')[next].focus();
  } else if (/^[1-9]$/.test(e.key)) {
    e.preventDefault();
    enter(Number(e.key));
  } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    e.preventDefault();
    if (noteMode) return;
    enter(0);
  } else if (e.key === 'n' || e.key === 'N') {
    noteMode = !noteMode;
    paint();
  } else if (e.key === 'z' || e.key === 'Z') {
    undo(game);
    paint();
  }
});
$('#pad').addEventListener('click', (e) => {
  const key = e.target.closest('.su-key');
  if (key) enter(Number(key.dataset.d));
});
$('#notes').addEventListener('click', () => {
  noteMode = !noteMode;
  if (game) paint();
});
$('#erase').addEventListener('click', () => {
  if (game?.status !== 'playing' || game.givens[selected]) return;
  if (game.values[selected]) setValue(game, selected, 0);
  else if (game.notes[selected]) {
    // Clear all notes of the cell, one undo step each is not needed here.
    for (const d of noteDigits(game, selected)) toggleNote(game, selected, d);
  }
  paint();
});
$('#undo').addEventListener('click', () => {
  if (!game) return;
  undo(game);
  paint();
});
$('#hint').addEventListener('click', askHint);
$('#restart').addEventListener('click', () => void newPuzzle());

const levelsHost = $('#levels');
for (const [key, def] of Object.entries(LEVELS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.level = key;
  b.setAttribute('aria-pressed', String(Number(key) === level));
  b.textContent = levelName(key);
  b.addEventListener('click', () => chooseLevel(Number(key)));
  levelsHost.append(b);
}
void newPuzzle();
window.mnI18n.onChange(() => {
  window.mnI18n.apply();
  for (const b of levelsHost.querySelectorAll('button')) b.textContent = levelName(b.dataset.level);
  for (const key of document.querySelectorAll('.su-key'))
    key.setAttribute('aria-label', t('pad.digit', { d: key.dataset.d }));
  if (game) paint();
  void showRecords();
});

(async () => {
  mn = await window.mnGame.connect({ player: '#player', hub: '#hub' });
  clock.attach();
  void showRecords();
})();
