// "Statistik": key figures for a year, the weekly speed trend, a heat grid of practice days,
// weak keys, best speed per course, badges and the latest runs.
import { courseName, errorBox, levelCounts, route, setHeader, startLesson } from './app.js';
import { clear, h, icon, skeleton } from './dom.js';
import { getLayout } from './layouts.js';
import { state, t } from './state.js';
import {
  achievements,
  courseBests,
  dayKey,
  heat,
  weakKeys,
  weeklyTrend,
  yearSummary,
} from './stats.js';

let year = new Date().getFullYear();

const main = () => document.getElementById('main');

export function renderStats() {
  const locale = window.mnI18n.locale;
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const stepper = h(
    'div',
    { class: 'mn-stepper', role: 'group', 'aria-label': t('stats.year') },
    h(
      'button',
      {
        class: 'mn-icon-btn',
        type: 'button',
        'aria-label': t('stats.prevYear'),
        onclick: () => step(-1),
      },
      icon('left'),
    ),
    h('b', { class: 'mn-num' }, String(year)),
    h(
      'button',
      {
        class: 'mn-icon-btn',
        type: 'button',
        'aria-label': t('stats.nextYear'),
        disabled: year >= new Date().getFullYear(),
        onclick: () => step(1),
      },
      icon('chevron'),
    ),
  );
  const summary = yearSummary(state.sessions, year);
  setHeader(t('stats.title'), t('stats.sub', { n: summary.count }), [stepper]);
  const root = clear(main());
  if (state.loading) return root.append(skeleton(96, 200, 160, 160));
  if (state.error) return root.append(errorBox(t('common.loadError'), () => route()));

  if (state.sessions.length === 0) {
    root.append(
      h(
        'div',
        { class: 'mn-empty' },
        h('div', { class: 'mn-empty-icon' }, icon('chart')),
        h('h3', {}, t('stats.emptyTitle')),
        h('p', {}, t('stats.emptyText')),
        h(
          'button',
          {
            class: 'mn-btn mn-btn--primary',
            type: 'button',
            onclick: () => startLesson(`layout:${state.settings.layout}`, 1),
          },
          t('stats.emptyAction'),
        ),
      ),
    );
    return;
  }

  const kpis = h(
    'div',
    { class: 'mn-kpis' },
    kpi(nf1.format(summary.best), t('stats.best')),
    kpi(nf1.format(summary.avg), t('stats.avg')),
    kpi(pct.format(summary.accuracy / 100), t('stats.accuracy')),
    kpi(
      t('stats.hours', {
        h: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(summary.minutes / 60),
      }),
      t('stats.time'),
    ),
  );

  // Weekly trend: columns, height by average speed, with the numbers in the label and a table.
  const trend = weeklyTrend(state.sessions, dayKey());
  const max = Math.max(10, ...trend.map((w) => w.wpm ?? 0));
  const fmtWeek = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' });
  const weekLabel = (w) => fmtWeek.format(new Date(`${w.start}T12:00:00`));
  const trendLabel = trend
    .map((w) => `${weekLabel(w)}: ${w.wpm === null ? t('stats.none') : nf.format(w.wpm)}`)
    .join(', ');
  const chart = h(
    'div',
    { class: 'tt-chart', role: 'img', 'aria-label': t('stats.trendLabel', { values: trendLabel }) },
    trend.map((w) =>
      h(
        'div',
        { class: 'tt-col-bar' },
        h('span', { class: 'tt-col-value mn-num' }, w.wpm === null ? '' : nf.format(w.wpm)),
        h(
          'span',
          { class: 'tt-col-track' },
          h('span', {
            class: `tt-col-fill${w.wpm === null ? ' is-empty' : ''}`,
            style: {
              '--tt-h': String(w.wpm === null ? 0 : Math.max(4, Math.round((w.wpm / max) * 100))),
            },
          }),
        ),
        h('span', { class: 'tt-col-label' }, weekLabel(w)),
      ),
    ),
  );
  const trendCard = h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'trend-title' },
    h('h2', { id: 'trend-title' }, t('stats.trend')),
    h('p', { class: 'mn-note' }, t('stats.trendNote')),
    chart,
  );

  // Heat grid: one square per day, weeks as columns.
  const days = heat(state.sessions, year);
  const first = new Date(year, 0, 1);
  const pad = (first.getDay() + 6) % 7;
  const fmtDay = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const heatGrid = h(
    'div',
    {
      class: 'mn-heat tt-heat',
      role: 'img',
      'aria-label': t('stats.heatLabel', { n: days.filter((d) => d.minutes > 0).length, year }),
    },
    Array.from({ length: pad }, () => h('i', { class: 'tt-heat-pad' })),
    days.map((d) =>
      h('i', {
        class: d.level ? `l${d.level}` : '',
        title: t('stats.heatDay', {
          day: fmtDay.format(new Date(`${d.key}T12:00:00`)),
          n: nf.format(d.minutes),
        }),
      }),
    ),
  );
  const heatWrap = h('div', { class: 'tt-heat-wrap' }, heatGrid);
  const heatCard = h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'heat-title' },
    h('h2', { id: 'heat-title' }, t('stats.heat')),
    heatWrap,
    h(
      'p',
      { class: 'tt-legend mn-note' },
      t('stats.legend'),
      ' ',
      ...[0, 1, 2, 3].map((l) =>
        h(
          'span',
          { class: 'tt-legend-item' },
          h('i', { class: `tt-swatch${l ? ` l${l}` : ''}` }),
          t(`stats.legend${l}`),
        ),
      ),
    ),
  );

  // Weak keys and courses as bars.
  const weak = weakKeys(state.sessions);
  const weakCard = h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'weak-title' },
    h('h2', { id: 'weak-title' }, t('stats.weak')),
    weak.length
      ? weak.map((k) =>
          h(
            'div',
            { class: 'mn-bar' },
            h(
              'span',
              { class: 'mn-bar-top' },
              h('b', { class: 'tt-keycap' }, k.ch === ' ' ? t('key.space') : k.ch),
              h('span', {}, t('stats.weakValue', { rate: pct.format(k.rate), n: k.typed })),
            ),
            h(
              'span',
              { class: 'mn-meter' },
              h('i', { style: { '--mn-value': String(Math.min(100, Math.round(k.rate * 300))) } }),
            ),
          ),
        )
      : h('p', { class: 'mn-note' }, t('stats.weakNone')),
  );
  const bests = courseBests(state.sessions);
  const bestMax = Math.max(1, ...bests.map((b) => b.wpm));
  const coursesCard = h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'courses-title' },
    h('h2', { id: 'courses-title' }, t('stats.courses')),
    bests.map((b) =>
      h(
        'div',
        { class: 'mn-bar' },
        h(
          'span',
          { class: 'mn-bar-top' },
          h('b', {}, courseLabel(b.course)),
          h('span', { class: 'mn-num' }, t('stats.wpmValue', { wpm: nf1.format(b.wpm) })),
        ),
        h(
          'span',
          { class: 'mn-meter' },
          h('i', { style: { '--mn-value': String(Math.round((b.wpm / bestMax) * 100)) } }),
        ),
      ),
    ),
  );

  // Badges: filled star when earned, outline when open, and a text either way.
  const badges = achievements(state.sessions, state.progress, dayKey(), levelCounts());
  const badgeList = h(
    'ul',
    { class: 'tt-badges' },
    badges.map((b) =>
      h(
        'li',
        { class: b.done ? 'is-done' : '' },
        icon('badge', { filled: b.done }),
        h(
          'span',
          {},
          h('b', {}, t(`badge.${b.id}`)),
          h('small', {}, b.done ? t('badge.earned') : t(`badge.${b.id}Hint`)),
        ),
      ),
    ),
  );
  const earned = badges.filter((b) => b.done).length;
  const badgeCard = h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'badge-title' },
    h('h2', { id: 'badge-title' }, t('stats.badges', { n: earned, total: badges.length })),
    badgeList,
  );

  // Latest runs.
  const recent = state.sessions.slice(0, 15);
  const fmtDate = (key) => window.mnui.date.format(key);
  const recentList = h(
    'div',
    { class: 'mn-list' },
    recent.map((s) =>
      h(
        'div',
        { class: 'mn-row mn-row--text' },
        h(
          'span',
          {},
          h('span', { class: 'mn-row-title' }, runLabel(s)),
          h(
            'span',
            { class: 'mn-row-sub' },
            `${fmtDate(s.practised_on)} · ${getLayout(s.layout).name}`,
          ),
        ),
        h(
          'span',
          { class: 'mn-row-side' },
          h('b', { class: 'mn-num' }, t('stats.wpmValue', { wpm: nf1.format(Number(s.wpm)) })),
          pct.format(Number(s.accuracy) / 100),
        ),
      ),
    ),
  );

  root.append(
    kpis,
    h('div', { class: 'mn-cols' }, trendCard, heatCard),
    h('div', { class: 'mn-cols' }, weakCard, coursesCard),
    badgeCard,
    h(
      'div',
      { class: 'mn-sect' },
      h('h2', {}, t('stats.recent'), h('small', {}, String(recent.length))),
    ),
    recentList,
  );
  // Show the latest weeks first; earlier ones are a scroll to the left.
  heatWrap.scrollLeft = heatWrap.scrollWidth;
}

function kpi(value, label) {
  return h('div', { class: 'mn-kpi' }, h('b', { class: 'mn-num' }, value), h('span', {}, label));
}

function courseLabel(course) {
  if (course === 'text') return t('stats.courseText');
  if (course === 'code') return t('stats.courseCode');
  return courseName(course);
}

function runLabel(s) {
  if (s.mode === 'lesson')
    return t('stats.runLesson', { course: courseName(s.course), n: s.level ?? 1 });
  if (s.mode === 'daily') return t('daily.title');
  if (s.mode === 'weak') return t('weak.title');
  if (s.mode === 'text') return t('stats.runText');
  return s.course.startsWith('code:')
    ? t('stats.runPracticeCode', { course: courseName(s.course) })
    : t('run.practiceText');
}

function step(delta) {
  year += delta;
  renderStats();
}
