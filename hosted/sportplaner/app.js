// Sportplaner: ported from a Claude artifact (see README.md). Plain script, no build step.
// Everything the user enters is kept private in mn.kv, photos in mn.files.
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
function describeSlot(s) {
  const when =
    s.kind === 'date'
      ? fmt(parse(s.date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : daysLabel(s.days || []);
  const per = s.kind === 'date' ? '' : periodLabel(s.period);
  return `<p><b>${esc(when)}</b>&ensp;<span class="muted">${esc(timeLabel(s))}</span>${per ? `<span class="season">${esc(per)}</span>` : ''}</p>`;
}

/* ---------- views ---------- */
function setHeader(title, sub) {
  setText($('#title'), title);
  setText($('#subtitle'), sub);
}
const SKELETON = {
  day: `<div class="week"><button class="arrow" data-action="week" data-dir="-1" aria-label="Vorherige Woche">${ICON.left}</button><div class="week-days" id="wk"></div><button class="arrow" data-action="week" data-dir="1" aria-label="Nächste Woche">${ICON.right}</button></div><div class="daybar" id="daybar"></div><div id="daybody"></div>`,
  cal: `<div class="calbar"><div class="seg calseg" id="calseg"></div><div class="viewseg" id="viewseg"></div></div><div id="agenda" hidden></div><div id="calmonth"><div class="card"><div class="cal-head"><button class="arrow" data-action="month" data-dir="-1" aria-label="Vorheriger Monat">${ICON.left}</button><h2 id="caltitle"></h2><button class="arrow" data-action="month" data-dir="1" aria-label="Nächster Monat">${ICON.right}</button></div><div class="cal-grid">${DAYS2.map((d) => `<span class="dow">${d}</span>`).join('')}</div><div class="cal-grid" id="cells"></div></div><div class="sect" id="calsect"></div><div id="callist"></div></div>`,
  lib: `<div class="search">${ICON.search}<input id="q" type="search" placeholder="Name, Ort, Sportart oder Anbieter" aria-label="Aktivitäten durchsuchen" autocomplete="off"></div><div id="chips"></div><div id="provfilter"></div><div id="liblist"></div><div id="backup"></div>`,
};

function tileHTML(a, s, ds) {
  const img =
    a.photos && a.photos[0]
      ? `<img src="${esc(thumbSrc(a, a.photos[0]))}" alt="" decoding="async">`
      : `<span class="ph">${esc(initials(a.name))}</span>`;
  const more = s.length > 1 ? ` +${s.length - 1}` : '';
  const isDone = (a.done || []).includes(ds),
    pl = isPlanned(a, ds);
  const badge = isDone ? `<span class="tile-done" aria-label="Erledigt">${ICON.check}</span>` : '';
  const toggle = isDone
    ? ''
    : `<button class="tile-pl${pl ? ' on' : ''}" data-action="plan-day" data-id="${esc(a.id)}" data-date="${ds}" aria-pressed="${pl}" aria-label="${esc(a.name)} ${pl ? 'nicht mehr einplanen' : 'einplanen'}">${pl ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 12h12"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>'}</button>`;
  return `<div class="tilewrap"><button class="tile" data-action="open" data-id="${esc(a.id)}" data-date="${ds}">${img}<span class="tile-time">${esc(timeLabel(s[0]) + more)}</span>${badge}<span class="tile-name">${esc(a.name)}</span></button>${toggle}</div>`;
}
function updDay() {
  const sel = parse(S.date),
    isToday = S.date === todayStr();
  setHeader(
    fmt(sel, { weekday: 'long' }),
    (isToday ? 'Heute, ' : '') + fmt(sel, { day: 'numeric', month: 'long', year: 'numeric' }),
  );
  const mon = addDays(sel, -wIdx(sel)),
    td = todayStr();
  patchList(
    $('#wk'),
    [...Array(7)].map((_, i) => {
      const d = addDays(mon, i),
        ds = ymd(d);
      const cls = ['wd', ds === S.date && 'sel', ds === td && 'today', onDate(ds).length && 'has']
        .filter(Boolean)
        .join(' ');
      return {
        key: ds,
        html: `<button class="${cls}" data-action="pick" data-date="${ds}" aria-label="${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}"><small>${DAYS2[i]}</small><b>${d.getDate()}</b><i></i></button>`,
      };
    }),
  );
  const items = onDate(S.date);
  const count = items.length
    ? `${items.length} ${items.length === 1 ? 'Aktivität' : 'Aktivitäten'} verfügbar`
    : '';
  setHTML(
    $('#daybar'),
    `<span>${count}</span>${isToday ? '' : '<button class="link" data-action="today">Zurück zu heute</button>'}`,
  );
  let empty;
  if (S.loading && !S.acts.length) empty = `<p class="loading">Wird geladen …</p>`;
  else if (!S.acts.length)
    empty = `<div class="empty"><h3>Deine Bibliothek ist leer</h3><p>Füge die Sportangebote hinzu, aus denen du wählen kannst, mit Tagen, Uhrzeiten und einem Foto.</p><button class="btn primary" data-action="new">Aktivität hinzufügen</button></div>`;
  else
    empty = `<div class="empty"><h3>An diesem Tag nichts geplant</h3><p>Keine deiner Aktivitäten ist ${fmt(sel, { weekday: 'long' }).toLowerCase()}s oder an diesem Datum verfügbar.</p><button class="btn" data-action="tab" data-tab="lib">Bibliothek ansehen</button></div>`;
  listOrEmpty(
    $('#daybody'),
    'tiles',
    items.map((x) => ({ key: x.a.id, html: tileHTML(x.a, x.s, S.date) })),
    empty,
  );
}

function rowHTML(a, right, ds) {
  const t =
    a.photos && a.photos[0]
      ? `<img class="thumb" src="${esc(thumbSrc(a, a.photos[0]))}" alt="" decoding="async">`
      : `<span class="thumb">${esc(initials(a.name))}</span>`;
  const sub = [a.category, a.provider, a.location].filter(Boolean).join(', ');
  return `<button class="row" data-action="open" data-id="${esc(a.id)}"${ds ? ` data-date="${ds}"` : ''}>${t}<span class="min"><h4>${esc(a.name)}</h4>${sub ? `<p>${esc(sub)}</p>` : ''}${right.below || ''}</span>${right.side || ''}</button>`;
}
const VIEW_ICONS = {
  month:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  agenda:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="4" width="17" height="6.5" rx="2"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="2"/></svg>',
};
function agendaItemHTML(a, s, ds, pl) {
  const t =
    a.photos && a.photos[0]
      ? `<img class="thumb" src="${esc(thumbSrc(a, a.photos[0]))}" alt="" decoding="async">`
      : `<span class="thumb">${esc(initials(a.name))}</span>`;
  const done = (a.done || []).includes(ds),
    planned = !pl && isPlanned(a, ds);
  const time = s.length ? s.map(timeLabel).join(', ') : 'Jederzeit';
  const place = [a.location, a.provider].filter(Boolean).join(', ');
  const state = done
    ? `<span class="ag-state">${ICON.check}Erledigt</span>`
    : planned
      ? '<span class="ag-state">Geplant</span>'
      : '';
  return `<button class="ag-item${done ? ' done' : ''}" data-action="open" data-id="${esc(a.id)}" data-date="${ds}">${t}<span class="min"><h4>${esc(a.name)}</h4><p>${esc(time)}</p>${place ? `<p>${esc(place)}</p>` : ''}</span>${state}</button>`;
}
function updAgenda() {
  const pl = S.calMode === 'planned',
    base = parse(todayStr()),
    td = todayStr();
  setHeader('Kalender', pl ? 'Nächste geplante Teilnahmen' : 'Nächste verfügbare Angebote');
  const groups = [];
  let lastMonth = '';
  for (let i = 0; i < S.agendaDays; i++) {
    const d = addDays(base, i),
      ds = ymd(d),
      list = pl ? plannedOn(ds) : onDate(ds);
    if (!list.length) continue;
    const mk = fmt(d, { month: 'long', year: 'numeric' });
    const head = mk !== lastMonth && groups.length ? `<p class="ag-head">${esc(mk)}</p>` : '';
    lastMonth = mk;
    const rel =
      i === 0 ? 'Heute' : i === 1 ? 'Morgen' : fmt(d, { weekday: 'short' }).replace('.', '');
    groups.push({
      key: ds + S.calMode,
      html: `<div class="ag-group">${head}<div class="ag-day"><div class="ag-date${ds === td ? ' today' : ''}"><b>${d.getDate()}</b><small>${esc(rel)}</small></div><div class="ag-items">${list.map((x) => agendaItemHTML(x.a, x.s, ds, pl)).join('')}</div></div></div>`,
    });
  }
  const until = fmt(addDays(base, S.agendaDays - 1), { day: 'numeric', month: 'long' });
  const empty = `<div class="empty"><h3>${pl ? 'Nichts geplant' : 'Keine Angebote'}</h3><p>${pl ? `Bis ${esc(until)} sind keine Teilnahmen geplant. Plane sie beim Bearbeiten einer Aktivität oder in ihrer Detailansicht.` : `Bis ${esc(until)} ist keine deiner Aktivitäten verfügbar.`}</p></div>`;
  const host = $('#agenda');
  if (!groups.length) {
    setHTML(
      host,
      empty +
        `<button class="btn ag-more" data-action="agenda-more">Weitere 4 Wochen anzeigen</button>`,
    );
    return;
  }
  let list = host.firstElementChild;
  if (!list || !list.classList.contains('ag-list') || host._html) {
    host.innerHTML =
      '<div class="ag-list"></div><button class="btn ag-more" data-action="agenda-more"></button>';
    host._html = null;
    list = host.firstElementChild;
  }
  patchList(list, groups);
  setText(
    host.lastElementChild,
    `Weitere Termine laden (bis ${fmt(addDays(base, S.agendaDays + 27), { day: 'numeric', month: 'short' })})`,
  );
}
function updCal() {
  setHTML(
    $('#viewseg'),
    [
      ['month', 'Monatsansicht'],
      ['agenda', 'Terminliste'],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" class="${S.calView === k ? 'on' : ''}" data-action="calview" data-view="${k}" aria-label="${l}" aria-pressed="${S.calView === k}">${VIEW_ICONS[k]}</button>`,
      )
      .join(''),
  );
  $('#agenda').hidden = S.calView !== 'agenda';
  $('#calmonth').hidden = S.calView === 'agenda';
  if (S.calView === 'agenda') {
    setHTML(
      $('#calseg'),
      [
        ['avail', 'Verfügbare Angebote'],
        ['planned', 'Geplante Teilnahmen'],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" class="${S.calMode === k ? 'on' : ''}" data-action="calmode" data-mode="${k}" aria-pressed="${S.calMode === k}">${l}</button>`,
        )
        .join(''),
    );
    return updAgenda();
  }
  const first = S.month;
  setHeader('Kalender', fmt(first, { month: 'long', year: 'numeric' }));
  setText($('#caltitle'), fmt(first, { month: 'long', year: 'numeric' }));
  const start = addDays(first, -wIdx(first)),
    td = todayStr();
  const n = addDays(start, 35).getMonth() !== first.getMonth() ? 35 : 42;
  const pl = S.calMode === 'planned';
  setHTML(
    $('#calseg'),
    [
      ['avail', 'Verfügbare Angebote'],
      ['planned', 'Geplante Teilnahmen'],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" class="${S.calMode === k ? 'on' : ''}" data-action="calmode" data-mode="${k}" aria-pressed="${S.calMode === k}">${l}</button>`,
      )
      .join(''),
  );
  patchList(
    $('#cells'),
    [...Array(n)].map((_, i) => {
      const d = addDays(start, i),
        ds = ymd(d),
        list = pl ? plannedOn(ds) : onDate(ds),
        c = list.length;
      const dots = pl
        ? list
            .slice(0, 3)
            .map((x) => ((x.a.done || []).includes(ds) ? '<i></i>' : '<i class="o"></i>'))
            .join('')
        : '<i></i>'.repeat(Math.min(c, 3));
      const cls = [
        'cell',
        d.getMonth() !== first.getMonth() && 'out',
        ds === td && 'today',
        ds === S.date && 'sel',
      ]
        .filter(Boolean)
        .join(' ');
      return {
        key: ds + S.calMode,
        html: `<button class="${cls}" data-action="calpick" data-date="${ds}" aria-label="${fmt(d, { day: 'numeric', month: 'long' })}, ${c} ${pl ? 'geplant' : 'Aktivitäten'}"><span class="n">${d.getDate()}</span><span class="dots">${dots}</span></button>`,
      };
    }),
  );
  const items = pl ? plannedOn(S.date) : onDate(S.date);
  setHTML(
    $('#calsect'),
    `<h3>${fmt(parse(S.date), { weekday: 'long', day: 'numeric', month: 'long' })}</h3>${!pl && items.length ? '<button class="link" data-action="tab" data-tab="day">Tag öffnen</button>' : ''}`,
  );
  const side = (x) =>
    pl && (x.a.done || []).includes(S.date)
      ? `<span class="next"><b>Erledigt</b>${esc((x.s[0] && x.s[0].start) || '')}</span>`
      : `<span class="next"><b>${esc((x.s[0] && x.s[0].start) || 'Jederzeit')}</b>${x.s[0] && x.s[0].end ? esc('bis ' + x.s[0].end) : ''}</span>`;
  listOrEmpty(
    $('#callist'),
    'list-card',
    items.map((x) => ({ key: x.a.id, html: rowHTML(x.a, { side: side(x) }, S.date) })),
    pl
      ? `<p class="sub">Für diesen Tag ist nichts geplant. Teilnahmen planst du beim Bearbeiten einer Aktivität oder in ihrer Detailansicht.</p>`
      : `<p class="sub">An diesem Tag ist keine Aktivität verfügbar.</p>`,
  );
}

function updLib() {
  setHeader('Bibliothek', `${S.acts.length} ${S.acts.length === 1 ? 'Aktivität' : 'Aktivitäten'}`);
  const cats = [...new Set(S.acts.map((a) => a.category).filter(Boolean))].sort();
  if (!cats.includes(S.cat)) S.cat = 'Alle';
  const provs = [...new Set(S.acts.map((a) => a.provider).filter(Boolean))].sort((x, y) =>
    x.localeCompare(y, 'de'),
  );
  if (S.prov && !provs.includes(S.prov)) S.prov = '';
  setHTML(
    $('#provfilter'),
    provs.length
      ? `<div class="provrow"><label for="provsel">Anbieter</label><select id="provsel" class="${S.prov ? 'on' : ''}"><option value="">Alle Anbieter</option>${provs.map((p) => `<option value="${esc(p)}"${p === S.prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>`
      : '',
  );
  setHTML(
    $('#chips'),
    cats.length
      ? `<div class="chips">${['Alle', ...cats].map((c) => `<button class="chipbtn ${c === S.cat ? 'on' : ''}" data-action="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
      : '',
  );
  const q = S.q.trim().toLowerCase(),
    nm = nextMap();
  const list = S.acts
    .filter(
      (a) =>
        (S.cat === 'Alle' || a.category === S.cat) &&
        (!S.prov || a.provider === S.prov) &&
        (!q ||
          [a.name, a.category, a.provider, a.location, a.description]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    )
    .sort((x, y) => x.name.localeCompare(y.name, 'de'));
  const items = list.map((a) => {
    const days = new Set();
    let dates = 0;
    for (const s of a.slots || []) {
      if (s.kind === 'date') dates++;
      else for (const d of s.days || []) days.add(d);
    }
    const pills = `<span class="pills">${days.size ? DAYS2.map((d, i) => `<span class="${days.has(i) ? 'on' : ''}">${d}</span>`).join('') : ''}${dates ? `<em>${days.size ? '&ensp;+' : ''}${dates} ${dates > 1 ? 'Termine' : 'Termin'}</em>` : ''}${!days.size && !dates ? '<em>Keine Zeiten angegeben</em>' : ''}</span>`;
    const nx = nm.get(a.id);
    const when = !nx
      ? ''
      : nx.i === 0
        ? 'Heute'
        : nx.i === 1
          ? 'Morgen'
          : nx.i < 7
            ? DAYS[wIdx(parse(nx.ds))]
            : fmt(parse(nx.ds), { day: 'numeric', month: 'short' });
    return {
      key: a.id,
      html: rowHTML(a, {
        below: pills,
        side: nx ? `<span class="next"><b>${esc(when)}</b>${esc(nx.s.start || '')}</span>` : '',
      }),
    };
  });
  listOrEmpty(
    $('#liblist'),
    'list-card',
    items,
    S.acts.length
      ? `<p class="sub">Keine Aktivität passt zu deiner Suche.</p>`
      : `<div class="empty"><h3>Noch keine Aktivitäten</h3><p>Alles, was du hinzufügst, erscheint hier, zusammen mit den verfügbaren Zeiten.</p><button class="btn primary" data-action="new">Aktivität hinzufügen</button></div>`,
  );
  updBackup();
}

let mounted = null,
  rq = 0;
const UPD = { day: updDay, cal: updCal, lib: updLib };
function render() {
  if (rq) {
    cancelAnimationFrame(rq);
    rq = 0;
  }
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('on', t.dataset.tab === S.view);
  });
  $('.add').setAttribute(
    'aria-label',
    S.view === 'stats' ? 'Tarif hinzufügen' : 'Aktivität hinzufügen',
  );
  if (mounted !== S.view) {
    $('#view').innerHTML = SKELETON[S.view];
    mounted = S.view;
    if (S.view === 'lib') $('#q').value = S.q;
  }
  UPD[S.view]();
  if (S.sheet && S.sheet.type === 'detail') updDetail();
}
function scheduleRender() {
  if (!rq)
    rq = requestAnimationFrame(() => {
      rq = 0;
      render();
    });
}

/* ---------- sheets ---------- */
let sheetReturn = null;
function openSheet(html, tall, foot) {
  if (!$('#sheet-root').firstChild) sheetReturn = document.activeElement;
  $('#sheet-root').innerHTML =
    `<div class="overlay" data-action="backdrop"><div class="sheet${tall ? ' tall' : ''}${foot ? ' foot' : ''}" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  document.body.style.overflow = 'hidden';
  $('.sheet').focus({ preventScroll: true });
}
function closeSheet() {
  S.sheet = null;
  $('#sheet-root').innerHTML = '';
  document.body.style.overflow = '';
  if (sheetReturn && sheetReturn.isConnected) sheetReturn.focus({ preventScroll: true });
  sheetReturn = null;
}
// Keep Tab inside the open sheet.
document.addEventListener('keydown', (e) => {
  const sheet = e.key === 'Tab' && S.sheet && $('.sheet');
  if (!sheet) return;
  const f = [...sheet.querySelectorAll('button,input,select,textarea,a[href]')].filter(
    (x) => !x.disabled && x.getClientRects().length,
  );
  if (!f.length) return;
  const first = f[0],
    last = f[f.length - 1],
    cur = document.activeElement;
  if (e.shiftKey && (cur === first || cur === sheet)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && cur === last) {
    e.preventDefault();
    first.focus();
  }
});
// Forms are saved through their buttons; Enter must not reload the page.
document.addEventListener('submit', (e) => e.preventDefault());

function galleryHTML(a) {
  const photos = a.photos || [];
  if (!photos.length) return '';
  return `<div class="gallery">${photos.map((p, i) => `<img src="${esc(photoSrc(p))}" alt="" decoding="async"${i ? ' loading="lazy"' : ''}>`).join('')}</div>${photos.length > 1 ? `<div class="gcount">${photos.length} Fotos, zum Blättern wischen</div>` : ''}`;
}
function detailBodyHTML(a, ds) {
  let today = '';
  if (ds) {
    const s = slotsOn(a, ds),
      planned = isPlanned(a, ds);
    if (s.length || planned) {
      const on = (a.done || []).includes(ds);
      today = `<div class="today-box"><span><small>${fmt(parse(ds), { weekday: 'long', day: 'numeric', month: 'long' })}</small><b>${esc(s.length ? s.map(timeLabel).join(', ') : 'Geplant')}</b></span><span class="tb-actions"><button class="done-btn ${planned ? 'on' : ''}" data-action="plan-toggle">${planned ? ICON.check + 'Geplant' : 'Einplanen'}</button><button class="done-btn ${on ? 'on' : ''}" data-action="toggle-done">${on ? ICON.check + 'Erledigt' : 'Erledigt'}</button></span></div>`;
    }
  }
  const facts = [];
  const slots = a.slots || [];
  let when = slots.length ? groupedWhen(slots) : '<p class="muted">Keine Zeiten angegeben</p>';
  const aSeason = seasonOf(a);
  if (aSeason && aSeason.type !== 'all')
    when += `<p class="muted">Angebot ${esc(periodLabel(aSeason))}</p>`;
  facts.push(['Wann', when]);
  if (hasPlan(a)) {
    const nx = [];
    const base = parse(todayStr());
    for (let i = 0; i < 120 && nx.length < 3; i++) {
      const d = ymd(addDays(base, i));
      if (isPlanned(a, d) && !(a.done || []).includes(d)) nx.push(d);
    }
    facts.push([
      'Geplant',
      `<p>${esc(plannedSummary(a))}</p>${nx.length ? `<span class="pnext">Nächste: ${esc(nx.map((d) => fmt(parse(d), { weekday: 'short', day: 'numeric', month: 'short' })).join(', '))}</span>` : '<span class="pnext">Keine anstehenden Termine</span>'}`,
    ]);
  }
  const acc = a.access || {},
    memberPlans = S.plans.filter(
      (p) => (p.activities || []).includes(a.id) && (p.type === 'recurring' || p.type === 'once'),
    );
  if (acc.guest || acc.students || acc.membership)
    facts.push([
      'Zugang',
      `<div class="acc-tags">${acc.guest ? '<span class="tag">Gastzutritt möglich</span>' : ''}${acc.students ? '<span class="tag">Für Studenten</span>' : ''}${acc.membership ? '<span class="tag">Mitgliedschaft erforderlich</span>' : ''}</div>${acc.membership && memberPlans.length ? `<p class="muted">Zählt zu: ${esc(memberPlans.map((p) => p.name).join(', '))}</p>` : ''}`,
    ]);
  if (a.provider)
    facts.push([
      'Anbieter',
      `<p>${esc(a.provider)}</p>${S.acts.filter((x) => x.provider === a.provider).length > 1 ? `<p><button class="link" style="padding:4px 0" data-action="filter-prov" data-prov="${esc(a.provider)}">Alle Angebote anzeigen</button></p>` : ''}`,
    ]);
  if (a.location || a.address) {
    const q = encodeURIComponent([a.location, a.address].filter(Boolean).join(', '));
    facts.push([
      'Wo',
      `${a.location ? `<p>${esc(a.location)}</p>` : ''}${a.address ? `<p class="muted">${esc(a.address)}</p>` : ''}<p><a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">In Karten öffnen</a></p>`,
    ]);
  }
  if (a.equipment && a.equipment.length)
    facts.push([
      'Mitbringen',
      a.equipment.map((e) => `<span class="tag">${esc(e)}</span>`).join(''),
    ]);
  if ((a.signup && a.signup !== 'none') || a.signupUrl || a.signupNotes) {
    facts.push([
      'Anmeldung',
      `<p>${esc(SIGNUP[a.signup] || 'Nicht nötig')}</p>${a.signupNotes ? `<p class="muted">${esc(a.signupNotes)}</p>` : ''}${a.signupUrl ? `<p><a href="${esc(safeUrl(a.signupUrl))}" target="_blank" rel="noopener">Anmeldeseite öffnen</a></p>` : ''}`,
    ]);
  } else facts.push(['Anmeldung', '<p>Nicht nötig</p>']);
  const costLines = [
    a.cost && `<p>${esc(a.cost)}</p>`,
    +a.visitPrice > 0 && `<p>${eur(+a.visitPrice)} pro Besuch</p>`,
    ...S.plans
      .filter((p) => (p.activities || []).includes(a.id))
      .map((p) => `<p>${esc(p.name)} <span class="muted">${esc(planSummary(p))}</span></p>`),
  ].filter(Boolean);
  if (costLines.length) facts.push(['Kosten', costLines.join('')]);
  if (a.level) facts.push(['Niveau', `<p>${esc(levelLabel(a.level))}</p>`]);
  if (a.contact) facts.push(['Kontakt', `<p>${esc(a.contact)}</p>`]);
  if (a.website)
    facts.push([
      'Webseite',
      `<p><a href="${esc(safeUrl(a.website))}" target="_blank" rel="noopener">${esc(a.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></p>`,
    ]);
  if (a.notes) facts.push(['Notizen', `<p style="white-space:pre-line">${esc(a.notes)}</p>`]);
  const done = [...(a.done || [])].sort(),
    yr = String(new Date().getFullYear()),
    td = todayStr();
  const yrN = done.filter((d) => d.startsWith(yr)).length;
  facts.push([
    'Besuche',
    (done.length
      ? `<p>${done.length}-mal erledigt, davon ${yrN} in ${yr}</p><div class="visits">${done
          .slice(-6)
          .reverse()
          .map(
            (d) =>
              `<span class="tag">${fmt(parse(d), { day: 'numeric', month: 'short', year: '2-digit' })}<button class="vx" data-action="del-visit" data-d="${esc(d)}" aria-label="Besuch am ${fmt(parse(d), { day: 'numeric', month: 'long' })} entfernen">×</button></span>`,
          )
          .join('')}</div>`
      : '<p class="muted">Noch keine Besuche eingetragen</p>') +
      `<div class="visit-add"><input type="date" id="visitdate" value="${td}" max="${td}" aria-label="Datum des Besuchs"><button class="btn" data-action="add-visit">Eintragen</button></div>`,
  ]);
  return `<h2 class="d-title">${esc(a.name)}</h2>${[a.category, a.level].filter(Boolean).length ? `<p class="d-meta">${esc([a.category, levelLabel(a.level)].filter(Boolean).join(', '))}</p>` : ''}
    ${a.description ? `<p class="d-desc">${esc(a.description)}</p>` : ''}${today}
    <dl class="facts">${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="d-actions"><button class="btn danger" data-action="del">Aktivität löschen</button></div>`;
}
function updDetail() {
  const a = S.acts.find((x) => x.id === S.sheet.id);
  if (!a) return closeSheet();
  setHTML($('#d-gal'), galleryHTML(a));
  if (delArmed !== a.id) setHTML($('#d-body'), detailBodyHTML(a, S.sheet.date));
}
function openDetail(id, ds) {
  if (!S.acts.some((x) => x.id === id)) return;
  S.sheet = { type: 'detail', id, date: ds || null };
  openSheet(
    `<div class="bar"><button class="icon" data-action="close" aria-label="Schließen">${ICON.close}</button><button class="btn" data-action="edit">Bearbeiten</button></div><div id="d-gal"></div><div class="d-body" id="d-body"></div>
    <div class="sheet-foot"><button class="btn" data-action="close">Schließen</button><button class="btn primary" data-action="edit">Aktivität bearbeiten</button></div>`,
    false,
    true,
  );
  updDetail();
}

/* ---------- editor ---------- */
let draft = null,
  uploads = new Set(),
  removed = new Set(),
  uploading = 0;
function openEditor(a) {
  draft = a
    ? JSON.parse(JSON.stringify(a))
    : {
        id: newId(),
        name: '',
        category: '',
        provider: '',
        description: '',
        location: '',
        address: '',
        equipment: [],
        signup: 'none',
        signupUrl: '',
        signupNotes: '',
        slots: [{ kind: 'weekly', days: [wIdx(parse(S.date))], start: '', end: '' }],
        from: '',
        until: '',
        cost: '',
        level: '',
        contact: '',
        website: '',
        notes: '',
        photos: [],
        thumbs: {},
        done: [],
        planned: { mode: 'none' },
      };
  draft.slots = draft.slots || [];
  draft.photos = draft.photos || [];
  ({ blocks: draft.blocks, singles: draft.singles } = slotsToBlocks(draft.slots));
  if (!draft.blocks.length)
    draft.blocks = [
      { period: { type: 'all' }, rows: [newRow(draft.slots.length ? [] : [wIdx(parse(S.date))])] },
    ];
  draft.planned = draft.planned || { mode: 'none' };
  draft.season = seasonOf(draft) || { type: 'all' };
  if (draft.planned.mode !== 'none' && !draft.planned.season)
    draft.planned.season = planSeason(draft.planned) || { type: 'all' };
  draft.thumbs = draft.thumbs || {};
  uploads = new Set();
  removed = new Set();
  uploading = 0;
  S.sheet = { type: 'edit', isNew: !a };
  const cats = [...new Set(S.acts.map((x) => x.category).filter(Boolean))].sort();
  const v = (k) => esc(draft[k] || '');
  const opt = (val, label, cur) =>
    `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(label)}</option>`;
  openSheet(
    `<div class="bar"><button class="btn ghost" data-action="cancel-edit">Abbrechen</button><h2>${a ? 'Aktivität bearbeiten' : 'Neue Aktivität'}</h2><button class="btn primary" data-action="save">Speichern</button></div>
  <form class="form" id="form" novalidate>
    <fieldset><legend>Fotos</legend><div class="photos" id="photos"></div><p class="hint">Das erste Foto ist das Titelbild. Tippe auf ein anderes Foto, um es zum Titelbild zu machen.</p></fieldset>
    <fieldset><legend>Grundlagen</legend>
      <label class="f">Name<input name="name" value="${v('name')}" placeholder="z. B. Beachvolleyball" autocomplete="off" required></label>
      <label class="f">Sportart<input name="category" value="${v('category')}" list="cats" placeholder="z. B. Volleyball, Klettern" autocomplete="off"></label>
      <label class="f">Anbieter / Veranstalter<input name="provider" value="${v('provider')}" list="provs" placeholder="z. B. ZHS, DAV Sektion München" autocomplete="off"></label>
      <datalist id="provs">${[...new Set(S.acts.map((x) => x.provider).filter(Boolean))]
        .sort()
        .map((c) => `<option value="${esc(c)}">`)
        .join('')}</datalist>
      <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <label class="f">Beschreibung<textarea name="description" rows="3" placeholder="Worum es geht, was dich erwartet">${v('description')}</textarea></label>
    </fieldset>
    <fieldset><legend>Wann</legend><div id="slots" style="display:grid;gap:12px"></div>
      <div id="availbox" style="display:grid;gap:12px"></div>
      <p class="hint">Gesamtzeitraum des Angebots, z. B. ein Freibad jedes Jahr von Mai bis September. Unterschiedliche Öffnungszeiten je Saison stellst du oben pro Zeit unter „Gilt“ ein.</p>
    </fieldset>
    <fieldset><legend>Geplante Teilnahme</legend>
      <label class="f">Teilnahme planen<select id="pmode">${[
        ['none', 'Nicht geplant'],
        ['weekly', 'Regelmäßig'],
        ['dates', 'An einzelnen Terminen'],
        ['both', 'Regelmäßig und einzelne Termine'],
      ]
        .map(([k, l]) => opt(k, l, (draft.planned && draft.planned.mode) || 'none'))
        .join('')}</select></label>
      <div id="plannedbox" style="display:grid;gap:12px"></div>
    </fieldset>
    <fieldset><legend>Wo</legend>
      <label class="f">Ort<input name="location" value="${v('location')}" placeholder="z. B. Olympiapark, Platz 3"></label>
      <label class="f">Adresse<input name="address" value="${v('address')}" placeholder="Straße, Ort"></label>
    </fieldset>
    <fieldset><legend>Vorbereitung</legend>
      <label class="f">Ausrüstung zum Mitbringen<input name="equipment" value="${esc((draft.equipment || []).join(', '))}" placeholder="Mehrere Dinge mit Komma trennen"></label>
      <label class="f">Anmeldung<select name="signup">${Object.entries(SIGNUP)
        .map(([k, l]) => opt(k, l, draft.signup || 'none'))
        .join('')}</select></label>
      <label class="f">Anmeldelink<input name="signupUrl" type="url" inputmode="url" value="${v('signupUrl')}" placeholder="https://"></label>
      <label class="f">Hinweise zur Anmeldung<input name="signupNotes" value="${v('signupNotes')}" placeholder="z. B. 48 Stunden vorher per App buchen"></label>
    </fieldset>
    <fieldset><legend>Zugang</legend>
      <div class="checks">
        <label><input type="checkbox" name="acc_guest"${draft.access && draft.access.guest ? ' checked' : ''}><span>Gastzutritt möglich</span></label>
        <label><input type="checkbox" name="acc_students"${draft.access && draft.access.students ? ' checked' : ''}><span>Für Studenten</span></label>
        <label><input type="checkbox" name="acc_member" id="acc_member"${draft.access && draft.access.membership ? ' checked' : ''}><span>Erfordert Mitgliedschaft</span></label>
      </div>
      <div id="memberbox"${draft.access && draft.access.membership ? '' : ' hidden'}>
        ${
          S.plans.length
            ? `<p class="hint" style="margin:0 0 4px 32px">Zählt zu:</p><div class="checks sub">${[
                ...S.plans,
              ]
                .sort(
                  (x, y) =>
                    (x.type === 'recurring' ? 0 : 1) - (y.type === 'recurring' ? 0 : 1) ||
                    x.name.localeCompare(y.name, 'de'),
                )
                .map(
                  (p) =>
                    `<label><input type="checkbox" name="memberof" value="${esc(p.id)}"${(p.activities || []).includes(draft.id) ? ' checked' : ''}><span>${esc(p.name)}<small>${esc([planSummary(p), p.provider].filter(Boolean).join(', '))}</small></span></label>`,
                )
                .join('')}</div>
          <p class="hint" style="margin:6px 0 0 32px">Die Auswahl verknüpft die Aktivität auch mit dem Tarif, damit Besuche und Kosten pro Besuch in der Statistik stimmen.</p>`
            : '<p class="hint" style="margin:0 0 0 32px">Lege deine Mitgliedschaften in der Statistik unter „Tarife und Mitgliedschaften“ an, um sie hier auszuwählen.</p>'
        }
      </div>
    </fieldset>
    <fieldset><legend>Details</legend>
      <div class="two"><label class="f">Preis pro Besuch in €<input name="visitPrice" inputmode="decimal" value="${+draft.visitPrice > 0 ? esc(numF.format(draft.visitPrice)) : ''}" placeholder="0,00" autocomplete="off"></label>
      <label class="f">Kostenhinweis<input name="cost" value="${v('cost')}" placeholder="z. B. ermäßigt 6 €"></label></div>
      <p class="hint">Der Preis pro Besuch fließt in die Statistik ein. Leer lassen, wenn ein Tarif die Kosten abdeckt.</p>
      <label class="f">Niveau<select name="level">${Object.entries(LEVELS)
        .map(([k, l]) => opt(k, l, draft.level || ''))
        .join('')}</select></label>
      <label class="f">Kontakt<input name="contact" value="${v('contact')}" placeholder="Name, Telefon oder E-Mail"></label>
      <label class="f">Webseite<input name="website" type="url" inputmode="url" value="${v('website')}" placeholder="https://"></label>
      <label class="f">Notizen<textarea name="notes" rows="3">${v('notes')}</textarea></label>
    </fieldset>
    <p class="err" id="err" hidden></p>
  </form>
  <div class="sheet-foot"><button class="btn" data-action="cancel-edit">Abbrechen</button><button class="btn primary" data-action="save">${a ? 'Änderungen speichern' : 'Aktivität anlegen'}</button></div>`,
    true,
  );
  renderSlots();
  renderPhotos();
  renderPlanned();
  renderAvail();
  if (!a) setTimeout(() => document.querySelector('[name=name]')?.focus(), 300);
}
const MONTHS = [...Array(12)].map((_, m) => fmt(new Date(2000, m, 1), { month: 'short' }));
/* shared editor for a period: open-ended, yearly (day + month) or a fixed date range */
const toYearly = (p) => ({
  ...p,
  type: 'yearly',
  from: p.from ? p.from.slice(-5) : '05-01',
  until: p.until ? p.until.slice(-5) : '09-30',
});
function toRange(p) {
  const yr = new Date().getFullYear(),
    f = p.from ? p.from.slice(-5) : '05-01',
    u = p.until ? p.until.slice(-5) : '09-30';
  return { ...p, type: 'range', from: `${yr}-${f}`, until: `${u < f ? yr + 1 : yr}-${u}` };
}
const yearlyCheck = (attr, on) =>
  `<label class="yearly-check"><input type="checkbox" ${attr}${on ? ' checked' : ''}>Jedes Jahr wiederholen (ohne Jahreszahl)</label>`;
const SEASON_OPTS = {
  avail: [
    ['all', 'Dauerhaft'],
    ['period', 'Nur in einem Zeitraum'],
  ],
  plan: [
    ['all', 'Ohne Zeitbegrenzung'],
    ['period', 'Nur in einem Zeitraum'],
  ],
};
const seasonObj = (scope) => (scope === 'avail' ? draft.season : draft.planned.season);
function mdSelects(scope, key, val) {
  const [m, d] = (val || '01-01').split('-').map(Number);
  return `<span class="md"><select data-smd="${scope}" data-key="${key}" data-part="d" aria-label="Tag">${[...Array(31)].map((_, k) => `<option value="${k + 1}"${k + 1 === d ? ' selected' : ''}>${k + 1}.</option>`).join('')}</select><select data-smd="${scope}" data-key="${key}" data-part="m" aria-label="Monat">${MONTHS.map((l, k) => `<option value="${k + 1}"${k + 1 === m ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></span>`;
}
function seasonEditor(scope, label) {
  const p = seasonObj(scope) || { type: 'all' },
    t = p.type || 'all';
  return `<label class="f">${label}<select data-season="${scope}">${SEASON_OPTS[scope].map(([k, l]) => `<option value="${k}"${(k === 'all') === (t === 'all') ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    ${t !== 'all' ? yearlyCheck(`data-syearly="${scope}"`, t === 'yearly') : ''}
    ${t === 'yearly' ? `<div class="two"><label class="f">Von${mdSelects(scope, 'from', p.from)}</label><label class="f">Bis${mdSelects(scope, 'until', p.until)}</label></div>` : ''}
    ${t === 'range' ? `<div class="two"><label class="f">${scope === 'plan' ? 'Ab' : 'Von'}<input type="date" data-sdate="${scope}" data-key="from" value="${esc(p.from || '')}"></label><label class="f">Bis<input type="date" data-sdate="${scope}" data-key="until" value="${esc(p.until || '')}"></label></div>` : ''}`;
}
const renderAvail = () => {
  const el = $('#availbox');
  if (el) el.innerHTML = seasonEditor('avail', 'Angebot verfügbar');
};
function rerenderSeason(scope) {
  scope === 'avail' ? renderAvail() : renderPlanned();
}
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!draft || !t.dataset) return;
  if (t.dataset.season) {
    const scope = t.dataset.season,
      old = seasonObj(scope) || {},
      yr = new Date().getFullYear();
    const next =
      t.value === 'all'
        ? { type: 'all' }
        : old.type === 'yearly' || old.type === 'range'
          ? old
          : { type: 'yearly', from: '05-01', until: '09-30' };
    if (scope === 'avail') draft.season = next;
    else draft.planned.season = next;
    rerenderSeason(scope);
  } else if (t.dataset.syearly) {
    const scope = t.dataset.syearly,
      cur = seasonObj(scope),
      next = t.checked ? toYearly(cur) : toRange(cur);
    if (scope === 'avail') draft.season = next;
    else draft.planned.season = next;
    rerenderSeason(scope);
  } else if (t.dataset.smd) {
    const p = seasonObj(t.dataset.smd),
      key = t.dataset.key;
    let [m, d] = (p[key] || '01-01').split('-').map(Number);
    if (t.dataset.part === 'd') d = +t.value;
    else m = +t.value;
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1],
      clamp = d > max;
    p[key] = `${pad(m)}-${pad(clamp ? max : d)}`;
    if (clamp) rerenderSeason(t.dataset.smd);
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (draft && t.dataset && t.dataset.sdate) seasonObj(t.dataset.sdate)[t.dataset.key] = t.value;
});
function renderPlanned() {
  const p = draft.planned || { mode: 'none' },
    el = $('#plannedbox');
  if (!el) return;
  const reg = p.mode === 'weekly' || p.mode === 'both',
    dat = p.mode === 'dates' || p.mode === 'both';
  el.innerHTML =
    (p.mode === 'none'
      ? '<p class="hint" style="margin:0">Optional. Geplante Teilnahmen erscheinen im Kalender unter „Geplante Teilnahmen“.</p>'
      : '') +
    (reg
      ? `<div class="slot"><div class="daypick">${DAYS2.map((d, j) => `<button type="button" class="${(p.days || []).includes(j) ? 'on' : ''}" data-action="pday" data-j="${j}" aria-pressed="${(p.days || []).includes(j)}">${d}</button>`).join('')}</div>
      <label class="f">Rhythmus<select data-pf="every">${[1, 2, 3, 4].map((n) => `<option value="${n}"${(+p.every || 1) === n ? ' selected' : ''}>${n === 1 ? 'Jede Woche' : `Alle ${n} Wochen`}</option>`).join('')}</select></label>
      ${seasonEditor('plan', 'Zeitraum')}
      <p class="hint" style="margin:0">Eingeplant werden nur Tage, an denen das Angebot laut deinen Zeiten stattfindet. „Bis“ leer lassen, wenn es offen ist.</p></div>`
      : '') +
    (dat
      ? `<div class="slot"><span class="f">Einzelne Termine</span>${(p.dates || []).length ? `<div class="pdates">${p.dates.map((d) => `<span class="tag">${fmt(parse(d), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}<button type="button" class="vx" data-action="pdate-del" data-d="${esc(d)}" aria-label="Termin entfernen">×</button></span>`).join('')}</div>` : ''}
      <div class="padd-row"><input type="date" id="pdate" value="${esc(S.date >= todayStr() ? S.date : todayStr())}" aria-label="Termin"><button type="button" class="btn" data-action="pdate-add">Hinzufügen</button></div></div>`
      : '');
}
/* opening hours are edited as blocks: one block per period (whole year, a season, ...), each with its own weekly times */
const perKey = (p) =>
  !p || !p.type || p.type === 'all' ? 'all' : [p.type, p.from, p.until, p.label || ''].join('|');
function slotsToBlocks(slots) {
  const blocks = [],
    map = new Map(),
    singles = [];
  for (const sl of slots || []) {
    if (sl.kind === 'date') {
      singles.push({ date: sl.date || '', start: sl.start || '', end: sl.end || '' });
      continue;
    }
    const k = perKey(sl.period);
    if (!map.has(k)) {
      const b = {
        period: sl.period && sl.period.type !== 'all' ? { ...sl.period } : { type: 'all' },
        rows: [],
      };
      map.set(k, b);
      blocks.push(b);
    }
    map.get(k).rows.push({ days: [...(sl.days || [])], start: sl.start || '', end: sl.end || '' });
  }
  blocks.sort((x, y) => (x.period.type === 'all' ? 0 : 1) - (y.period.type === 'all' ? 0 : 1));
  return { blocks, singles };
}
const newRow = (days) => ({ days: days || [], start: '', end: '' });
function blockTitle(b) {
  const p = b.period;
  if (p.type === 'all') return '<b>Ganzjährig</b>';
  const r = periodLabel({ ...p, label: '' });
  return `<span><b>${esc(p.label || 'Zeitraum')}</b><small>${esc(r)}</small></span>`;
}
function blockHead(b, i) {
  const p = b.period,
    t = p.type;
  const md = (key, part) => {
    const [m, d] = (p[key] || '01-01').split('-').map(Number);
    return part === 'd'
      ? `<select data-bmd="${i}" data-key="${key}" data-part="d" aria-label="Tag">${[...Array(31)].map((_, k) => `<option value="${k + 1}"${k + 1 === d ? ' selected' : ''}>${k + 1}.</option>`).join('')}</select>`
      : `<select data-bmd="${i}" data-key="${key}" data-part="m" aria-label="Monat">${MONTHS.map((l, k) => `<option value="${k + 1}"${k + 1 === m ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  };
  return `<div class="blk-head">
    <label class="f">Gilt<select data-bper="${i}">${[
      ['all', 'Ganzjährig'],
      ['period', 'Nur in einem Zeitraum'],
    ]
      .map(
        ([k, l]) =>
          `<option value="${k}"${(k === 'all') === (t === 'all') ? ' selected' : ''}>${l}</option>`,
      )
      .join('')}</select></label>
    ${t !== 'all' ? yearlyCheck(`data-byearly="${i}"`, t === 'yearly') : ''}
    ${t === 'yearly' ? `<div class="two"><label class="f">Von<span class="md">${md('from', 'd')}${md('from', 'm')}</span></label><label class="f">Bis<span class="md">${md('until', 'd')}${md('until', 'm')}</span></label></div>` : ''}
    ${t === 'range' ? `<div class="two"><label class="f">Von<input type="date" data-f="per" data-b="${i}" data-k="from" value="${esc(p.from || '')}"></label><label class="f">Bis<input type="date" data-f="per" data-b="${i}" data-k="until" value="${esc(p.until || '')}"></label></div>` : ''}
    ${t !== 'all' ? `<label class="f">Bezeichnung<input data-f="per" data-b="${i}" data-k="label" value="${esc(p.label || '')}" placeholder="z. B. Sommer, Winter, Ferien"></label>` : ''}
  </div>`;
}
const DEL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function renderSlots() {
  const el = $('#slots');
  if (!el || !draft) return;
  const B = draft.blocks,
    S1 = draft.singles;
  el.innerHTML =
    B.map(
      (b, i) => `<div class="blk">
      <div class="blk-title">${blockTitle(b)}</div>
      ${blockHead(b, i)}
      ${b.rows
        .map(
          (r, j) => `<div class="trow">
        <div class="daypick">${DAYS2.map((d, k) => `<button type="button" class="${r.days.includes(k) ? 'on' : ''}" data-action="row-day" data-b="${i}" data-r="${j}" data-j="${k}" aria-pressed="${r.days.includes(k)}">${d}</button>`).join('')}</div>
        <div class="ttimes"><label class="f">Beginn<input type="time" data-f="row" data-b="${i}" data-r="${j}" data-k="start" value="${esc(r.start)}"></label><label class="f">Ende<input type="time" data-f="row" data-b="${i}" data-r="${j}" data-k="end" value="${esc(r.end)}"></label>
        ${b.rows.length > 1 ? `<button type="button" class="icon" data-action="row-del" data-b="${i}" data-r="${j}" aria-label="Zeit entfernen">${DEL_ICON}</button>` : '<span></span>'}</div>
      </div>`,
        )
        .join('')}
      <div class="blk-actions"><button type="button" class="btn add" data-action="row-add" data-b="${i}">+ Weitere Zeit${b.period.type === 'all' ? '' : ' in diesem Zeitraum'}</button>
        <span>${b.period.type === 'all' ? `<button type="button" class="btn" data-action="blk-split" data-b="${i}">In Sommer/Winter aufteilen</button>` : ''}${B.length > 1 ? `<button type="button" class="btn danger" data-action="blk-del" data-b="${i}">Block entfernen</button>` : ''}</span></div>
    </div>`,
    ).join('') +
    `<button type="button" class="btn" data-action="blk-add">+ Öffnungszeiten für einen weiteren Zeitraum</button>` +
    `<div class="blk"><div class="blk-title"><b>Einzeltermine</b></div>
      ${
        S1.length
          ? S1.map(
              (
                x,
                k,
              ) => `<div class="trow"><div class="ttimes" style="grid-template-columns:1fr 36px"><label class="f">Datum<input type="date" data-f="single" data-s="${k}" data-k="date" value="${esc(x.date)}"></label><button type="button" class="icon" data-action="single-del" data-s="${k}" aria-label="Termin entfernen">${DEL_ICON}</button></div>
        <div class="two"><label class="f">Beginn<input type="time" data-f="single" data-s="${k}" data-k="start" value="${esc(x.start)}"></label><label class="f">Ende<input type="time" data-f="single" data-s="${k}" data-k="end" value="${esc(x.end)}"></label></div></div>`,
            ).join('')
          : '<p class="hint" style="margin:0">Für Termine, die nur einmal stattfinden, z. B. ein Turnier.</p>'
      }
      <div class="blk-actions"><button type="button" class="btn add" data-action="single-add">+ Einzeltermin</button></div></div>`;
}
function fieldSync(t) {
  if (!draft || !t.dataset || !t.dataset.f) return;
  const { f, b, r, k, s: si } = t.dataset;
  if (f === 'row') draft.blocks[+b].rows[+r][k] = t.value;
  else if (f === 'per') draft.blocks[+b].period[k] = t.value;
  else if (f === 'single') draft.singles[+si][k] = t.value;
}
const syncSlotsDOM = () => {
  if (draft && draft.blocks) document.querySelectorAll('#slots [data-f]').forEach(fieldSync);
};
document.addEventListener('input', (e) => fieldSync(e.target));
document.addEventListener('change', (e) => {
  const t = e.target;
  syncSlotsDOM();
  if (!draft || !t.dataset) return;
  if (t.dataset.bper !== undefined) {
    const b = draft.blocks[+t.dataset.bper],
      old = b.period;
    b.period =
      t.value === 'all'
        ? { type: 'all' }
        : old.type !== 'all'
          ? old
          : { type: 'yearly', from: '04-01', until: '09-30', label: '' };
    renderSlots();
  } else if (t.dataset.byearly !== undefined) {
    const b = draft.blocks[+t.dataset.byearly];
    b.period = t.checked ? toYearly(b.period) : toRange(b.period);
    renderSlots();
  } else if (t.dataset.bmd !== undefined) {
    const p = draft.blocks[+t.dataset.bmd].period,
      key = t.dataset.key;
    let [m, d] = (p[key] || '01-01').split('-').map(Number);
    if (t.dataset.part === 'd') d = +t.value;
    else m = +t.value;
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    p[key] = `${pad(m)}-${pad(Math.min(d, max))}`;
    renderSlots(); // refresh the block title with the new dates
  }
});
/* flatten blocks back into slots; returns an error message or null */
function blocksToSlots() {
  syncSlotsDOM(); // take whatever is on screen, even if a picker fired no event
  const out = [];
  for (const b of draft.blocks) {
    const p = b.period,
      rows = b.rows.filter((r) => r.days.length);
    if (!rows.length) continue;
    if (p.type === 'range') {
      if (!p.from && !p.until) return 'Gib für den Zeitraum mindestens ein Von- oder Bis-Datum an.';
      if (p.from && p.until && p.until < p.from)
        return 'Bei einem Zeitraum liegt das Bis-Datum vor dem Von-Datum.';
    }
    const per =
      p.type === 'all'
        ? null
        : p.type === 'yearly'
          ? { type: 'yearly', from: p.from, until: p.until, label: (p.label || '').trim() }
          : {
              type: 'range',
              from: p.from || '',
              until: p.until || '',
              label: (p.label || '').trim(),
            };
    for (const r of rows) {
      const o = {
        kind: 'weekly',
        days: [...r.days].sort(),
        start: r.start || '',
        end: r.end || '',
      };
      if (per) o.period = per;
      out.push(o);
    }
  }
  for (const x of draft.singles)
    if (x.date) out.push({ kind: 'date', date: x.date, start: x.start || '', end: x.end || '' });
  draft.slots = out;
  return null;
}
const BLOCK_HANDLERS = {
  'row-day': (t) => {
    const r = draft.blocks[+t.dataset.b].rows[+t.dataset.r],
      k = +t.dataset.j;
    r.days = r.days.includes(k) ? r.days.filter((x) => x !== k) : [...r.days, k];
    t.classList.toggle('on', r.days.includes(k));
    t.setAttribute('aria-pressed', r.days.includes(k));
  },
  'row-add': (t) => {
    draft.blocks[+t.dataset.b].rows.push(newRow());
    renderSlots();
  },
  'row-del': (t) => {
    draft.blocks[+t.dataset.b].rows.splice(+t.dataset.r, 1);
    renderSlots();
  },
  'blk-add': () => {
    draft.blocks.push({
      period: { type: 'yearly', from: '10-01', until: '03-31', label: '' },
      rows: [newRow()],
    });
    renderSlots();
  },
  'blk-del': (t) => {
    draft.blocks.splice(+t.dataset.b, 1);
    renderSlots();
  },
  'blk-split': (t) => {
    const b = draft.blocks[+t.dataset.b];
    const winter = {
      period: { type: 'yearly', from: '10-01', until: '03-31', label: 'Winter' },
      rows: b.rows.map((r) => ({ ...r, days: [...r.days] })),
    };
    b.period = { type: 'yearly', from: '04-01', until: '09-30', label: 'Sommer' };
    draft.blocks.splice(+t.dataset.b + 1, 0, winter);
    renderSlots();
    toast('In Sommer und Winter aufgeteilt. Passe die Zeiten im Winter-Block an.');
  },
  'single-add': () => {
    draft.singles.push({ date: S.date, start: '', end: '' });
    renderSlots();
  },
  'single-del': (t) => {
    draft.singles.splice(+t.dataset.s, 1);
    renderSlots();
  },
};
function renderPhotos() {
  const el = $('#photos');
  if (!el || !draft) return;
  patchList(el, [
    ...draft.photos.map((p, i) => ({
      key: 'p' + p.slice(-40) + i,
      html: `<div class="pslot"><button type="button" style="border:0;padding:0;width:100%;height:100%;background:none" data-action="photo-cover" data-i="${i}" aria-label="Als Titelbild festlegen"><img src="${esc(thumbSrc(draft, p))}" alt="" decoding="async"></button>${i === 0 ? '<span class="cover">Titelbild</span>' : ''}<button type="button" class="x" data-action="photo-del" data-i="${i}" aria-label="Foto entfernen">${ICON.close}</button></div>`,
    })),
    ...(uploading
      ? [{ key: 'busy', html: `<div class="pslot busy">Wird hinzugefügt …</div>` }]
      : []),
    {
      key: 'add',
      html: `<label class="pslot padd">${ICON.camera}Foto hinzufügen<input type="file" accept="image/*" multiple id="file"></label>`,
    },
  ]);
}
/* decode off the main thread where the browser allows it */
async function decode(blob) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(blob);
    } catch {}
  }
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
function scaleTo(img, max, q, asBlob) {
  const w0 = img.naturalWidth || img.width,
    h0 = img.naturalHeight || img.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w0 * k);
  cv.height = Math.round(h0 * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return asBlob ? new Promise((r) => cv.toBlob(r, 'image/jpeg', q)) : cv.toDataURL('image/jpeg', q);
}
async function addPhotos(files) {
  for (const f of files) {
    uploading++;
    renderPhotos();
    try {
      const st = await storeImage(f);
      if (st.thumb) {
        uploads.add(st.ref);
        uploads.add(st.thumb);
      }
      if (draft) {
        draft.photos.push(st.ref);
        if (st.thumb) draft.thumbs[st.ref] = st.thumb;
      }
    } catch (e) {
      toast(
        e && e.code === 'quota_or_state'
          ? 'Der Fotospeicher ist voll. Entferne zuerst einige Fotos.'
          : e && e.code === 'too_large'
            ? 'Dieses Foto ist zu groß.'
            : 'Das Foto konnte nicht hinzugefügt werden.',
      );
    } finally {
      uploading--;
      renderPhotos();
    }
  }
}
function collectForm() {
  const fd = new FormData($('#form'));
  for (const k of [
    'name',
    'category',
    'provider',
    'description',
    'location',
    'address',
    'signup',
    'signupUrl',
    'signupNotes',
    'cost',
    'level',
    'contact',
    'website',
    'notes',
  ])
    draft[k] = String(fd.get(k) || '').trim();
  const vp = parseMoney(fd.get('visitPrice'));
  draft.visitPrice = vp > 0 ? vp : 0;
  draft.access = {
    guest: fd.has('acc_guest'),
    students: fd.has('acc_students'),
    membership: fd.has('acc_member'),
  };
  draft._memberOf = fd.getAll('memberof');
  draft.equipment = String(fd.get('equipment') || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
const normUrl = (u) => (u && !/^https?:\/\//i.test(u) ? 'https://' + u : u);
const dropAsset = (r) => {
  if (r && !r.startsWith('data:')) ready.then((mn) => mn.files.remove(r)).catch(() => {});
};
async function saveDraft() {
  collectForm();
  const err = $('#err');
  const fail = (m) => {
    err.textContent = m;
    err.hidden = false;
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  if (!draft.name) return fail('Gib der Aktivität einen Namen.');
  if (
    String(new FormData($('#form')).get('visitPrice') || '').trim() &&
    !(parseMoney(new FormData($('#form')).get('visitPrice')) >= 0)
  )
    return fail('Gib einen gültigen Preis pro Besuch ein, z. B. 8,50.');
  if (uploading) return fail('Warte, bis alle Fotos hinzugefügt sind.');
  if (draft.from && draft.until && draft.until < draft.from)
    return fail('Das Enddatum liegt vor dem Startdatum.');
  const slotErr = blocksToSlots();
  if (slotErr) return fail(slotErr);
  const pp = draft.planned;
  if (pp.mode === 'weekly' || pp.mode === 'both') {
    if (!(pp.days || []).length)
      return fail('Wähle für die regelmäßige Teilnahme mindestens einen Wochentag.');
  }
  const badRange = (x) => x && x.type === 'range' && x.from && x.until && x.until < x.from;
  if (badRange(draft.season))
    return fail('Beim Zeitraum des Angebots liegt das Bis-Datum vor dem Von-Datum.');
  if (pp.mode !== 'none' && badRange(pp.season))
    return fail('Bei der geplanten Teilnahme liegt das Bis-Datum vor dem Ab-Datum.');
  const normSeason = (x) =>
    !x || x.type === 'all' || (x.type === 'range' && !x.from && !x.until)
      ? { type: 'all' }
      : { type: x.type, from: x.from || '', until: x.until || '' };
  draft.season = normSeason(draft.season);
  draft.from = '';
  draft.until = '';
  if (pp.mode === 'dates' && !(pp.dates || []).length)
    return fail('Füge mindestens einen geplanten Termin hinzu oder wähle „Nicht geplant“.');
  draft.planned =
    pp.mode === 'none'
      ? { mode: 'none' }
      : {
          mode: pp.mode,
          days: [...(pp.days || [])].sort(),
          every: +pp.every || 1,
          season: normSeason(pp.season),
          anchor:
            pp.anchor ||
            (pp.season && pp.season.type === 'range' && pp.season.from) ||
            pp.from ||
            todayStr(),
          from: '',
          until: '',
          dates: [...new Set(pp.dates || [])].sort(),
          skip: pp.skip || [],
        };
  const cleanPeriod = (p) =>
    !p || !p.type || p.type === 'all'
      ? undefined
      : p.type === 'yearly'
        ? { type: 'yearly', from: p.from, until: p.until, label: (p.label || '').trim() }
        : {
            type: 'range',
            from: p.from || '',
            until: p.until || '',
            label: (p.label || '').trim(),
          };
  draft.slots = draft.slots
    .filter((s) => (s.kind === 'date' ? s.date : (s.days || []).length))
    .map((s) => {
      if (s.kind === 'date')
        return { kind: 'date', date: s.date, start: s.start || '', end: s.end || '' };
      const o = {
          kind: 'weekly',
          days: [...s.days].sort(),
          start: s.start || '',
          end: s.end || '',
        },
        per = cleanPeriod(s.period);
      if (per) o.period = per;
      return o;
    });
  draft.signupUrl = normUrl(draft.signupUrl);
  draft.website = normUrl(draft.website);
  for (const k of Object.keys(draft.thumbs)) if (!draft.photos.includes(k)) delete draft.thumbs[k];
  draft.updatedAt = Date.now();
  const memberOf = draft._memberOf || [];
  delete draft._memberOf;
  const act = { ...draft },
    isNew = S.sheet.isNew;
  delete act.blocks;
  delete act.singles;
  try {
    await persist(act);
    if (act.access && act.access.membership) {
      // keep tariff links in sync with the membership choice
      for (const p of S.plans) {
        const has = (p.activities || []).includes(act.id),
          want = memberOf.includes(p.id);
        if (has !== want)
          await persistPlan({
            ...p,
            activities: want
              ? [...(p.activities || []), act.id]
              : (p.activities || []).filter((x) => x !== act.id),
          }).catch(() => toast('Ein Tarif konnte nicht aktualisiert werden.'));
      }
    }
    removed.forEach(dropAsset);
    uploads = new Set();
    removed = new Set();
    closeSheet();
    toast(isNew ? 'Aktivität hinzugefügt' : 'Änderungen gespeichert');
    openDetail(act.id, null);
  } catch (e) {
    fail(
      e && e.code === 'quota_exceeded'
        ? 'Der Speicher ist voll. Lösche eine Aktivität, um neue hinzuzufügen.'
        : e && e.message === 'local-full'
          ? 'Der Gerätespeicher für diese Seite ist voll. Entferne einige Fotos.'
          : 'Speichern fehlgeschlagen. Prüfe deine Verbindung und versuche es erneut.',
    );
  }
}
function cancelEdit() {
  uploads.forEach(dropAsset);
  uploads = new Set();
  removed = new Set();
  draft = null;
  closeSheet();
}

/* ---------- persistence ---------- */
function applyLocal(act, del) {
  const next = S.acts.filter((x) => x.id !== act.id);
  if (!del) next.push(act);
  S.acts = next;
  dataChanged();
}
async function persist(act) {
  const mn = await ready;
  await mn.kv.set(ACT + act.id, act);
  applyLocal(act);
}
async function removeAct(a) {
  const mn = await ready;
  await mn.kv.delete(ACT + a.id);
  applyLocal(a, true);
  (a.photos || []).forEach(dropAsset);
  Object.values(a.thumbs || {}).forEach(dropAsset);
}

/* ---------- actions ---------- */
let delArmed = null,
  searchT;
const H = {
  tab: (t) => {
    S.view = t.dataset.tab;
    if (S.view === 'cal') {
      const d = parse(S.date);
      S.month = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    render();
    window.scrollTo(0, 0);
  },
  pick: (t) => {
    S.date = t.dataset.date;
    render();
  },
  week: (t) => {
    S.date = ymd(addDays(parse(S.date), 7 * +t.dataset.dir));
    render();
  },
  today: () => {
    S.date = todayStr();
    render();
  },
  month: (t) => {
    S.month = new Date(S.month.getFullYear(), S.month.getMonth() + +t.dataset.dir, 1);
    render();
  },
  calpick: (t) => {
    S.date = t.dataset.date;
    const d = parse(S.date);
    if (d.getMonth() !== S.month.getMonth()) S.month = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
  },
  cat: (t) => {
    S.cat = t.dataset.cat;
    render();
  },
  'filter-prov': (t) => {
    S.prov = t.dataset.prov;
    S.cat = 'Alle';
    S.q = '';
    closeSheet();
    S.view = 'lib';
    mounted = null;
    render();
    window.scrollTo(0, 0);
  },
  open: (t) => openDetail(t.dataset.id, t.dataset.date),
  new: () => (S.view === 'stats' ? openPlanEditor(null) : openEditor(null)),
  edit: () => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (a) {
      closeSheet();
      openEditor(a);
    }
  },
  close: () => closeSheet(),
  backdrop: (t, e) => {
    if (e.target === t && S.sheet && S.sheet.type === 'detail') closeSheet();
  },
  'toggle-done': async () => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (!a) return;
    const ds = S.sheet.date,
      done = new Set(a.done || []);
    done.has(ds) ? done.delete(ds) : done.add(ds);
    try {
      await persist({ ...a, done: [...done].sort() });
    } catch {
      toast('Aktualisierung fehlgeschlagen. Bitte erneut versuchen.');
    }
  },
  del: async (t) => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (!a) return;
    if (delArmed !== a.id) {
      delArmed = a.id;
      t.textContent = 'Zum Löschen erneut tippen';
      setTimeout(() => {
        if (delArmed === a.id) {
          delArmed = null;
          if (t.isConnected) t.textContent = 'Aktivität löschen';
        }
      }, 3000);
      return;
    }
    delArmed = null;
    closeSheet();
    try {
      await removeAct(a);
      toast('Aktivität gelöscht');
    } catch {
      toast('Löschen fehlgeschlagen. Bitte erneut versuchen.');
    }
  },
  save: () => saveDraft(),
  'cancel-edit': () => cancelEdit(),
  calmode: (t) => {
    S.calMode = t.dataset.mode;
    S.agendaDays = 28;
    render();
  },
  calview: (t) => {
    S.calView = t.dataset.view;
    S.agendaDays = 28;
    render();
    window.scrollTo(0, 0);
  },
  'agenda-more': () => {
    S.agendaDays += 28;
    render();
  },
  pday: (t) => {
    const p = draft.planned,
      j = +t.dataset.j;
    p.days = (p.days || []).includes(j) ? p.days.filter((x) => x !== j) : [...(p.days || []), j];
    t.classList.toggle('on', p.days.includes(j));
    t.setAttribute('aria-pressed', p.days.includes(j));
  },
  'pdate-add': () => {
    const v = $('#pdate').value;
    if (!v) return;
    const p = draft.planned;
    p.dates = [...new Set([...(p.dates || []), v])].sort();
    renderPlanned();
  },
  'pdate-del': (t) => {
    const p = draft.planned;
    p.dates = (p.dates || []).filter((x) => x !== t.dataset.d);
    renderPlanned();
  },
  'plan-toggle': () => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (a && S.sheet.date) togglePlan(a, S.sheet.date);
  },
  'plan-day': (t) => {
    const a = S.acts.find((x) => x.id === t.dataset.id);
    if (a) togglePlan(a, t.dataset.date, true);
  },
};
async function togglePlan(a, ds, announce) {
  {
    const was = isPlanned(a, ds);
    const p = JSON.parse(JSON.stringify(a.planned || { mode: 'none' }));
    p.dates = p.dates || [];
    p.skip = p.skip || [];
    if (isPlanned(a, ds)) {
      if (p.dates.includes(ds)) p.dates = p.dates.filter((x) => x !== ds);
      else p.skip = [...p.skip, ds];
      if (p.mode === 'dates' && !p.dates.length) p.mode = 'none';
    } else {
      if (p.skip.includes(ds)) p.skip = p.skip.filter((x) => x !== ds);
      if (!isPlanned({ ...a, planned: p }, ds)) {
        p.dates = [...p.dates, ds].sort();
        p.mode = p.mode === 'weekly' ? 'both' : p.mode === 'none' ? 'dates' : p.mode;
      }
    }
    try {
      await persist({ ...a, planned: p });
      if (announce)
        toast(
          was
            ? 'Nicht mehr eingeplant'
            : `Für ${fmt(parse(ds), { weekday: 'short', day: 'numeric', month: 'short' })} eingeplant`,
        );
    } catch {
      toast('Aktualisierung fehlgeschlagen. Bitte erneut versuchen.');
    }
  }
}
Object.assign(H, {
  'photo-del': (t) => {
    const [r] = draft.photos.splice(+t.dataset.i, 1),
      th = draft.thumbs[r];
    delete draft.thumbs[r];
    for (const id of [r, th])
      if (id) {
        if (uploads.has(id)) {
          uploads.delete(id);
          dropAsset(id);
        } else removed.add(id);
      }
    renderPhotos();
  },
  'photo-cover': (t) => {
    const i = +t.dataset.i;
    if (i) {
      const [p] = draft.photos.splice(i, 1);
      draft.photos.unshift(p);
      renderPhotos();
    }
  },
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t || !H[t.dataset.action]) return;
  if (draft && draft.blocks && $('#slots')) syncSlotsDOM();
  H[t.dataset.action](t, e);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') {
    S.q = t.value;
    clearTimeout(searchT);
    searchT = setTimeout(updLib, 120);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'provsel') {
    S.prov = e.target.value;
    updLib();
    return;
  }
  if (e.target.id === 'file' && e.target.files.length) {
    const f = [...e.target.files];
    e.target.value = '';
    addPhotos(f);
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!draft) return;
  if (t.id === 'pmode') {
    const p = draft.planned;
    p.mode = t.value;
    if ((p.mode === 'weekly' || p.mode === 'both') && !(p.days || []).length)
      p.days = [...new Set(draft.blocks.flatMap((b) => b.rows.flatMap((r) => r.days)))].sort();
    if ((p.mode === 'weekly' || p.mode === 'both') && !p.season)
      p.season = { type: 'range', from: todayStr(), until: '' };
    renderPlanned();
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (draft && t.dataset && t.dataset.pf)
    draft.planned[t.dataset.pf] = t.dataset.pf === 'every' ? +t.value : t.value;
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (draft && t.dataset && t.dataset.pf)
    draft.planned[t.dataset.pf] = t.dataset.pf === 'every' ? +t.value : t.value;
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'acc_member') {
    const b = $('#memberbox');
    if (b) b.hidden = !e.target.checked;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.sheet) S.sheet.type === 'edit' ? cancelEdit() : closeSheet();
});

let toastT;
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

Object.assign(H, BLOCK_HANDLERS);
/* ---------- tariffs, costs and statistics ---------- */
S.plans = [];
S.year = new Date().getFullYear();
S.costBy = 'provider';
function plansChanged() {
  scheduleRender();
}
const eurF = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur = (n) => eurF.format(n || 0);
const numF = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoney = (v) => {
  const s = String(v ?? '').replace(/[\s€]/g, '');
  if (!s) return NaN;
  return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};
const UNITS = {
  day: ['Tag', 'Tage'],
  week: ['Woche', 'Wochen'],
  month: ['Monat', 'Monate'],
  year: ['Jahr', 'Jahre'],
};
const EVERY1 = { day: 'täglich', week: 'wöchentlich', month: 'monatlich', year: 'jährlich' };
const PTYPES = {
  recurring: 'Wiederkehrend (Abo, Mitgliedschaft)',
  once: 'Einmalig',
  visit: 'Pro Besuch',
  card: 'Mehrfachkarte (z. B. 10er-Karte)',
};
const PLAN_AMOUNT_LABEL = {
  recurring: 'Betrag pro Zahlung in €',
  once: 'Betrag in €',
  visit: 'Preis pro Besuch in €',
  card: 'Kartenpreis in €',
};

function addInterval(d, n, unit) {
  const x = new Date(d);
  if (unit === 'day') x.setDate(x.getDate() + n);
  else if (unit === 'week') x.setDate(x.getDate() + 7 * n);
  else {
    const day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + (unit === 'year' ? 12 * n : n));
    x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  }
  return x;
}
function paymentsCount(p, from, to) {
  if (!p.start) return 0;
  const end = p.end && p.end < to ? p.end : to,
    st = parse(p.start),
    n = Math.max(1, +p.every || 1);
  let c = 0;
  for (let k = 0; k < 6000; k++) {
    // k-th payment from the anchor date: no month-end drift
    const ds = ymd(addInterval(st, k * n, p.unit || 'month'));
    if (ds > end) break;
    if (ds >= from) c++;
  }
  return c;
}
function planSummary(p) {
  const a = eur(p.amount);
  if (p.type === 'once')
    return `${a} einmalig${p.start ? ' am ' + fmt(parse(p.start), { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`;
  if (p.type === 'visit') return `${a} pro Besuch`;
  if (p.type === 'card') return `${p.visits || 10}er-Karte für ${a}`;
  const n = +p.every || 1,
    u = p.unit || 'month';
  return `${a} ${n === 1 ? EVERY1[u] : `alle ${n} ${UNITS[u][1]}`}${p.end ? ', gekündigt zum ' + fmt(parse(p.end), { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`;
}
const visitsIn = (a, from, to) =>
  (a.done || []).reduce((c, d) => c + (d >= from && d <= to ? 1 : 0), 0);

function computeStats(Y) {
  const from = `${Y}-01-01`,
    yEnd = `${Y}-12-31`,
    td = todayStr(),
    to = yEnd < td ? yEnd : td;
  const actMap = new Map(S.acts.map((a) => [a.id, a]));
  const vis = new Map(S.acts.map((a) => [a.id, visitsIn(a, from, yEnd)]));
  const byDay = new Map();
  for (const a of S.acts)
    for (const d of a.done || []) if (d >= from && d <= yEnd) byDay.set(d, (byDay.get(d) || 0) + 1);
  const entries = [],
    planStats = [],
    covered = new Set();
  const push = (amount, a, p, label) => {
    if (amount > 0)
      entries.push({
        amount,
        act: a ? a.id : null,
        provider: (p && p.provider) || (a && a.provider) || 'Ohne Anbieter',
        category: (p && p.category) || (a && a.category) || 'Ohne Sportart',
        tarif: label,
      });
  };
  let forecast = 0;
  for (const p of S.plans) {
    const linked = (p.activities || []).map((id) => actMap.get(id)).filter(Boolean);
    const lv = linked.reduce((s, a) => s + vis.get(a.id), 0),
      amt = +p.amount || 0;
    let total = 0,
      fc = 0;
    if (p.type === 'visit' || p.type === 'card') {
      const unit = p.type === 'visit' ? amt : amt / Math.max(1, +p.visits || 1);
      linked.forEach((a) => {
        covered.add(a.id);
        push(unit * vis.get(a.id), a, p, p.name);
      });
      total = fc = unit * lv;
    } else {
      if (p.type === 'once') {
        total = p.start >= from && p.start <= to ? amt : 0;
        fc = p.start >= from && p.start <= yEnd ? amt : 0;
      } else {
        total = amt * paymentsCount(p, from, to);
        fc = amt * paymentsCount(p, from, yEnd);
      }
      if (total) {
        const w = linked.map((a) => vis.get(a.id)),
          sw = w.reduce((s, x) => s + x, 0);
        if (!linked.length) push(total, null, p, p.name);
        else
          linked.forEach((a, i) => {
            push(total * (sw ? w[i] / sw : 1 / linked.length), a, p, p.name); // split by use
          });
      }
    }
    forecast += fc;
    planStats.push({ p, total, visits: lv, perVisit: lv && total ? total / lv : null });
  }
  for (const a of S.acts) {
    const pr = +a.visitPrice || 0;
    if (pr > 0 && !covered.has(a.id)) {
      const c = pr * vis.get(a.id);
      push(c, a, null, 'Einzelpreise');
      forecast += c;
    }
  }
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const group = (k) => {
    const m = new Map();
    for (const e of entries) m.set(e[k], (m.get(e[k]) || 0) + e.amount);
    return [...m].sort((x, y) => y[1] - x[1]);
  };
  const actCost = new Map();
  entries.forEach((e) => {
    if (e.act) actCost.set(e.act, (actCost.get(e.act) || 0) + e.amount);
  });
  const usage = S.acts
    .map((a) => ({ a, n: vis.get(a.id), cost: actCost.get(a.id) || 0 }))
    .filter((x) => x.n || x.cost)
    .sort((x, y) => y.n - x.n || y.cost - x.cost);
  return {
    byDay,
    total,
    forecast,
    usage,
    planStats,
    groups: { provider: group('provider'), category: group('category'), tarif: group('tarif') },
    sessions: [...byDay.values()].reduce((s, x) => s + x, 0),
    activeDays: byDay.size,
    isCurrent: from <= td && yEnd >= td,
  };
}

SKELETON.stats = `<div class="yearnav"><button class="arrow" data-action="year" data-dir="-1" aria-label="Vorheriges Jahr">${ICON.left}</button><h2 id="yr"></h2><button class="arrow" data-action="year" data-dir="1" aria-label="Nächstes Jahr">${ICON.right}</button></div>
  <div id="st-sum"></div><div class="card heat-card" id="st-heat"></div><div id="st-usage"></div><div id="st-cost"></div><div id="st-plans"></div>`;

function updStats() {
  const Y = S.year,
    st = computeStats(Y),
    td = todayStr();
  setHeader('Statistik', `Jahr ${Y}`);
  setText($('#yr'), String(Y));
  setHTML(
    $('#st-sum'),
    `<div class="kpis"><div><b>${st.sessions}</b><span>Einheiten</span></div><div><b>${st.activeDays}</b><span>Aktive Tage</span></div><div><b>${eur(st.total)}</b><span>${st.isCurrent ? 'Kosten bisher' : 'Kosten'}</span></div></div>`,
  );

  const months = [...Array(12)]
    .map((_, m) => {
      const first = new Date(Y, m, 1),
        days = new Date(Y, m + 1, 0).getDate(),
        mn = fmt(first, { month: 'long' });
      let cells = '<i class="hm-pad"></i>'.repeat(wIdx(first));
      for (let d = 1; d <= days; d++) {
        const ds = `${Y}-${pad(m + 1)}-${pad(d)}`,
          c = st.byDay.get(ds) || 0;
        cells += `<button class="hm l${Math.min(c, 3)}${ds === td ? ' now' : ''}" data-action="heatday" data-date="${ds}" aria-label="${d}. ${mn}: ${c} ${c === 1 ? 'Einheit' : 'Einheiten'}"></button>`;
      }
      return `<div class="hm-month"><span>${fmt(first, { month: 'short' }).replace('.', '')}</span><div class="hm-grid">${cells}</div></div>`;
    })
    .join('');
  setHTML(
    $('#st-heat'),
    `<div class="heat">${months}</div><div class="hm-legend">Weniger<i class="hm"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i>Mehr</div>`,
  );

  const maxN = Math.max(1, ...st.usage.map((u) => u.n));
  setHTML(
    $('#st-usage'),
    `<div class="sect"><h3>Nutzung</h3></div>` +
      (st.usage.length
        ? `<div class="card pad">${st.usage.map((u) => `<button class="ubar" data-action="open" data-id="${esc(u.a.id)}"><span class="u-top"><b>${esc(u.a.name)}</b><span>${u.n}×${u.cost ? ', ' + eur(u.cost) + (u.n ? ` (${eur(u.cost / u.n)} pro Besuch)` : '') : ''}</span></span><span class="meter"><i style="width:${Math.max(2, (u.n / maxN) * 100)}%"></i></span></button>`).join('')}</div>`
        : `<p class="sub">Noch keine Besuche in ${Y}. Markiere Aktivitäten als erledigt oder trage Besuche in der Detailansicht nach.</p>`),
  );

  const g = st.groups[S.costBy],
    maxC = Math.max(0.01, ...g.map((x) => x[1]));
  const seg = `<div class="seg" role="tablist">${[
    ['provider', 'Anbieter'],
    ['category', 'Sportart'],
    ['tarif', 'Tarif'],
  ]
    .map(
      ([k, l]) =>
        `<button type="button" class="${S.costBy === k ? 'on' : ''}" data-action="costby" data-by="${k}">${l}</button>`,
    )
    .join('')}</div>`;
  const fc =
    st.isCurrent && st.forecast > st.total + 0.005
      ? `Voraussichtlich ${eur(st.forecast)} im ganzen Jahr`
      : st.isCurrent
        ? 'Bis heute'
        : `Gesamt ${Y}`;
  setHTML(
    $('#st-cost'),
    `<div class="sect"><h3>Kosten</h3></div>` +
      (st.total || st.forecast
        ? `<div class="card pad"><div class="costhead"><b>${eur(st.total)}</b><span>${fc}</span></div>${seg}${g.map(([k, v]) => `<div class="ubar"><span class="u-top"><b>${esc(k)}</b><span>${eur(v)}, ${Math.round((v / (st.total || 1)) * 100)} %</span></span><span class="meter"><i style="width:${Math.max(2, (v / maxC) * 100)}%"></i></span></div>`).join('')}</div>`
        : `<p class="sub">Noch keine Kosten für ${Y}. Lege unten einen Tarif an oder trage bei einer Aktivität einen Preis pro Besuch ein.</p>`),
  );

  const actName = (id) => (S.acts.find((a) => a.id === id) || {}).name;
  setHTML(
    $('#st-plans'),
    `<div class="sect"><h3>Tarife und Mitgliedschaften</h3>${S.plans.length ? '<button class="link" data-action="new-plan">Hinzufügen</button>' : ''}</div>` +
      (S.plans.length
        ? `<div class="list-card">${[...st.planStats]
            .sort((x, y) => x.p.name.localeCompare(y.p.name, 'de'))
            .map(({ p, total, visits, perVisit }) => {
              const links = (p.activities || []).map(actName).filter(Boolean);
              return `<button class="row prow" data-action="edit-plan" data-id="${esc(p.id)}"><span class="min"><h4>${esc(p.name)}</h4><p>${esc([planSummary(p), p.provider].filter(Boolean).join(', '))}</p>${links.length ? `<p>${esc(links.join(', '))}</p>` : ''}</span><span class="next"><b>${eur(total)}</b>${visits ? `${visits} ${visits === 1 ? 'Besuch' : 'Besuche'}` : ''}${perVisit ? `<br>${eur(perVisit)} pro Besuch` : ''}</span></button>`;
            })
            .join('')}</div>`
        : `<div class="empty"><h3>Noch keine Tarife</h3><p>Trage Mitgliedschaften, Abos und Mehrfachkarten ein, z. B. Urban Sports Club oder dein Gym.</p><button class="btn primary" data-action="new-plan">Tarif hinzufügen</button></div>`),
  );
}
UPD.stats = updStats;

/* ---------- tariff editor ---------- */
let pdraft = null,
  planDelArmed = false;
function openPlanEditor(p) {
  pdraft = p
    ? JSON.parse(JSON.stringify(p))
    : {
        id: newId(),
        name: '',
        provider: '',
        category: '',
        type: 'recurring',
        amount: '',
        every: 1,
        unit: 'month',
        visits: 10,
        start: todayStr(),
        end: '',
        activities: [],
        notes: '',
      };
  S.sheet = { type: 'plan', isNew: !p };
  planDelArmed = false;
  const uniq = (key) =>
    [
      ...new Set([...S.acts.map((x) => x[key]), ...S.plans.map((x) => x[key])].filter(Boolean)),
    ].sort((x, y) => x.localeCompare(y, 'de'));
  const v = (k) => esc(pdraft[k] ?? '');
  const opt = (val, label, cur) =>
    `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const acts = [...S.acts].sort((x, y) => x.name.localeCompare(y.name, 'de'));
  openSheet(
    `<div class="bar"><button class="btn ghost" data-action="close">Abbrechen</button><h2>${p ? 'Tarif bearbeiten' : 'Neuer Tarif'}</h2><button class="btn primary" data-action="save-plan">Speichern</button></div>
  <form class="form" id="planform" data-type="${esc(pdraft.type)}" novalidate>
    <fieldset><legend>Tarif</legend>
      <label class="f">Name<input name="name" value="${v('name')}" placeholder="z. B. Urban Sports Club M" autocomplete="off"></label>
      <div class="two"><label class="f">Anbieter<input name="provider" value="${v('provider')}" list="pprovs" autocomplete="off"></label><label class="f">Sportart<input name="category" value="${v('category')}" list="pcats" placeholder="optional" autocomplete="off"></label></div>
      <datalist id="pprovs">${uniq('provider')
        .map((c) => `<option value="${esc(c)}">`)
        .join('')}</datalist><datalist id="pcats">${uniq('category')
        .map((c) => `<option value="${esc(c)}">`)
        .join('')}</datalist>
      <p class="hint">Ohne Anbieter oder Sportart werden die Kosten nach deinen Besuchen auf die zugeordneten Aktivitäten verteilt.</p>
    </fieldset>
    <fieldset><legend>Zahlung</legend>
      <label class="f">Zahlungsart<select name="type" id="ptype">${Object.entries(PTYPES)
        .map(([k, l]) => opt(k, l, pdraft.type))
        .join('')}</select></label>
      <div class="two"><label class="f"><span id="amountlbl">${PLAN_AMOUNT_LABEL[pdraft.type]}</span><input name="amount" inputmode="decimal" value="${pdraft.amount === '' ? '' : esc(numF.format(pdraft.amount))}" placeholder="0,00" autocomplete="off"></label>
        <label class="f only-card">Anzahl Besuche<input name="visits" type="number" inputmode="numeric" min="1" value="${v('visits')}"></label>
        <label class="f only-recurring">Alle<input name="every" type="number" inputmode="numeric" min="1" value="${v('every')}"></label></div>
      <label class="f only-recurring">Intervall<select name="unit">${Object.entries(UNITS)
        .map(([k, l]) => opt(k, l[1], pdraft.unit))
        .join('')}</select></label>
      <div class="two only-dated"><label class="f"><span class="only-recurring">Erste Zahlung</span><span class="only-once">Zahlungsdatum</span><input type="date" name="start" value="${v('start')}"></label><label class="f only-recurring">Gekündigt zum<input type="date" name="end" value="${v('end')}"></label></div>
      <p class="hint only-recurring">„Gekündigt zum“ leer lassen, solange der Tarif läuft.</p>
      <p class="hint only-card">Jeder Besuch wird anteilig verbucht: Kartenpreis geteilt durch die Anzahl Besuche.</p>
    </fieldset>
    <fieldset><legend>Gilt für</legend>
      ${acts.length ? `<div class="checks">${acts.map((a) => `<label><input type="checkbox" name="acts" value="${esc(a.id)}"${(pdraft.activities || []).includes(a.id) ? ' checked' : ''}><span>${esc(a.name)}${a.provider ? `<small>${esc(a.provider)}</small>` : ''}</span></label>`).join('')}</div>` : '<p class="hint">Lege zuerst Aktivitäten an, um sie diesem Tarif zuzuordnen.</p>'}
      <p class="hint">Besuche dieser Aktivitäten werden dem Tarif zugerechnet, daraus ergeben sich die Kosten pro Besuch.</p>
    </fieldset>
    <fieldset><legend>Notizen</legend><label class="f">Notizen<textarea name="notes" rows="3">${v('notes')}</textarea></label></fieldset>
    <p class="err" id="perr" hidden></p>
    ${p ? '<div><button type="button" class="btn danger" data-action="del-plan">Tarif löschen</button></div>' : ''}
  </form>
  <div class="sheet-foot"><button class="btn" data-action="close">Abbrechen</button><button class="btn primary" data-action="save-plan">${p ? 'Änderungen speichern' : 'Tarif anlegen'}</button></div>`,
    true,
  );
}
async function savePlan() {
  const fd = new FormData($('#planform')),
    err = $('#perr');
  const fail = (m) => {
    err.textContent = m;
    err.hidden = false;
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const p = { ...pdraft };
  for (const k of ['name', 'provider', 'category', 'type', 'unit', 'start', 'end', 'notes'])
    p[k] = String(fd.get(k) || '').trim();
  p.amount = parseMoney(fd.get('amount'));
  p.every = Math.max(1, parseInt(fd.get('every'), 10) || 1);
  p.visits = Math.max(1, parseInt(fd.get('visits'), 10) || 1);
  p.activities = fd.getAll('acts');
  if (!p.name) return fail('Gib dem Tarif einen Namen.');
  if (!(p.amount >= 0)) return fail('Gib einen gültigen Betrag ein, z. B. 29,90.');
  if ((p.type === 'recurring' || p.type === 'once') && !p.start)
    return fail(
      p.type === 'once' ? 'Gib das Zahlungsdatum an.' : 'Gib das Datum der ersten Zahlung an.',
    );
  if (p.type === 'recurring' && p.end && p.end < p.start)
    return fail('Das Kündigungsdatum liegt vor der ersten Zahlung.');
  if (p.type !== 'recurring') p.end = '';
  p.updatedAt = Date.now();
  const isNew = S.sheet.isNew;
  try {
    await persistPlan(p);
    closeSheet();
    toast(isNew ? 'Tarif hinzugefügt' : 'Tarif gespeichert');
  } catch {
    fail('Speichern fehlgeschlagen. Prüfe deine Verbindung und versuche es erneut.');
  }
}
async function persistPlan(p) {
  const mn = await ready;
  await mn.kv.set(PLAN + p.id, p);
  S.plans = [...S.plans.filter((x) => x.id !== p.id), p];
  plansChanged();
}
async function removePlan(p) {
  const mn = await ready;
  await mn.kv.delete(PLAN + p.id);
  S.plans = S.plans.filter((x) => x.id !== p.id);
  plansChanged();
}

Object.assign(H, {
  year: (t) => {
    S.year += +t.dataset.dir;
    render();
  },
  heatday: (t) => {
    S.date = t.dataset.date;
    S.view = 'day';
    render();
    window.scrollTo(0, 0);
  },
  costby: (t) => {
    S.costBy = t.dataset.by;
    render();
  },
  'new-plan': () => openPlanEditor(null),
  'edit-plan': (t) => {
    const p = S.plans.find((x) => x.id === t.dataset.id);
    if (p) openPlanEditor(p);
  },
  'save-plan': () => savePlan(),
  'del-plan': async (t) => {
    if (!planDelArmed) {
      planDelArmed = true;
      t.textContent = 'Zum Löschen erneut tippen';
      setTimeout(() => {
        planDelArmed = false;
        if (t.isConnected) t.textContent = 'Tarif löschen';
      }, 3000);
      return;
    }
    const p = pdraft;
    closeSheet();
    try {
      await removePlan(p);
      toast('Tarif gelöscht');
    } catch {
      toast('Löschen fehlgeschlagen. Bitte erneut versuchen.');
    }
  },
  'add-visit': async () => {
    const a = S.acts.find((x) => x.id === S.sheet.id),
      d = $('#visitdate') && $('#visitdate').value;
    if (!a || !d) return;
    if (d > todayStr()) return toast('Besuche können nur bis heute eingetragen werden.');
    if ((a.done || []).includes(d))
      return toast('Für diesen Tag ist bereits ein Besuch eingetragen.');
    try {
      await persist({ ...a, done: [...(a.done || []), d].sort() });
      toast('Besuch eingetragen');
    } catch {
      toast('Eintragen fehlgeschlagen. Bitte erneut versuchen.');
    }
  },
  'del-visit': async (t) => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (!a) return;
    try {
      await persist({ ...a, done: (a.done || []).filter((x) => x !== t.dataset.d) });
      toast('Besuch entfernt');
    } catch {
      toast('Entfernen fehlgeschlagen. Bitte erneut versuchen.');
    }
  },
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'ptype') {
    $('#planform').dataset.type = e.target.value;
    setText($('#amountlbl'), PLAN_AMOUNT_LABEL[e.target.value]);
  }
});

/* ---------- backup: export / import ---------- */
const BK = { busy: false, msg: '' };
function updBackup() {
  const el = $('#backup');
  if (!el) return;
  const last = S.lastBackup;
  const age = last ? Math.floor((Date.now() - +last) / 864e5) : null;
  const lastTxt = !last
    ? 'Du hast noch nicht exportiert.'
    : age === 0
      ? 'Zuletzt heute exportiert.'
      : `Zuletzt exportiert am ${fmt(new Date(+last), { day: 'numeric', month: 'short', year: 'numeric' })}.`;
  const off = BK.busy || (!S.acts.length && !S.plans.length);
  setHTML(
    el,
    `<h3>Datensicherung</h3><p>${lastTxt} Beim Export werden alle Aktivitäten, Besuche, Tarife und Fotos in einer Datei gespeichert. Beim Import wird der Inhalt der Datei hinzugefügt und bereits Vorhandenes aktualisiert.</p>
    <div class="two"><button class="btn" data-action="export"${off ? ' disabled' : ''}>Exportieren</button><label class="btn filebtn${BK.busy ? ' off' : ''}">Importieren<input type="file" accept=".json,application/json" id="importfile"></label></div>
    <p class="status" role="status">${esc(BK.msg)}</p>`,
  );
}
function bkStatus(msg, busy) {
  BK.msg = msg;
  if (busy !== undefined) BK.busy = busy;
  updBackup();
}
const blobToDataURL = (b) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(b);
  });
function dataURLToBlob(du) {
  const [head, b64] = du.split(',');
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' });
}
/* store one image: full size and a thumbnail in mn.files; both are cached locally as blob: URLs */
async function storeImage(blob) {
  const img = await decode(blob);
  try {
    const mn = await ready,
      id = newId(),
      ref = `photos/${id}.jpg`,
      thumb = `photos/${id}-klein.jpg`;
    const [full, small] = [
      await scaleTo(img, 1600, 0.84, true),
      await scaleTo(img, 640, 0.8, true),
    ];
    await Promise.all([
      mn.files.upload(ref, full, { contentType: 'image/jpeg' }),
      mn.files.upload(thumb, small, { contentType: 'image/jpeg' }),
    ]);
    media.set(ref, URL.createObjectURL(full));
    media.set(thumb, URL.createObjectURL(small));
    return { ref, thumb };
  } finally {
    if (img.close) img.close();
  }
}
async function exportData() {
  if (BK.busy) return;
  bkStatus('Export wird vorbereitet …', true);
  try {
    const refs = [
      ...new Set(S.acts.flatMap((a) => (a.photos || []).filter((r) => !r.startsWith('data:')))),
    ];
    const photos = {};
    let missing = 0;
    for (let i = 0; i < refs.length; i++) {
      bkStatus(`Foto ${i + 1} von ${refs.length} wird verpackt …`);
      try {
        photos[refs[i]] = await blobToDataURL(await fetchBlob(refs[i]));
      } catch {
        missing++;
      }
    }
    const activities = S.acts.map(({ thumbs, ...rest }) => rest);
    const blob = new Blob(
      [
        JSON.stringify({
          app: 'sport-planner',
          version: 2,
          exportedAt: new Date().toISOString(),
          activities,
          plans: S.plans,
          photos,
        }),
      ],
      { type: 'application/json' },
    );
    const filename = `sportplaner-sicherung-${todayStr()}.json`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    S.lastBackup = Date.now();
    ready.then((mn) => mn.kv.set(LAST_BACKUP, S.lastBackup)).catch(() => {});
    bkStatus(
      missing
        ? `${activities.length} ${activities.length === 1 ? 'Aktivität' : 'Aktivitäten'} exportiert. ${missing} ${missing > 1 ? 'Fotos konnten' : 'Foto konnte'} nicht aufgenommen werden.`
        : `${activities.length} ${activities.length === 1 ? 'Aktivität' : 'Aktivitäten'} mit ${refs.length} ${refs.length === 1 ? 'Foto' : 'Fotos'} exportiert.`,
      false,
    );
  } catch (e) {
    bkStatus(
      e && e.code === 'declined'
        ? 'Export abgebrochen.'
        : e && e.code === 'rate_limited'
          ? 'Ein Speicherdialog ist bereits geöffnet.'
          : 'Die Sicherungsdatei konnte nicht erstellt werden. Bitte erneut versuchen.',
      false,
    );
  }
}
/* backups come from other devices or the original artifact: keep only well-formed dates, so a bad
   file can neither break the calendar nor inject markup */
function sanitizeAct(raw) {
  const period = (p) =>
    p && typeof p === 'object' && (p.type === 'yearly' || p.type === 'range')
      ? {
          type: p.type,
          from: String(p.from || ''),
          until: String(p.until || ''),
          label: String(p.label || ''),
        }
      : undefined;
  const pl = raw.planned && typeof raw.planned === 'object' ? raw.planned : { mode: 'none' };
  const slots = arr(raw.slots)
    .filter((s) => s && (s.kind === 'date' ? isDay(s.date) : Array.isArray(s.days)))
    .map((s) => {
      const o =
        s.kind === 'date'
          ? { kind: 'date', date: s.date }
          : { kind: 'weekly', days: s.days.map(Number).filter((d) => d >= 0 && d <= 6) };
      o.start = String(s.start || '');
      o.end = String(s.end || '');
      const per = s.kind === 'date' ? undefined : period(s.period);
      if (per) o.period = per;
      return o;
    });
  return {
    ...raw,
    slots,
    equipment: arr(raw.equipment).map(String),
    done: arr(raw.done).filter(isDay),
    photos: [],
    thumbs: {},
    season: period(raw.season) || { type: 'all' },
    planned: {
      ...pl,
      days: arr(pl.days)
        .map(Number)
        .filter((d) => d >= 0 && d <= 6),
      dates: arr(pl.dates).filter(isDay),
      skip: arr(pl.skip).filter(isDay),
      season: period(pl.season) || { type: 'all' },
    },
  };
}
async function importData(file) {
  if (BK.busy) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return bkStatus('Diese Datei ist keine Sportplaner-Sicherung.');
  }
  if (!data || data.app !== 'sport-planner' || !Array.isArray(data.activities))
    return bkStatus('Diese Datei ist keine Sportplaner-Sicherung.');
  bkStatus('Import läuft …', true);
  const photos = data.photos || {};
  const known = new Map(); // photo ids still stored in this artifact
  for (const a of S.acts) for (const r of a.photos || []) known.set(r, (a.thumbs || {})[r]);
  let count = 0,
    lost = 0,
    failed = 0;
  const list = data.activities.filter((a) => a && typeof a.id === 'string' && a.name);
  for (const raw of list) {
    bkStatus(`Import ${count + failed + 1} von ${list.length} …`);
    const a = sanitizeAct(raw);
    for (const r of raw.photos || []) {
      try {
        if (typeof r !== 'string') continue;
        if (known.has(r)) {
          a.photos.push(r);
          if (known.get(r)) a.thumbs[r] = known.get(r);
          continue;
        }
        const du = r.startsWith('data:') ? r : photos[r];
        if (!du) {
          lost++;
          continue;
        }
        const st = await storeImage(dataURLToBlob(du));
        a.photos.push(st.ref);
        if (st.thumb) a.thumbs[st.ref] = st.thumb;
      } catch {
        lost++;
      }
    }
    try {
      await persist(a);
      count++;
    } catch {
      failed++;
    }
  }
  let pcount = 0;
  for (const p of Array.isArray(data.plans) ? data.plans : []) {
    if (!p || typeof p.id !== 'string' || !p.name) continue;
    try {
      await persistPlan({
        ...p,
        activities: arr(p.activities).filter((x) => typeof x === 'string'),
        start: isDay(p.start) ? p.start : '',
        end: isDay(p.end) ? p.end : '',
      });
      pcount++;
    } catch {
      failed++;
    }
  }
  bkStatus(
    `${count} ${count === 1 ? 'Aktivität' : 'Aktivitäten'}${pcount ? ` und ${pcount} ${pcount === 1 ? 'Tarif' : 'Tarife'}` : ''} importiert.` +
      (lost
        ? ` ${lost} ${lost > 1 ? 'Fotos konnten' : 'Foto konnte'} nicht wiederhergestellt werden.`
        : '') +
      (failed ? ` ${failed} konnten nicht gespeichert werden.` : ''),
    false,
  );
}
H.export = () => exportData();
document.addEventListener('change', (e) => {
  if (e.target.id === 'importfile' && e.target.files[0]) {
    const f = e.target.files[0];
    e.target.value = '';
    importData(f);
  }
});

/* ---------- boot ---------- */
S.lastBackup = null;
buildIndex();
render();
let loading = null;
function load() {
  loading ??= (async () => {
    try {
      const mn = await ready;
      const [acts, plans, last] = await Promise.all([
        mn.kv.list(ACT),
        mn.kv.list(PLAN),
        mn.kv.get(LAST_BACKUP),
      ]);
      S.acts = acts
        .filter((x) => x.value && typeof x.value === 'object')
        .map((x) => ({ ...x.value, id: x.key.slice(ACT.length) }));
      S.plans = plans
        .filter((x) => x.value && typeof x.value === 'object')
        .map((x) => ({ ...x.value, id: x.key.slice(PLAN.length) }));
      S.lastBackup = typeof last === 'number' ? last : null;
      dataChanged();
      plansChanged();
    } catch {
      toast('Deine Daten konnten nicht geladen werden. Lade die Seite neu.');
    } finally {
      S.loading = false;
      loading = null;
      scheduleRender();
    }
  })();
  return loading;
}
load();
// Other devices may have changed something while this tab was in the background.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    nextCache = null;
    if (!S.sheet || S.sheet.type === 'detail') load();
  }
});
