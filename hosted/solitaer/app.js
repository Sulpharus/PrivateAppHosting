// Solitaer: the table and its input. Rules are in logic.js, the Gaming Hub parts in the kit's
// game.js (login, playtime, results, leaderboard).
import {
  autoStep,
  canAutoFinish,
  cardsAt,
  draw,
  foundationMove,
  isRed,
  move,
  newDeal,
  SUITS,
  tableauMove,
  undo,
} from './logic.js';

const $ = (s) => document.querySelector(s);
const t = (key, params) => window.mnI18n.t(key, params);
// The packages must be there before the first text is made.
await window.mnI18n.ready;
const { format } = window.mnGame;
const TEXT = '︎'; // keeps the suit signs as text, never as colour emoji

const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
let mn = null;
let game = newDeal(random);
let held = null; // { pile, i, from }
let cursor = { zone: 'tab', c: 0, depth: 0 };
let finishing = 0;
let reported = false;

const clock = window.mnGame.timer({
  onTick: (s) => {
    $('#time').textContent = format.seconds(s);
  },
  mn: () => mn,
});

const suitName = (s) => t(`suit.${s}`);
const cardName = (card) => t('card.name', { suit: suitName(card.s), rank: t(`rank.${card.r}`) });
const sameSrc = (a, b) => a && b && a.pile === b.pile && a.i === b.i && a.from === b.from;

// ---- drawing ------------------------------------------------------------------------------

function cardEl(card, attrs, y) {
  const down = !card.up;
  const el = document.createElement(down ? 'span' : 'button');
  el.className = `sol-card${down ? ' down' : ''}${card && !down && isRed(card) ? ' red' : ''}`;
  el.style.setProperty('--y', String(y));
  if (down) {
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  el.type = 'button';
  const rank = document.createElement('span');
  rank.textContent = `${t(`rank.short.${card.r}`)}${SUITS[card.s]}${TEXT}`;
  const big = document.createElement('span');
  big.className = 'big';
  big.setAttribute('aria-hidden', 'true');
  big.textContent = `${SUITS[card.s]}${TEXT}`;
  el.append(rank, big);
  el.setAttribute('aria-label', cardName(card));
  Object.assign(el.dataset, attrs);
  return el;
}

function slotEl(label, attrs, symbol = '') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'sol-card slot';
  el.textContent = symbol;
  el.setAttribute('aria-label', label);
  Object.assign(el.dataset, attrs);
  return el;
}

function pile(...children) {
  const host = document.createElement('div');
  host.className = 'sol-pile';
  host.append(...children);
  return host;
}

function render() {
  const table = $('#table');
  table.replaceChildren();
  // Top row: stock, waste, gap, four foundations.
  table.append(
    pile(
      game.stock.length
        ? Object.assign(slotEl(t('slot.stock', { n: game.stock.length }), { pile: 's' }), {
            textContent: String(game.stock.length),
          })
        : slotEl(t('slot.stockEmpty'), { pile: 's' }, '↺'),
    ),
  );
  const waste = game.waste[game.waste.length - 1];
  table.append(
    pile(waste ? cardEl(waste, { pile: 'w' }, 0) : slotEl(t('slot.waste'), { pile: 'w' })),
  );
  const spacer = document.createElement('div');
  spacer.className = 'sol-spacer';
  table.append(spacer);
  game.foundations.forEach((cards, i) => {
    const top = cards[cards.length - 1];
    table.append(
      pile(
        top
          ? cardEl(top, { pile: 'f', i: String(i) }, 0)
          : slotEl(
              t('slot.foundation', { suit: suitName(i) }),
              { pile: 'f', i: String(i) },
              SUITS[i] + TEXT,
            ),
      ),
    );
  });
  game.tableau.forEach((cards, i) => {
    const host = pile();
    let y = 0;
    if (!cards.length)
      host.append(slotEl(t('slot.column', { n: i + 1 }), { pile: 't', i: String(i), from: '0' }));
    cards.forEach((card, from) => {
      host.append(cardEl(card, { pile: 't', i: String(i), from: String(from) }, y));
      y += card.up ? 0.5 : 0.22;
    });
    host.style.setProperty(
      '--h',
      String(Math.max(1.4, y - (cards.length ? card0(cards) : 0) + 1.4)),
    );
    table.append(host);
  });

  for (const el of table.querySelectorAll('[data-pile]')) {
    el.tabIndex = -1;
    if (held && sameSrc(srcOf(el), held)) el.classList.add('held');
  }
  const current = elAtCursor();
  if (current) current.tabIndex = 0;

  $('#moves').textContent = String(game.moves);
  $('#score').textContent = String(game.score);
  $('#undo').disabled = game.history.length === 0 || game.status !== 'playing';
  $('#finish').hidden = !canAutoFinish(game) || finishing !== 0;
}
// The offset of the last card does not add to the pile's height (it is the card itself).
function card0(cards) {
  const last = cards[cards.length - 1];
  return last.up ? 0.5 : 0.22;
}

const srcOf = (el) => ({
  pile: el.dataset.pile,
  i: el.dataset.i === undefined ? undefined : Number(el.dataset.i),
  from: el.dataset.from === undefined ? undefined : Number(el.dataset.from),
});

// ---- cursor (keyboard) --------------------------------------------------------------------

const TOP_COLS = [0, 1, 3, 4, 5, 6];
function elAtCursor() {
  const table = $('#table');
  if (cursor.zone === 'top') {
    const c = cursor.c;
    const sel =
      c === 0
        ? '[data-pile="s"]'
        : c === 1
          ? '[data-pile="w"]'
          : `[data-pile="f"][data-i="${c - 3}"]`;
    return table.querySelector(sel);
  }
  const len = game.tableau[cursor.c].length;
  const from = Math.min(cursor.depth, Math.max(0, len - 1));
  return table.querySelector(`[data-pile="t"][data-i="${cursor.c}"][data-from="${from}"]`);
}

function setCursorFromEl(el) {
  const { pile: p, i, from } = srcOf(el);
  if (p === 's') cursor = { zone: 'top', c: 0, depth: 0 };
  else if (p === 'w') cursor = { zone: 'top', c: 1, depth: 0 };
  else if (p === 'f') cursor = { zone: 'top', c: 3 + i, depth: 0 };
  else cursor = { zone: 'tab', c: i, depth: from };
}

function moveCursor(key) {
  if (cursor.zone === 'top') {
    const at = TOP_COLS.indexOf(cursor.c);
    if (key === 'ArrowLeft') cursor.c = TOP_COLS[Math.max(0, at - 1)];
    else if (key === 'ArrowRight') cursor.c = TOP_COLS[Math.min(TOP_COLS.length - 1, at + 1)];
    else if (key === 'ArrowDown') cursor = { zone: 'tab', c: cursor.c, depth: 99 };
  } else {
    const len = game.tableau[cursor.c].length;
    const depth = Math.min(cursor.depth, Math.max(0, len - 1));
    if (key === 'ArrowLeft') cursor = { zone: 'tab', c: Math.max(0, cursor.c - 1), depth };
    else if (key === 'ArrowRight') cursor = { zone: 'tab', c: Math.min(6, cursor.c + 1), depth };
    else if (key === 'ArrowDown') cursor.depth = Math.min(len - 1, depth + 1);
    else if (key === 'ArrowUp') {
      if (depth > 0 && game.tableau[cursor.c][depth - 1].up) cursor.depth = depth - 1;
      else cursor = { zone: 'top', c: cursor.c === 2 ? 1 : cursor.c, depth: 0 };
    }
  }
  render();
  elAtCursor()?.focus();
}

// ---- playing ------------------------------------------------------------------------------

function say(text) {
  $('#announce').textContent = text;
}

function begin() {
  if (!clock.running && game.status === 'playing') clock.start();
}

async function afterMove() {
  render();
  if (game.status === 'won') await won();
}

async function won() {
  const seconds = Math.max(1, clock.stop());
  clearInterval(finishing);
  finishing = 0;
  $('#end-title').textContent = t('end.won');
  $('#end-text').textContent = t('end.wonText', {
    time: format.seconds(seconds),
    n: game.moves,
    score: game.score,
  });
  $('#end').hidden = false;
  $('#end').focus();
  say(t('say.won', { text: $('#end-text').textContent }));
  render();
  if (!reported) {
    reported = true;
    await window.mnGame.report(
      mn,
      'win',
      { time: seconds, moves: Math.max(52, game.moves), score: game.score },
      seconds,
    );
    void showRecords();
  }
}

function act(src) {
  if (game.status !== 'playing') return;
  if (src.pile === 's') {
    held = null;
    begin();
    if (draw(game))
      say(
        game.waste.length
          ? t('say.drawn', { card: cardName(game.waste[game.waste.length - 1]) })
          : t('say.reshuffled'),
      );
    return void afterMove();
  }
  if (held) {
    if (sameSrc(src, held)) {
      // A second tap: send the card where it belongs.
      const from = held;
      held = null;
      const dst = foundationMove(game, from) ?? tableauMove(game, from);
      if (dst && move(game, from, dst)) {
        begin();
        return void afterMove();
      }
      return render();
    }
    const dst =
      src.pile === 'f' ? { pile: 'f' } : src.pile === 't' ? { pile: 't', i: src.i } : null;
    const from = held;
    if (dst && move(game, from, dst)) {
      held = null;
      begin();
      return void afterMove();
    }
    // Not legal: pick up the tapped card instead, or let go.
    held = cardsAt(game, src) && src.pile !== 'f' ? src : null;
    if (!held) say(t('say.nope'));
    return render();
  }
  if (cardsAt(game, src) && src.pile !== 'f') {
    held = src;
    say(t('say.picked'));
  }
  render();
}

// A card tapped twice is sent on by itself; src must carry the same pile data as `held`.
$('#table').addEventListener('click', (e) => {
  const el = e.target.closest('[data-pile]');
  if (!el) return;
  setCursorFromEl(el);
  act(srcOf(el));
});
$('#table').addEventListener('dblclick', (e) => {
  const el = e.target.closest('[data-pile]');
  if (!el || game.status !== 'playing') return;
  const src = srcOf(el);
  const dst = foundationMove(game, src);
  if (dst && move(game, src, dst)) {
    held = null;
    begin();
    void afterMove();
  }
});
$('#table').addEventListener('keydown', (e) => {
  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    moveCursor(e.key);
  } else if (e.key === 'f' || e.key === 'F') {
    const el = elAtCursor();
    if (!el) return;
    const src = srcOf(el);
    const dst = foundationMove(game, src);
    if (dst && move(game, src, dst)) {
      held = null;
      begin();
      void afterMove();
    }
  } else if (e.key === 'd' || e.key === 'D') {
    act({ pile: 's' });
  } else if (e.key === 'z' || e.key === 'Z') {
    held = null;
    undo(game);
    render();
  } else if (e.key === 'Escape') {
    held = null;
    render();
  }
});

$('#undo').addEventListener('click', () => {
  held = null;
  undo(game);
  render();
});

$('#finish').addEventListener('click', () => {
  if (finishing) return;
  $('#finish').hidden = true;
  finishing = setInterval(() => {
    if (!autoStep(game)) {
      clearInterval(finishing);
      finishing = 0;
    }
    void afterMove();
  }, 70);
});

$('#giveup').addEventListener('click', async () => {
  if (game.status !== 'playing' || !game.moves) return;
  const seconds = Math.max(1, clock.stop());
  game.status = 'lost';
  $('#end-title').textContent = t('end.gaveUp');
  $('#end-text').textContent = t('end.gaveUpText', {
    time: format.seconds(seconds),
    n: game.moves,
  });
  $('#end').hidden = false;
  $('#end').focus();
  render();
  await window.mnGame.report(mn, 'loss', {}, seconds);
});

function newGame() {
  clearInterval(finishing);
  finishing = 0;
  clock.reset();
  game = newDeal(random);
  held = null;
  reported = false;
  cursor = { zone: 'tab', c: 0, depth: 0 };
  $('#end').hidden = true;
  say(t('say.new'));
  render();
}
$('#restart').addEventListener('click', newGame);

async function showRecords() {
  const best = await window.mnGame.leaders(mn, '#leaders', {
    stat: 'score',
    format: (n) => t('unit.points', { n }),
  });
  $('#record').textContent = best === undefined ? '' : t('record.best', { n: best });
}

newGame();
window.mnI18n.onChange(() => {
  window.mnI18n.apply();
  render();
  void showRecords();
});
(async () => {
  mn = await window.mnGame.connect({ player: '#player', hub: '#hub' });
  clock.attach();
  void showRecords();
})();
