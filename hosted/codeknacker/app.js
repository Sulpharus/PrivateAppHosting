// Codeknacker: the rows and the input. Rules are in logic.js, the Gaming Hub parts in the kit's
// game.js (login, playtime, results, leaderboard).
import { guess, LENGTH, MAX_GUESSES, newGame, SYMBOLS } from './logic.js';

const $ = (s) => document.querySelector(s);
const { format } = window.mnGame;
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// Shapes differ as well as colours, so the symbols are told apart without colour.
const SHAPES = ['●', '▲', '■', '◆', '★', '✚'];
const NAMES = ['Kreis', 'Dreieck', 'Quadrat', 'Raute', 'Stern', 'Kreuz'];
const TEXT = '︎';

let mn = null;
let game = newGame(random);
let current = [];
let reported = false;

const clock = window.mnGame.timer({
  onTick: (s) => {
    $('#time').textContent = format.seconds(s);
  },
  mn: () => mn,
});

function symbol(s, tag = 'span') {
  const el = document.createElement(tag);
  el.className = `ck-sym s${s}`;
  el.textContent = `${SHAPES[s]}${TEXT}`;
  el.setAttribute('aria-label', NAMES[s]);
  return el;
}

function feedbackText({ exact, near }) {
  if (!exact && !near) return 'nichts getroffen';
  return `${exact} genau, ${near} nah`;
}

function render() {
  const rows = $('#rows');
  rows.replaceChildren();
  game.guesses.forEach((g, i) => {
    const li = document.createElement('li');
    li.className = 'ck-row';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = String(i + 1);
    li.append(n, ...g.symbols.map((s) => symbol(s)));
    const fb = document.createElement('span');
    fb.className = 'fb';
    fb.textContent = feedbackText(g);
    li.append(fb);
    rows.append(li);
  });

  const slots = $('#slots');
  slots.replaceChildren();
  for (let i = 0; i < LENGTH; i++) {
    const filled = current[i] !== undefined;
    const slot = filled ? symbol(current[i]) : document.createElement('span');
    if (!filled) {
      slot.className = 'ck-sym';
      slot.setAttribute('aria-label', 'leer');
    } else slot.classList.add('filled');
    slots.append(slot);
  }
  const over = game.status !== 'playing';
  for (const b of document.querySelectorAll('#pad button')) b.disabled = over;
  $('#submit').disabled = over || current.length !== LENGTH;
  $('#back').disabled = over || current.length === 0;
  $('#left').textContent = String(MAX_GUESSES - game.guesses.length);
}

async function ended() {
  const seconds = Math.max(1, clock.stop());
  const won = game.status === 'won';
  const n = game.guesses.length;
  $('#end-title').textContent = won ? 'Code geknackt!' : 'Nicht geschafft';
  $('#end-text').textContent = won
    ? `In ${n} ${n === 1 ? 'Versuch' : 'Versuchen'} und ${format.seconds(seconds)}.`
    : `Der Code war ${game.code.map((s) => NAMES[s]).join(', ')}. Neues Spiel?`;
  $('#end').hidden = false;
  $('#end').focus();
  $('#announce').textContent = `${$('#end-title').textContent} ${$('#end-text').textContent}`;
  if (reported) return;
  reported = true;
  if (won) await window.mnGame.report(mn, 'win', { guesses: n, time: seconds }, seconds);
  else await window.mnGame.report(mn, 'loss', {}, seconds);
  void showRecords();
}

function add(s) {
  if (game.status !== 'playing' || current.length >= LENGTH) return;
  if (!clock.running) clock.start();
  current.push(s);
  render();
}

function submit() {
  if (current.length !== LENGTH) return;
  const result = guess(game, current);
  if (!result) return;
  $('#announce').textContent = `Versuch ${game.guesses.length}: ${feedbackText(result)}.`;
  current = [];
  render();
  if (game.status !== 'playing') void ended();
}

function newRound() {
  clock.reset();
  game = newGame(random);
  current = [];
  reported = false;
  $('#end').hidden = true;
  $('#announce').textContent = 'Neues Spiel.';
  render();
}

const pad = $('#pad');
for (let s = 0; s < SYMBOLS; s++) {
  const b = symbol(s, 'button');
  b.type = 'button';
  b.setAttribute('aria-label', `${NAMES[s]} setzen (Taste ${s + 1})`);
  b.addEventListener('click', () => add(s));
  pad.append(b);
}
$('#back').addEventListener('click', () => {
  current.pop();
  render();
});
$('#submit').addEventListener('click', submit);
$('#restart').addEventListener('click', newRound);
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (/^[1-6]$/.test(e.key)) add(Number(e.key) - 1);
  else if (e.key === 'Backspace') {
    current.pop();
    render();
  } else if (e.key === 'Enter' && e.target === document.body) submit();
});

async function showRecords() {
  const best = await window.mnGame.leaders(mn, '#leaders', {
    stat: 'guesses',
    format: (n) => `${n}`,
    unit: ' Versuche',
  });
  $('#record').textContent = best === undefined ? '' : `Dein Rekord: ${best} Versuche.`;
}

render();
(async () => {
  mn = await window.mnGame.connect({ player: '#player', hub: '#hub' });
  void showRecords();
})();
