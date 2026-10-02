// 2048: the board and its input (arrows, WASD, swipes, buttons). Rules are in logic.js, the Gaming
// Hub parts in the kit's game.js (login, playtime, results, leaderboard).
import { best, newGame, play } from './logic.js';

const $ = (s) => document.querySelector(s);
const { format } = window.mnGame;
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

let mn = null;
let game = newGame(random);
let undoState = null; // one step back
let fresh = -1;
let reported = false;

const clock = window.mnGame.timer({
  onTick: (s) => {
    $('#time').textContent = format.seconds(s);
  },
  mn: () => mn,
});

function render() {
  const host = $('#board');
  host.replaceChildren();
  game.board.forEach((v, i) => {
    const tile = document.createElement('div');
    tile.className = 'g-tile';
    if (v) {
      tile.textContent = String(v);
      tile.classList.add('t');
      tile.style.setProperty('--l', String(Math.log2(v)));
      if (v >= 2048) tile.classList.add('hot');
      if (v >= 1000) tile.classList.add('big');
      if (v >= 10000) tile.classList.add('huge');
      if (i === fresh) tile.classList.add('new');
      tile.setAttribute('aria-label', `${v}`);
    } else tile.setAttribute('aria-hidden', 'true');
    host.append(tile);
  });
  $('#score').textContent = format.number(game.score);
  $('#tile').textContent = format.number(best(game.board));
  $('#undo').disabled = !undoState || game.over;
}

function describe() {
  const rows = [];
  for (let r = 0; r < 4; r++)
    rows.push(
      game.board
        .slice(r * 4, r * 4 + 4)
        .map((v) => v || '·')
        .join(' '),
    );
  return `Punkte ${game.score}, größte Kachel ${best(game.board)}. ${rows.join('; ')}`;
}

async function finish(kind) {
  if (reported || !game.moves) return;
  reported = true;
  const seconds = Math.max(1, clock.stop());
  const top = best(game.board);
  const outcome = top >= 2048 ? 'win' : kind === 'over' ? 'loss' : 'done';
  const headline = kind === 'over' ? 'Keine Züge mehr.' : 'Runde beendet.';
  $('#end-title').textContent = kind === 'over' ? 'Spiel vorbei' : 'Beendet';
  $('#end-text').textContent =
    `${headline} ${format.number(game.score)} Punkte, größte Kachel ${format.number(top)}, ${game.moves} Züge in ${format.seconds(seconds)}.`;
  $('#end').hidden = false;
  $('#announce').textContent = $('#end-text').textContent;
  await window.mnGame.report(
    mn,
    outcome,
    { score: Math.max(4, game.score), tile: Math.max(4, top) },
    seconds,
  );
  void showRecords();
}

function step(dir) {
  if (game.over || reported) return;
  const before = { board: [...game.board], score: game.score, moves: game.moves };
  const result = play(game, dir, random);
  if (!result) return;
  undoState = before;
  if (!clock.running) clock.start();
  fresh = result.added;
  render();
  $('#announce').textContent = describe();
  if (game.over) void finish('over');
}

function newRound() {
  // A round that was played and not finished is still a result.
  if (game.moves && !reported) void finish('quit');
  clock.reset();
  game = newGame(random);
  undoState = null;
  fresh = -1;
  reported = false;
  $('#end').hidden = true;
  render();
  $('#announce').textContent = 'Neues Spiel.';
}

const KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const dir = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  const t = e.target;
  // Arrow keys on a focused button or field keep their own meaning; the board takes the rest.
  if (!dir || t.closest?.('input, select, textarea')) return;
  e.preventDefault();
  step(dir);
});

for (const b of document.querySelectorAll('[data-dir]')) {
  b.addEventListener('click', () => step(b.dataset.dir));
}

let touch = null;
const board = $('#board');
board.addEventListener('pointerdown', (e) => {
  touch = { x: e.clientX, y: e.clientY };
});
board.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) step(dx > 0 ? 'right' : 'left');
  else step(dy > 0 ? 'down' : 'up');
});
board.addEventListener('pointercancel', () => {
  touch = null;
});

$('#undo').addEventListener('click', () => {
  if (!undoState || game.over || reported) return;
  game.board = undoState.board;
  game.score = undoState.score;
  game.moves = undoState.moves;
  undoState = null;
  fresh = -1;
  render();
});
$('#finish').addEventListener('click', () => void finish('quit'));
$('#restart').addEventListener('click', newRound);

async function showRecords() {
  const best = await window.mnGame.leaders(mn, '#leaders', {
    stat: 'score',
    format: format.number,
    unit: ' Punkte',
  });
  $('#record').textContent =
    best === undefined ? '' : `Dein Rekord: ${format.number(best)} Punkte.`;
}

render();
(async () => {
  mn = await window.mnGame.connect({ player: '#player', hub: '#hub' });
  void showRecords();
})();
