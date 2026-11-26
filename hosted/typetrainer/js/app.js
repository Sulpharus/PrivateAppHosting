// Typetrainer: start-up, routing, the "Üben" view and the learning path.
import { chordTable } from './chords.js';
import { CODE_LANGUAGES, getCodeLanguage } from './code.js';
import { clear, fill, h, icon, skeleton, starRow, upper } from './dom.js';
import {
  adapt,
  berlinDate,
  dailyText,
  msToBerlinMidnight,
  mulberry32,
  practiceCode,
  practiceText,
  randomSeed,
  weakText,
} from './generator.js';
import { getLayout, LAYOUTS } from './layouts.js';
import { placeCorner, startRun, stopRun } from './run.js';
import { renderSettings, showShortcuts } from './settings.js';
import { loadAll, saveSettings, state, t, textLang } from './state.js';
import { dayKey, minutesOn, streak, unlockedFrom, weakKeys } from './stats.js';
import { renderStats } from './statsview.js';
import { renderTexts, textShortcut } from './texts.js';
import {
  BRANCHES,
  continueCourse,
  courseLevels,
  courseOf,
  FOCUS,
  isComplete,
  isOpen,
  levelText,
  parseCourse,
} from './tree.js';

const main = () => document.getElementById('main');

/** Title, subtitle and tools of a view; `corner` is a round button at the right (the add button). */
export function setHeader(title, sub = '', tools = [], corner = null) {
  const el = document.getElementById('title');
  el.removeAttribute('data-i18n');
  el.textContent = title;
  document.getElementById('sub').textContent = sub;
  document.getElementById('tools').replaceChildren(...tools);
  placeCorner(corner);
}

export function errorBox(message, retry) {
  return h(
    'div',
    { class: 'mn-banner mn-banner--bad tt-error', role: 'alert' },
    h('span', {}, message),
    h('button', { class: 'mn-btn', type: 'button', onclick: retry }, t('common.retry')),
  );
}

// ---------- courses (the tree per layout, js/tree.js) ----------

export { courseLevels };

/** "Neo 2 · Chording"; older runs without a layout ("code:python") show the language. */
export function courseName(course) {
  const parsed = parseCourse(course);
  if (parsed) return `${getLayout(parsed.layout).name} · ${t(`branch.${parsed.branch}`)}`;
  if (course.startsWith('code:')) return getCodeLanguage(course.slice(5)).name;
  return course;
}

export function levelTitle(level) {
  if (level.kind === 'code') return t(`code.level.${level.id}`);
  if (level.kind === 'letters') {
    const keys = level.fresh.map((ch) => (/\p{L}/u.test(ch) ? upper(ch) : ch)).join(' ');
    return t('level.letters', { keys });
  }
  if (level.kind === 'chords')
    return t('level.chords', { from: level.range[0] + 1, to: level.range[1] });
  return t(`level.${level.kind}`);
}

export const unlockedLevel = (course) => unlockedFrom(state.stars, course);
export const starsOf = (course, n) => state.stars[`${course}#${n}`] ?? 0;

/** Number of levels per course of every layout (for the "all stars" badge). */
export function levelCounts() {
  const out = {};
  for (const l of LAYOUTS)
    for (const b of BRANCHES) out[courseOf(l.id, b.id)] = courseLevels(courseOf(l.id, b.id)).length;
  return out;
}

/** The course to continue on the selected layout: Grundlagen first, then the focus. */
export function currentCourse() {
  return continueCourse(state.stars, state.settings.layout, state.settings.focus);
}

export function startLesson(course, number) {
  const parsed = parseCourse(course);
  const levels = courseLevels(course);
  const level = levels[number - 1];
  if (!parsed || !level) return;
  // Lessons of another layout keep their own keys; the computer must use that layout too.
  const layout = getLayout(parsed.layout);
  const { text, chords, code } = levelText(layout, level, textLang(), mulberry32(randomSeed()));
  startRun({
    mode: 'lesson',
    course,
    level: number,
    target: level.target,
    code: Boolean(code),
    chords,
    layout,
    title: levelTitle(level),
    subtitle: t('run.lessonSub', { course: courseName(course), n: number, count: levels.length }),
    text,
    onAgain: () => startLesson(course, number),
    onNext: () =>
      startLesson(
        course,
        Math.min(levels.length, unlockedLevel(course) > number ? number + 1 : number),
      ),
    onExit: () => route(),
  });
}

export function startPractice(
  kind = state.settings.practiceKind,
  difficulty = state.settings.difficulty,
) {
  const layout = getLayout(state.settings.layout);
  const rng = mulberry32(randomSeed());
  const code = kind === 'code';
  const lang = state.settings.codeLanguage;
  const text = code
    ? practiceCode(lang, difficulty, rng)
    : practiceText(textLang(), difficulty, rng);
  startRun({
    mode: 'practice',
    course: code ? `code:${lang}` : 'text',
    difficulty,
    code,
    title: code
      ? t('run.practiceCode', { lang: getCodeLanguage(lang).name })
      : t('run.practiceText'),
    subtitle: t('run.practiceSub', {
      difficulty: t(`difficulty.${difficulty}`),
      layout: layout.name,
    }),
    text: adapt(text, layout),
    onAgain: () => startPractice(kind, difficulty),
    onNext: () => startPractice(kind, difficulty),
    onExit: () => route(),
  });
}

export function startDaily() {
  const layout = getLayout(state.settings.layout);
  const date = berlinDate();
  const done = state.progress.daily.last === date;
  startRun({
    mode: 'daily',
    course: 'text',
    difficulty: 'mittel',
    title: t('daily.title'),
    subtitle: done ? t('daily.practiceSub') : t('daily.rankedSub'),
    text: adapt(dailyText(date, textLang()), layout),
    onAgain: () => startDaily(),
    onExit: () => route(),
  });
}

export function startWeak() {
  const layout = getLayout(state.settings.layout);
  const keys = weakKeys(state.sessions).map((k) => k.ch);
  const text = weakText(textLang(), keys, mulberry32(randomSeed()));
  startRun({
    mode: 'weak',
    course: 'text',
    title: t('weak.title'),
    subtitle: t('weak.sub', { keys: keys.join(' ') }),
    text: adapt(text, layout),
    onAgain: () => startWeak(),
    onNext: () => startWeak(),
    onExit: () => route(),
  });
}

// ---------- view: Üben ----------

function renderHome() {
  const s = state.settings;
  const layout = getLayout(s.layout);
  const today = dayKey();
  const days = streak(state.sessions, today);
  setHeader(
    t('home.title'),
    days > 0
      ? t('home.subStreak', { layout: layout.name, n: days })
      : t('home.sub', { layout: layout.name }),
  );
  const root = clear(main());
  if (state.loading) return root.append(skeleton(180, 120, 120));
  if (state.error) return root.append(errorBox(t('common.loadError'), () => boot()));

  // Continue the learning path.
  const courseId = currentCourse();
  const levels = courseLevels(courseId);
  const number = Math.min(unlockedLevel(courseId), levels.length);
  const level = levels[number - 1];
  const levelStars = starsOf(courseId, number);
  const continueCard = h(
    'section',
    { class: 'mn-card tt-continue', 'aria-labelledby': 'continue-title' },
    h('p', { class: 'tt-eyebrow' }, t('home.continue', { course: courseName(courseId) })),
    h('h2', { id: 'continue-title' }, levelTitle(level)),
    h(
      'p',
      { class: 'mn-muted' },
      t('home.levelOf', { n: number, count: levels.length }),
      ' · ',
      t('home.target', { wpm: level.target }),
    ),
    starRow(levelStars, t('stars.label', { n: levelStars })),
    h(
      'div',
      { class: 'tt-actions' },
      h('a', { class: 'mn-btn', href: `#/pfad/${state.settings.layout}` }, t('home.allLevels')),
      h(
        'button',
        {
          class: 'mn-btn mn-btn--primary',
          type: 'button',
          title: t('home.startHint'),
          onclick: () => startLesson(courseId, number),
        },
        icon('play', { filled: true }),
        t('home.start'),
      ),
    ),
  );

  // Today: minutes against the goal, streak, best speed.
  const minutes = minutesOn(state.sessions, today);
  const goal = s.dailyMinutes;
  const nf = new Intl.NumberFormat(window.mnI18n.locale, { maximumFractionDigits: 0 });
  const best = state.sessions.length ? Math.max(...state.sessions.map((x) => Number(x.wpm))) : 0;
  const todayCard = h(
    'section',
    { class: 'tt-today', 'aria-labelledby': 'today-title' },
    h('div', { class: 'mn-sect' }, h('h2', { id: 'today-title' }, t('home.today'))),
    h(
      'div',
      { class: 'mn-kpis' },
      h(
        'div',
        { class: 'mn-kpi' },
        h('b', { class: 'mn-num' }, t('home.minutesOf', { n: nf.format(minutes), goal })),
        h('span', {}, t('home.goal')),
      ),
      h(
        'div',
        { class: 'mn-kpi' },
        h('b', { class: 'mn-num' }, nf.format(days)),
        h('span', {}, t('home.streak', { n: days })),
      ),
      h(
        'div',
        { class: 'mn-kpi' },
        h('b', { class: 'mn-num' }, nf.format(best)),
        h('span', {}, t('home.best')),
      ),
    ),
    h(
      'div',
      { class: 'mn-bar' },
      h(
        'span',
        { class: 'mn-bar-top' },
        h('b', {}, t('home.goalBar')),
        h(
          'span',
          {},
          minutes >= goal
            ? t('home.goalDone')
            : t('home.goalLeft', { n: nf.format(Math.max(0, goal - minutes)) }),
        ),
      ),
      h(
        'span',
        { class: 'mn-meter' },
        h('i', {
          style: { '--mn-value': String(Math.min(100, Math.round((minutes / goal) * 100))) },
        }),
      ),
    ),
  );

  // Daily challenge.
  const date = berlinDate();
  const doneToday = state.progress.daily.last === date;
  const countdown = h('span', { class: 'mn-muted' });
  const tick = () => {
    const ms = msToBerlinMidnight();
    countdown.textContent = t('daily.next', {
      h: Math.floor(ms / 3600000),
      m: Math.floor((ms % 3600000) / 60000),
    });
  };
  tick();
  const dailyCard = h(
    'section',
    { class: 'mn-card tt-daily', 'aria-labelledby': 'daily-title' },
    h(
      'div',
      { class: 'mn-sect' },
      h('h2', { id: 'daily-title' }, t('daily.title')),
      state.progress.daily.streak > 0
        ? h(
            'span',
            { class: 'mn-chip mn-chip--plain' },
            icon('flame'),
            t('daily.streak', { n: state.progress.daily.streak }),
          )
        : null,
    ),
    h(
      'p',
      {},
      doneToday
        ? t('daily.done', {
            wpm: nf.format(state.progress.daily.wpm ?? 0),
            accuracy: nf.format(state.progress.daily.accuracy ?? 0),
          })
        : t('daily.open'),
    ),
    countdown,
    h(
      'div',
      { class: 'tt-actions' },
      h(
        'button',
        { class: 'mn-btn', type: 'button', title: t('daily.hint'), onclick: () => startDaily() },
        doneToday ? t('daily.practice') : t('daily.start'),
      ),
    ),
  );

  // Free practice.
  const kind = s.practiceKind;
  const seg = (label, options, value, onPick) =>
    h(
      'div',
      { class: 'mn-seg', role: 'group', 'aria-label': label },
      options.map(([id, text]) =>
        h(
          'button',
          { type: 'button', 'aria-pressed': String(id === value), onclick: () => onPick(id) },
          text,
        ),
      ),
    );
  const weak = weakKeys(state.sessions).slice(0, 6);
  const practiceCard = h(
    'section',
    { class: 'mn-card tt-practice', 'aria-labelledby': 'practice-title' },
    h('h2', { id: 'practice-title' }, t('practice.title')),
    h('p', { class: 'mn-muted' }, t('practice.intro')),
    seg(
      t('practice.kind'),
      [
        ['text', t('practice.text')],
        ['code', t('practice.code')],
      ],
      kind,
      (id) => saveAndRender({ practiceKind: id }),
    ),
    seg(
      t('practice.difficulty'),
      ['leicht', 'mittel', 'schwer'].map((d) => [d, t(`difficulty.${d}`)]),
      s.difficulty,
      (id) => saveAndRender({ difficulty: id }),
    ),
    kind === 'code'
      ? seg(
          t('practice.language'),
          CODE_LANGUAGES.map((c) => [c.id, c.name]),
          s.codeLanguage,
          (id) => saveAndRender({ codeLanguage: id }),
        )
      : null,
    h(
      'div',
      { class: 'tt-actions' },
      h(
        'button',
        {
          class: 'mn-btn',
          type: 'button',
          title: t('practice.hint'),
          onclick: () => startPractice(),
        },
        t('practice.start'),
      ),
    ),
    h('div', { class: 'mn-sect' }, h('h3', {}, t('weak.title'))),
    weak.length
      ? [
          h(
            'div',
            { class: 'mn-chips' },
            weak.map((k) =>
              h(
                'span',
                { class: 'mn-chip mn-chip--warn' },
                t('weak.chip', {
                  key: k.ch === ' ' ? t('key.space') : k.ch,
                  rate: Math.round(k.rate * 100),
                }),
              ),
            ),
          ),
          h(
            'div',
            { class: 'tt-actions' },
            h(
              'button',
              { class: 'mn-btn', type: 'button', onclick: () => startWeak() },
              t('weak.start'),
            ),
          ),
        ]
      : h('p', { class: 'mn-note' }, t('weak.none')),
  );

  root.append(
    h(
      'div',
      { class: 'tt-home' },
      h('div', { class: 'tt-col' }, continueCard, todayCard),
      h('div', { class: 'tt-col' }, dailyCard, practiceCard),
    ),
  );
}

async function saveAndRender(patch) {
  try {
    await saveSettings(patch);
  } catch {
    window.mnui.toast(t('common.saveError'));
  }
  route();
}

// ---------- view: Lernpfad (a tree per layout) ----------

function renderPath(selected) {
  const layoutId = LAYOUTS.some((l) => l.id === selected) ? selected : state.settings.layout;
  const layout = getLayout(layoutId);
  const total = BRANCHES.reduce(
    (sum, b) =>
      sum +
      courseLevels(courseOf(layoutId, b.id)).reduce(
        (n, _, i) => n + starsOf(courseOf(layoutId, b.id), i + 1),
        0,
      ),
    0,
  );
  setHeader(t('path.title'), t('path.sub', { layout: layout.name, stars: total }));
  const root = clear(main());
  if (state.loading) return root.append(skeleton(44, 160, 120, 120));
  if (state.error) return root.append(errorBox(t('common.loadError'), () => boot()));
  const chips = h(
    'div',
    { class: 'mn-chips', role: 'group', 'aria-label': t('path.layouts') },
    LAYOUTS.map((l) =>
      h(
        'button',
        {
          class: 'mn-filter',
          type: 'button',
          'aria-pressed': String(l.id === layoutId),
          onclick: () => {
            location.hash = `#/pfad/${l.id}`;
          },
        },
        l.name,
      ),
    ),
  );
  const note =
    layoutId !== state.settings.layout
      ? h(
          'div',
          { class: 'mn-banner mn-banner--warn', role: 'note' },
          t('path.otherLayout', {
            course: layout.name,
            layout: getLayout(state.settings.layout).name,
          }),
        )
      : null;
  const basics = courseCard(layoutId, 'basics');
  const children = (parent) => BRANCHES.filter((b) => b.parent === parent);
  const subtree = (parent) =>
    h(
      'div',
      { class: 'tt-tree-children' },
      children(parent).map((b) =>
        h(
          'div',
          { class: 'tt-tree-node' },
          courseCard(layoutId, b.id),
          children(b.id).length ? subtree(b.id) : null,
        ),
      ),
    );
  fill(
    root,
    chips,
    note,
    h('p', { class: 'mn-note' }, t('path.treeHint')),
    h(
      'div',
      { class: 'tt-tree' },
      basics,
      h('h2', { class: 'tt-tree-title' }, t('path.branches')),
      subtree('basics'),
    ),
  );
}

function courseCard(layoutId, branch) {
  const course = courseOf(layoutId, branch);
  const levels = courseLevels(course);
  const open = isOpen(state.stars, layoutId, branch);
  const complete = isComplete(state.stars, course);
  const unlocked = unlockedLevel(course);
  const stars = levels.reduce((n, _, i) => n + starsOf(course, i + 1), 0);
  const focus = state.settings.focus === branch;
  const parent = BRANCHES.find((b) => b.id === branch)?.parent;
  const list = h(
    'div',
    { class: 'mn-list' },
    levels.map((level, i) => {
      const n = i + 1;
      const playable = open && n <= unlocked;
      const title = levelTitle(level);
      const got = starsOf(course, n);
      return h(
        'button',
        {
          class: `mn-row${playable ? '' : ' tt-locked'}`,
          type: 'button',
          disabled: !playable,
          'aria-label': playable
            ? t('path.startLevel', { n, title })
            : t('path.lockedLevel', { n, title }),
          onclick: () => startLesson(course, n),
        },
        h('span', { class: 'mn-thumb' }, playable ? String(n) : icon('lock')),
        h(
          'span',
          {},
          h('span', { class: 'mn-row-title' }, title),
          h(
            'span',
            { class: 'mn-row-sub' },
            playable ? t('path.target', { wpm: level.target }) : t('path.locked'),
          ),
        ),
        h(
          'span',
          { class: 'mn-row-side' },
          playable ? starRow(got, t('stars.label', { n: got })) : null,
        ),
      );
    }),
  );
  const focusButton = FOCUS.includes(branch)
    ? h(
        'button',
        {
          class: 'mn-btn',
          type: 'button',
          'aria-pressed': String(focus),
          onclick: async () => {
            try {
              await saveSettings({ focus: branch });
              window.mnui.toast(t('path.focusSaved', { branch: t(`branch.${branch}`) }));
            } catch {
              window.mnui.toast(t('common.saveError'));
            }
            route();
          },
        },
        focus ? t('path.isFocus') : t('path.setFocus'),
      )
    : null;
  const extra =
    branch === 'chord'
      ? [
          window.matchMedia('(pointer: coarse)').matches
            ? h('p', { class: 'mn-note' }, t('path.chordTouch'))
            : null,
          h(
            'button',
            { class: 'mn-btn', type: 'button', onclick: () => showChords(getLayout(layoutId)) },
            t('path.chordTable'),
          ),
        ]
      : [];
  return h(
    'section',
    {
      class: `mn-card tt-course${open ? '' : ' is-locked'}${focus ? ' is-focus' : ''}`,
      'aria-labelledby': `course-${branch}`,
    },
    h(
      'div',
      { class: 'tt-course-head' },
      h('h3', { id: `course-${branch}` }, open ? null : icon('lock'), t(`branch.${branch}`)),
      h(
        'span',
        { class: 'mn-chip mn-chip--plain' },
        t('path.stars', { n: stars, max: levels.length * 3 }),
      ),
    ),
    h('p', { class: 'mn-muted' }, t(`branch.${branch}Desc`)),
    open
      ? null
      : h('p', { class: 'mn-note' }, t('path.opensAfter', { parent: t(`branch.${parent}`) })),
    h('div', { class: 'tt-actions tt-actions--start' }, focusButton, ...extra),
    h(
      'details',
      { class: 'tt-levels', open: open && !complete ? true : null },
      h('summary', {}, t('path.levels', { n: levels.length })),
      list,
    ),
  );
}

/** The chord table of a layout, with an export for chord tools (Kanata, QMK, ZMK …). */
function showChords(layout) {
  const lang = textLang();
  const table = chordTable(layout, lang, (w) => adapt(w, layout));
  const download = () => {
    const lines = ['chord;word', ...table.map((c) => `${c.keys.join('+')};${c.word}`)];
    const url = URL.createObjectURL(
      new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }),
    );
    const a = h('a', { href: url, download: `chords-${layout.id}-${lang}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.mnui.toast(t('data.exported'));
  };
  const content = h(
    'div',
    {},
    h(
      'div',
      { class: 'mn-sheet-bar' },
      h(
        'button',
        {
          class: 'mn-icon-btn',
          type: 'button',
          'data-mn-close': true,
          'aria-label': t('common.close'),
        },
        icon('close'),
      ),
      h('h2', {}, t('chords.title', { layout: layout.name })),
      h('span', {}),
    ),
    h(
      'div',
      { class: 'mn-sheet-body' },
      h('p', { class: 'mn-hint' }, t('chords.hint')),
      h('button', { class: 'mn-btn', type: 'button', onclick: download }, t('chords.export')),
      h(
        'div',
        { class: 'mn-list tt-chord-list' },
        table.map((c) =>
          h(
            'div',
            { class: 'mn-row mn-row--text' },
            h('span', {}, h('span', { class: 'mn-row-title' }, c.word)),
            h(
              'span',
              { class: 'mn-row-side' },
              h('b', { class: 'tt-keycap' }, c.keys.map((k) => upper(k)).join(' + ')),
            ),
          ),
        ),
      ),
    ),
  );
  window.mnui.sheet.open(content, { tall: true });
}

// ---------- routing, shortcuts, start-up ----------

const ROUTES = {
  '': 'home',
  pfad: 'path',
  texte: 'texts',
  statistik: 'stats',
  einstellungen: 'settings',
};

export function route() {
  stopRun();
  const [, first = '', second] = location.hash.replace(/^#/, '').split('/');
  const name = ROUTES[first] ?? 'home';
  for (const tab of document.querySelectorAll('.mn-tab')) {
    if (tab.dataset.route === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (name === 'path') renderPath(second ? decodeURIComponent(second) : null);
  else if (name === 'texts') renderTexts(second ? decodeURIComponent(second) : null);
  else if (name === 'stats') renderStats();
  else if (name === 'settings') renderSettings();
  else renderHome();
}

function onShortcut(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  )
    return;
  if (state.run || document.querySelector('.mn-overlay') || state.loading) return;
  const first = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (e.key === '?') {
    e.preventDefault();
    showShortcuts();
  } else if (first === 'texte' && textShortcut(e)) {
    e.preventDefault();
  } else if (e.key === 'n' && first !== 'texte') {
    e.preventDefault();
    const courseId = currentCourse();
    startLesson(courseId, Math.min(unlockedLevel(courseId), courseLevels(courseId).length));
  } else if (e.key === 'p') {
    e.preventDefault();
    startPractice();
  } else if (e.key === 'd') {
    e.preventDefault();
    startDaily();
  }
}

/** A run, its result, an open sheet or a focused field: a background reload must not redraw. */
function busy() {
  const el = document.activeElement;
  return Boolean(
    state.run ||
      state.result ||
      document.querySelector('.mn-overlay') ||
      (el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)),
  );
}

export async function boot({ quiet = false } = {}) {
  if (!quiet) {
    state.loading = true;
    state.error = null;
    route();
  }
  try {
    await loadAll();
    state.error = null;
  } catch (error) {
    if (!quiet) state.error = error;
  }
  state.loading = false;
  if (!quiet || !busy()) route();
}

async function start() {
  await window.mnI18n.ready;
  const factory = window.mininode;
  state.mn = await factory.mininode();
  await state.mn.auth.requireLogin();
  for (const a of document.querySelectorAll('.mn-home')) a.href = state.mn.config.portalUrl;
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onShortcut);
  state.mn.offline.onSynced(() => void boot({ quiet: true }));
  window.mnI18n.onChange(() => {
    if (!busy()) route();
  });
  await boot();
}

if (window.mininode) void start();
else window.addEventListener('DOMContentLoaded', () => void start(), { once: true });
