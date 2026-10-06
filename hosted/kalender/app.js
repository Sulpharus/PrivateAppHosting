// Kalender: one calendar for everything. Own events live in shared suite records (type `event`)
// in calendars (collections) that can be shared with people; other apps' records with a time
// (sport sessions, due contracts, tasks) show up as read-only sources. Every source can be
// shown, hidden and coloured; the choice is stored per person (kv `prefs`).
import {
  dateInput,
  endBefore,
  fromInputs,
  moveToDay,
  nextReminder,
  parseOffset,
  ruleFrom,
  shiftKeys,
  shiftSeries,
  timeInput,
  withExdate,
} from './edit.js';
import { parseIcs, toIcs } from './ics.js';
import { appName, COLORS, itemsFor, onDay, SELF, sourcesFrom, spanOf } from './items.js';
import { isoWeek, layoutDay, monthGrid, startOfWeek } from './layout.js';
import { geocode, initMap, mapView, reasonOf } from './map.js';
import { validPoint } from './route.js';
import { buildRule, describeRule, occurrenceKey, parseRule } from './rrule.js';

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const t = (key, params) => window.mnI18n.t(key, params);
/** The language of the page: 'de-DE' or 'en-GB' (kit/i18n.js). */
const loc = () => window.mnI18n.locale;

/** Builds elements with textContent only: user data never goes through innerHTML. */
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const c of children.flat(Number.POSITIVE_INFINITY)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  return el;
}
const ICON_PATHS = {
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  search: 'M10.5 17a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM20 20l-4.8-4.8',
  layers: 'M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  repeat: 'M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4',
  bell: 'M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  people:
    'M9 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5M16 11a3 3 0 100-6M17.5 15c2 .4 3.2 2 3.5 4.5',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.append(path);
  return svg;
}
const toast = (message) => window.mnui.toast(message);
const frag = (...nodes) => {
  const f = document.createDocumentFragment();
  for (const n of nodes) if (n) f.append(n);
  return f;
};

// ---------- dates ----------
const DAY = 86_400_000;
const HOUR_PX = 48;
/** Short weekday names, Monday first. */
const weekdays = () => [0, 1, 2, 3, 4, 5, 6].map((i) => t(`weekday.${i}`));
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const shiftDays = (d, n) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
/** A date format in the page's language; the formatter is made again when the language changes. */
const fmt = (options) => {
  let formatter;
  let made;
  return {
    format(date) {
      if (made !== loc()) {
        made = loc();
        formatter = new Intl.DateTimeFormat(made, options);
      }
      return formatter.format(date);
    },
  };
};
const F = {
  time: fmt({ hour: '2-digit', minute: '2-digit' }),
  day: fmt({ weekday: 'short', day: 'numeric', month: 'short' }),
  dayLong: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  month: fmt({ month: 'long', year: 'numeric' }),
  dm: fmt({ day: 'numeric', month: 'short' }),
};
const euro = (cents, currency = 'EUR') =>
  new Intl.NumberFormat(loc(), { style: 'currency', currency }).format(cents / 100);
function nextHalfHour() {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}
function parseDateParam(value) {
  const d = fromInputs(value ?? '', '00:00');
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** When an item happens, for labels and the detail view. */
function whenText(item) {
  const { start, end } = item;
  if (item.allDay) {
    const last = addDays(end, -1);
    return last > start
      ? t('when.range', { from: F.day.format(start), to: F.day.format(last) })
      : t('when.allDay', { day: F.day.format(start) });
  }
  if (item.due) return t('when.due', { day: F.day.format(start), time: F.time.format(start) });
  if (sameDay(start, end) || end - start < DAY)
    return t('when.sameDay', {
      day: F.day.format(start),
      from: F.time.format(start),
      to: F.time.format(end),
    });
  return t('when.span', {
    from: `${F.day.format(start)} ${F.time.format(start)}`,
    to: `${F.day.format(end)} ${F.time.format(end)}`,
  });
}

const colorName = (id) => t(`color.${id}`);
/** Reminder offsets (ISO durations) with the language key of their label. */
const REMINDERS_TIMED = [
  ['', 'reminder.none'],
  ['PT0M', 'reminder.atStart'],
  ['-PT10M', 'reminder.10m'],
  ['-PT30M', 'reminder.30m'],
  ['-PT1H', 'reminder.1h'],
  ['-P1D', 'reminder.1d'],
];
const REMINDERS_ALL_DAY = [
  ['', 'reminder.none'],
  ['PT9H', 'reminder.sameDay9'],
  ['-PT6H', 'reminder.dayBefore18'],
];
const reminderLabel = (offset) => {
  const found = [...REMINDERS_TIMED, ...REMINDERS_ALL_DAY].find(([v]) => v === offset);
  return found ? t(found[1]) : offset;
};

// ---------- state ----------
const params = new URLSearchParams(location.search);
const VIEWS = ['month', 'week', 'day', 'list', 'map'];
const S = {
  view: VIEWS.includes(params.get('view')) ? params.get('view') : 'month',
  anchor: parseDateParam(params.get('date')) ?? dayStart(new Date()),
  mini: null,
  records: [],
  types: [],
  projections: {},
  collections: [],
  roles: {},
  prefs: { sources: {} },
  sources: [],
  items: [],
  range: null,
  loading: true,
  error: null,
  openEvent: params.get('event'),
  /** Google Calendar sync state (ADR 0010), null until loaded or when unavailable. */
  google: null,
  me: null,
};
const wide = matchMedia('(min-width: 960px)');

// Handlers work right away; the SDK and the login check run in the background.
const ready = (async () => {
  const client = await window.mininode.mininode();
  const user = await client.auth.requireLogin();
  S.me = user?.id ?? null;
  return client;
})();

function errorText(err) {
  if (err?.code === '42501') return t('error.forbidden');
  if (err?.code === 'P0002') return t('error.gone');
  if (err?.code === '22023') return t('error.invalid');
  return t('error.generic');
}

function rangeOf(view, anchor) {
  if (view === 'month') {
    const grid = monthGrid(anchor.getFullYear(), anchor.getMonth());
    return { from: grid[0], to: addDays(grid[41], 1) };
  }
  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  if (view === 'map') {
    // the map shows a day, a week or all seven weeks, whichever the person chose
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 49) };
  }
  const from = dayStart(anchor);
  return { from, to: addDays(from, view === 'day' ? 1 : 42) };
}

async function loadMeta(mn) {
  const [types, prefs] = await Promise.all([
    mn.suite.types(),
    mn.kv.get('prefs').catch(() => null),
  ]);
  let collections = await mn.suite.collections();
  if (!collections.some((c) => c.personal && c.family === 'kalender')) {
    await mn.suite.personal('kalender');
    collections = await mn.suite.collections();
  }
  S.types = types;
  S.projections = Object.fromEntries(types.map((t) => [t.type, t.calendar]));
  S.collections = collections;
  S.roles = Object.fromEntries(collections.map((c) => [c.id, c.role]));
  if (prefs && typeof prefs === 'object' && !Array.isArray(prefs))
    S.prefs = { sources: {}, ...prefs };
}

let loadToken = 0;
async function load({ meta = false } = {}) {
  const token = ++loadToken;
  const range = rangeOf(S.view, S.anchor);
  try {
    const mn = await ready;
    if (meta || !S.types.length) await loadMeta(mn);
    const records = await mn.suite.range({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    if (token !== loadToken) return;
    S.records = records;
    S.range = range;
    S.error = null;
  } catch {
    if (token !== loadToken) return;
    S.error = t('error.load');
  }
  S.loading = false;
  refresh();
  render();
  if (S.openEvent) {
    const item = S.items.find((i) => i.record.id === S.openEvent);
    S.openEvent = null;
    if (item) openDetail(item);
    else toast(t('error.gone'));
  }
}

/** Sources and visible items from the loaded records. */
function refresh() {
  S.sources = sourcesFrom(
    S.records,
    S.collections,
    S.types,
    S.prefs.sources ?? {},
    t('calendar.sharedName'),
    S.prefs.appColors ?? {},
  );
  // calendars that come from Google get their own group
  const fromGoogle = new Set((S.google?.calendars ?? []).map((c) => `col:${c.collectionId}`));
  for (const source of S.sources) if (fromGoogle.has(source.id)) source.group = 'google';
  const hidden = new Set(S.sources.filter((s) => !s.visible).map((s) => s.id));
  S.items = S.range
    ? itemsFor(
        S.records.filter((r) => S.projections[r.type]),
        {
          ...S.range,
          projections: S.projections,
          sources: S.sources,
          roles: S.roles,
          untitled: t('event.untitled'),
        },
      ).filter((i) => !hidden.has(i.sourceId))
    : [];
}

let prefsTimer;
function setSource(id, patch) {
  const source = S.sources.find((s) => s.id === id);
  S.prefs.sources ??= {};
  S.prefs.sources[id] = {
    ...(S.prefs.sources[id] ?? {}),
    color: source?.color,
    visible: source?.visible,
    ...(source?.group === 'apps' ? { name: source.name } : {}),
    ...patch,
  };
  refresh();
  render();
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(async () => {
    try {
      const mn = await ready;
      await mn.kv.set('prefs', S.prefs);
    } catch {
      toast(t('error.prefsSave'));
    }
  }, 400);
}

function savePrefs() {
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(async () => {
    try {
      const mn = await ready;
      await mn.kv.set('prefs', S.prefs);
    } catch {
      toast(t('error.prefsSave'));
    }
  }, 400);
}

/** One colour for everything an app puts into the calendar (its sources can still differ). */
function setAppColor(app, color) {
  S.prefs.appColors = { ...(S.prefs.appColors ?? {}), [app]: color };
  S.prefs.sources ??= {};
  for (const s of S.sources.filter((x) => x.group === 'apps' && x.app === app))
    S.prefs.sources[s.id] = {
      ...(S.prefs.sources[s.id] ?? {}),
      visible: s.visible,
      name: s.name,
      color,
    };
  refresh();
  render();
  savePrefs();
}

/** Whether pictures show in a view ("day" or "list"): on until the person turns them off. */
const imagesOn = (view) => S.prefs.images?.[view] !== false;

/** A small switch inside the view: pictures of the entries on or off (kept in the prefs). */
function imageSwitch(view) {
  const on = imagesOn(view);
  return h(
    'div',
    { class: 'cal-viewbar' },
    h(
      'button',
      {
        type: 'button',
        class: 'cal-switch',
        role: 'switch',
        'aria-checked': on ? 'true' : 'false',
        'data-key': `images:${view}`,
        onclick: () => {
          S.prefs.images = { ...(S.prefs.images ?? {}), [view]: !on };
          savePrefs();
          render();
        },
      },
      h('span', { class: 'cal-switch-track', 'aria-hidden': 'true' }, h('span', {})),
      h('span', { class: 'cal-switch-label' }, t('images.switch')),
    ),
  );
}

const sourceName = (item) => S.sources.find((s) => s.id === item.sourceId)?.name ?? '';
const itemLabel = (item) =>
  [item.title, whenText(item), item.cancelled ? t('event.cancelled') : null, sourceName(item)]
    .filter(Boolean)
    .join(', ');
const writableCalendars = () =>
  S.collections.filter((c) => c.family === 'kalender' && c.role !== 'viewer');
function appUrl(app) {
  const host = location.hostname.endsWith('mininode.app')
    ? location.hostname.replace(/^[^.]+/, app)
    : `${app}.mininode.app`;
  return `https://${host}/`;
}
const safeUrl = (url) => (/^https?:\/\//i.test(url ?? '') ? url : null);

// ---------- navigation ----------
function setView(view, day) {
  S.view = view;
  if (day) S.anchor = dayStart(day);
  S.mini = null;
  void load();
}
function step(n) {
  const a = S.anchor;
  if (S.view === 'month') {
    const last = new Date(a.getFullYear(), a.getMonth() + n + 1, 0).getDate();
    S.anchor = new Date(a.getFullYear(), a.getMonth() + n, Math.min(a.getDate(), last));
  } else {
    const days =
      S.view === 'map'
        ? { day: 1, week: 7, all: 42 }[S.prefs.map?.scope ?? 'day']
        : { week: 7, day: 1, list: 42 }[S.view];
    S.anchor = addDays(a, n * days);
  }
  S.mini = null;
  void load();
}
function goToday() {
  S.anchor = dayStart(new Date());
  S.mini = null;
  void load();
}
const openDay = (day) => setView('day', day);

function titleFor() {
  const { from, to } = rangeOf(S.view, S.anchor);
  if (S.view === 'month') return F.month.format(S.anchor);
  if (S.view === 'week') return `${F.dm.format(from)} – ${F.dm.format(addDays(to, -1))}`;
  if (S.view === 'day')
    return sameDay(S.anchor, new Date()) ? t('nav.today') : F.dayLong.format(S.anchor);
  if (S.view === 'map') {
    const scope = S.prefs.map?.scope ?? 'day';
    if (scope === 'day') return F.dayLong.format(S.anchor);
    if (scope === 'week') {
      const start = startOfWeek(S.anchor);
      return `${F.dm.format(start)} – ${F.dm.format(addDays(start, 6))}`;
    }
    return t('map.title');
  }
  return t('nav.upcoming');
}
function subtitleFor() {
  if (S.loading) return '';
  const { from, to } = rangeOf(S.view, S.anchor);
  const count = S.items.filter((i) => i.start < to && i.end >= from).length;
  const n = t('events.count', { n: count });
  if (S.view === 'week') return t('subtitle.week', { week: isoWeek(from), n });
  if (S.view === 'day')
    return sameDay(S.anchor, new Date()) ? `${F.dayLong.format(S.anchor)} · ${n}` : n;
  if (S.view === 'list') return t('subtitle.list', { from: F.day.format(from), n });
  if (S.view === 'map') {
    const withPlace = S.items.filter((i) => i.record.place_name || validPoint(i.record)).length;
    return t('map.subtitle', { n: withPlace });
  }
  return n;
}

// ---------- rendering ----------
function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set('view', S.view);
  url.searchParams.set('date', dateInput(S.anchor));
  url.searchParams.delete('event');
  history.replaceState(null, '', url);
}

let scrollTop = null;
/** Redraws an open sheet that shows loaded data (calendars and sources) after a reload. */
let sheetRedraw = null;
function render() {
  syncUrl();
  for (const tab of document.querySelectorAll('.mn-tab'))
    if (tab.dataset.view === S.view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  $('#title').textContent = titleFor();
  $('#subtitle').textContent = subtitleFor();
  renderTools();
  const old = $('.cal-scroll');
  if (old) scrollTop = old.scrollTop;
  $('#view').replaceChildren(layout());
  const scroll = $('.cal-scroll');
  if (scroll) scroll.scrollTop = scrollTop ?? 7 * HOUR_PX;
  sheetRedraw?.();
}

function renderTools() {
  const prev = { month: t('nav.prevMonth'), week: t('nav.prevWeek'), day: t('nav.prevDay') };
  const next = { month: t('nav.nextMonth'), week: t('nav.nextWeek'), day: t('nav.nextDay') };
  $('#tools').replaceChildren(
    h(
      'div',
      { class: 'mn-stepper cal-stepper', role: 'group', 'aria-label': t('nav.period') },
      h(
        'button',
        {
          type: 'button',
          class: 'mn-icon-btn',
          'aria-label': prev[S.view] ?? t('nav.earlier'),
          onclick: () => step(-1),
        },
        icon('left'),
      ),
      h('button', { type: 'button', class: 'mn-btn cal-today', onclick: goToday }, t('nav.today')),
      h(
        'button',
        {
          type: 'button',
          class: 'mn-icon-btn',
          'aria-label': next[S.view] ?? t('nav.later'),
          onclick: () => step(1),
        },
        icon('right'),
      ),
    ),
    googleButton(),
    h(
      'button',
      { type: 'button', class: 'mn-icon-btn', 'aria-label': t('nav.search'), onclick: openSearch },
      icon('search'),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'mn-icon-btn cal-sources-btn',
        'aria-label': t('nav.sources'),
        onclick: openSources,
      },
      icon('layers'),
    ),
  );
}

function layout() {
  return h(
    'div',
    { class: 'cal-layout' },
    h(
      'aside',
      { class: 'cal-side', 'aria-label': t('nav.sideLabel') },
      miniMonth(),
      sourceToggles(),
    ),
    h(
      'section',
      { class: 'cal-body', 'aria-busy': S.loading ? 'true' : 'false' },
      S.error ? h('div', { class: 'mn-banner mn-banner--bad', role: 'alert' }, S.error) : null,
      S.loading ? h('span', { class: 'mn-sk cal-sk' }) : viewBody(),
    ),
  );
}

function viewBody() {
  if (S.view === 'month') return wide.matches ? monthFull() : monthCompact();
  if (S.view === 'week') {
    const from = startOfWeek(S.anchor);
    return timeGrid(Array.from({ length: 7 }, (_, i) => addDays(from, i)));
  }
  if (S.view === 'day') return timeGrid([S.anchor], { images: true });
  if (S.view === 'map') return mapView();
  return agenda();
}

const colorsOf = (items) => [...new Set(items.map((i) => i.color))];

function chip(item, { drag = false, time = true } = {}) {
  const el = h(
    'button',
    {
      type: 'button',
      class: `cal-chip${item.allDay ? ' cal-chip--allday' : ''}${item.cancelled ? ' is-cancelled' : ''}`,
      'data-cat': item.color,
      'aria-label': itemLabel(item),
      onclick: (e) => {
        e.stopPropagation();
        openDetail(item);
      },
    },
    item.due ? icon('check') : null,
    !item.allDay && time ? h('span', { class: 'cal-chip-time' }, F.time.format(item.start)) : null,
    h('span', { class: 'cal-chip-title' }, item.title),
  );
  if (drag && item.editable) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      dragKey = item.key;
      e.dataTransfer?.setData('text/plain', item.title);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      dragKey = null;
    });
  }
  return el;
}

/** A day for screen readers: its date and, when there are any, how many events it holds. */
const dayLabel = (day, n) =>
  n ? t('day.withEvents', { day: F.dayLong.format(day), n }) : F.dayLong.format(day);

let dragKey = null;
function monthFull() {
  const days = monthGrid(S.anchor.getFullYear(), S.anchor.getMonth());
  const today = new Date();
  const grid = h('div', {
    class: 'cal-month',
    role: 'grid',
    'aria-label': F.month.format(S.anchor),
  });
  grid.append(
    h(
      'div',
      { class: 'cal-dows', role: 'row' },
      weekdays().map((d) => h('span', { role: 'columnheader' }, d)),
    ),
  );
  for (let w = 0; w < 6; w++) {
    const row = h('div', { class: 'cal-mweek', role: 'row' });
    for (const day of days.slice(w * 7, w * 7 + 7)) {
      const its = onDay(S.items, day);
      const list = h('div', { class: 'cal-mitems' });
      const max = 4;
      for (const item of its.slice(0, its.length > max ? max - 1 : max))
        list.append(chip(item, { drag: true }));
      if (its.length > max)
        list.append(
          h(
            'button',
            { type: 'button', class: 'cal-more', onclick: () => openDay(day) },
            t('month.more', { n: its.length - (max - 1) }),
          ),
        );
      const cell = h(
        'div',
        {
          role: 'gridcell',
          class: `cal-mday${day.getMonth() !== S.anchor.getMonth() ? ' out' : ''}${sameDay(day, today) ? ' today' : ''}`,
        },
        h(
          'button',
          {
            type: 'button',
            class: 'cal-mnum',
            'aria-label': dayLabel(day, its.length),
            onclick: () => openDay(day),
          },
          h('span', {}, String(day.getDate())),
        ),
        list,
      );
      // a click on free space creates an event that day (keyboard: "Termin anlegen" or C)
      cell.addEventListener('click', (e) => {
        if (e.target === cell || e.target === list)
          openEditor(null, {
            start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9),
          });
      });
      cell.addEventListener('dragover', (e) => {
        if (!dragKey) return;
        e.preventDefault();
        cell.classList.add('is-drop');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('is-drop'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('is-drop');
        const item = S.items.find((i) => i.key === dragKey);
        dragKey = null;
        if (!item || sameDay(item.start, day)) return;
        const moved = moveToDay(item.start, item.end, day);
        void moveItem(item, moved.start, moved.end);
      });
      row.append(cell);
    }
    grid.append(row);
  }
  return grid;
}

function monthCompact() {
  const days = monthGrid(S.anchor.getFullYear(), S.anchor.getMonth());
  const today = new Date();
  return h(
    'div',
    { class: 'mn-split mn-split--start' },
    h(
      'div',
      { class: 'mn-card' },
      h(
        'div',
        { class: 'mn-cal' },
        weekdays().map((d) => h('span', { class: 'mn-dow' }, d)),
      ),
      h(
        'div',
        { class: 'mn-cal' },
        days.map((day) => {
          const its = onDay(S.items, day);
          return h(
            'button',
            {
              type: 'button',
              class: `mn-cell${day.getMonth() !== S.anchor.getMonth() ? ' out' : ''}${sameDay(day, today) ? ' today' : ''}`,
              'aria-pressed': sameDay(day, S.anchor) ? 'true' : 'false',
              'aria-label': dayLabel(day, its.length),
              onclick: () => {
                const otherMonth = day.getMonth() !== S.anchor.getMonth();
                S.anchor = day;
                if (otherMonth) void load();
                else render();
              },
            },
            String(day.getDate()),
            h(
              'span',
              { class: 'mn-dots' },
              colorsOf(its)
                .slice(0, 3)
                .map((c) => h('i', { 'data-cat': c })),
            ),
          );
        }),
      ),
    ),
    dayList(S.anchor),
  );
}

function row(item, { image = false } = {}) {
  const sub = [item.recurring ? t('event.series') : null, sourceName(item), item.record.place_name]
    .filter(Boolean)
    .join(' · ');
  return h(
    'button',
    {
      type: 'button',
      class: `mn-row cal-row${item.cancelled ? ' is-cancelled' : ''}${image && item.image ? ' has-image' : ''}`,
      'data-cat': item.color,
      onclick: () => openDetail(item),
    },
    h('span', { class: 'cal-swatch', 'aria-hidden': 'true' }),
    image && item.image
      ? h('img', { class: 'cal-row-img', src: item.image, alt: '', decoding: 'async' })
      : null,
    h(
      'span',
      {},
      h('span', { class: 'mn-row-title' }, item.title),
      h('span', { class: 'mn-row-sub' }, item.cancelled ? t('event.cancelledSub', { sub }) : sub),
    ),
    h(
      'span',
      { class: 'mn-row-side' },
      h('b', {}, item.allDay ? t('event.allDay') : F.time.format(item.start)),
      item.allDay || item.due
        ? item.due
          ? t('event.due')
          : ''
        : t('event.until', { time: F.time.format(item.end) }),
    ),
  );
}

function dayList(day) {
  const its = onDay(S.items, day);
  return h(
    'section',
    { class: 'cal-daylist', 'aria-label': F.dayLong.format(day) },
    h(
      'div',
      { class: 'mn-sect' },
      h('h2', {}, F.dayLong.format(day), its.length ? h('small', {}, String(its.length)) : null),
      h(
        'button',
        {
          type: 'button',
          class: 'mn-link',
          onclick: () =>
            openEditor(null, {
              start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9),
            }),
        },
        t('event.add'),
      ),
    ),
    its.length
      ? h('div', { class: 'mn-list' }, its.map(row))
      : h('p', { class: 'mn-note' }, t('day.empty')),
  );
}

function agenda() {
  const { from, to } = rangeOf('list', S.anchor);
  const out = h('div', { class: 'cal-agenda' });
  const today = new Date();
  const showImages = imagesOn('list');
  if (S.items.some((i) => i.image)) out.append(imageSwitch('list'));
  for (let d = from; d < to; d = addDays(d, 1)) {
    const its = onDay(S.items, d);
    if (!its.length) continue;
    out.append(
      h(
        'section',
        { class: 'cal-agenda-day' },
        h(
          'div',
          { class: 'mn-sect' },
          h(
            'h2',
            {},
            sameDay(d, today)
              ? t('agenda.today', { day: F.dayLong.format(d) })
              : F.dayLong.format(d),
            h('small', {}, String(its.length)),
          ),
        ),
        h(
          'div',
          { class: 'mn-list' },
          its.map((i) => row(i, { image: showImages })),
        ),
      ),
    );
  }
  if (!out.querySelector('.cal-agenda-day'))
    out.append(
      h(
        'div',
        { class: 'mn-empty' },
        h('div', { class: 'mn-empty-icon' }, icon('calendar')),
        h('h3', {}, t('agenda.emptyTitle')),
        h('p', {}, t('agenda.emptyText')),
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => openEditor(null) },
          t('event.add'),
        ),
      ),
    );
  return out;
}

const isBanner = (i) => i.allDay || i.end - i.start >= DAY;
let suppressClick = false;

function timeGrid(days, { images = false } = {}) {
  const today = new Date();
  const grid = h('div', { class: 'cal-grid' });
  grid.style.setProperty('--days', String(days.length));
  const head = h(
    'div',
    { class: 'cal-ghead' },
    h('span', { class: 'cal-gutter' }),
    days.map((d) =>
      h(
        'button',
        {
          type: 'button',
          class: `cal-ghead-day${sameDay(d, today) ? ' today' : ''}`,
          'aria-label': F.dayLong.format(d),
          onclick: () => openDay(d),
        },
        h('small', {}, weekdays()[(d.getDay() + 6) % 7]),
        h('b', {}, String(d.getDate())),
      ),
    ),
  );
  const allDay = h(
    'div',
    { class: 'cal-allday' },
    h('span', { class: 'cal-gutter' }, h('span', { class: 'cal-gutter-label' }, t('event.allDay'))),
    days.map((d) =>
      h(
        'div',
        { class: 'cal-allday-col' },
        onDay(S.items, d)
          .filter(isBanner)
          .map((i) => chip(i, { time: false })),
      ),
    ),
  );
  const body = h('div', { class: 'cal-gbody' });
  body.style.height = `${24 * HOUR_PX}px`;
  const hours = h('div', { class: 'cal-hours', 'aria-hidden': 'true' });
  for (let i = 1; i < 24; i++) {
    const label = h('span', {}, `${String(i).padStart(2, '0')}:00`);
    label.style.top = `${i * HOUR_PX}px`;
    hours.append(label);
  }
  const cols = h('div', { class: 'cal-cols' });
  for (const d of days) {
    const start = dayStart(d);
    const end = addDays(d, 1);
    const col = h('div', {
      class: `cal-col${sameDay(d, today) ? ' today' : ''}`,
      role: 'group',
      'aria-label': F.dayLong.format(d),
    });
    const timed = onDay(S.items, d)
      .filter((i) => !isBanner(i))
      .map((i) => ({
        ...i,
        start: i.start < start ? start : i.start,
        end: i.end > end ? end : i.end,
        orig: i,
      }));
    for (const p of layoutDay(timed)) {
      const top = ((p.start - start) / 60_000) * (HOUR_PX / 60);
      const height = Math.max(((p.end - p.start) / 60_000) * (HOUR_PX / 60), 22);
      // a picture needs room: only entries longer than an hour, and not squeezed into a third lane
      const withImage =
        images &&
        imagesOn('day') &&
        Boolean(p.orig.image) &&
        p.orig.end - p.orig.start > 3_600_000 &&
        p.lanes <= 2;
      const ev = h(
        'button',
        {
          type: 'button',
          class: `cal-ev${p.cancelled ? ' is-cancelled' : ''}${p.orig.editable ? ' is-editable' : ''}${withImage ? ' has-image' : ''}`,
          'data-cat': p.color,
          'aria-label': itemLabel(p.orig),
        },
        withImage
          ? h('img', { class: 'cal-ev-img', src: p.orig.image, alt: '', decoding: 'async' })
          : null,
        h('span', { class: 'cal-ev-title' }, p.title),
        height >= 40
          ? h(
              'span',
              { class: 'cal-ev-time' },
              p.orig.due
                ? t('event.dueAt', { time: F.time.format(p.orig.start) })
                : `${F.time.format(p.orig.start)}–${F.time.format(p.orig.end)}`,
            )
          : null,
        p.orig.editable ? h('span', { class: 'cal-ev-grip', 'aria-hidden': 'true' }) : null,
      );
      ev.style.top = `${top}px`;
      ev.style.height = `${height}px`;
      ev.style.left = `${(p.lane / p.lanes) * 100}%`;
      ev.style.width = `calc(${100 / p.lanes}% - 3px)`;
      ev.addEventListener('click', () => {
        if (suppressClick) return;
        openDetail(p.orig);
      });
      if (p.orig.editable)
        ev.addEventListener('pointerdown', (e) => startDrag(e, p.orig, ev, cols));
      col.append(ev);
    }
    if (sameDay(d, today)) {
      const now = h('span', { class: 'cal-now', 'aria-hidden': 'true' });
      now.style.top = `${((today - start) / 60_000) * (HOUR_PX / 60)}px`;
      col.append(now);
    }
    // a click on free time creates an event there, rounded to the half hour
    col.addEventListener('click', (e) => {
      if (e.target !== col) return;
      const minutes = Math.floor(((e.offsetY / HOUR_PX) * 60) / 30) * 30;
      openEditor(null, { start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes) });
    });
    cols.append(col);
  }
  body.append(hours, cols);
  const anyImage = images && days.some((d) => onDay(S.items, d).some((i) => i.image));
  grid.append(
    ...(anyImage ? [imageSwitch('day')] : []),
    head,
    allDay,
    h('div', { class: 'cal-scroll' }, body),
  );
  return grid;
}

/** Mouse and pen: drag an own event to another time or day, or its lower edge to resize. */
function startDrag(e, item, el, cols) {
  if (e.pointerType === 'touch' || e.button !== 0) return;
  const resize = e.target instanceof Element && e.target.classList.contains('cal-ev-grip');
  const colEls = [...cols.children];
  const home = colEls.indexOf(el.parentElement);
  const x0 = e.clientX;
  const y0 = e.clientY;
  const top0 = Number.parseFloat(el.style.top);
  const height0 = Number.parseFloat(el.style.height);
  let moved = false;
  let minutes = 0;
  let day = home;
  const onMove = (ev) => {
    if (!moved && Math.abs(ev.clientY - y0) < 5 && Math.abs(ev.clientX - x0) < 5) return;
    moved = true;
    el.classList.add('is-dragging');
    minutes = Math.round(((ev.clientY - y0) / HOUR_PX) * 4) * 15;
    if (resize) {
      el.style.height = `${Math.max(height0 + (minutes * HOUR_PX) / 60, HOUR_PX / 4)}px`;
      return;
    }
    const idx = colEls.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return ev.clientX >= r.left && ev.clientX < r.right;
    });
    if (idx >= 0 && idx !== day) {
      colEls[idx].append(el);
      day = idx;
    }
    el.style.top = `${top0 + (minutes * HOUR_PX) / 60}px`;
  };
  const onUp = () => {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    if (!moved) return;
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    if (resize) {
      const end = new Date(item.end.getTime() + minutes * 60_000);
      if (end <= item.start) return render();
      void moveItem(item, item.start, end);
      return;
    }
    const start = new Date(shiftDays(item.start, day - home).getTime() + minutes * 60_000);
    if (start.getTime() === item.start.getTime()) return render();
    void moveItem(item, start, new Date(start.getTime() + (item.end - item.start)));
  };
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
}

function miniMonth() {
  const base = S.mini ?? new Date(S.anchor.getFullYear(), S.anchor.getMonth(), 1);
  const days = monthGrid(base.getFullYear(), base.getMonth());
  const today = new Date();
  const loaded = S.range;
  const move = (n) => {
    S.mini = new Date(base.getFullYear(), base.getMonth() + n, 1);
    render();
  };
  return h(
    'div',
    { class: 'mn-card cal-mini' },
    h(
      'div',
      { class: 'mn-cal-head' },
      h(
        'button',
        {
          type: 'button',
          class: 'mn-icon-btn',
          'aria-label': t('nav.prevMonth'),
          onclick: () => move(-1),
        },
        icon('left'),
      ),
      h('h2', {}, F.month.format(base)),
      h(
        'button',
        {
          type: 'button',
          class: 'mn-icon-btn',
          'aria-label': t('nav.nextMonth'),
          onclick: () => move(1),
        },
        icon('right'),
      ),
    ),
    h(
      'div',
      { class: 'mn-cal' },
      weekdays().map((d) => h('span', { class: 'mn-dow' }, d)),
    ),
    h(
      'div',
      { class: 'mn-cal' },
      days.map((day) => {
        const its = loaded && day >= loaded.from && day < loaded.to ? onDay(S.items, day) : [];
        return h(
          'button',
          {
            type: 'button',
            class: `mn-cell${day.getMonth() !== base.getMonth() ? ' out' : ''}${sameDay(day, today) ? ' today' : ''}`,
            'aria-pressed': sameDay(day, S.anchor) ? 'true' : 'false',
            'aria-label': F.dayLong.format(day),
            onclick: () => {
              S.anchor = day;
              S.mini = null;
              void load();
            },
          },
          String(day.getDate()),
          h(
            'span',
            { class: 'mn-dots' },
            colorsOf(its)
              .slice(0, 3)
              .map((c) => h('i', { 'data-cat': c })),
          ),
        );
      }),
    ),
  );
}

function sourceToggle(source, sub) {
  return h(
    'button',
    {
      type: 'button',
      class: 'cal-src-toggle',
      'data-cat': source.color,
      'aria-pressed': source.visible ? 'true' : 'false',
      onclick: () => setSource(source.id, { visible: !source.visible }),
    },
    h('span', { class: 'cal-src-box', 'aria-hidden': 'true' }, icon('check')),
    h(
      'span',
      { class: 'cal-src-text' },
      h('span', { class: 'cal-src-name' }, source.name),
      sub ? h('small', {}, sub) : null,
    ),
  );
}

function sourceToggles() {
  const groups = [
    [t('sources.mine'), S.sources.filter((s) => s.group === 'calendars')],
    [t('sources.google'), S.sources.filter((s) => s.group === 'google')],
    [t('sources.apps'), S.sources.filter((s) => s.group === 'apps')],
  ];
  return h(
    'div',
    { class: 'cal-srcs' },
    groups.map(([title, list]) =>
      list.length
        ? h(
            'section',
            { 'aria-label': title },
            h('h2', { class: 'cal-side-h' }, title),
            list.map((s) => sourceToggle(s)),
          )
        : null,
    ),
    h('button', { type: 'button', class: 'mn-link', onclick: openSources }, t('sources.manage')),
  );
}

// ---------- detail ----------
function openDetail(item) {
  const r = item.record;
  const rule = item.recurring ? parseRule(r.data?.recurrence?.rrule) : null;
  const app = r.created_by_app ?? r.source_app;
  const foreign = app && app !== SELF;
  const facts = [];
  if (r.place_name) facts.push([t('fact.place'), r.place_name]);
  if (rule) facts.push([t('fact.repeat'), describeRule(rule, t, loc())]);
  if (r.data?.reminders?.length)
    facts.push([
      t('fact.reminder'),
      r.data.reminders.map((x) => reminderLabel(x.offset)).join(', '),
    ]);
  if (r.amount_cents !== null && r.amount_cents !== undefined)
    facts.push([t('fact.amount'), euro(r.amount_cents, r.currency ?? 'EUR')]);
  facts.push([t(foreign ? 'fact.from' : 'fact.calendar'), sourceName(item)]);
  if (r.data?.description) facts.push([t('fact.description'), r.data.description]);
  const link = safeUrl(r.data?.url);
  const chips = [
    item.cancelled ? h('span', { class: 'mn-chip mn-chip--bad' }, t('chip.cancelled')) : null,
    r.data?.status === 'tentative'
      ? h('span', { class: 'mn-chip mn-chip--warn' }, t('chip.tentative'))
      : null,
    item.due ? h('span', { class: 'mn-chip mn-chip--plain' }, t('chip.due')) : null,
    r.status === 'done' ? h('span', { class: 'mn-chip mn-chip--ok' }, t('chip.done')) : null,
    item.recurring
      ? h('span', { class: 'mn-chip mn-chip--plain' }, icon('repeat'), t('event.series'))
      : null,
  ].filter(Boolean);
  let armed = false;
  const remove = item.editable
    ? h(
        'button',
        {
          type: 'button',
          class: 'mn-btn mn-btn--danger',
          onclick: async (e) => {
            if (!armed) {
              armed = true;
              e.currentTarget.textContent = t('common.deleteConfirm');
              return;
            }
            const scope = item.recurring
              ? await askScope(t('scope.deleteTitle'), ['one', 'following', 'all'])
              : 'all';
            if (!scope) return;
            window.mnui.sheet.close();
            await run(() => deleteItem(item, scope), t('toast.deleted'));
          },
        },
        t('common.delete'),
      )
    : null;
  window.mnui.sheet.open(
    frag(
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
          t('common.close'),
        ),
        h('span', {}),
        item.editable
          ? h(
              'button',
              { type: 'button', class: 'mn-btn', onclick: () => void editItem(item) },
              t('common.edit'),
            )
          : h('span', {}),
      ),
      h(
        'div',
        { class: 'mn-sheet-body cal-detail', 'data-cat': item.color },
        h('span', { class: 'cal-detail-bar', 'aria-hidden': 'true' }),
        h('h2', { class: `mn-sheet-title${item.cancelled ? ' is-cancelled' : ''}` }, item.title),
        h('p', { class: 'cal-detail-when' }, whenText(item)),
        chips.length ? h('div', { class: 'mn-chips' }, chips) : null,
        h(
          'dl',
          { class: 'mn-facts' },
          facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
        ),
        r.place_name || validPoint(r)
          ? h(
              'button',
              {
                type: 'button',
                class: 'mn-link',
                onclick: () => {
                  window.mnui.sheet.close();
                  S.prefs.map = { ...(S.prefs.map ?? {}), scope: 'day' };
                  setView('map', item.start);
                },
              },
              t('detail.showOnMap'),
            )
          : null,
        link
          ? h(
              'a',
              { class: 'mn-link', href: link, target: '_blank', rel: 'noopener noreferrer' },
              t('detail.openLink'),
            )
          : null,
        foreign
          ? h(
              'a',
              { class: 'mn-btn', href: appUrl(app) },
              t('detail.openIn', { app: appName(app) }),
            )
          : null,
        !item.editable && !foreign ? h('p', { class: 'mn-note' }, t('detail.readOnly')) : null,
      ),
      item.editable
        ? h(
            'div',
            { class: 'mn-sheet-foot' },
            remove,
            h('span', { class: 'mn-grow' }),
            h(
              'button',
              {
                type: 'button',
                class: 'mn-btn',
                onclick: () => openEditor(null, { copy: item }),
              },
              t('detail.duplicate'),
            ),
          )
        : null,
    ),
    { label: item.title },
  );
}

const scopeLabel = (scope) => t(`scope.${scope}`);
/** Asks which occurrences a change applies to; resolves with the scope or null. */
function askScope(title, scopes) {
  return new Promise((resolve) => {
    let chosen = null;
    const body = h(
      'div',
      { class: 'mn-sheet-body cal-scope' },
      h('h2', { class: 'cal-sheet-h' }, title),
      h('p', { class: 'mn-muted' }, t('scope.question')),
      scopes.map((s) =>
        h(
          'button',
          {
            type: 'button',
            class: 'mn-btn mn-btn--block',
            onclick: () => {
              chosen = s;
              window.mnui.sheet.close();
            },
          },
          scopeLabel(s),
        ),
      ),
      h(
        'button',
        { type: 'button', class: 'mn-btn mn-btn--ghost mn-btn--block', 'data-mn-close': true },
        t('common.cancel'),
      ),
    );
    window.mnui.sheet.open(body, { label: title, onClose: () => resolve(chosen) });
    body.querySelector('button')?.focus();
  });
}

async function editItem(item) {
  const scope = item.recurring
    ? await askScope(t('scope.editTitle'), ['one', 'following', 'all'])
    : 'all';
  if (scope) openEditor(item, { scope });
}

// ---------- writing ----------
async function events() {
  const mn = await ready;
  return mn.suite.type('event');
}
const baseFields = (r) => ({
  title: r.title,
  starts_at: r.starts_at,
  ends_at: r.ends_at,
  place_name: r.place_name,
  lat: r.lat,
  lon: r.lon,
  data: { ...(r.data ?? {}) },
});
const isFirst = (item) => {
  const span = spanOf(item.record, 'span');
  return span ? occurrenceKey(span.start) === item.occurrence : true;
};

/**
 * Saves an edit. `fields` carry the occurrence's new times; `scope` says which occurrences of
 * a series change. Returns { record, merged }.
 */
async function applyEdit(item, fields, scope, collection) {
  const ev = await events();
  if (!item) return ev.upsert(fields, { collection });
  const r = item.record;
  const recurrence = r.data?.recurrence;
  if (item.recurring && (scope === 'one' || (scope === 'following' && !isFirst(item)))) {
    // the new part first: if it fails, the series is still whole
    const data = { ...r.data, ...(fields.data ?? {}) };
    if (scope === 'one') data.recurrence = null;
    else {
      const delta = fields.starts_at ? new Date(fields.starts_at) - item.start : 0;
      const sameRule =
        !fields.data?.recurrence || fields.data.recurrence.rrule === recurrence.rrule;
      const rrule = sameRule
        ? ruleFrom(recurrence.rrule, new Date(r.starts_at), item.start)
        : fields.data.recurrence.rrule;
      const kept = (recurrence.exdates ?? []).filter((k) => k >= item.occurrence);
      data.recurrence = {
        rrule,
        ...(sameRule && kept.length ? { exdates: shiftKeys(kept, delta) } : {}),
      };
    }
    const created = await ev.upsert(
      { ...baseFields(r), ...fields, data },
      { collection: collection ?? r.collection_id },
    );
    const master = await ev.upsert(
      {
        data: {
          recurrence:
            scope === 'one'
              ? withExdate(recurrence, item.occurrence)
              : { ...recurrence, rrule: endBefore(recurrence.rrule, item.start) },
        },
      },
      { id: r.id },
    );
    void scheduleReminders(master.record);
    return created;
  }
  let next = fields;
  if (item.recurring && fields.starts_at) {
    const moved = shiftSeries(
      new Date(r.starts_at),
      item.start,
      new Date(fields.starts_at),
      new Date(fields.ends_at),
    );
    next = { ...fields, starts_at: moved.start.toISOString(), ends_at: moved.end.toISOString() };
    // exclusions move with the series (unless the editor set a new rule)
    const delta = moved.start - new Date(r.starts_at);
    const rule = next.data?.recurrence ?? recurrence;
    if (delta && rule?.exdates?.length && rule.rrule === recurrence?.rrule)
      next = {
        ...next,
        data: {
          ...(next.data ?? {}),
          recurrence: { ...rule, exdates: shiftKeys(rule.exdates, delta) },
        },
      };
  }
  if (collection && collection !== r.collection_id) {
    // another calendar: a new record there, the old one into the bin
    const created = await ev.upsert(
      { ...baseFields(r), ...next, data: { ...r.data, ...(next.data ?? {}) } },
      { collection },
    );
    await ev.delete(r.id);
    await cancelReminders(r);
    return created;
  }
  return ev.upsert(next, { id: r.id });
}

async function deleteItem(item, scope) {
  const ev = await events();
  const r = item.record;
  if (!item.recurring || scope === 'all' || (scope === 'following' && isFirst(item))) {
    await ev.delete(r.id);
    await cancelReminders(r);
    return;
  }
  const recurrence = r.data.recurrence;
  const master = await ev.upsert(
    {
      data: {
        recurrence:
          scope === 'one'
            ? withExdate(recurrence, item.occurrence)
            : { ...recurrence, rrule: endBefore(recurrence.rrule, item.start) },
      },
    },
    { id: r.id },
  );
  // the next reminder may have been for the removed occurrence
  void scheduleReminders(master.record);
}

async function moveItem(item, start, end) {
  const scope = item.recurring
    ? await askScope(t('scope.moveTitle'), ['one', 'following', 'all'])
    : 'all';
  if (!scope) return render();
  await run(async () => {
    const saved = await applyEdit(
      item,
      { starts_at: start.toISOString(), ends_at: end.toISOString() },
      scope,
    );
    void scheduleReminders(saved.record);
  }, t('toast.moved'));
}

/** Runs a write, confirms it and reloads; errors become a toast. */
async function run(action, done) {
  try {
    await action();
    toast(done);
    googleSoon();
  } catch (err) {
    toast(errorText(err));
  }
  await load();
}

// ---------- reminders (mn.push) ----------
const reminderKey = (id, i) => `ev:${id}:${i}`;
async function cancelReminders(record) {
  const mn = await ready;
  const count = Math.max(record.data?.reminders?.length ?? 0, 1);
  for (let i = 0; i < count; i++) await mn.push.cancel(reminderKey(record.id, i)).catch(() => {});
}

/** Schedules the next reminder of each of the record's reminders (series: the next occurrence). */
async function scheduleReminders(record, existing = null) {
  if (record?.type !== 'event') return;
  const mn = await ready;
  const span = spanOf(record, 'span');
  const reminders = record.data?.status === 'cancelled' ? [] : (record.data?.reminders ?? []);
  for (let i = 0; i < 3; i++) {
    const key = reminderKey(record.id, i);
    const offset = reminders[i] ? parseOffset(reminders[i].offset) : null;
    const hit =
      span && offset !== null
        ? nextReminder(
            span.start,
            record.data?.recurrence?.rrule,
            record.data?.recurrence?.exdates,
            offset,
            new Date(),
          )
        : null;
    try {
      if (!hit) {
        if (!existing || existing.has(key)) await mn.push.cancel(key);
        continue;
      }
      const at = new Date(Math.floor(hit.at.getTime() / 60_000) * 60_000);
      if (existing?.get(key) === at.getTime()) continue;
      const end = new Date(hit.occurrence.getTime() + (span.end - span.start));
      await mn.push.schedule({
        key,
        at,
        title: record.title ?? t('event.default'),
        body: whenText({ start: hit.occurrence, end, allDay: span.allDay, due: false }),
        path: `/?view=day&date=${dateInput(hit.occurrence)}&event=${record.id}`,
      });
    } catch {
      // push is optional; the calendar works without it
    }
  }
}

/** Once per start: the next reminders of own events in the coming 60 days. */
async function syncReminders() {
  try {
    const mn = await ready;
    const now = new Date();
    const [records, scheduled] = await Promise.all([
      mn.suite.range({
        from: now.toISOString(),
        to: new Date(now.getTime() + 60 * DAY).toISOString(),
        types: ['event'],
      }),
      mn.push.list(),
    ]);
    const existing = new Map(scheduled.map((p) => [p.key, new Date(p.at).getTime()]));
    for (const r of records)
      if (
        (r.created_by_app ?? SELF) === SELF &&
        (r.data?.reminders?.length || existing.has(reminderKey(r.id, 0)))
      )
        await scheduleReminders(r, existing);
  } catch {
    // no network or push unavailable: try again next start
  }
}

// ---------- editor ----------
function option(value, label) {
  return h('option', { value }, label);
}

async function openEditor(item, opts = {}) {
  // the calendars to choose from come with the first load
  await firstLoad;
  const src = item?.record ?? opts.copy?.record ?? null;
  const scope = item ? (opts.scope ?? 'all') : null;
  const calendars = writableCalendars();
  const personal = calendars.find((c) => c.personal);
  const base = item ?? opts.copy ?? null;
  // a copy goes to the next day: the same title at the same time would merge into the original
  const shift = opts.copy ? 1 : 0;
  const start0 = base ? shiftDays(base.start, shift) : (opts.start ?? nextHalfHour());
  const end0 = base ? shiftDays(base.end, shift) : new Date(start0.getTime() + 3600_000);
  const allDay0 = base ? base.allDay : false;

  const title = h('input', {
    name: 'title',
    required: true,
    maxlength: 500,
    autocomplete: 'off',
    value: src?.title ?? '',
  });
  const allDay = h('input', { type: 'checkbox', name: 'all_day', checked: allDay0 });
  const sd = h('input', {
    type: 'date',
    name: 'start_date',
    required: true,
    value: dateInput(start0),
  });
  const st = h('input', {
    type: 'time',
    name: 'start_time',
    step: 300,
    'aria-label': t('editor.startTime'),
    value: timeInput(start0),
  });
  const ed = h('input', {
    type: 'date',
    name: 'end_date',
    value: dateInput(allDay0 ? addDays(end0, -1) : end0),
  });
  const et = h('input', {
    type: 'time',
    name: 'end_time',
    step: 300,
    'aria-label': t('editor.endTime'),
    value: timeInput(end0),
  });
  // moving the start keeps the length
  let lastStart = fromInputs(sd.value, st.value);
  const keepLength = () => {
    const s = fromInputs(sd.value, allDay.checked ? '00:00' : st.value);
    const e = fromInputs(ed.value, allDay.checked ? '00:00' : et.value);
    if (s && e && lastStart) {
      const moved = new Date(e.getTime() + (s - lastStart));
      ed.value = dateInput(moved);
      if (!allDay.checked) et.value = timeInput(moved);
    }
    lastStart = s;
  };
  sd.addEventListener('change', keepLength);
  st.addEventListener('change', keepLength);

  // recurrence
  const rec0 = scope === 'one' || opts.copy ? null : src?.data?.recurrence;
  const rule0 = rec0 ? parseRule(rec0.rrule) : null;
  const custom = Boolean(
    rule0 &&
      (rule0.bymonthday.length ||
        rule0.bymonth.length ||
        rule0.byday.some((b) => b.n) ||
        (rule0.byday.length && rule0.freq !== 'WEEKLY')),
  );
  const freq = h(
    'select',
    { name: 'freq' },
    option('', t('repeat.never')),
    option('DAILY', t('repeat.daily')),
    option('WEEKLY', t('repeat.weekly')),
    option('MONTHLY', t('repeat.monthly')),
    option('YEARLY', t('repeat.yearly')),
    custom ? option('CUSTOM', describeRule(rule0, t, loc())) : null,
  );
  freq.value = custom ? 'CUSTOM' : (rule0?.freq ?? '');
  const interval = h('input', {
    type: 'number',
    name: 'interval',
    min: 1,
    max: 99,
    inputmode: 'numeric',
    value: rule0?.interval ?? 1,
  });
  const picked = new Set(rule0?.byday.length ? rule0.byday.map((b) => b.wd) : [start0.getDay()]);
  // until the weekdays are picked by hand, they follow the start date
  let daysTouched = Boolean(rule0?.byday.length);
  const daypick = h(
    'div',
    { class: 'mn-daypick', role: 'group', 'aria-label': t('editor.weekdays') },
    [1, 2, 3, 4, 5, 6, 0].map((wd) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': picked.has(wd) ? 'true' : 'false',
          'aria-label': t(`weekdayLong.${wd}`),
          'data-wd': wd,
          onclick: (e) => {
            daysTouched = true;
            if (picked.has(wd) && picked.size > 1) picked.delete(wd);
            else picked.add(wd);
            e.currentTarget.setAttribute('aria-pressed', picked.has(wd) ? 'true' : 'false');
          },
        },
        weekdays()[(wd + 6) % 7],
      ),
    ),
  );
  const endKind = h(
    'select',
    { name: 'repeat_end' },
    option('never', t('repeat.never')),
    option('count', t('repeat.afterCount')),
    option('until', t('repeat.onDate')),
  );
  endKind.value = rule0?.count ? 'count' : rule0?.until ? 'until' : 'never';
  const count = h('input', {
    type: 'number',
    name: 'count',
    min: 1,
    max: 999,
    inputmode: 'numeric',
    value: rule0?.count ?? 10,
  });
  const until = h('input', {
    type: 'date',
    name: 'until',
    value: dateInput(rule0?.until ?? addDays(start0, 90)),
  });
  const intervalUnit = h('span', { class: 'cal-unit' });
  const countLabel = h('label', { class: 'mn-field' }, t('repeat.count'), count);
  const untilLabel = h('label', { class: 'mn-field' }, t('repeat.lastDay'), until);
  const repeatGroup = h(
    'div',
    { class: 'mn-group cal-repeat' },
    h(
      'label',
      { class: 'mn-field cal-interval' },
      t('repeat.every'),
      h('span', { class: 'cal-inline' }, interval, intervalUnit),
    ),
    daypick,
    h(
      'div',
      { class: 'mn-grid-2' },
      h('label', { class: 'mn-field' }, t('repeat.ends'), endKind),
      countLabel,
      untilLabel,
    ),
  );
  const syncRepeat = () => {
    const f = freq.value;
    repeatGroup.hidden = !f || f === 'CUSTOM';
    daypick.hidden = f !== 'WEEKLY';
    intervalUnit.textContent =
      {
        DAILY: t('unit.days'),
        WEEKLY: t('unit.weeks'),
        MONTHLY: t('unit.months'),
        YEARLY: t('unit.years'),
      }[f] ?? '';
    countLabel.hidden = endKind.value !== 'count';
    untilLabel.hidden = endKind.value !== 'until';
  };
  freq.addEventListener('change', syncRepeat);
  sd.addEventListener('change', () => {
    const d = fromInputs(sd.value);
    if (daysTouched || !d) return;
    picked.clear();
    picked.add(d.getDay());
    for (const b of daypick.children)
      b.setAttribute('aria-pressed', picked.has(Number(b.dataset.wd)) ? 'true' : 'false');
  });
  endKind.addEventListener('change', syncRepeat);

  // reminder
  const reminder = h('select', { name: 'reminder' });
  const fillReminders = () => {
    const current = reminder.value || src?.data?.reminders?.[0]?.offset || '';
    const list = allDay.checked ? REMINDERS_ALL_DAY : REMINDERS_TIMED;
    reminder.replaceChildren(...list.map(([v, l]) => option(v, t(l))));
    reminder.value = list.some(([v]) => v === current) ? current : '';
  };

  // calendar, colour, status
  const calendar = h(
    'select',
    { name: 'calendar' },
    calendars.map((c) =>
      option(
        c.id,
        c.personal
          ? c.name
          : googleCollections().has(c.id)
            ? t('calendar.google', { name: c.name })
            : t('calendar.shared', { name: c.name }),
      ),
    ),
  );
  calendar.value =
    src && calendars.some((c) => c.id === src.collection_id)
      ? src.collection_id
      : S.prefs.defaultCalendar && calendars.some((c) => c.id === S.prefs.defaultCalendar)
        ? S.prefs.defaultCalendar
        : (personal?.id ?? calendars[0]?.id ?? '');
  let color = src?.data?.color ?? null;
  const swatches = h(
    'div',
    { class: 'cal-swatches', role: 'group', 'aria-label': t('editor.colour') },
    [null, ...COLORS].map((c) =>
      h(
        'button',
        {
          type: 'button',
          class: 'cal-swatch-btn',
          'data-cat': c ?? 'none',
          'aria-pressed': c === color ? 'true' : 'false',
          'aria-label': c ? colorName(c) : t('editor.calendarColour'),
          title: c ? colorName(c) : t('editor.calendarColour'),
          onclick: (e) => {
            color = c;
            for (const b of swatches.children)
              b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
          },
        },
        c ? null : t('editor.auto'),
      ),
    ),
  );
  const status = h(
    'select',
    { name: 'status' },
    option('confirmed', t('status.confirmed')),
    option('tentative', t('chip.tentative')),
    option('cancelled', t('chip.cancelled')),
  );
  status.value = src?.data?.status ?? 'confirmed';
  // The checked point of the place (stored with the event, so the map needs no lookup).
  let coords = validPoint({ lat: src?.lat, lon: src?.lon })
    ? { lat: src.lat, lon: src.lon, q: (src.place_name ?? '').trim() }
    : null;
  const placeNote = h(
    'p',
    { class: 'mn-note', role: 'status' },
    coords ? t('editor.placeChecked') : '',
  );
  const place = h('input', {
    name: 'place',
    maxlength: 300,
    autocomplete: 'off',
    value: src?.place_name ?? '',
  });
  place.addEventListener('input', () => {
    if (coords && coords.q !== place.value.trim()) {
      coords = null;
      placeNote.textContent = '';
    }
  });
  const checkPlace = h(
    'button',
    {
      type: 'button',
      class: 'mn-btn',
      onclick: async (e) => {
        const text = place.value.trim();
        if (!text) return;
        e.currentTarget.disabled = true;
        placeNote.textContent = t('map.searching');
        try {
          const [hit] = await geocode(text);
          if (hit) {
            coords = { lat: hit.lat, lon: hit.lon, q: text };
            placeNote.textContent = t('editor.placeFound', { place: hit.label });
          } else placeNote.textContent = t('editor.placeNone');
        } catch (err) {
          placeNote.textContent = `${t('editor.placeOffline')} ${reasonOf(err)}`;
        } finally {
          e.currentTarget.disabled = false;
        }
      },
    },
    t('editor.placeCheck'),
  );
  const description = h(
    'textarea',
    { name: 'description', rows: 4, maxlength: 10000 },
    src?.data?.description ?? '',
  );
  const url = h('input', {
    name: 'url',
    type: 'url',
    inputmode: 'url',
    maxlength: 2000,
    autocomplete: 'off',
    placeholder: 'https://…',
    value: src?.data?.url ?? '',
  });

  const error = h('p', { class: 'mn-error', role: 'alert', hidden: true });
  const fail = (message, field) => {
    error.textContent = message;
    error.hidden = false;
    for (const f of [title, sd, ed, st, et, url, count, until]) f.removeAttribute('aria-invalid');
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  };

  const startTimeLabel = h('label', { class: 'mn-field' }, t('editor.time'), st);
  const endTimeLabel = h('label', { class: 'mn-field' }, t('editor.time'), et);
  const syncAllDay = () => {
    startTimeLabel.hidden = allDay.checked;
    endTimeLabel.hidden = allDay.checked;
    fillReminders();
  };
  allDay.addEventListener('change', syncAllDay);

  const more = h(
    'details',
    {
      class: 'mn-more',
      open: Boolean(src?.place_name || src?.data?.description || src?.data?.url),
    },
    h('summary', {}, t('editor.more')),
    h(
      'div',
      {},
      h('label', { class: 'mn-field' }, t('fact.place'), place),
      h('div', { class: 'cal-place-check' }, checkPlace, placeNote),
      h('label', { class: 'mn-field' }, t('fact.description'), description),
      h('label', { class: 'mn-field' }, t('editor.link'), url),
    ),
  );

  const form = h(
    'form',
    { class: 'mn-form mn-sheet-body', novalidate: true },
    h(
      'fieldset',
      {},
      h('legend', {}, t('event.default')),
      h('label', { class: 'mn-field' }, t('editor.title'), title),
      h('div', { class: 'mn-checks' }, h('label', {}, allDay, t('event.allDay'))),
      h(
        'div',
        { class: 'mn-grid-2' },
        h('label', { class: 'mn-field' }, t('editor.start'), sd),
        startTimeLabel,
      ),
      h(
        'div',
        { class: 'mn-grid-2' },
        h('label', { class: 'mn-field' }, t('editor.end'), ed),
        endTimeLabel,
      ),
    ),
    scope === 'one'
      ? h('p', { class: 'mn-note' }, t('editor.onlyOne'))
      : h(
          'fieldset',
          {},
          h('legend', {}, t('fact.repeat')),
          h('label', { class: 'mn-field' }, t('editor.repeatLabel'), freq),
          repeatGroup,
        ),
    h(
      'fieldset',
      {},
      h('legend', {}, t('editor.calendarAndReminder')),
      h(
        'div',
        { class: 'mn-grid-2' },
        h('label', { class: 'mn-field' }, t('fact.calendar'), calendar),
        h('label', { class: 'mn-field' }, t('fact.reminder'), reminder),
      ),
      h('div', { class: 'mn-field' }, h('span', {}, t('editor.colour')), swatches),
      h('label', { class: 'mn-field' }, t('editor.status'), status),
    ),
    more,
    error,
  );

  const recurrenceValue = () => {
    if (!freq.value) return null;
    if (freq.value === 'CUSTOM') return rec0;
    const rrule = buildRule({
      freq: freq.value,
      interval: Math.max(1, Number.parseInt(interval.value, 10) || 1),
      byday: freq.value === 'WEEKLY' ? [...picked].map((wd) => ({ n: 0, wd })) : [],
      count: endKind.value === 'count' ? Math.max(1, Number.parseInt(count.value, 10) || 1) : null,
      until: endKind.value === 'until' ? fromInputs(until.value) : null,
    });
    return rec0 && rec0.rrule === rrule ? rec0 : { rrule };
  };

  let saving = false;
  const save = async () => {
    if (saving) return;
    const text = title.value.trim();
    if (!text) return fail(t('editor.errTitle'), title);
    let s;
    let e;
    if (allDay.checked) {
      s = fromInputs(sd.value);
      const last = fromInputs(ed.value || sd.value);
      e = last ? addDays(last, 1) : null;
    } else {
      s = fromInputs(sd.value, st.value);
      e = fromInputs(ed.value || sd.value, et.value || st.value);
    }
    if (!s) return fail(t('editor.errStart'), sd);
    if (!e || e < s) return fail(t('editor.errEnd'), ed);
    const link = url.value.trim();
    if (link && !safeUrl(link)) return fail(t('editor.errLink'), url);
    if (endKind.value === 'until' && freq.value && freq.value !== 'CUSTOM') {
      const u = fromInputs(until.value);
      if (!u || addDays(u, 1) <= s) return fail(t('editor.errUntil'), until);
    }
    const data = {
      all_day: allDay.checked || null,
      description: description.value.trim() || null,
      url: link || null,
      color,
      status: status.value === 'confirmed' ? null : status.value,
      reminders: reminder.value ? [{ offset: reminder.value, channel: 'push' }] : null,
    };
    if (scope !== 'one') data.recurrence = recurrenceValue();
    const placeText = place.value.trim();
    // A place nobody checked is looked up quietly (a few seconds at most); no result is no problem.
    if (placeText && !coords) {
      try {
        const [hit] = await Promise.race([
          geocode(placeText),
          new Promise((resolve) => setTimeout(() => resolve([]), 3500)),
        ]);
        if (hit) coords = { lat: hit.lat, lon: hit.lon, q: placeText };
      } catch {
        // offline or not set up
      }
    }
    const fields = {
      title: text,
      starts_at: s.toISOString(),
      ends_at: e.toISOString(),
      place_name: placeText || null,
      lat: placeText && coords ? coords.lat : null,
      lon: placeText && coords ? coords.lon : null,
      data,
    };
    saving = true;
    try {
      const result = await applyEdit(item, fields, scope, calendar.value || undefined);
      window.mnui.sheet.close();
      toast(t(result.merged ? 'toast.merged' : item ? 'toast.saved' : 'toast.created'));
      void scheduleReminders(result.record);
      googleSoon();
      const { from, to } = rangeOf(S.view, S.anchor);
      if (s >= to || e <= from) S.anchor = dayStart(s);
      await load();
    } catch (err) {
      fail(errorText(err));
    } finally {
      saving = false;
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void save();
  });

  fillReminders();
  syncAllDay();
  syncRepeat();
  window.mnui.sheet.open(
    frag(
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
          t('common.cancel'),
        ),
        h('h2', {}, t(item ? 'editor.edit' : 'editor.new')),
        h('span', {}),
      ),
      form,
      h(
        'div',
        { class: 'mn-sheet-foot' },
        h('span', { class: 'mn-grow' }),
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => void save() },
          t('common.save'),
        ),
      ),
    ),
    { tall: true, modal: true, label: t(item ? 'editor.edit' : 'editor.new') },
  );
  title.focus();
  if (!calendars.length) fail(t('editor.errNoCalendar'));
}

// ---------- calendars and sources ----------
function openSources() {
  const body = h('div', { class: 'mn-sheet-body cal-manage' });
  // keep open panels and the focused control across redraws
  const draw = () => {
    const open = new Set([...body.querySelectorAll('details[open]')].map((d) => d.dataset.key));
    const focused =
      document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : null;
    body.replaceChildren(...manageContent(draw));
    for (const d of body.querySelectorAll('details')) if (open.has(d.dataset.key)) d.open = true;
    if (focused) body.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus();
  };
  draw();
  sheetRedraw = draw;
  window.mnui.sheet.open(
    frag(
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
          t('common.done'),
        ),
        h('h2', {}, t('nav.sources')),
        h('span', {}),
      ),
      body,
    ),
    {
      tall: true,
      label: t('nav.sources'),
      onClose: () => {
        sheetRedraw = null;
      },
    },
  );
}

function colorPicker(source, redraw) {
  return h(
    'div',
    {
      class: 'cal-swatches',
      role: 'group',
      'aria-label': t('manage.colourFor', { name: source.name }),
    },
    COLORS.map((c) =>
      h('button', {
        type: 'button',
        class: 'cal-swatch-btn',
        'data-cat': c,
        'aria-pressed': source.color === c ? 'true' : 'false',
        'aria-label': colorName(c),
        title: colorName(c),
        'data-key': `c:${source.id}:${c}`,
        onclick: () => {
          setSource(source.id, { color: c });
          redraw();
        },
      }),
    ),
  );
}

/** The colour of all entries an app brings: shown in the day, list, month and on the map. */
function appColorPicker(app, list, redraw) {
  const same = list.every((s) => s.color === list[0]?.color) ? list[0]?.color : null;
  return h(
    'div',
    { class: 'cal-app-colour' },
    h('span', { class: 'cal-app-colour-label' }, t('manage.colourForApp', { name: appName(app) })),
    h(
      'div',
      {
        class: 'cal-swatches',
        role: 'group',
        'aria-label': t('manage.colourForApp', { name: appName(app) }),
      },
      COLORS.map((c) =>
        h('button', {
          type: 'button',
          class: 'cal-swatch-btn',
          'data-cat': c,
          'aria-pressed': same === c ? 'true' : 'false',
          'aria-label': colorName(c),
          title: colorName(c),
          'data-key': `ac:${app}:${c}`,
          onclick: () => {
            setAppColor(app, c);
            redraw();
          },
        }),
      ),
    ),
  );
}

function confirmButton(label, confirmLabel, action) {
  let armed = false;
  return h(
    'button',
    {
      type: 'button',
      class: 'mn-btn mn-btn--danger',
      onclick: (e) => {
        if (!armed) {
          armed = true;
          e.currentTarget.textContent = confirmLabel;
          return;
        }
        void action();
      },
    },
    label,
  );
}

function manageContent(redraw) {
  const calendars = S.sources.filter((s) => s.group === 'calendars');
  const fromGoogle = S.sources.filter((s) => s.group === 'google');
  const apps = S.sources.filter((s) => s.group === 'apps');
  const withToggle = (source, sub, extra = []) => {
    const wrap = h('div', { class: 'cal-src' }, sourceToggle(source, sub));
    wrap.querySelector('button')?.setAttribute('data-key', `t:${source.id}`);
    wrap.append(
      h(
        'details',
        { class: 'cal-src-more', 'data-key': `d:${source.id}` },
        h('summary', {}, t('manage.customise')),
        h('div', {}, colorPicker(source, redraw), ...extra),
      ),
    );
    return wrap;
  };
  const calendarRow = (source) => {
    const c = source.collection;
    if (!c) return withToggle(source, t('calendar.sharedName'));
    const others = c.members.filter((m) => m.userId !== S.me);
    const sub = c.personal
      ? t('calendar.personal')
      : c.role === 'owner'
        ? others.length
          ? t('manage.sharedWith', { names: others.map((m) => m.name).join(', ') })
          : t('manage.sharedNobody')
        : t(c.role === 'viewer' ? 'manage.fromViewOnly' : 'manage.fromEdit', {
            owner: c.ownerName,
          });
    const extra = [];
    if (c.role !== 'viewer')
      extra.push(
        h(
          'button',
          {
            type: 'button',
            class: 'mn-btn',
            'aria-pressed': S.prefs.defaultCalendar === c.id ? 'true' : 'false',
            onclick: () => {
              S.prefs.defaultCalendar = c.id;
              setSource(source.id, {});
              toast(t('manage.defaultSet', { name: c.name }));
              redraw();
            },
          },
          t('manage.useDefault'),
        ),
      );
    if (!c.personal && c.role === 'owner')
      extra.push(
        h(
          'button',
          { type: 'button', class: 'mn-btn', onclick: () => void openMembers(c) },
          icon('people'),
          t('manage.members'),
        ),
        confirmButton(t('manage.deleteCalendar'), t('manage.deleteConfirm'), async () => {
          window.mnui.sheet.close();
          const mn = await ready;
          await runMeta(() => mn.suite.leave(c.id), t('toast.calendarDeleted'));
        }),
      );
    if (!c.personal && c.role !== 'owner')
      extra.push(
        confirmButton(t('manage.leave'), t('manage.leaveConfirm'), async () => {
          window.mnui.sheet.close();
          const mn = await ready;
          await runMeta(() => mn.suite.leave(c.id), t('toast.calendarLeft'));
        }),
      );
    return withToggle(source, sub, extra);
  };

  const file = h('input', {
    type: 'file',
    accept: '.ics,text/calendar',
    class: 'mn-sr-only',
    tabindex: -1,
    'aria-hidden': 'true',
  });
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) void importIcs(f);
    file.value = '';
  });
  return [
    h(
      'section',
      { class: 'cal-manage-sect' },
      h(
        'div',
        { class: 'mn-sect' },
        h('h2', {}, t('sources.mine'), h('small', {}, String(calendars.length))),
        h(
          'button',
          { type: 'button', class: 'mn-link', onclick: openNewCalendar },
          t('calendar.new'),
        ),
      ),
      calendars.map(calendarRow),
    ),
    fromGoogle.length
      ? h(
          'section',
          { class: 'cal-manage-sect' },
          h('div', { class: 'mn-sect' }, h('h2', {}, t('sources.google'))),
          fromGoogle.map((s) =>
            withToggle(s, null, [h('p', { class: 'mn-note' }, t('manage.googleNote'))]),
          ),
        )
      : null,
    h(
      'section',
      { class: 'cal-manage-sect' },
      h('div', { class: 'mn-sect' }, h('h2', {}, t('sources.apps'))),
      apps.length
        ? [...new Set(apps.map((s) => s.app))].map((app) => {
            const list = apps.filter((s) => s.app === app);
            return h(
              'div',
              { class: 'cal-app-block', 'data-key': `app:${app}` },
              h('h3', { class: 'cal-app-name' }, appName(app)),
              appColorPicker(app, list, redraw),
              list.map((s) =>
                withToggle(s, s.hiddenByDefault && !s.visible ? t('manage.hiddenByDefault') : null),
              ),
            );
          })
        : h('p', { class: 'mn-note' }, t('manage.appsEmpty')),
    ),
    h(
      'section',
      { class: 'cal-manage-sect' },
      h('div', { class: 'mn-sect' }, h('h2', {}, t('manage.importExport'))),
      h('p', { class: 'mn-note' }, t('manage.icsNote')),
      h(
        'div',
        { class: 'cal-actions' },
        h(
          'button',
          { type: 'button', class: 'mn-btn', onclick: () => file.click() },
          t('manage.icsImport'),
        ),
        h(
          'button',
          { type: 'button', class: 'mn-btn', onclick: () => void exportIcs() },
          t('manage.icsExport'),
        ),
        file,
      ),
    ),
    h(
      'section',
      { class: 'cal-manage-sect' },
      h('div', { class: 'mn-sect' }, h('h2', {}, t('manage.shortcuts'))),
      shortcutList(),
    ),
  ];
}

async function runMeta(action, done) {
  try {
    await action();
    toast(done);
  } catch (err) {
    toast(errorText(err));
  }
  await load({ meta: true });
}

function openNewCalendar() {
  const name = h('input', {
    name: 'name',
    required: true,
    maxlength: 100,
    autocomplete: 'off',
    placeholder: t('calendar.namePlaceholder'),
  });
  let color = COLORS[S.collections.length % COLORS.length];
  const swatches = h(
    'div',
    { class: 'cal-swatches', role: 'group', 'aria-label': t('editor.colour') },
    COLORS.map((c) =>
      h('button', {
        type: 'button',
        class: 'cal-swatch-btn',
        'data-cat': c,
        'aria-pressed': c === color ? 'true' : 'false',
        'aria-label': colorName(c),
        onclick: (e) => {
          color = c;
          for (const b of swatches.children)
            b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
        },
      }),
    ),
  );
  const error = h('p', { class: 'mn-error', role: 'alert', hidden: true });
  const save = async () => {
    const text = name.value.trim();
    if (!text) {
      error.textContent = t('calendar.errName');
      error.hidden = false;
      name.setAttribute('aria-invalid', 'true');
      name.focus();
      return;
    }
    const mn = await ready;
    window.mnui.sheet.close();
    await runMeta(
      () => mn.suite.createCollection(text, 'kalender', color),
      t('toast.calendarCreated'),
    );
  };
  const form = h(
    'form',
    { class: 'mn-form mn-sheet-body', novalidate: true },
    h(
      'fieldset',
      {},
      h('legend', {}, t('calendar.new')),
      h('label', { class: 'mn-field' }, t('editor.name'), name),
      h('div', { class: 'mn-field' }, h('span', {}, t('editor.colour')), swatches),
      h('p', { class: 'mn-hint' }, t('calendar.hint')),
    ),
    error,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void save();
  });
  window.mnui.sheet.open(
    frag(
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
          t('common.cancel'),
        ),
        h('h2', {}, t('calendar.new')),
        h('span', {}),
      ),
      form,
      h(
        'div',
        { class: 'mn-sheet-foot' },
        h('span', { class: 'mn-grow' }),
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => void save() },
          t('calendar.create'),
        ),
      ),
    ),
    { modal: true, label: t('calendar.new') },
  );
  name.focus();
}

async function openMembers(collection) {
  const mn = await ready;
  let people = [];
  try {
    people = (await mn.people()).filter((p) => p.id !== S.me);
  } catch {
    toast(t('members.errLoad'));
    return;
  }
  const roles = new Map(collection.members.map((m) => [m.userId, m.role]));
  const list = h(
    'div',
    { class: 'mn-list' },
    people.map((p) => {
      const select = h(
        'select',
        { 'aria-label': t('members.accessFor', { name: p.name }) },
        option('', t('members.none')),
        option('viewer', t('members.viewer')),
        option('editor', t('members.editor')),
      );
      select.value = roles.get(p.id) ?? '';
      select.addEventListener('change', async () => {
        try {
          await mn.suite.setMember(collection.id, p.id, select.value || null);
          if (select.value) roles.set(p.id, select.value);
          else roles.delete(p.id);
          toast(t(select.value ? 'members.added' : 'members.removed', { name: p.name }));
          await loadMeta(mn);
          refresh();
          render();
        } catch (err) {
          toast(errorText(err));
          select.value = roles.get(p.id) ?? '';
        }
      });
      return h(
        'div',
        { class: 'mn-row mn-row--text cal-member' },
        h('span', { class: 'mn-thumb', 'aria-hidden': 'true' }, p.name.slice(0, 2).toUpperCase()),
        h('span', { class: 'mn-row-title' }, p.name),
        select,
      );
    }),
  );
  window.mnui.sheet.open(
    frag(
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
          t('common.done'),
        ),
        h('h2', {}, collection.name),
        h('span', {}),
      ),
      h(
        'div',
        { class: 'mn-sheet-body' },
        h('p', { class: 'mn-muted' }, t('members.intro')),
        people.length ? list : h('p', { class: 'mn-note' }, t('members.empty')),
      ),
    ),
    { tall: true, label: t('members.label', { name: collection.name }) },
  );
}

// ---------- ICS ----------
async function importIcs(file) {
  if (file.size > 5_000_000) return toast(t('ics.tooBig'));
  const parsed = parseIcs(await file.text()).slice(0, 2000);
  if (!parsed.length) return toast(t('ics.empty'));
  const calendars = writableCalendars();
  const target =
    calendars.find((c) => c.id === S.prefs.defaultCalendar) ??
    calendars.find((c) => c.personal) ??
    calendars[0];
  if (!target) return toast(t('ics.noTarget'));
  const ev = await events();
  window.mnui.sheet.close();
  toast(t('ics.importing', { n: parsed.length }));
  let done = 0;
  let failed = 0;
  const queue = [...parsed];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const rrule = e.rrule && parseRule(e.rrule) ? e.rrule.slice(0, 500) : null;
      try {
        await ev.upsert(
          {
            title: e.title || t('event.untitled'),
            starts_at: e.start.toISOString(),
            ends_at: e.end.toISOString(),
            place_name: e.location || null,
            data: {
              all_day: e.allDay || null,
              description: e.description || null,
              url: safeUrl(e.url) ?? null,
              recurrence: rrule
                ? {
                    rrule,
                    ...(e.exdates.length
                      ? { exdates: e.exdates.map(occurrenceKey).slice(0, 500) }
                      : {}),
                  }
                : null,
            },
          },
          { collection: target.id, sourceKey: e.uid ? `ics:${e.uid.slice(0, 200)}` : undefined },
        );
        done++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  toast(failed ? t('ics.importedSkipped', { done, failed }) : t('ics.imported', { n: done }));
  await load();
}

async function exportIcs() {
  const own = S.sources.filter((s) => s.group === 'calendars' && s.visible && s.collection);
  if (!own.length) return toast(t('ics.showOne'));
  try {
    const ev = await events();
    const lists = await Promise.all(
      own.map((s) => ev.list({ collection: s.collection.id, limit: 5000 })),
    );
    const out = [];
    for (const r of lists.flat()) {
      const span = spanOf(r, 'span');
      if (!span) continue;
      out.push({
        uid: `${r.id}@mininode.app`,
        title: r.title,
        start: span.start,
        end: span.end,
        allDay: span.allDay,
        description: r.data?.description,
        location: r.place_name,
        url: safeUrl(r.data?.url),
        rrule: r.data?.recurrence?.rrule,
        exdates: r.data?.recurrence?.exdates,
      });
    }
    const blob = new Blob([toIcs(out, own.length === 1 ? own[0].name : t('ics.calendarName'))], {
      type: 'text/calendar',
    });
    const a = h('a', {
      href: URL.createObjectURL(blob),
      download: t('ics.fileName', { date: dateInput(new Date()) }),
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast(t('ics.exported', { n: out.length }));
  } catch (err) {
    toast(errorText(err));
  }
}

// ---------- search ----------
function openSearch() {
  const input = h('input', {
    type: 'search',
    placeholder: t('search.placeholder'),
    'aria-label': t('search.label'),
    autocomplete: 'off',
  });
  const results = h('div', { class: 'cal-results', 'aria-live': 'polite' });
  let timer;
  let token = 0;
  const search = async () => {
    const q = input.value.trim();
    const mine = ++token;
    if (q.length < 2) {
      results.replaceChildren(h('p', { class: 'mn-note' }, t('search.minLength')));
      return;
    }
    try {
      const mn = await ready;
      const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const { data, error } = await mn.supabase
        .schema('platform')
        .from('records')
        .select(
          'id, type, collection_id, title, starts_at, ends_at, due_at, data, created_by_app, source_app, place_name',
        )
        .ilike('title', pattern)
        .order('starts_at', { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      if (mine !== token) return;
      const rows = (data ?? []).filter((r) => S.projections[r.type]);
      results.replaceChildren(
        rows.length
          ? h(
              'div',
              { class: 'mn-list' },
              rows.map((r) => {
                const span = spanOf(r, S.projections[r.type]);
                if (!span) return null;
                return h(
                  'button',
                  {
                    type: 'button',
                    class: 'mn-row',
                    onclick: () => {
                      window.mnui.sheet.close();
                      S.openEvent = r.id;
                      const next = r.data?.recurrence
                        ? nextReminder(
                            span.start,
                            r.data.recurrence.rrule,
                            r.data.recurrence.exdates,
                            0,
                            new Date(),
                            366 * DAY,
                          )
                        : null;
                      setView('day', next?.occurrence ?? span.start);
                    },
                  },
                  h(
                    'span',
                    {},
                    h('span', { class: 'mn-row-title' }, r.title || t('event.untitled')),
                    h(
                      'span',
                      { class: 'mn-row-sub' },
                      r.data?.recurrence
                        ? t('search.series', { day: F.day.format(span.start) })
                        : whenText({ ...span, due: S.projections[r.type] === 'due' }),
                    ),
                  ),
                );
              }),
            )
          : h('p', { class: 'mn-note' }, t('search.none', { q })),
      );
    } catch {
      if (mine === token) results.replaceChildren(h('p', { class: 'mn-note' }, t('search.failed')));
    }
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void search(), 250);
  });
  window.mnui.sheet.open(
    frag(
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
          t('common.close'),
        ),
        h('h2', {}, t('search.title')),
        h('span', {}),
      ),
      h(
        'div',
        { class: 'mn-sheet-body' },
        h('div', { class: 'mn-search' }, icon('search'), input),
        results,
      ),
    ),
    { tall: true, label: t('search.sheet') },
  );
  input.focus();
}

// ---------- Google Calendar (ADR 0010) ----------
const GOOGLE_ERRORS = {
  google_not_connected: 'google.notConnected',
  google_scope_missing: 'google.scopeMissing',
  google_token_invalid: 'google.tokenInvalid',
  google_not_configured: 'google.notConfigured',
};
const googleErrorText = (code) => t(GOOGLE_ERRORS[code] ?? 'google.syncFailed');
const googleCollections = () =>
  new Set((S.google?.calendars ?? []).map((c) => c.collectionId).filter(Boolean));

/** Loads the sync state; with `sync`, syncs first when it is on (the Kalender was opened). */
async function loadGoogle({ sync = false } = {}) {
  try {
    const mn = await ready;
    S.google = await mn.google.calendarSync.get();
    if (sync && S.google.enabled) {
      const result = await mn.google.calendarSync.sync();
      S.google = await mn.google.calendarSync.get();
      if (result.ran) await load({ meta: true });
    }
  } catch {
    S.google = S.google ?? null;
  }
  refresh();
  render();
}

let googleTimer;
/** After a change: sync with Google a few seconds later (changes in a row count once). */
function googleSoon() {
  if (!S.google?.enabled) return;
  clearTimeout(googleTimer);
  googleTimer = setTimeout(async () => {
    try {
      const mn = await ready;
      const result = await mn.google.calendarSync.sync();
      if (result.ran && !document.querySelector('.mn-sheet')) await loadGoogle();
    } catch {
      // the cron catches up
    }
  }, 3000);
}

function googleButton() {
  const on = Boolean(S.google?.enabled);
  const failing = on && S.google?.status === 'error';
  return h(
    'button',
    {
      type: 'button',
      class: `mn-btn cal-google${on ? ' is-on' : ''}`,
      'aria-haspopup': 'dialog',
      'aria-label': t(failing ? 'google.ariaError' : on ? 'google.ariaOn' : 'google.ariaOff'),
      onclick: openGoogle,
    },
    h('span', { class: `cal-google-dot${failing ? ' is-error' : ''}`, 'aria-hidden': 'true' }),
    h(
      'span',
      { class: 'cal-google-label' },
      t('google.word'),
      h('span', { class: 'cal-google-word' }, ` ${t('google.wordCalendar')}`),
    ),
  );
}

function openGoogle() {
  const body = h('div', { class: 'mn-sheet-body cal-manage' });
  const foot = h('div', { class: 'mn-sheet-foot' });
  const state = S.google;
  const pushed = new Set(state?.pushSources ?? []);
  const calendarsOn = Object.fromEntries((state?.calendars ?? []).map((c) => [c.id, c.enabled]));
  // whoever opens this wants the sync: switched on, with the personal calendar preselected
  let enabled = true;
  if (!state?.enabled && pushed.size === 0) {
    const personal = S.collections.find((c) => c.personal && c.family === 'kalender');
    if (personal) pushed.add(`col:${personal.id}`);
  }
  const check = (label, sub, checked, onchange) => {
    const input = h('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onchange(input.checked));
    return h('label', {}, input, h('span', {}, label, sub ? h('small', {}, sub) : null));
  };

  if (!state || !state.available) {
    body.append(h('p', { class: 'mn-note' }, googleErrorText('google_not_configured')));
  } else if (!state.connected || !state.scopeOk) {
    body.append(
      h(
        'p',
        {},
        googleErrorText(state.connected ? 'google_scope_missing' : 'google_not_connected'),
      ),
      h('a', { class: 'mn-btn mn-btn--primary', href: state.connectUrl }, t('google.connect')),
    );
  } else {
    const own = S.sources.filter((s) => s.group === 'calendars' || s.group === 'apps');
    const master = h(
      'div',
      { class: 'mn-checks' },
      check(
        t('google.syncWith'),
        state.email ? t('google.account', { email: state.email }) : null,
        enabled,
        (v) => {
          enabled = v;
          choices.hidden = !v;
        },
      ),
    );
    const choices = h(
      'div',
      { class: 'cal-manage' },
      h(
        'section',
        { class: 'cal-manage-sect' },
        h('div', { class: 'mn-sect' }, h('h2', {}, t('google.pushTitle'))),
        h('p', { class: 'mn-note' }, t('google.pushNote')),
        own.length
          ? h(
              'div',
              { class: 'mn-checks' },
              own.map((source) =>
                check(
                  source.name,
                  source.group === 'apps' ? t('google.fromApp') : null,
                  pushed.has(source.id),
                  (v) => {
                    if (v) pushed.add(source.id);
                    else pushed.delete(source.id);
                  },
                ),
              ),
            )
          : h('p', { class: 'mn-note' }, t('google.noSources')),
      ),
      h(
        'section',
        { class: 'cal-manage-sect' },
        h('div', { class: 'mn-sect' }, h('h2', {}, t('google.pullTitle'))),
        state.calendars.length
          ? h(
              'div',
              { class: 'mn-checks' },
              state.calendars.map((c) =>
                check(c.name, c.writable ? null : t('google.viewOnly'), c.enabled, (v) => {
                  calendarsOn[c.id] = v;
                }),
              ),
            )
          : h('p', { class: 'mn-note' }, t('google.pullNote')),
      ),
    );
    choices.hidden = !enabled;
    const status = state.enabled
      ? state.status === 'error'
        ? h(
            'div',
            { class: 'mn-banner mn-banner--bad', role: 'alert' },
            googleErrorText(state.error),
          )
        : h(
            'p',
            { class: 'mn-note' },
            state.lastSyncAt
              ? t('google.lastSync', {
                  day: F.day.format(new Date(state.lastSyncAt)),
                  time: F.time.format(new Date(state.lastSyncAt)),
                })
              : t('google.firstSync'),
          )
      : null;
    body.append(master, status, choices);
    let saving = false;
    const save = async () => {
      if (saving) return;
      saving = true;
      try {
        const mn = await ready;
        await mn.google.calendarSync.set({
          enabled,
          pushSources: [...pushed],
          calendars: calendarsOn,
        });
        window.mnui.sheet.close();
        toast(t(enabled ? 'google.on' : 'google.off'));
        await loadGoogle();
        if (enabled) setTimeout(() => void loadGoogle({ sync: true }), 1500);
        else await load({ meta: true });
      } catch (err) {
        toast(err?.message || t('google.saveFailed'));
      } finally {
        saving = false;
      }
    };
    foot.append(
      h('span', { class: 'mn-grow' }),
      h(
        'button',
        { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => void save() },
        t('common.save'),
      ),
    );
  }
  window.mnui.sheet.open(
    frag(
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
          t('common.close'),
        ),
        h('h2', {}, t('google.sheet')),
        h('span', {}),
      ),
      body,
      foot.children.length ? foot : null,
    ),
    { tall: true, modal: true, label: t('google.sheet') },
  );
}

// ---------- keyboard ----------
// The letters are the keys of the German layout; the descriptions follow the language.
const SHORTCUTS = [
  ['T', 'keys.today'],
  [['J', 'N'], 'keys.next'],
  [['K', 'P'], 'keys.prev'],
  ['M, W, D, L, O', 'keys.views'],
  ['C', 'keys.add'],
  ['/', 'keys.search'],
];
const keyLabel = (k) => (Array.isArray(k) ? t('keys.or', { a: k[0], b: k[1] }) : k);
function shortcutList() {
  return h(
    'dl',
    { class: 'mn-facts cal-keys' },
    SHORTCUTS.map(([k, v]) =>
      h('div', {}, h('dt', {}, h('kbd', {}, keyLabel(k))), h('dd', {}, t(v))),
    ),
  );
}
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.mn-sheet')) return;
  const t = e.target;
  if (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    t?.isContentEditable
  )
    return;
  const actions = {
    t: goToday,
    j: () => step(1),
    n: () => step(1),
    k: () => step(-1),
    p: () => step(-1),
    m: () => setView('month'),
    w: () => setView('week'),
    d: () => setView('day'),
    l: () => setView('list'),
    o: () => setView('map'),
    c: () => openEditor(null),
    '/': openSearch,
  };
  const action = actions[e.key.toLowerCase()];
  if (!action) return;
  e.preventDefault();
  action();
});

// ---------- wiring ----------
initMap({
  S,
  h,
  t,
  F,
  ready,
  openDetail,
  render,
  savePrefs,
  startOfWeek,
  addDays,
});
for (const tab of document.querySelectorAll('.mn-tab'))
  tab.addEventListener('click', () => setView(tab.dataset.view));
for (const button of document.querySelectorAll('[data-add]'))
  button.addEventListener('click', () => openEditor(null));
wide.addEventListener('change', () => render());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !document.querySelector('.mn-sheet')) void load();
});
// The packages must be there before the first text is made; a language change redraws.
await window.mnI18n.ready;
window.mnI18n.onChange(() => {
  refresh();
  if (!document.querySelector('.mn-sheet')) render();
});
render();
const firstLoad = load({ meta: true });
void firstLoad.then(() => syncReminders());
void firstLoad.then(() => loadGoogle({ sync: true }));
