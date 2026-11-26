// The typing screen: the text, live figures, the on-screen keyboard and the result.

import { CHORD_WINDOW, createChordInput } from './chordinput.js';
import { chordKey } from './chords.js';
import { h, icon, starRow, upper } from './dom.js';
import * as engine from './engine.js';
import { berlinDate } from './generator.js';
import { FINGERS, getLayout, locate, modifierFor, ROWS } from './layouts.js';
import { addSession, saveProgress, state, t } from './state.js';
import { dayKey, nextDaily, previousBest } from './stats.js';

const CLASS = ['', 's-ok', 's-wrong', 's-fixed', 's-auto'];

let view = null;

/**
 * Starts a run in the main area.
 * spec: { mode, course, level?, target?, title, subtitle, text, difficulty?, ranked?, textId?,
 *         onNext?: () => void, onExit: () => void }
 */
export function startRun(spec) {
  stopRun();
  const layout = spec.layout ?? getLayout(state.settings.layout);
  const run = engine.createRun(spec.text, { stopOnError: state.settings.errorMode !== 'continue' });
  state.run = { spec, run };
  const main = document.getElementById('main');
  const title = document.getElementById('title');
  title.removeAttribute('data-i18n');
  title.textContent = spec.title;
  document.getElementById('sub').textContent = spec.subtitle;
  document.getElementById('tools').replaceChildren();
  placeCorner(
    h(
      'button',
      {
        class: 'mn-icon-btn tt-corner',
        type: 'button',
        'aria-label': t('run.cancel'),
        title: t('run.cancelHint'),
        onclick: () => exit(spec),
      },
      icon('close'),
    ),
  );

  const kpiWpm = h('b', { class: 'mn-num' }, '0');
  const kpiAcc = h('b', { class: 'mn-num' }, '100 %');
  const kpiLeft = h('b', { class: 'mn-num' }, '0 %');
  const textEl = h('div', {
    class: `tt-text${spec.code ? ' tt-text--code' : ''}`,
    'aria-hidden': 'true',
  });
  const spans = [];
  const frag = document.createDocumentFragment();
  for (const ch of run.text) {
    const span = document.createElement('span');
    if (ch === '\n') {
      span.textContent = '↵\n';
      span.className = 'nl';
    } else if (ch === ' ') {
      span.textContent = ' ';
      span.className = 'sp';
    } else span.textContent = ch;
    spans.push(span);
    frag.append(span);
  }
  textEl.append(frag);
  const capture = h('textarea', {
    class: 'tt-capture',
    'aria-label': t('run.captureLabel'),
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    rows: '1',
  });
  const paused = h(
    'button',
    { class: 'tt-paused', type: 'button', onclick: () => capture.focus() },
    t('run.resume'),
  );
  const board = h('div', { class: 'mn-card tt-board' }, textEl, capture, paused);
  board.addEventListener('click', () => capture.focus());
  const announce = h('p', { class: 'mn-sr-only', 'aria-live': 'polite' });
  const hint = h('p', { class: 'mn-note tt-hint' }, t('run.startHint'));
  const keyboard = state.settings.keyboard ? buildKeyboard(layout) : null;

  main.replaceChildren(
    h(
      'div',
      { class: 'tt-run' },
      h(
        'div',
        { class: 'mn-kpis tt-live' },
        h('div', { class: 'mn-kpi' }, kpiWpm, h('span', {}, t('run.wpm'))),
        h('div', { class: 'mn-kpi' }, kpiAcc, h('span', {}, t('run.accuracy'))),
        h('div', { class: 'mn-kpi' }, kpiLeft, h('span', {}, t('run.progress'))),
      ),
      board,
      hint,
      keyboard?.el,
      announce,
    ),
  );

  view = {
    spec,
    run,
    layout,
    spans,
    textEl,
    capture,
    board,
    hint,
    keyboard,
    kpiWpm,
    kpiAcc,
    kpiLeft,
    announce,
    lineTop: -1,
    timer: 0,
    shown: -1,
    // Chord lessons: word → keys, and the chord key → word for recognising a chord.
    chords: spec.chords ?? null,
    chordWords: spec.chords
      ? new Map([...spec.chords].map(([word, keys]) => [chordKey(keys), word]))
      : null,
    // Telling chords from fast typing (js/chordinput.js), and its window timer.
    keys: spec.chords ? createChordInput() : null,
    keyTimer: 0,
  };
  mark(view, 0);
  showNext(view);

  capture.addEventListener('beforeinput', onBeforeInput);
  capture.addEventListener('compositionend', onComposition);
  capture.addEventListener('keydown', onKeyDown);
  capture.addEventListener('keyup', onKeyUp);
  capture.addEventListener('focus', () => board.classList.remove('is-paused'));
  capture.addEventListener('blur', () => {
    // Releases of keys held while focus leaves never arrive: settle waiting letters now.
    if (view?.keys) apply(view, view.keys.reset());
    if (state.run && !engine.isDone(run)) board.classList.add('is-paused');
  });
  capture.focus({ preventScroll: true });
  board.scrollIntoView({ block: 'nearest' });
  view.timer = window.setInterval(() => updateLive(view), 300);
}

/** A button at the right of the header (next to the title on phones too). */
export function placeCorner(button) {
  const inner = document.querySelector('.mn-top-inner');
  inner.querySelector('.tt-corner')?.remove();
  if (button) inner.append(button);
}

export function stopRun() {
  if (view?.timer) window.clearInterval(view.timer);
  if (view?.keyTimer) window.clearTimeout(view.keyTimer);
  view = null;
  state.run = null;
  state.result = false;
}

function exit(spec) {
  stopRun();
  spec.onExit();
}

function onKeyDown(e) {
  const v = view;
  if (!v) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    exit(v.spec);
    return;
  }
  if (e.key === 'Tab') {
    // Code uses spaces; Tab would leave the field.
    e.preventDefault();
    return;
  }
  if (!v.keys) return;
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    // Chord lessons read characters from the key events themselves, so a chord can be told
    // apart from fast typing before anything is written.
    e.preventDefault();
    if (e.repeat) return;
    apply(v, v.keys.down(e.key, e.code, performance.now()));
  } else {
    // Backspace, Enter, dead keys, AltGr: letters still waiting go first.
    apply(v, v.keys.flush());
  }
}

function onKeyUp(e) {
  const v = view;
  if (v?.keys) apply(v, v.keys.up(e.code));
}

/** Runs the actions of the chord input and keeps its window timer. */
function apply(v, actions) {
  for (const action of actions) {
    if (view !== v) return;
    if (action.type === 'char') typeChar(action.ch);
    else playChord(v, action.chars);
  }
  window.clearTimeout(v.keyTimer);
  if (v.keys.waiting) {
    v.keyTimer = window.setTimeout(() => {
      if (view === v) apply(v, v.keys.tick(performance.now()));
    }, CHORD_WINDOW + 1);
  }
}

/**
 * Keys held together: the word at the caret if they are its chord; a known chord in the wrong
 * place is a mistake; anything else was fast typing and is typed in pressing order.
 */
function playChord(v, chars) {
  if (v.finished) return;
  const word = v.chordWords.get(chordKey(chars.map((ch) => ch.toLowerCase())));
  if (!word) {
    for (const ch of chars) typeChar(ch);
    return;
  }
  const expected = engine.wordAt(v.run);
  const res =
    word === expected?.toLowerCase() ? engine.inputWord(v.run, expected, performance.now()) : null;
  if (res) {
    for (const i of res.changed) v.spans[i].className = spanClass(v, i);
    if (res.done) return finish(v);
  } else {
    const miss = engine.chordMiss(v.run, performance.now());
    if (!miss) return;
    for (const i of miss.changed) v.spans[i].className = spanClass(v, i);
    v.announce.textContent = expected
      ? t('run.chordWrong', { word: expected })
      : t('run.chordNoWord');
  }
  mark(v, v.run.pos);
  showNext(v);
}

function onBeforeInput(e) {
  if (!view) return;
  const type = e.inputType;
  if (type === 'insertCompositionText') return;
  e.preventDefault();
  if (type === 'insertText' && e.data) for (const ch of e.data) typeChar(ch);
  else if (type === 'insertLineBreak' || type === 'insertParagraph') typeChar('\n');
  else if (type === 'deleteContentBackward') erase();
}

function onComposition(e) {
  if (!view) return;
  if (view.keys) apply(view, view.keys.flush());
  for (const ch of e.data ?? '') typeChar(ch);
  view.capture.value = '';
}

function typeChar(ch) {
  const v = view;
  if (!v || v.finished) return;
  const res = engine.input(v.run, ch, performance.now());
  if (!res) return;
  for (const i of res.changed) v.spans[i].className = spanClass(v, i);
  if (!res.correct) {
    const expected = v.run.text[res.changed[0]];
    v.announce.textContent = t('run.announceWrong', {
      key: expected === ' ' ? t('key.space') : expected === '\n' ? t('key.enter') : expected,
    });
    v.board.classList.remove('flash');
    // Restart the short flash (transform only).
    void v.board.offsetWidth;
    v.board.classList.add('flash');
  }
  if (res.done) return finish(v);
  mark(v, v.run.pos);
  showNext(v);
}

function erase() {
  const v = view;
  if (!v || v.finished) return;
  const res = engine.backspace(v.run);
  if (!res) return;
  for (const i of res.changed) v.spans[i].className = spanClass(v, i);
  mark(v, v.run.pos);
  showNext(v);
}

function spanClass(v, i) {
  const base = v.run.text[i] === '\n' ? 'nl' : v.run.text[i] === ' ' ? 'sp' : '';
  const status = CLASS[v.run.status[i]];
  return [base, status, i === v.run.pos ? 'cur' : ''].filter(Boolean).join(' ');
}

/** Moves the caret and keeps its line as the second visible line. */
function mark(v, pos) {
  const span = v.spans[pos];
  if (!span) return;
  span.className = spanClass(v, pos);
  // Long tokens can wrap mid-word, so the line is checked on every move (one cheap read).
  const top = span.offsetTop;
  if (top !== v.lineTop) {
    v.lineTop = top;
    const line = span.offsetHeight || 32;
    v.textEl.scrollTop = Math.max(0, top - line - 4);
  }
}

/** Highlights the next key, its modifier and the finger; relabels the keyboard per layer. */
function showNext(v) {
  const ch = v.run.text[v.run.pos];
  if (ch === undefined) return;
  // In chord lessons, a word with a chord shows all its keys at once.
  const word = v.chords ? engine.wordAt(v.run) : null;
  const keys = word ? v.chords.get(word.toLocaleLowerCase('de-DE')) : null;
  if (keys) {
    const places = keys.map((k) => locate(v.layout, k)).filter(Boolean);
    if (v.keyboard)
      v.keyboard.show(
        places[0],
        null,
        places.slice(1).map((p) => p.key),
      );
    v.hint.textContent = t('run.chordHint', {
      word,
      keys: keys.map((k) => upper(k)).join(' + '),
    });
    return;
  }
  const place = locate(v.layout, ch);
  const mod = modifierFor(v.layout, place);
  if (v.keyboard) v.keyboard.show(place, mod);
  const finger =
    place?.key === 'SPCE' ? 'thumb' : place?.key === 'RTRN' ? 'r4' : FINGERS[place?.key];
  const keyName = ch === ' ' ? t('key.space') : ch === '\n' ? t('key.enter') : ch;
  let text = finger
    ? t('run.next', { key: keyName, finger: t(`finger.${finger}`) })
    : t('run.nextUnknown', { key: keyName });
  if (mod === 'LSHIFT' || mod === 'RSHIFT')
    text = t(mod === 'LSHIFT' ? 'run.withShiftLeft' : 'run.withShiftRight', { text });
  else if (mod) text = t('run.withThird', { text, mod: v.layout.third?.label ?? '' });
  v.hint.textContent = text;
}

function updateLive(v) {
  if (!v.run.startedAt) return;
  const live = engine.live(v.run, performance.now());
  const nf = new Intl.NumberFormat(window.mnI18n.locale, { maximumFractionDigits: 0 });
  v.kpiWpm.textContent = nf.format(live.wpm);
  v.kpiAcc.textContent = new Intl.NumberFormat(window.mnI18n.locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(live.accuracy / 100);
  v.kpiLeft.textContent = new Intl.NumberFormat(window.mnI18n.locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(live.progress);
}

function buildKeyboard(layout) {
  const keys = new Map();
  const el = h('div', { class: 'tt-kbd', 'aria-hidden': 'true' });
  const special = (id, label, cls) => {
    const k = h('span', { class: `tt-key tt-key--${cls}` }, label);
    keys.set(id, k);
    return k;
  };
  const rowEls = ROWS.map((row, r) => {
    const rowEl = h('div', { class: 'tt-kbd-row' });
    if (r === 1) rowEl.append(special('TAB', '⇥', 'tab'));
    if (r === 2) rowEl.append(special('CAPS', layout.family === 'neo' ? 'M3' : '⇪', 'caps'));
    if (r === 3) rowEl.append(special('LSHIFT', '⇧', 'lshift'));
    for (const id of row) {
      const k = h('span', { class: 'tt-key', dataset: { finger: FINGERS[id] } });
      keys.set(id, k);
      rowEl.append(k);
    }
    if (r === 0) rowEl.append(special('BKSP', '⌫', 'bksp'));
    if (r === 1) rowEl.append(special('RTRN', '↵', 'enter'));
    if (r === 3) rowEl.append(special('RSHIFT', '⇧', 'rshift'));
    return rowEl;
  });
  const bottom = h('div', { class: 'tt-kbd-row' }, special('SPCE', '', 'space'));
  if (layout.third?.keys.includes('RALT')) bottom.append(special('RALT', 'AltGr', 'alt'));
  el.append(...rowEls, bottom);
  let shownLayer = -1;
  let lit = [];
  const label = (layer) => {
    for (const row of ROWS)
      for (const id of row) {
        const chars = layout.keys[id];
        let text = chars?.[layer] ?? '';
        if (layer === 0 && /^\p{Ll}$/u.test(text) && text !== 'ß') text = text.toLocaleUpperCase();
        const k = keys.get(id);
        k.textContent = text;
        k.classList.toggle('is-mod3', id === 'AC11' && layout.third?.keys.includes('AC11'));
        if (layout.third?.keys.includes(id)) k.textContent = layout.third.label;
      }
  };
  return {
    el,
    show(place, mod, extra = []) {
      const layer = place?.layer === 2 ? 2 : 0;
      if (layer !== shownLayer) {
        label(layer);
        shownLayer = layer;
      }
      for (const k of lit) k.classList.remove('next');
      lit = [];
      for (const id of [place?.key, mod, ...extra]) {
        const k = id && keys.get(id);
        if (k) {
          k.classList.add('next');
          lit.push(k);
        }
      }
    },
  };
}

async function finish(v) {
  // Typing or Backspace while the result is saved must not finish the run a second time.
  if (v.finished) return;
  v.finished = true;
  window.clearInterval(v.timer);
  updateLive(v);
  const res = engine.result(v.run);
  const spec = v.spec;
  const today = dayKey();
  const stars = spec.mode === 'lesson' ? engine.stars(res, spec.target) : null;
  const daily =
    spec.mode === 'daily'
      ? nextDaily(
          state.progress.daily,
          res,
          berlinDate(),
          berlinDate(new Date(Date.now() - 24 * 3600 * 1000)),
        )
      : null;
  const ranked = Boolean(daily);
  const row = {
    mode: spec.mode,
    course: spec.course,
    level: spec.level ?? null,
    layout: v.layout.id,
    difficulty: spec.difficulty ?? null,
    ranked,
    wpm: Math.min(400, res.wpm),
    accuracy: res.accuracy,
    chars: res.chars,
    errors: res.errors,
    duration_ms: Math.round(res.ms),
    stars,
    practised_on: today,
    details: { keys: res.keys, ...(spec.textId ? { textId: spec.textId } : {}) },
  };
  const before = previousBest(state.sessions, row);
  let saveError = null;
  try {
    await addSession(row);
    if (daily) await saveProgress({ ...state.progress, daily });
  } catch (error) {
    saveError = error;
  }
  if (view !== v) return;
  showResult(v, res, {
    stars,
    ranked,
    record: before !== null && res.wpm > before,
    saveError,
    row,
  });
}

function showResult(v, res, { stars, ranked, record, saveError, row }) {
  const spec = v.spec;
  state.run = null;
  state.result = true;
  const locale = window.mnI18n.locale;
  const nf1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const seconds = Math.round(res.ms / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const worst = Object.entries(res.keys)
    .filter(([ch, [, wrong]]) => wrong > 0 && ch !== '\n')
    .sort((a, b) => b[1][1] - a[1][1])
    .slice(0, 6);
  const next = spec.onNext
    ? h(
        'button',
        { class: 'mn-btn mn-btn--primary', type: 'button', onclick: () => spec.onNext() },
        spec.mode === 'lesson' && stars >= 1 ? t('result.nextLevel') : t('result.next'),
      )
    : null;
  const again = h(
    'button',
    { class: 'mn-btn', type: 'button', onclick: () => spec.onAgain() },
    t('result.again'),
  );
  const back = h(
    'button',
    { class: 'mn-btn mn-btn--ghost', type: 'button', onclick: () => exit(spec) },
    t('result.back'),
  );
  const card = h(
    'section',
    { class: 'mn-card tt-result', tabindex: '-1', 'aria-labelledby': 'result-title' },
    h('h2', { id: 'result-title' }, t('result.title')),
    saveError
      ? h('div', { class: 'mn-banner mn-banner--bad', role: 'alert' }, t('result.saveError'))
      : null,
    h('p', { class: 'mn-big mn-num' }, t('result.wpm', { wpm: nf1.format(row.wpm) })),
    record
      ? h(
          'p',
          { class: 'mn-chip mn-chip--ok' },
          icon('badge', { filled: true }),
          t('result.record'),
        )
      : null,
    stars !== null
      ? h(
          'div',
          { class: 'tt-result-stars' },
          starRow(stars, t('stars.label', { n: stars })),
          h(
            'span',
            {},
            stars === 0 ? t('result.noStar') : t('result.target', { wpm: spec.target }),
          ),
        )
      : null,
    spec.mode === 'daily'
      ? h('p', { class: 'mn-note' }, ranked ? t('result.dailyRanked') : t('result.dailyPractice'))
      : null,
    h(
      'div',
      { class: 'mn-kpis' },
      h(
        'div',
        { class: 'mn-kpi' },
        h('b', { class: 'mn-num' }, pct.format(res.accuracy / 100)),
        h('span', {}, t('run.accuracy')),
      ),
      h(
        'div',
        { class: 'mn-kpi' },
        h('b', { class: 'mn-num' }, time),
        h('span', {}, t('result.time')),
      ),
      h(
        'div',
        { class: 'mn-kpi' },
        h('b', { class: 'mn-num' }, String(res.errors)),
        h('span', {}, t('result.errors')),
      ),
    ),
    worst.length
      ? h(
          'div',
          { class: 'tt-worst' },
          h('h3', {}, t('result.worstKeys')),
          h(
            'div',
            { class: 'mn-chips' },
            worst.map(([ch, [, wrong]]) =>
              h(
                'span',
                { class: 'mn-chip mn-chip--warn' },
                t('result.keyErrors', { key: ch === ' ' ? t('key.space') : ch, n: wrong }),
              ),
            ),
          ),
        )
      : null,
    h('div', { class: 'tt-actions' }, back, again, next),
  );
  document.getElementById('main').replaceChildren(card);
  card.focus({ preventScroll: false });
  if (record) window.mnui.toast(t('result.recordToast', { wpm: nf1.format(row.wpm) }));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === card) (next ?? again).click();
  });
}
