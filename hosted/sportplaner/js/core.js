// Sportplaner: ported from a Claude artifact (see README.md). Plain scripts, no build step.
// Everything the user enters is kept private in mn.kv, photos in mn.files.
// Helpers, DOM patching, state and the schedule index. Loaded in order by index.html; all files share one global scope.
/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
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
  const k = JSON.stringify(o);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('de-DE', o);
    fmtCache.set(k, f);
  }
  return f.format(d);
};
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS2 = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
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
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
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
const SIGNUP = {
  none: 'Nicht nötig',
  advance: 'Vorab anmelden',
  checkin: 'Vor Ort einchecken',
  membership: 'Mitgliedschaft erforderlich',
};
const LEVELS = {
  '': 'Nicht angegeben',
  'All levels': 'Alle Niveaus',
  Beginner: 'Einsteiger',
  Intermediate: 'Mittelstufe',
  Advanced: 'Fortgeschritten',
};
const levelLabel = (v) => LEVELS[v] || v;

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
/* data: one private mn.kv entry per activity (act:<id>) and per tariff (plan:<id>) */
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
  r.sort((x, y) => byStart(x.s[0], y.s[0]) || x.a.name.localeCompare(y.a.name, 'de'));
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
    .sort((x, y) => byStart(x.s[0] || {}, y.s[0] || {}) || x.a.name.localeCompare(y.a.name, 'de'));
  plannedCache.set(ds, r);
  return r;
}
const slotsOn = (a, ds) => (onDate(ds).find((e) => e.a.id === a.id) || { s: [] }).s;
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
}

const timeLabel = (s) =>
  s.start ? (s.end ? `${s.start}–${s.end}` : `ab ${s.start}`) : 'Jederzeit';
function daysLabel(days) {
  const d = [...days].sort();
  if (d.length === 7) return 'Täglich';
  if (d.join() === '0,1,2,3,4') return 'Werktags';
  if (d.join() === '5,6') return 'Am Wochenende';
  return d.map((i) => DAYS[i]).join(', ');
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
const dLabel = (v) => fmt(parse(v), { day: 'numeric', month: 'short', year: 'numeric' });
function periodLabel(p) {
  if (!p || !p.type || p.type === 'all') return '';
  const r =
    p.type === 'yearly'
      ? `jedes Jahr ${mdLabel(p.from)} bis ${mdLabel(p.until)}`
      : p.from && p.until
        ? `${dLabel(p.from)} bis ${dLabel(p.until)}`
        : p.from
          ? `ab ${dLabel(p.from)}`
          : `bis ${dLabel(p.until)}`;
  return p.label ? `${p.label}: ${r}` : r;
}
function plannedSummary(a) {
  const p = a.planned;
  if (!hasPlan(a)) return '';
  const parts = [];
  if (p.mode === 'weekly' || p.mode === 'both') {
    const n = +p.every || 1;
    parts.push(
      `${n === 1 ? 'Jede Woche' : `Alle ${n} Wochen`}: ${daysLabel(p.days || [])}${planSeason(p) && planSeason(p).type !== 'all' ? ', ' + periodLabel(planSeason(p)) : ''}`,
    );
  }
  if ((p.mode === 'dates' || p.mode === 'both') && (p.dates || []).length)
    parts.push(
      `${p.dates.length} ${p.dates.length === 1 ? 'einzelner Termin' : 'einzelne Termine'}`,
    );
  return parts.join(', ') || 'Noch keine Termine';
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
            ? `<p class="when-head">${esc(b.period.type === 'all' ? 'Ganzjährig' : periodLabel(b.period))}</p>`
            : '') + b.rows.map(row).join(''),
      )
      .join('') +
    (singles.length
      ? (blocks.length ? '<p class="when-head">Einzeltermine</p>' : '') +
        singles
          .map(
            (x) =>
              `<p><b>${esc(fmt(parse(x.date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</b>&ensp;<span class="muted">${esc(timeLabel(x))}</span></p>`,
          )
          .join('')
      : '')
  );
}
