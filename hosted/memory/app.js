// Memory: find the eight pairs. Rules live in logic.js; playtime and results go to the Gaming Hub
// through mn.game (ADR 0009), the username comes from there too.
import { flip, foundPairs, hideMisses, newGame, PAIRS } from './logic.js';

const $ = (s) => document.querySelector(s);
const t = (key, params) => window.mnI18n.t(key, params);
const shapeLabel = (shape) => t(`shape.${shape}`);
const SHAPE_SVG = {
  circle: '<circle cx="12" cy="12" r="7.5"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  triangle: '<path d="M12 4.5l8 14.5H4z"/>',
  diamond: '<path d="M12 3.5l8 8.5-8 8.5-8-8.5z"/>',
  star: '<path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/>',
  heart:
    '<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  hexagon: '<path d="M8 4.5h8l4 7.5-4 7.5H8l-4-7.5z"/>',
  cross: '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
};
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

let mn = null;
let state = newGame();
let started = 0;
let tick = 0;
let stopTracking = null;
let hideTimer = 0;
let focusIndex = 0;

function cardLabel(c, i) {
  const params = { n: i + 1, shape: c.shape ? shapeLabel(c.shape) : '' };
  if (c.found) return t('card.found', params);
  if (c.open) return t('card.open', params);
  return t('card.hidden', params);
}

function render() {
  const board = $('#board');
  if (!board.children.length) {
    for (let r = 0; r < 4; r++) {
      const row = document.createElement('div');
      row.className = 'mem-row';
      for (let c = 0; c < 4; c++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mem-card';
        btn.dataset.i = String(r * 4 + c);
        btn.innerHTML =
          '<span class="mem-inner"><span class="mem-back" aria-hidden="true"></span><span class="mem-front" aria-hidden="true"><svg viewBox="0 0 24 24"></svg></span></span>';
        row.append(btn);
      }
      board.append(row);
    }
  }
  const buttons = board.querySelectorAll('.mem-card');
  state.cards.forEach((c, i) => {
    const btn = buttons[i];
    btn.classList.toggle('open', c.open || c.found);
    btn.classList.toggle('found', c.found);
    btn.setAttribute('aria-label', cardLabel(c, i));
    btn.tabIndex = i === focusIndex ? 0 : -1;
    const svg = btn.querySelector('svg');
    const want = c.open || c.found ? SHAPE_SVG[c.shape] : '';
    if (svg.innerHTML !== want) svg.innerHTML = want;
  });
  $('#moves').textContent = String(state.moves);
  $('#pairs').textContent = `${foundPairs(state)} / ${PAIRS}`;
}

function elapsed() {
  return started ? Math.round((Date.now() - started) / 1000) : 0;
}

function start() {
  clearInterval(tick);
  clearTimeout(hideTimer);
  stopTracking?.();
  stopTracking = null;
  state = newGame();
  started = 0;
  focusIndex = 0;
  $('#time').textContent = '0:00';
  $('#won').hidden = true;
  $('#announce').textContent = t('announce.new');
  render();
}

async function won() {
  clearInterval(tick);
  const seconds = Math.max(1, elapsed());
  stopTracking?.();
  stopTracking = null;
  $('#time').textContent = clock(seconds);
  $('#won-text').textContent = t('won.text', {
    pairs: PAIRS,
    n: state.moves,
    time: clock(seconds),
  });
  $('#won').hidden = false;
  $('#won').focus();
  $('#announce').textContent = $('#won-text').textContent;
  if (!mn) return;
  try {
    await mn.game.result('win', { moves: state.moves, time: seconds }, seconds);
  } catch {
    window.mnui?.toast(t('toast.notSaved'));
  }
  void showRecords();
}

function pick(i) {
  if (!started) {
    started = Date.now();
    tick = setInterval(() => {
      $('#time').textContent = clock(elapsed());
    }, 1000);
    if (mn) stopTracking = mn.game.track();
  }
  if (state.picked.length === 2) {
    // A third tap turns the two misses back right away.
    clearTimeout(hideTimer);
    state = hideMisses(state);
  }
  const r = flip(state, i);
  if (r.event === 'ignored') return;
  state = r.state;
  focusIndex = i;
  render();
  const shape = shapeLabel(state.cards[i].shape);
  if (r.event === 'first') $('#announce').textContent = t('announce.first', { shape });
  if (r.event === 'match') $('#announce').textContent = t('announce.match', { shape });
  if (r.event === 'miss') {
    $('#announce').textContent = t('announce.miss', { shape });
    hideTimer = setTimeout(() => {
      state = hideMisses(state);
      render();
    }, 900);
  }
  if (r.event === 'won') void won();
}

async function showRecords() {
  if (!mn) return;
  const host = $('#leaders');
  try {
    const [stats, rows] = await Promise.all([mn.game.stats(), mn.game.leaderboard('moves', 5)]);
    const best = stats.records.moves;
    $('#record').textContent =
      best === undefined
        ? t('record.none')
        : stats.records.time
          ? t('record.movesTime', { n: best, time: clock(stats.records.time) })
          : t('record.moves', { n: best });
    host.replaceChildren();
    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'mn-note';
      p.textContent = t('leaders.empty');
      host.append(p);
      return;
    }
    const list = document.createElement('ol');
    list.className = 'mn-list mem-list';
    for (const row of rows) {
      const li = document.createElement('li');
      li.className = row.mine ? 'mine' : '';
      const rank = document.createElement('span');
      rank.className = 'mem-rank';
      rank.textContent = `${row.rank}.`;
      const name = document.createElement('span');
      name.textContent = row.mine ? t('leaders.you', { name: row.username }) : row.username;
      const value = document.createElement('span');
      value.className = 'mn-num';
      value.textContent = t('leaders.value', { n: row.value });
      li.append(rank, name, value);
      list.append(li);
    }
    host.append(list);
  } catch {
    host.textContent = t('leaders.unreachable');
  }
}

$('#board').addEventListener('click', (e) => {
  const btn = e.target.closest('.mem-card');
  if (btn) pick(Number(btn.dataset.i));
});
$('#board').addEventListener('keydown', (e) => {
  const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  const next = focusIndex + moves[e.key];
  if (next < 0 || next >= PAIRS * 2) return;
  focusIndex = next;
  render();
  document.querySelectorAll('.mem-card')[next].focus();
});
$('#restart').addEventListener('click', start);

let playerName;

function renderPlayer() {
  const player = $('#player');
  if (playerName === undefined) return;
  if (playerName) player.textContent = t('player.as', { name: playerName });
  else {
    player.textContent = `${t('player.noName')} `;
    const link = document.createElement('a');
    link.href = new URL('/games', mn.config.portalUrl).toString();
    link.textContent = t('player.setName');
    player.append(link);
  }
}

// Start once the language packages are loaded; a language change redraws the texts that script made.
await window.mnI18n.ready;
start();
window.mnI18n.onChange(() => {
  window.mnI18n.apply();
  renderPlayer();
  render();
  void showRecords();
});
try {
  mn = await window.mininode.mininode();
  await mn.auth.requireLogin();
  $('#hub').href = mn.game.hubUrl();
  playerName = await mn.game.username();
  renderPlayer();
  void showRecords();
} catch {
  // Offline: the game still works, only nothing is recorded.
}
