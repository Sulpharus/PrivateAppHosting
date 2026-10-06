// Sportplaner: ported from a Claude artifact (see README.md). Plain scripts, no build step.
// Everything the user enters is kept private in mn.kv, photos in mn.files.
// Helpers, DOM patching, state and the schedule index. Loaded in order by index.html; all files share one global scope.
/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
// Texts come from the language packages (i18n/de.json, i18n/en.json); the page waits for them in boot.js.
const tr = (key, params) => window.mnI18n.t(key, params);
const loc = () => window.mnI18n.locale; // 'de-DE' or 'en-GB'
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// "Sportart" can name several activities, separated by commas ("Schwimmen, Sauna"). The field stays
// one text (older data keeps working); these two read and tidy it.
const sportsOf = (s) => {
  const seen = new Map();
  for (const part of String(s ?? '').split(/[,;]/)) {
    const sport = part.trim();
    // The first spelling wins ("Schwimmen, schwimmen" is one sport).
    if (sport && !seen.has(sport.toLowerCase())) seen.set(sport.toLowerCase(), sport);
  }
  return [...seen.values()];
};
const normSports = (s) => sportsOf(s).join(', ');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const wIdx = (d) => (d.getDay() + 6) % 7; // 0 = Monday
const todayStr = () => ymd(new Date());
const fmtCache = new Map();
const fmt = (d, o) => {
  if (Number.isNaN(+d)) return '?';
  const k = loc() + JSON.stringify(o);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(loc(), o);
    fmtCache.set(k, f);
  }
  return f.format(d);
};
const dayShort = (i) => tr(`day.short.${i}`);
const DAYS = () => [0, 1, 2, 3, 4, 5, 6].map(dayShort); // Monday first, in the active language
const newId = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
/* photos live in mn.files (private bucket): each one is fetched once per visit and shown from a blob: URL */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const media = new Map(); // ref → object URL, 'pending' or 'failed'
const mediaQueue = [];
let mediaActive = 0,
  mediaT;
function photoSrc(r) {
  if (r.startsWith('data:')) return r;
  const u = media.get(r);
  if (u === undefined) {
    media.set(r, 'pending');
    mediaQueue.push(r);
    pumpMedia();
  }
  return u && u !== 'pending' && u !== 'failed' ? u : BLANK;
}
function pumpMedia() {
  while (mediaActive < 4 && mediaQueue.length) {
    const r = mediaQueue.shift();
    mediaActive++;
    fetchBlob(r)
      .then(
        (b) => media.set(r, URL.createObjectURL(b)),
        () => media.set(r, 'failed'),
      )
      .finally(() => {
        mediaActive--;
        mediaChanged();
        pumpMedia();
      });
  }
}
function mediaChanged() {
  clearTimeout(mediaT);
  mediaT = setTimeout(() => {
    scheduleRender();
    if (draft) renderPhotos();
  }, 60);
}
async function fetchBlob(r) {
  const mn = await ready,
    res = await fetch(await mn.files.url(r));
  if (!res.ok) throw new Error(`photo ${res.status}`);
  return res.blob();
}
const thumbSrc = (a, r) => (a.thumbs && a.thumbs[r] ? photoSrc(a.thumbs[r]) : photoSrc(r));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const isDay = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`); // 2026-02-31 and 2026-13-40 are no days
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const initials = (n) =>
  (n || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
const byStart = (x, y) => (x.start || '99').localeCompare(y.start || '99');
const ICON = {
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  camera:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>',
};
const EMPTY_ICON = {
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5.5h16M4 12h16M4 18.5h10"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  search: ICON.search,
  stats:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20v-7M12 20V5M19 20v-10"/></svg>',
};
// The stored values stay as they are; these maps give the language key of each label.
const SIGNUP = {
  none: 'signup.none',
  advance: 'signup.advance',
  checkin: 'signup.checkin',
  membership: 'signup.membership',
};
const LEVELS = {
  '': 'level.unspecified',
  'All levels': 'level.all',
  Beginner: 'level.beginner',
  Intermediate: 'level.intermediate',
  Advanced: 'level.advanced',
};
const levelLabel = (v) => (LEVELS[v] ? tr(LEVELS[v]) : v);

/* ---------- minimal DOM patching (keeps unchanged nodes and their decoded images) ---------- */
function setHTML(el, html) {
  if (el && el._html !== html) {
    el.innerHTML = html;
    el._html = html;
  }
}
function setText(el, t) {
  if (el.textContent !== t) el.textContent = t;
}
const tpl = document.createElement('template');
function patchList(el, items) {
  // items: [{key, html}]
  const old = new Map();
  for (const c of el.children) old.set(c.dataset.key, c);
  let ref = el.firstElementChild;
  for (const { key, html } of items) {
    let node = old.get(key);
    old.delete(key);
    if (!node || node._html !== html) {
      if (node) {
        if (node === ref) ref = ref.nextElementSibling;
        node.remove();
      }
      tpl.innerHTML = html;
      node = tpl.content.firstElementChild;
      node._html = html;
      node.dataset.key = key;
    }
    if (node === ref) ref = ref.nextElementSibling;
    else el.insertBefore(node, ref);
  }
  for (const n of old.values()) n.remove();
}
function listOrEmpty(host, cls, items, emptyHtml) {
  if (!items.length) {
    setHTML(host, emptyHtml);
    return;
  }
  let list = host.firstElementChild;
  if (!list || !list.classList.contains(cls) || host._html) {
    host.innerHTML = `<div class="${cls}"></div>`;
    host._html = null;
    list = host.firstElementChild;
  }
  patchList(list, items);
}

/* ---------- state ---------- */
const S = {
  calMode: 'avail',
  calView: 'month',
  agendaDays: 28,
  acts: [],
  view: 'day',
  date: todayStr(),
  month: null,
  cat: 'Alle',
  prov: '',
  q: '',
  loading: true,
  sheet: null,
};
S.month = (() => {
  const d = parse(S.date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
})();
/* data: rows of the tables activities and plans (tables.js); the kv entries act:<id> and plan:<id>
   are what older versions wrote and are only read once, to copy them over */
const ACT = 'act:',
  PLAN = 'plan:',
  LAST_BACKUP = 'meta:lastBackup';
// Handlers are attached right away; the SDK and the login check run in the background.
const ready = (async () => {
  const client = await window.mininode.mininode();
  await client.auth.requireLogin();
  return client;
})();

/* ---------- schedule index (rebuilt only when data changes) ---------- */
let IDX = { weekly: [[], [], [], [], [], [], []], dated: new Map() };
const dayCache = new Map();
let nextCache = null;
function buildIndex() {
  const weekly = [[], [], [], [], [], [], []],
    dated = new Map();
  for (const a of S.acts)
    for (const s of a.slots || []) {
      if (s.kind === 'date') {
        if (!s.date) continue;
        if (!dated.has(s.date)) dated.set(s.date, []);
        dated.get(s.date).push([a, s]);
      } else for (const d of s.days || []) weekly[d].push([a, s]);
    }
  IDX = { weekly, dated };
  dayCache.clear();
  nextCache = null;
  plannedCache.clear();
}
function onDate(ds) {
  let r = dayCache.get(ds);
  if (r) return r;
  const m = new Map(),
    dated = IDX.dated.get(ds);
  const add = ([a, s]) => {
    if (!actActive(a, ds) || !slotActive(s, ds)) return;
    let e = m.get(a.id);
    if (!e) {
      e = { a, s: [] };
      m.set(a.id, e);
    }
    e.s.push(s);
  };
  IDX.weekly[wIdx(parse(ds))].forEach(add);
  if (dated) dated.forEach(add);
  r = [...m.values()];
  for (const e of r) e.s.sort(byStart);
  r.sort((x, y) => byStart(x.s[0], y.s[0]) || x.a.name.localeCompare(y.a.name, loc()));
  dayCache.set(ds, r);
  return r;
}
/* planned participation: regular weekdays (every n weeks, only on days the offer is available) and/or single dates */
const plannedCache = new Map();
const hasPlan = (a) => a.planned && a.planned.mode && a.planned.mode !== 'none';
function isPlanned(a, ds) {
  const p = a.planned;
  if (!hasPlan(a) || (p.skip || []).includes(ds)) return false;
  if ((p.mode === 'dates' || p.mode === 'both') && (p.dates || []).includes(ds)) return true;
  if (p.mode !== 'weekly' && p.mode !== 'both') return false;
  if (!periodActive(planSeason(p), ds)) return false;
  const d = parse(ds),
    w = wIdx(d);
  if (!(p.days || []).includes(w)) return false;
  const n = +p.every || 1;
  if (n > 1) {
    const anc = parse(p.anchor || p.from || '2024-01-01'),
      weeks = Math.round((addDays(d, -w) - addDays(anc, -wIdx(anc))) / 6048e5);
    if (((weeks % n) + n) % n) return false;
  }
  return !(a.slots || []).length || slotsOn(a, ds).length > 0;
}
function plannedOn(ds) {
  let r = plannedCache.get(ds);
  if (r) return r;
  r = S.acts
    .filter((a) => isPlanned(a, ds))
    .map((a) => ({ a, s: slotsOn(a, ds) }))
    .sort((x, y) => byStart(x.s[0] || {}, y.s[0] || {}) || x.a.name.localeCompare(y.a.name, loc()));
  plannedCache.set(ds, r);
  return r;
}
const slotsOn = (a, ds) => (onDate(ds).find((e) => e.a.id === a.id) || { s: [] }).s;
/* a session marked "Ausgefallen" did not take place: it is neither attended nor missed and
   counts in no statistic */
const isCancelled = (a, ds) => (a.cancelled || []).includes(ds);
/* a course runs from course.from to course.until on its weekly slots; every session is planned */
function courseDates(a) {
  const c = a.course,
    out = [];
  if (!c || !c.from || !c.until) return out;
  for (let d = parse(c.from), i = 0; ymd(d) <= c.until && i < 800; d = addDays(d, 1), i++)
    if (slotsOn(a, ymd(d)).length) out.push(ymd(d));
  return out;
}
/* the course price split over its sessions (js/price.js); null without a price */
const coursePrices = (a) =>
  a.course && +a.course.price > 0
    ? splitCoursePrice(a.course, courseDates(a), new Set(a.cancelled || []))
    : null;
function nextMap() {
  const t = todayStr();
  if (nextCache && nextCache.t === t) return nextCache.m;
  const m = new Map(),
    base = parse(t);
  for (let i = 0; i < 120 && m.size < S.acts.length; i++) {
    const ds = ymd(addDays(base, i));
    for (const e of onDate(ds)) if (!m.has(e.a.id)) m.set(e.a.id, { ds, s: e.s[0], i });
  }
  nextCache = { t, m };
  return m;
}
function dataChanged() {
  buildIndex();
  scheduleRender();
  // planned sessions go to the Kalender (js/suite.js); the first load waits a little longer
  if (typeof suiteSoon === 'function') suiteSoon(S.loading ? 5000 : 3000);
}

const timeLabel = (s) =>
  s.start
    ? s.end
      ? `${s.start}–${s.end}`
      : tr('time.from', { time: s.start })
    : tr('time.anytime');
function daysLabel(days) {
  const d = [...days].sort();
  if (d.length === 7) return tr('days.daily');
  if (d.join() === '0,1,2,3,4') return tr('days.weekdays');
  if (d.join() === '5,6') return tr('days.weekend');
  return d.map(dayShort).join(', ');
}
/* seasonal validity of a weekly slot: whole year, the same dates every year, or one fixed date range */
const seasonOf = (a) =>
  a.season ||
  (a.from || a.until ? { type: 'range', from: a.from || '', until: a.until || '' } : null);
const planSeason = (p) =>
  p.season ||
  (p.from || p.until ? { type: 'range', from: p.from || '', until: p.until || '' } : null);
const actActive = (a, ds) => periodActive(seasonOf(a), ds);
const slotActive = (s, ds) => periodActive(s.period, ds);
function periodActive(p, ds) {
  if (!p || !p.type || p.type === 'all') return true;
  if (p.type === 'range') return (!p.from || ds >= p.from) && (!p.until || ds <= p.until);
  const md = ds.slice(5);
  return p.from <= p.until ? md >= p.from && md <= p.until : md >= p.from || md <= p.until; // wraps over New Year
}
const mdLabel = (v) => {
  const [m, d] = v.split('-').map(Number);
  return fmt(new Date(2000, m - 1, d), { day: 'numeric', month: 'short' });
};
const dLabel = (v) => fmt(parse(v), { day: '2-digit', month: 'short', year: 'numeric' });
function periodLabel(p) {
  if (!p || !p.type || p.type === 'all') return '';
  const r =
    p.type === 'yearly'
      ? tr('period.yearly', { from: mdLabel(p.from), until: mdLabel(p.until) })
      : p.from && p.until
        ? tr('period.range', { from: dLabel(p.from), until: dLabel(p.until) })
        : p.from
          ? tr('period.fromOnly', { from: dLabel(p.from) })
          : tr('period.untilOnly', { until: dLabel(p.until) });
  return p.label ? tr('period.labelled', { label: labelText(p.label), range: r }) : r;
}
function plannedSummary(a) {
  const p = a.planned;
  if (!hasPlan(a)) return '';
  if (a.course) {
    const all = courseDates(a),
      mine = all.filter((d) => isPlanned(a, d)).length,
      off = all.filter((d) => isCancelled(a, d)).length;
    const text =
      mine === all.length
        ? tr('plan.courseAll', { n: all.length })
        : tr('plan.courseSome', { mine, all: all.length });
    return off ? tr('plan.courseOff', { text, n: off }) : text;
  }
  const parts = [];
  if (p.mode === 'weekly' || p.mode === 'both') {
    const n = +p.every || 1;
    const days = daysLabel(p.days || []);
    const text = n === 1 ? tr('plan.everyWeek', { days }) : tr('plan.everyN', { n, days });
    const season = planSeason(p);
    parts.push(
      season && season.type !== 'all'
        ? tr('plan.withPeriod', { text, period: periodLabel(season) })
        : text,
    );
  }
  if ((p.mode === 'dates' || p.mode === 'both') && (p.dates || []).length)
    parts.push(tr('plan.singleDates', { n: p.dates.length }));
  return parts.join(', ') || tr('plan.none');
}
function groupedWhen(slots) {
  const { blocks, singles } = slotsToBlocks(slots),
    multi = blocks.length > 1 || blocks.some((b) => b.period.type !== 'all');
  const row = (r) =>
    `<p><b>${esc(daysLabel(r.days))}</b>&ensp;<span class="muted">${esc(timeLabel(r))}</span></p>`;
  return (
    blocks
      .map(
        (b) =>
          (multi
            ? `<p class="when-head">${esc(b.period.type === 'all' ? tr('when.allYear') : periodLabel(b.period))}</p>`
            : '') + b.rows.map(row).join(''),
      )
      .join('') +
    (singles.length
      ? (blocks.length ? `<p class="when-head">${esc(tr('when.singles'))}</p>` : '') +
        singles
          .map(
            (x) =>
              `<p><b>${esc(fmt(parse(x.date), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }))}</b>&ensp;<span class="muted">${esc(timeLabel(x))}</span></p>`,
          )
          .join('')
      : '')
  );
}
