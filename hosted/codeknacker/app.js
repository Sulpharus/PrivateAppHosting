// Codeknacker: the rows and the input. Rules are in logic.js, the Gaming Hub parts in the kit's
// game.js (login, playtime, results, leaderboard).
import { guess, LENGTH, MAX_GUESSES, newGame, SYMBOLS } from './logic.js';

const $ = (s) => document.querySelector(s);
const { format } = window.mnGame;
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// Shapes differ as well as colours, so the symbols are told apart without colour.
const SHAPES = ['●', '▲', '■', '◆', '★', '✚'];
const t = (key, params) => window.mnI18n.t(key, params);
const symbolName = (s) => t(`symbol.${s}`);
// The packages must be there before the first text is made.
await window.mnI18n.ready;
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
  el.setAttribute('aria-label', symbolName(s));
  return el;
}

function feedbackText({ exact, near }) {
  if (!exact && !near) return t('feedback.none');
  return t('feedback.hits', { exact, near });
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
      slot.setAttribute('aria-label', t('slot.empty'));
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
  $('#end-title').textContent = t(won ? 'end.won' : 'end.lost');
  $('#end-text').textContent = won
    ? t('end.wonText', { n, time: format.seconds(seconds) })
    : t('end.lostText', { code: game.code.map((s) => symbolName(s)).join(', ') });
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
  $('#announce').textContent = t('say.guess', {
    n: game.guesses.length,
    feedback: feedbackText(result),
  });
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
  $('#announce').textContent = t('say.new');
  render();
}

const pad = $('#pad');
for (let s = 0; s < SYMBOLS; s++) {
  const b = symbol(s, 'button');
  b.type = 'button';
  b.setAttribute('aria-label', t('symbol.place', { symbol: symbolName(s), key: s + 1 }));
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
  } else if (e.key === 'Enter' && !e.target.closest?.('#submit, #back, #restart')) {
    e.preventDefault();
    submit();
  }
});

async function showRecords() {
  const best = await window.mnGame.leaders(mn, '#leaders', {
    stat: 'guesses',
    format: (n) => t('unit.guesses', { n }),
  });
  $('#record').textContent = best === undefined ? '' : t('record.best', { n: best });
}

render();
window.mnI18n.onChange(() => {
  window.mnI18n.apply();
  pad.querySelectorAll('button').forEach((b, s) => {
    b.setAttribute('aria-label', t('symbol.place', { symbol: symbolName(s), key: s + 1 }));
    b.replaceChildren(document.createTextNode(`${SHAPES[s]}${TEXT}`));
  });
  render();
  void showRecords();
});
(async () => {
  mn = await window.mnGame.connect({ player: '#player', hub: '#hub' });
  clock.attach();
  void showRecords();
})();
