// Haushalt: household book with monthly budgets, bank CSV import, standing orders and the
// automatic transfer of tax-relevant bookings into the forms of the income tax return.
// Storage is private mn.kv: settings, one key per booking (tx:<date>:<id>), per standing order
// (rec:<id>) and per tax year (profile:<year>). Receipts are files in mn.files (belege/...).
import { analyse, toCsv as csv, hash, parseAmount, toBookings } from './csv.js';
import {
  amountFor,
  cleanBooking,
  cleanProfile,
  cleanRecurring,
  cleanSettings,
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  dueRecurring,
  FIXED_TYPES,
  isDay,
  KINDS,
  matchRule,
} from './data.js';
import {
  calendarPayments,
  deviations,
  dueIn,
  status as fixedStatus,
  matchFixed,
  monthly,
  monthMoney,
  nextDue,
} from './plan.js';
import { parseStatement, readPdf } from './statement.js';
import { buildReturn, euro, FIELDS, FORMS } from './tax.js';

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const newId = () => crypto.randomUUID();
const monthName = (ym) =>
  new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(
    new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1),
  );
const shortMonth = (m) =>
  new Intl.DateTimeFormat('de-DE', { month: 'short' })
    .format(new Date(2000, m, 1))
    .replace('.', '');
const dayLabel = (ds) =>
  new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long' }).format(
    new Date(Number(ds.slice(0, 4)), Number(ds.slice(5, 7)) - 1, Number(ds.slice(8, 10))),
  );
const shiftMonth = (ym, n) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
/** Cents → "1234,56" for inputs and for pasting into ELSTER. */
const plain = (cents) =>
  (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, useGrouping: false });

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
  search: 'M16 16l4 4M11 17.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13z',
  list: 'M4 5.5h16M4 12h16M4 18.5h10',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v4h14v-4',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  clip: 'M8 12.5l5.5-5.5a2.5 2.5 0 013.5 3.5l-7 7a4 4 0 01-5.7-5.7L11 5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert:
    'M12 8v5M12 16.5v.5M10.3 4.2L3.2 17a2 2 0 001.7 3h14.2a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z',
  gear: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',
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

// ---------- state ----------
const S = {
  tab: 'overview',
  month: today().slice(0, 7),
  year: Number(today().slice(0, 4)),
  settings: { categories: [], rules: [] },
  tx: new Map(), // kv key → booking
  years: new Set(), // years loaded into tx
  recs: new Map(),
  profiles: new Map(),
  q: '',
  cat: '',
  plan: 'fixed', // Planung: 'fixed' (Fixkosten) or 'budget'
  loading: true,
};
// Handlers work right away; the SDK and the login check run in the background.
const ready = (async () => {
  const client = await window.mininode.mininode();
  await client.auth.requireLogin();
  return client;
})();
const keyOf = (b) => `tx:${b.date}:${b.id}`;
const cats = () => S.settings.categories;
const catById = (id) => cats().find((c) => c.id === id);
const catName = (id) => catById(id)?.name ?? (id ? 'Gelöschte Kategorie' : 'Ohne Kategorie');
function taxFieldOf(b) {
  if (b.taxField === 'none') return '';
  return b.taxField || catById(b.cat)?.tax || '';
}
const bookings = () => [...S.tx.values()];
const inMonth = (ym) => bookings().filter((b) => b.date.startsWith(ym));
const sum = (list, kind) => list.filter((b) => b.kind === kind).reduce((s, b) => s + b.cents, 0);

async function ensureYear(year) {
  if (S.years.has(year)) return;
  const mn = await ready;
  const rows = await mn.kv.list(`tx:${year}-`);
  for (const { key, value } of rows) {
    const b = cleanBooking(value, FIELDS);
    if (b) S.tx.set(key, b);
  }
  S.years.add(year);
}
// Bumped on every write; a background refresh that overlaps a write is thrown away.
let writes = 0;
async function saveBooking(b, oldKey) {
  writes++;
  const mn = await ready;
  const key = keyOf(b);
  await mn.kv.set(key, b);
  S.tx.set(key, b);
  if (oldKey && oldKey !== key) {
    await mn.kv.delete(oldKey);
    S.tx.delete(oldKey);
  }
}
async function deleteBooking(key) {
  writes++;
  const mn = await ready;
  const b = S.tx.get(key);
  await mn.kv.delete(key);
  S.tx.delete(key);
  if (b?.receipt) mn.files.remove(b.receipt).catch(() => {});
}
async function saveSettings() {
  const mn = await ready;
  await mn.kv.set('settings', S.settings);
}
async function saveProfile(year, profile) {
  const mn = await ready;
  await mn.kv.set(`profile:${year}`, profile);
  S.profiles.set(year, profile);
}
async function ensureProfile(year) {
  if (S.profiles.has(year)) return;
  const mn = await ready;
  S.profiles.set(year, cleanProfile(await mn.kv.get(`profile:${year}`)));
}

/** Books what standing orders owe up to today. Ids are deterministic, so a second device or a
 * second run writes the same keys instead of duplicates. */
async function runRecurring() {
  const mn = await ready;
  const t = today();
  let added = 0;
  for (const rec of S.recs.values()) {
    const due = dueRecurring(rec, t);
    if (!due.length) continue;
    for (const { month, booking } of due) {
      const key = keyOf(booking);
      // paid through the bank (imported and recognised): not booked a second time
      if (paidByBank(rec.id, month)) continue;
      if (!S.tx.has(key)) {
        await mn.kv.set(key, booking);
        S.tx.set(key, booking);
        added++;
      }
    }
    const next = { ...rec, until: due[due.length - 1].month };
    await mn.kv.set(`rec:${rec.id}`, next);
    S.recs.set(rec.id, next);
  }
  if (added) toast(`${added} ${added === 1 ? 'Fixkosten-Zahlung' : 'Fixkosten-Zahlungen'} gebucht`);
}

// ---------- Kalender (ADR 0002) ----------
// The coming payments of fixed costs are shared `contract` records, so they show in the
// Kalender. Without the admin's approval the database refuses and the app goes on without it.
let calendarTimer = null;
let calendarOff = false;
const sameValue = (a, b) => (a ?? null) === (b ?? null);
async function syncCalendar() {
  if (calendarOff) return;
  try {
    const mn = await ready;
    const contract = mn.suite.type('contract');
    const mine = (await contract.list({ limit: 5000 })).filter((r) => r.source_app === 'haushalt');
    const wanted = calendarPayments(recList(), today(), (id) => (id ? catName(id) : ''));
    const byKey = new Map(mine.map((r) => [r.source_key, r]));
    const jobs = [];
    for (const [key, f] of wanted) {
      const r = byKey.get(key);
      const unchanged =
        r &&
        sameValue(r.title, f.title) &&
        new Date(r.due_at).getTime() === new Date(f.due_at).getTime() &&
        sameValue(r.amount_cents, f.amount_cents) &&
        Object.entries(f.data).every(([k, v]) => sameValue(r.data?.[k], v));
      if (!unchanged) jobs.push(() => contract.upsert(f, { sourceKey: key }));
    }
    // ended or deleted fixed costs leave the Kalender from this month on; paid months stay
    const month = today().slice(0, 7);
    for (const r of mine)
      if (!wanted.has(r.source_key) && (r.source_key ?? '').split('#')[1] >= month)
        jobs.push(() => contract.delete(r.id));
    const queue = [...jobs];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await job();
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  } catch (err) {
    if (err?.code === '42501') calendarOff = true;
  }
}
/** After a change to the fixed costs: sync a few seconds later (changes in a row count once). */
function calendarSoon(delay = 3000) {
  clearTimeout(calendarTimer);
  calendarTimer = setTimeout(() => void syncCalendar(), delay);
}

const paidByBank = (recId, month) =>
  bookings().some((b) => b.rec === recId && b.source !== 'rec' && b.date.startsWith(month));

async function load() {
  try {
    const mn = await ready;
    const [settings, recs] = await Promise.all([mn.kv.get('settings'), mn.kv.list('rec:')]);
    if (settings) S.settings = cleanSettings(settings, FIELDS);
    else {
      S.settings = { categories: DEFAULT_CATEGORIES, rules: DEFAULT_RULES };
      await saveSettings();
    }
    S.recs = new Map(
      recs
        .map((r) => cleanRecurring(r.value))
        .filter(Boolean)
        .map((r) => [r.id, r]),
    );
    const year = Number(today().slice(0, 4));
    // Standing orders may reach back into last year; the tax view usually wants it too.
    await Promise.all([ensureYear(year), ensureYear(year - 1), ensureProfile(S.year)]);
    await runRecurring();
    calendarSoon(5000);
  } catch {
    toast('Deine Daten konnten nicht geladen werden. Lade die Seite neu.');
  } finally {
    S.loading = false;
    render();
  }
}

// ---------- shared view parts ----------
/** A month or year stepper for the header tools. */
function stepper(label, value, prev, next, onChange) {
  return h(
    'div',
    { class: 'mn-stepper', role: 'group', 'aria-label': label },
    h(
      'button',
      { type: 'button', class: 'mn-icon-btn', 'aria-label': prev, onclick: () => onChange(-1) },
      icon('left'),
    ),
    h('b', {}, value),
    h(
      'button',
      { type: 'button', class: 'mn-icon-btn', 'aria-label': next, onclick: () => onChange(1) },
      icon('right'),
    ),
  );
}
const monthStepper = () =>
  stepper('Monat', monthName(S.month), 'Vorheriger Monat', 'Nächster Monat', changeMonth);
async function changeMonth(n) {
  S.month = shiftMonth(S.month, n);
  await ensureYear(Number(S.month.slice(0, 4))).catch(() => toast('Laden fehlgeschlagen.'));
  render();
}
function meter(value, max, over) {
  const pct = max > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0;
  const bar = h('i', {});
  bar.style.setProperty('--mn-value', String(pct));
  return h('span', { class: `mn-meter${over ? ' over' : ''}`, 'aria-hidden': 'true' }, bar);
}
function kpi(label, value, cls) {
  return h('div', { class: 'mn-kpi' }, h('b', { class: cls }, value), h('span', {}, label));
}
function sect(title, ...extra) {
  return h('div', { class: 'mn-sect' }, h('h2', {}, title), ...extra);
}
function empty(title, text, ...actions) {
  return h(
    'div',
    { class: 'mn-empty' },
    h('div', { class: 'mn-empty-icon' }, icon('list')),
    h('h3', {}, title),
    h('p', {}, text),
    actions.length ? h('div', { class: 'actions' }, actions) : null,
  );
}
function signed(b) {
  if (b.kind === 'income') return `+${euro(b.cents)}`;
  if (b.kind === 'transfer') return euro(b.cents);
  return `−${euro(b.cents)}`;
}
/** One "label … value" row with a meter below, as in the kit's bar list. */
function barRow(label, value, meterEl, extra) {
  return h(
    'div',
    { class: 'mn-bar' },
    h('span', { class: 'mn-bar-top' }, h('b', {}, label), h('span', {}, value)),
    meterEl,
    extra,
  );
}

// ---------- Übersicht ----------
function viewOverview() {
  const list = inMonth(S.month);
  const income = sum(list, 'income');
  const expense = sum(list, 'expense');
  const saldo = income - expense;
  const byCat = new Map();
  for (const b of list.filter((x) => x.kind === 'expense'))
    byCat.set(b.cat, (byCat.get(b.cat) ?? 0) + b.cents);
  const top = [...byCat].sort((a, b) => b[1] - a[1]);
  const budgeted = cats().filter((c) => c.kind === 'expense' && c.budget > 0);
  const budget = budgeted.reduce((s, c) => s + c.budget, 0);
  const spentInBudget = budgeted.reduce((s, c) => s + (byCat.get(c.id) ?? 0), 0);
  const overCats = budgeted.filter((c) => (byCat.get(c.id) ?? 0) > c.budget);

  const year = S.month.slice(0, 4);
  const months = [...Array(12)].map((_, m) => {
    const ym = `${year}-${pad(m + 1)}`;
    const l = inMonth(ym);
    return { m, ym, income: sum(l, 'income'), expense: sum(l, 'expense') };
  });
  const maxBar = Math.max(1, ...months.flatMap((x) => [x.income, x.expense]));
  const taxYear = bookings().filter((b) => b.date.startsWith(`${year}-`) && taxFieldOf(b));
  const taxSum = taxYear.reduce(
    (s, b) => s + (b.kind === 'income' ? -1 : 1) * (b.taxCents ?? b.cents),
    0,
  );

  const devs = recList()
    .flatMap((r) => deviations(r, list).map((d) => ({ ...d, rec: r })))
    .filter((d) => d.booking.date.startsWith(S.month));
  const devBanner = devs.length
    ? h(
        'div',
        { class: 'mn-banner mn-banner--warn', role: 'note' },
        `${devs.length === 1 ? 'Eine Fixkosten-Zahlung weicht' : `${devs.length} Fixkosten-Zahlungen weichen`} diesen Monat vom Plan ab: `,
        devs
          .map(
            (d) =>
              `${d.rec.text || catName(d.rec.cat)} ${euro(d.booking.cents)} statt ${euro(d.expected)}`,
          )
          .join(', '),
        '. ',
        h(
          'button',
          {
            type: 'button',
            class: 'mn-link',
            onclick: () => {
              S.plan = 'fixed';
              go('plan');
            },
          },
          'Ansehen',
        ),
      )
    : null;

  if (list.length === 0)
    return [
      moneyCard(),
      empty(
        'Noch keine Buchungen in diesem Monat',
        'Trage Ausgaben und Einnahmen ein oder importiere den Kontoauszug deiner Bank als CSV.',
        h(
          'button',
          { class: 'mn-btn mn-btn--primary', onclick: () => editBooking(null) },
          'Buchung hinzufügen',
        ),
        h('button', { class: 'mn-btn', onclick: () => openImport() }, 'Kontoauszug importieren'),
      ),
    ];

  const chart = h(
    'div',
    { class: 'mn-card' },
    h(
      'div',
      { class: 'chart', role: 'img', 'aria-label': `Einnahmen und Ausgaben je Monat ${year}` },
      months.map((x) => {
        const col = (v, cls) => {
          const bar = h('i', { class: cls });
          bar.style.height = `${(v / maxBar) * 100}%`;
          return bar;
        };
        return h(
          'button',
          {
            type: 'button',
            class: `col${x.ym === S.month ? ' sel' : ''}`,
            'aria-label': `${monthName(x.ym)}: Einnahmen ${euro(x.income)}, Ausgaben ${euro(x.expense)}`,
            'aria-pressed': String(x.ym === S.month),
            onclick: () => {
              S.month = x.ym;
              render();
            },
          },
          h('span', { class: 'pair' }, col(x.income, 'in'), col(x.expense, 'out')),
          h('small', {}, shortMonth(x.m)),
        );
      }),
    ),
    h(
      'p',
      { class: 'legend' },
      h(
        'span',
        {},
        h('i', { class: 'in' }),
        `Einnahmen ${euro(months.reduce((s, x) => s + x.income, 0))}`,
      ),
      h(
        'span',
        {},
        h('i', { class: 'out' }),
        `Ausgaben ${euro(months.reduce((s, x) => s + x.expense, 0))}`,
      ),
    ),
  );

  return [
    moneyCard(),
    devBanner,
    h(
      'div',
      { class: 'mn-kpis' },
      kpi('Einnahmen', euro(income), 'pos'),
      kpi('Ausgaben', euro(expense)),
      kpi(
        saldo >= 0 ? 'Überschuss' : 'Fehlbetrag',
        euro(Math.abs(saldo)),
        saldo >= 0 ? 'pos' : 'neg',
      ),
      kpi('Sparquote', income > 0 ? `${Math.round((saldo / income) * 100)} %` : '–'),
    ),
    h(
      'div',
      { class: 'mn-cols' },
      h(
        'div',
        {},
        budget > 0
          ? [
              sect(
                'Budget',
                h(
                  'button',
                  {
                    class: 'mn-link',
                    onclick: () => {
                      S.plan = 'budget';
                      go('plan');
                    },
                  },
                  'Details',
                ),
              ),
              h(
                'div',
                { class: 'mn-list' },
                barRow(
                  `${euro(spentInBudget)} von ${euro(budget)}`,
                  spentInBudget > budget
                    ? `${euro(spentInBudget - budget)} drüber`
                    : `${euro(budget - spentInBudget)} übrig`,
                  meter(spentInBudget, budget, spentInBudget > budget),
                  overCats.length
                    ? h(
                        'span',
                        { class: 'mn-chip mn-chip--bad over-note' },
                        `Überschritten: ${overCats.map((c) => c.name).join(', ')}`,
                      )
                    : null,
                ),
              ),
            ]
          : null,
        top.length
          ? [
              sect('Ausgaben nach Kategorie'),
              h(
                'div',
                { class: 'mn-list' },
                top.map(([cat, cents]) =>
                  barRow(
                    catName(cat),
                    `${euro(cents)}, ${Math.round((cents / expense) * 100)} %`,
                    meter(cents, top[0][1]),
                  ),
                ),
              ),
            ]
          : null,
      ),
      h(
        'div',
        {},
        sect(`Jahr ${year}`),
        chart,
        sect(
          'Steuerlich relevant',
          h(
            'button',
            {
              class: 'mn-link',
              onclick: () => {
                S.year = Number(year);
                go('tax');
              },
            },
            'Zur Steuer',
          ),
        ),
        h(
          'div',
          { class: 'mn-card' },
          taxYear.length
            ? [
                h('span', { class: 'mn-big' }, euro(taxSum)),
                h(
                  'p',
                  { class: 'mn-note' },
                  `${taxYear.length} ${taxYear.length === 1 ? 'Buchung fließt' : 'Buchungen fließen'} ${year} automatisch in die Steuererklärung.`,
                ),
              ]
            : h(
                'p',
                { class: 'mn-note' },
                `Noch keine steuerlich relevanten Buchungen in ${year}. Kategorien wie Handwerker, Spenden oder Arbeitsmittel werden automatisch übernommen.`,
              ),
        ),
      ),
    ),
  ];
}

// ---------- Planung: Fixkosten und Budgets ----------
const EVERY = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };
const recList = () => [...S.recs.values()];

/** Adopts a different payment as the new amount from its month on. */
async function adoptAmount(rec, booking) {
  const from = booking.date.slice(0, 7);
  const next = cleanRecurring({
    ...rec,
    changes: [...rec.changes.filter((c) => c.from < from), { from, cents: booking.cents }],
  });
  const mn = await ready;
  await mn.kv.set(`rec:${next.id}`, next);
  S.recs.set(next.id, next);
  calendarSoon();
  toast(`${next.text || 'Fixkosten'}: ${euro(booking.cents)} ab ${monthName(from)}`);
  render();
}

function fixedRow(rec) {
  const t = today();
  const month = S.month;
  const st = fixedStatus(rec, month);
  const due = nextDue(rec, t);
  const amount = amountFor(rec, month);
  const dev = deviations(rec, bookings())[0];
  const parts = [`${euro(amount)} ${EVERY[rec.every]}`];
  if (st === 'ended') parts.push(`beendet ${monthName(rec.end)}`);
  else if (rec.end) parts.push(`letzte Zahlung ${monthName(rec.end)}`);
  else if (due) parts.push(`nächste am ${dayLabel(due)}`);
  if (st === 'upcoming') parts.push(`ab ${monthName(rec.start)}`);
  return h(
    'div',
    { class: 'fixed-row' },
    h(
      'button',
      { type: 'button', class: 'mn-row', onclick: () => editRecurring(rec.id) },
      h(
        'span',
        {},
        h('span', { class: 'mn-row-title' }, rec.text || catName(rec.cat)),
        h('span', { class: 'mn-row-sub' }, parts.join(' · ')),
      ),
      h(
        'span',
        { class: 'mn-row-side' },
        h('b', {}, `${rec.kind === 'income' ? '+' : ''}${euro(monthly(rec, month))}`),
        'pro Monat',
      ),
    ),
    st === 'ending'
      ? h('span', { class: 'mn-chip mn-chip--warn fixed-chip' }, 'Endet diesen Monat')
      : null,
    dev
      ? h(
          'div',
          { class: 'fixed-dev', role: 'note' },
          h(
            'span',
            {
              class: `mn-chip ${dev.booking.cents > dev.expected ? 'mn-chip--bad' : 'mn-chip--ok'}`,
            },
            `${dayLabel(dev.booking.date)}: ${euro(dev.booking.cents)} statt ${euro(dev.expected)} (${dev.booking.cents > dev.expected ? '+' : '−'}${euro(Math.abs(dev.booking.cents - dev.expected))})`,
          ),
          h(
            'button',
            { type: 'button', class: 'mn-link', onclick: () => void adoptAmount(rec, dev.booking) },
            'Als neuen Betrag übernehmen',
          ),
        )
      : null,
  );
}

function viewFixed() {
  const month = S.month;
  const all = recList();
  const live = all.filter((r) => fixedStatus(r, month) !== 'ended');
  const ended = all.filter((r) => fixedStatus(r, month) === 'ended');
  const out = live.filter((r) => r.kind !== 'income');
  const inc = live.filter((r) => r.kind === 'income');
  const costs = out.reduce((s, r) => s + monthly(r, month), 0);
  const income = inc.reduce((s, r) => s + monthly(r, month), 0);
  if (!all.length)
    return [
      empty(
        'Noch keine Fixkosten',
        'Miete, Abos, Versicherungen, Rücklagen oder Spenden: trag ein, was regelmäßig abgeht (und dein Gehalt). Sie werden automatisch gebucht oder beim Kontoimport erkannt.',
        h(
          'button',
          { class: 'mn-btn mn-btn--primary', onclick: () => editRecurring(null) },
          'Fixkosten hinzufügen',
        ),
      ),
    ];
  const groups = Object.entries(FIXED_TYPES)
    .map(([type, label]) => [label, live.filter((r) => r.type === type)])
    .filter(([, list]) => list.length);
  return [
    h(
      'div',
      { class: 'mn-kpis' },
      kpi('Fixkosten pro Monat', euro(costs)),
      kpi('Regelmäßige Einnahmen', euro(income), 'pos'),
      kpi(
        income - costs >= 0 ? 'Bleibt pro Monat' : 'Fehlt pro Monat',
        euro(Math.abs(income - costs)),
        income - costs >= 0 ? 'pos' : 'neg',
      ),
      kpi('Pro Jahr', euro(costs * 12)),
    ),
    h(
      'p',
      { class: 'mn-note' },
      'Jährliche und vierteljährliche Beträge zählen anteilig pro Monat. Gebucht wird am Fälligkeitstag, beim Kontoimport erkannte Zahlungen ersetzen die automatische Buchung.',
    ),
    groups.map(([label, list]) => [
      sect(
        label,
        h('small', { class: 'mn-muted' }, euro(list.reduce((s, r) => s + monthly(r, month), 0))),
      ),
      h('div', { class: 'mn-list' }, list.map(fixedRow)),
    ]),
    ended.length
      ? h(
          'details',
          { class: 'mn-more fixed-ended' },
          h('summary', {}, `Beendet (${ended.length})`),
          h('div', { class: 'mn-list' }, ended.map(fixedRow)),
        )
      : null,
    h(
      'button',
      { type: 'button', class: 'mn-btn fixed-add', onclick: () => editRecurring(null) },
      icon('plus'),
      'Fixkosten hinzufügen',
    ),
  ];
}

function viewPlan() {
  const seg = h(
    'div',
    { class: 'mn-seg plan-seg', role: 'group', 'aria-label': 'Planung' },
    [
      ['fixed', 'Fixkosten'],
      ['budget', 'Budgets'],
    ].map(([id, label]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': S.plan === id ? 'true' : 'false',
          onclick: () => {
            S.plan = id;
            render();
          },
        },
        label,
      ),
    ),
  );
  return [seg, S.plan === 'budget' ? viewBudget() : viewFixed()];
}

// ---------- Übersicht: der Monatsbalken ----------
function moneyCard() {
  const month = S.month;
  const now = today();
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const current = now.startsWith(month);
  const day = current ? Number(now.slice(8, 10)) : month < now.slice(0, 7) ? days : 0;
  const budgets = cats()
    .filter((c) => c.kind === 'expense' && c.budget > 0)
    .reduce((s, c) => s + c.budget, 0);
  const m = monthMoney({ month, bookings: bookings(), recs: recList(), day, days, budgets });
  if (m.basis === 'none')
    return h(
      'div',
      { class: 'mn-card money' },
      h('h2', { class: 'money-title' }, 'Dein Monat'),
      h(
        'p',
        { class: 'mn-note' },
        'Trag unter Planung dein Gehalt und deine Fixkosten ein (oder Budgets), dann zeigt dir dieser Balken jeden Tag, ob du mit dem Geld auskommst.',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'mn-btn',
          onclick: () => {
            S.plan = 'fixed';
            go('plan');
          },
        },
        'Zur Planung',
      ),
    );
  const over = m.spent > m.available;
  const behind = m.ahead < 0;
  const state = over ? 'bad' : behind ? 'warn' : 'ok';
  const chip = over
    ? `${euro(m.spent - m.available)} über dem Monat`
    : !current
      ? day === days
        ? `${euro(m.left)} übrig`
        : 'Geplant'
      : behind
        ? `${euro(-m.ahead)} über Plan`
        : `${euro(m.ahead)} unter Plan`;
  const bar = h('span', { class: `money-fill money-${state}` });
  bar.style.transform = `scaleX(${m.available > 0 ? Math.min(1, m.spent / m.available) : 1})`;
  const mark = h('span', { class: 'money-mark', 'aria-hidden': 'true' });
  mark.style.left = `${m.available > 0 ? Math.min(100, (m.pace / m.available) * 100) : 0}%`;
  const headline = current
    ? over
      ? 'Das Geld für diesen Monat ist ausgegeben'
      : `Heute noch ${euro(m.perDay ?? 0)} frei`
    : day === days
      ? over
        ? 'Mehr ausgegeben als verfügbar'
        : 'Mit dem Geld ausgekommen'
      : `${euro(m.available)} verfügbar`;
  return h(
    'section',
    { class: 'mn-card money', 'aria-label': 'Dein Monat' },
    h(
      'div',
      { class: 'money-head' },
      h('h2', { class: 'money-title' }, 'Dein Monat'),
      h(
        'span',
        { class: `mn-chip mn-chip--${state}` },
        icon(state === 'ok' ? 'check' : 'alert'),
        chip,
      ),
    ),
    h('p', { class: 'money-big' }, headline),
    current && !over
      ? h(
          'p',
          { class: 'mn-note' },
          `${euro(Math.max(0, m.left))} ${days - day === 0 ? 'für heute, den letzten Tag' : `für heute und die ${days - day} Tage danach`}. Bis heute wären ${euro(m.pace)} im Plan, ausgegeben hast du ${euro(m.spent)}.`,
        )
      : null,
    h(
      'div',
      {
        class: 'money-track',
        role: 'meter',
        'aria-label': 'Ausgegeben vom frei verfügbaren Geld',
        'aria-valuemin': '0',
        'aria-valuemax': String(Math.max(0, m.available) / 100),
        'aria-valuenow': String(m.spent / 100),
        'aria-valuetext': `${euro(m.spent)} von ${euro(m.available)}${current ? `, Plan bis heute ${euro(m.pace)}` : ''}`,
      },
      bar,
      current ? mark : null,
    ),
    h(
      'div',
      { class: 'money-scale' },
      h('span', {}, `Ausgegeben ${euro(m.spent)}`),
      h('span', {}, `Frei im Monat ${euro(m.available)}`),
    ),
    h(
      'dl',
      { class: 'mn-facts money-facts' },
      h(
        'div',
        {},
        h('dt', {}, m.basis === 'income' ? 'Einnahmen' : 'Budgets'),
        h('dd', {}, euro(m.basis === 'income' ? m.income : budgets)),
      ),
      m.basis === 'income'
        ? h('div', {}, h('dt', {}, 'Fixkosten und Rücklagen'), h('dd', {}, `−${euro(m.fixed)}`))
        : null,
    ),
  );
}

// ---------- Statistik ----------
function viewStats() {
  const year = String(S.year);
  const prevYear = String(S.year - 1);
  const inYear = (y) => bookings().filter((b) => b.date.startsWith(`${y}-`));
  const list = inYear(year);
  if (!list.length)
    return [
      empty(
        `Noch keine Buchungen in ${year}`,
        'Sobald Buchungen da sind, zeigt die Statistik Einnahmen, Ausgaben, Fixkosten und Kategorien im Jahresverlauf.',
      ),
    ];
  const months = [...Array(12)].map((_, m) => {
    const ym = `${year}-${pad(m + 1)}`;
    const l = list.filter((b) => b.date.startsWith(ym));
    const exp = l.filter((b) => b.kind === 'expense');
    const fixed = exp.filter((b) => b.rec).reduce((s, b) => s + b.cents, 0);
    return {
      m,
      ym,
      income: sum(l, 'income'),
      fixed,
      variable: exp.reduce((s, b) => s + b.cents, 0) - fixed,
      saved: sum(l, 'transfer'),
      any: l.length > 0,
    };
  });
  const active = months.filter((x) => x.any);
  const n = Math.max(1, active.length);
  const income = months.reduce((s, x) => s + x.income, 0);
  const expense = months.reduce((s, x) => s + x.fixed + x.variable, 0);
  const fixedSum = months.reduce((s, x) => s + x.fixed, 0);
  const max = Math.max(1, ...months.flatMap((x) => [x.income, x.fixed + x.variable]));

  // Einnahmen und Ausgaben (fix und variabel) je Monat: one axis, a stacked expense bar
  const chart = h(
    'div',
    { class: 'mn-card' },
    h(
      'div',
      {
        class: 'chart stats-chart',
        role: 'group',
        'aria-label': `Einnahmen und Ausgaben je Monat ${year}`,
      },
      months.map((x) => {
        const seg = (v, cls) => {
          const el = h('i', { class: cls });
          el.style.height = `${(v / max) * 100}%`;
          return el;
        };
        const label = `${monthName(x.ym)}: Einnahmen ${euro(x.income)}, Fixkosten ${euro(x.fixed)}, sonstige Ausgaben ${euro(x.variable)}`;
        return h(
          'button',
          {
            type: 'button',
            class: `col${x.ym === S.month ? ' sel' : ''}`,
            'aria-label': label,
            title: label,
            onclick: () => {
              S.month = x.ym;
              go('overview');
            },
          },
          h(
            'span',
            { class: 'pair' },
            seg(x.income, 's1'),
            h('span', { class: 'stack' }, seg(x.variable, 's3'), seg(x.fixed, 's2')),
          ),
          h('small', {}, shortMonth(x.m)),
        );
      }),
    ),
    h(
      'p',
      { class: 'legend' },
      h('span', {}, h('i', { class: 's1' }), `Einnahmen ${euro(income)}`),
      h('span', {}, h('i', { class: 's2' }), `Fixkosten ${euro(fixedSum)}`),
      h('span', {}, h('i', { class: 's3' }), `Sonstige Ausgaben ${euro(expense - fixedSum)}`),
    ),
    h(
      'details',
      { class: 'mn-more' },
      h('summary', {}, 'Als Tabelle'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'stats-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ['Monat', 'Einnahmen', 'Fixkosten', 'Sonstige', 'Gespart', 'Saldo'].map((t) =>
                h('th', { scope: 'col' }, t),
              ),
            ),
          ),
          h(
            'tbody',
            {},
            months.map((x) =>
              h(
                'tr',
                {},
                h('th', { scope: 'row' }, monthName(x.ym)),
                [x.income, x.fixed, x.variable, x.saved, x.income - x.fixed - x.variable].map((v) =>
                  h('td', { class: 'mn-num' }, euro(v)),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  // Kategorien im Jahr, mit Vorjahr
  const byCat = (l) => {
    const map = new Map();
    for (const b of l.filter((x) => x.kind === 'expense'))
      map.set(b.cat, (map.get(b.cat) ?? 0) + b.cents);
    return map;
  };
  const now = byCat(list);
  const before = byCat(inYear(prevYear));
  const hasBefore = before.size > 0;
  const topCats = [...now].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Fixkosten nach Art (monatlich, wie heute geplant)
  const month = S.month.startsWith(year) ? S.month : `${year}-12`;
  const byType = new Map();
  for (const r of recList().filter((x) => x.kind !== 'income' && dueIn(x, month) !== undefined))
    if (fixedStatus(r, month) !== 'ended' && fixedStatus(r, month) !== 'upcoming')
      byType.set(r.type, (byType.get(r.type) ?? 0) + monthly(r, month));
  const types = [...byType].sort((a, b) => b[1] - a[1]);

  // Empfänger
  const byParty = new Map();
  for (const b of list.filter((x) => x.kind === 'expense')) {
    const who = (b.party || b.text || catName(b.cat)).trim();
    byParty.set(who, (byParty.get(who) ?? 0) + b.cents);
  }
  const parties = [...byParty].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const change = (cat, cents) => {
    const old = before.get(cat);
    if (!hasBefore || !old) return null;
    const pct = Math.round(((cents - old) / old) * 100);
    return h(
      'span',
      { class: `mn-chip ${pct > 5 ? 'mn-chip--warn' : 'mn-chip--plain'} stats-delta` },
      `${pct > 0 ? '+' : ''}${pct} % ggü. ${prevYear}`,
    );
  };

  return [
    h(
      'div',
      { class: 'mn-kpis' },
      kpi('Ø Einnahmen pro Monat', euro(Math.round(income / n)), 'pos'),
      kpi('Ø Ausgaben pro Monat', euro(Math.round(expense / n))),
      kpi('Fixkostenquote', income > 0 ? `${Math.round((fixedSum / income) * 100)} %` : '–'),
      kpi(
        'Sparquote',
        income > 0 ? `${Math.round(((income - expense) / income) * 100)} %` : '–',
        income - expense >= 0 ? 'pos' : 'neg',
      ),
    ),
    h(
      'div',
      { class: 'mn-cols' },
      h('div', {}, sect(`Monate ${year}`), chart),
      h(
        'div',
        {},
        sect('Ausgaben nach Kategorie'),
        h(
          'div',
          { class: 'mn-list' },
          topCats.map(([cat, cents]) =>
            barRow(
              catName(cat),
              `${euro(cents)} · Ø ${euro(Math.round(cents / n))} im Monat`,
              meter(cents, topCats[0][1]),
              change(cat, cents),
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'mn-cols' },
      h(
        'div',
        {},
        sect('Fixkosten nach Art'),
        types.length
          ? h(
              'div',
              { class: 'mn-list' },
              types.map(([type, cents]) =>
                barRow(FIXED_TYPES[type], `${euro(cents)} im Monat`, meter(cents, types[0][1])),
              ),
            )
          : h('p', { class: 'mn-note' }, 'Noch keine Fixkosten angelegt (Planung).'),
      ),
      h(
        'div',
        {},
        sect('Größte Empfänger'),
        h(
          'div',
          { class: 'mn-list' },
          parties.map(([who, cents]) => barRow(who, euro(cents), meter(cents, parties[0][1]))),
        ),
      ),
    ),
  ];
}

// ---------- Buchungen ----------
function bookingRow([key, b]) {
  const field = taxFieldOf(b);
  return h(
    'button',
    { type: 'button', class: 'mn-row mn-row--text', onclick: () => editBooking(key) },
    h(
      'span',
      { class: 'tx-main' },
      h('span', { class: 'mn-row-title' }, b.text || b.party || KINDS[b.kind]),
      h(
        'span',
        { class: 'mn-row-sub' },
        [catName(b.cat), b.text && b.party ? b.party : ''].filter(Boolean).join(' · '),
      ),
      field || b.receipt
        ? h(
            'span',
            { class: 'tx-tags' },
            field ? h('span', { class: 'mn-chip' }, `Steuer: ${FIELDS[field].label}`) : null,
            b.receipt
              ? h('span', { class: 'mn-chip mn-chip--plain' }, icon('clip'), 'Beleg')
              : null,
          )
        : null,
    ),
    h(
      'span',
      { class: 'mn-row-side' },
      h(
        'b',
        { class: b.kind === 'income' ? 'pos' : b.kind === 'transfer' ? 'mn-muted' : '' },
        signed(b),
      ),
      !b.cat
        ? h('span', { class: 'neg' }, 'ohne Kategorie')
        : b.kind === 'expense'
          ? null
          : KINDS[b.kind],
    ),
  );
}
function filteredMonth() {
  const q = S.q.trim().toLowerCase();
  return [...S.tx.entries()]
    .filter(([, b]) => b.date.startsWith(S.month))
    .filter(([, b]) => !S.cat || (S.cat === '-' ? !b.cat : b.cat === S.cat))
    .filter(([, b]) => !q || `${b.text} ${b.party} ${catName(b.cat)}`.toLowerCase().includes(q))
    .sort((a, b) => b[1].date.localeCompare(a[1].date) || a[0].localeCompare(b[0]));
}
function bookingList() {
  const rows = filteredMonth();
  if (!rows.length)
    return S.q || S.cat
      ? h('p', { class: 'mn-note' }, 'Keine Buchung passt zum Filter.')
      : empty(
          'Keine Buchungen in diesem Monat',
          'Trage eine Buchung ein oder importiere den Kontoauszug deiner Bank.',
        );
  const days = new Map();
  for (const row of rows) {
    if (!days.has(row[1].date)) days.set(row[1].date, []);
    days.get(row[1].date).push(row);
  }
  return h(
    'div',
    {},
    [...days].map(([day, list]) =>
      h(
        'section',
        { class: 'day' },
        h('h3', {}, dayLabel(day)),
        h('div', { class: 'mn-list' }, list.map(bookingRow)),
      ),
    ),
  );
}
function viewBookings() {
  const uncategorised = inMonth(S.month).filter((b) => !b.cat).length;
  const listHost = h('div', { id: 'txlist' }, bookingList());
  const refresh = () => listHost.replaceChildren(bookingList());
  return [
    h(
      'div',
      { class: 'filters' },
      h(
        'div',
        { class: 'mn-search' },
        icon('search'),
        h('input', {
          id: 'q',
          type: 'search',
          placeholder: 'Beschreibung, Empfänger oder Kategorie',
          'aria-label': 'Buchungen durchsuchen',
          value: S.q,
          autocomplete: 'off',
          oninput: (e) => {
            S.q = e.target.value;
            refresh();
          },
        }),
      ),
      h(
        'select',
        {
          id: 'catfilter',
          'aria-label': 'Nach Kategorie filtern',
          value: S.cat,
          onchange: (e) => {
            S.cat = e.target.value;
            refresh();
          },
        },
        h('option', { value: '' }, 'Alle Kategorien'),
        h('option', { value: '-' }, 'Ohne Kategorie'),
        cats().map((c) => h('option', { value: c.id }, c.name)),
      ),
      h(
        'button',
        { class: 'mn-btn', onclick: () => openImport() },
        icon('upload'),
        'Kontoauszug importieren',
      ),
    ),
    uncategorised && S.cat !== '-'
      ? h(
          'div',
          { class: 'mn-banner mn-banner--warn', role: 'note' },
          h(
            'span',
            {},
            `${uncategorised} ${uncategorised === 1 ? 'Buchung ist' : 'Buchungen sind'} noch ohne Kategorie.`,
          ),
          h(
            'button',
            {
              class: 'mn-link',
              onclick: () => {
                S.cat = '-';
                render();
              },
            },
            'Anzeigen',
          ),
        )
      : null,
    listHost,
  ];
}

// ---------- Budget ----------
function viewBudget() {
  const list = inMonth(S.month).filter((b) => b.kind === 'expense');
  const spent = (id) => list.filter((b) => b.cat === id).reduce((s, b) => s + b.cents, 0);
  const expenseCats = cats().filter((c) => c.kind === 'expense');
  const total = expenseCats.reduce((s, c) => s + c.budget, 0);
  const totalSpent = expenseCats.filter((c) => c.budget).reduce((s, c) => s + spent(c.id), 0);
  const rest = sum(list, 'expense') - totalSpent;
  const row = (c) => {
    const s = spent(c.id);
    const over = c.budget > 0 && s > c.budget;
    const id = `budget-${c.id}`;
    return h(
      'div',
      { class: 'mn-bar budget-row' },
      h(
        'span',
        { class: 'mn-bar-top' },
        h('label', { for: id }, c.name),
        h(
          'span',
          { class: 'budget-input' },
          h('input', {
            id,
            inputmode: 'decimal',
            autocomplete: 'off',
            placeholder: 'kein Budget',
            value: c.budget ? plain(c.budget) : '',
            onchange: async (e) => {
              const v = e.target.value.trim() ? parseAmount(e.target.value) : 0;
              if (v === null || v < 0) {
                toast('Gib einen Betrag wie 250 oder 99,90 ein.');
                return;
              }
              c.budget = v;
              try {
                await saveSettings();
                render();
              } catch {
                toast('Speichern fehlgeschlagen.');
              }
            },
          }),
          h('span', { 'aria-hidden': 'true' }, '€'),
        ),
      ),
      c.budget
        ? [
            meter(s, c.budget, over),
            h(
              'span',
              { class: 'mn-bar-top budget-state' },
              h('span', {}, `${euro(s)} ausgegeben`),
              h(
                'span',
                { class: over ? 'neg' : '' },
                over ? `${euro(s - c.budget)} drüber` : `${euro(c.budget - s)} übrig`,
              ),
            ),
          ]
        : s
          ? h('span', { class: 'mn-note budget-state' }, `${euro(s)} ausgegeben, kein Budget`)
          : null,
    );
  };
  const withBudget = expenseCats.filter((c) => c.budget > 0);
  const without = expenseCats.filter((c) => !c.budget);
  return [
    total
      ? h(
          'div',
          { class: 'mn-kpis' },
          kpi('Budget', euro(total)),
          kpi('Ausgegeben', euro(totalSpent), totalSpent > total ? 'neg' : ''),
          kpi(
            totalSpent > total ? 'Überschritten' : 'Übrig',
            euro(Math.abs(total - totalSpent)),
            totalSpent > total ? 'neg' : 'pos',
          ),
        )
      : null,
    h(
      'div',
      { class: 'mn-cols' },
      h(
        'div',
        {},
        sect('Mit Budget', h('small', {}, String(withBudget.length))),
        withBudget.length
          ? h('div', { class: 'mn-list' }, withBudget.map(row))
          : h('p', { class: 'mn-note' }, 'Trag rechts bei einer Kategorie einen Monatsbetrag ein.'),
        rest > 0 ? h('p', { class: 'mn-note' }, `${euro(rest)} in Kategorien ohne Budget.`) : null,
      ),
      h(
        'div',
        {},
        sect('Ohne Budget', h('small', {}, String(without.length))),
        h('div', { class: 'mn-list' }, without.map(row)),
        h(
          'p',
          { class: 'mn-note' },
          'Das Budget gilt für jeden Monat. Leer lassen, wenn es für eine Kategorie keins gibt.',
        ),
      ),
    ),
  ];
}

// ---------- Steuer ----------
function profileForm(year) {
  const p = S.profiles.get(year) ?? cleanProfile(null);
  const field = (key, label, hint, opts = {}) =>
    h(
      'label',
      { class: 'mn-field' },
      label,
      h('input', {
        name: key,
        inputmode: opts.money ? 'decimal' : 'numeric',
        autocomplete: 'off',
        value: opts.money ? (p[key] ? plain(p[key]) : '') : p[key] ? String(p[key]) : '',
        placeholder: opts.placeholder ?? '0',
      }),
      hint ? h('small', { class: 'hint' }, hint) : null,
    );
  const form = h(
    'form',
    {
      class: 'profile mn-form',
      onchange: async () => {
        const fd = new FormData(form);
        const num = (k) => Math.max(0, Number(String(fd.get(k) || '0').replace(',', '.')) || 0);
        const income = String(fd.get('income') || '').trim() ? parseAmount(fd.get('income')) : 0;
        const next = cleanProfile({
          commuteKm: num('commuteKm'),
          commuteDays: Math.round(num('commuteDays')),
          homeofficeDays: Math.round(num('homeofficeDays')),
          children: Math.round(num('children')),
          married: fd.get('married') === 'on',
          car: fd.get('car') === 'on',
          income: income && income > 0 ? income : 0,
          employee: fd.get('employee') === 'on',
        });
        try {
          await saveProfile(year, next);
          $('#forms').replaceChildren(...formsView(year));
        } catch {
          toast('Speichern fehlgeschlagen.');
        }
      },
    },
    h(
      'div',
      { class: 'profile-fields' },
      field('commuteKm', 'Entfernung zur Arbeit (km, einfach)'),
      field('commuteDays', 'Tage im Büro'),
      field('homeofficeDays', 'Tage im Homeoffice', 'Tage ohne Weg zur Arbeit'),
      field('children', 'Kinder'),
      field('income', 'Gesamtbetrag der Einkünfte (€)', 'Optional, für die zumutbare Belastung', {
        money: true,
        placeholder: 'optional',
      }),
    ),
    h(
      'div',
      { class: 'mn-checks' },
      h(
        'label',
        {},
        h('input', { type: 'checkbox', name: 'employee', checked: p.employee }),
        'Ich bin Arbeitnehmer:in (Anlage N)',
      ),
      h(
        'label',
        {},
        h('input', { type: 'checkbox', name: 'car', checked: p.car }),
        h(
          'span',
          {},
          'Mit dem eigenen Auto zur Arbeit',
          h('small', {}, 'Keine Obergrenze von 4.500 €'),
        ),
      ),
      h(
        'label',
        {},
        h('input', { type: 'checkbox', name: 'married', checked: p.married }),
        'Zusammenveranlagung (verheiratet)',
      ),
    ),
  );
  form.addEventListener('submit', (e) => e.preventDefault());
  return form;
}
function taxBookings(year) {
  return bookings()
    .filter((b) => b.date.startsWith(`${year}-`))
    .map((b) => ({ ...b, taxField: taxFieldOf(b) }))
    .filter((b) => b.taxField)
    .sort((a, b) => a.date.localeCompare(b.date));
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${text} kopiert`);
  } catch {
    toast('Kopieren nicht möglich. Markiere den Betrag von Hand.');
  }
}
function formsView(year) {
  const profile = S.profiles.get(year) ?? cleanProfile(null);
  const forms = buildReturn(year, taxBookings(year), profile).filter(
    (f) => f.id !== 'N' || profile.employee,
  );
  return forms.map((f) => {
    const rows = f.rows.filter((r) => r.cents > 0);
    return h(
      'section',
      { class: 'form-sheet mn-card', 'aria-labelledby': `form-${f.id}` },
      h('header', {}, h('h3', { id: `form-${f.id}` }, f.title), h('p', {}, f.sub)),
      rows.length
        ? h(
            'table',
            {},
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col' }, 'Eintrag'),
                h('th', { scope: 'col', class: 'num' }, 'Betrag'),
              ),
            ),
            h(
              'tbody',
              {},
              rows.map((r) =>
                h(
                  'tr',
                  {},
                  h(
                    'td',
                    {},
                    h('b', {}, r.label),
                    r.hint ? h('small', {}, r.hint) : null,
                    r.deductible !== undefined && r.deductible !== r.cents
                      ? h('small', { class: 'pos' }, `Davon abziehbar: ${euro(r.deductible)}`)
                      : null,
                    r.reduction
                      ? h('small', { class: 'pos' }, `Steuerermäßigung: ${euro(r.reduction)}`)
                      : null,
                    r.items?.length
                      ? h(
                          'details',
                          {},
                          h(
                            'summary',
                            {},
                            `${r.items.length} ${r.items.length === 1 ? 'Buchung' : 'Buchungen'}`,
                          ),
                          h(
                            'ul',
                            {},
                            r.items.map((b) =>
                              h(
                                'li',
                                {},
                                h(
                                  'span',
                                  {},
                                  `${b.date.split('-').reverse().join('.')} ${b.text || b.party}`,
                                ),
                                h(
                                  'span',
                                  {},
                                  `${b.kind === 'income' ? '−' : ''}${euro(b.taxCents ?? b.cents)}`,
                                ),
                              ),
                            ),
                          ),
                        )
                      : null,
                  ),
                  h(
                    'td',
                    { class: 'num' },
                    h('span', {}, euro(r.cents)),
                    h(
                      'button',
                      {
                        class: 'mn-btn mn-btn--small no-print',
                        'aria-label': `${r.label}: ${plain(r.cents)} kopieren`,
                        onclick: () => copy(plain(r.cents)),
                      },
                      'Kopieren',
                    ),
                  ),
                ),
              ),
            ),
            h(
              'tfoot',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'row' }, 'Summe'),
                h('td', { class: 'num' }, euro(f.total)),
              ),
            ),
          )
        : h('p', { class: 'mn-note' }, 'Keine Einträge.'),
      f.summary ? h('p', { class: 'summary' }, f.summary) : null,
    );
  });
}
function exportTaxCsv(year) {
  const profile = S.profiles.get(year) ?? cleanProfile(null);
  const lines = [['Formular', 'Eintrag', 'Betrag', 'Abziehbar', 'Steuerermäßigung']];
  for (const f of buildReturn(year, taxBookings(year), profile))
    for (const r of f.rows.filter((x) => x.cents > 0))
      lines.push([
        f.title,
        r.label,
        plain(r.cents),
        r.deductible !== undefined ? plain(r.deductible) : '',
        r.reduction ? plain(r.reduction) : '',
      ]);
  lines.push([]);
  lines.push(['Datum', 'Buchung', 'Betrag', 'Eintrag', 'Kategorie']);
  for (const b of taxBookings(year))
    lines.push([
      b.date,
      b.text || b.party,
      plain((b.kind === 'income' ? -1 : 1) * (b.taxCents ?? b.cents)),
      FIELDS[b.taxField].label,
      catName(b.cat),
    ]);
  download(`steuer-${year}.csv`, csv(lines), 'text/csv');
}
function viewTax() {
  const year = S.year;
  return [
    h(
      'div',
      { class: 'mn-split mn-split--start' },
      h(
        'div',
        { class: 'no-print tax-side' },
        h(
          'div',
          { class: 'mn-card' },
          h('h3', {}, `Angaben für ${year}`),
          h(
            'p',
            { class: 'mn-note' },
            'Fließen in Pauschalen und Grenzen ein. Änderungen gelten sofort.',
          ),
          profileForm(year),
        ),
        h(
          'div',
          { class: 'tax-actions' },
          h(
            'button',
            { class: 'mn-btn', onclick: () => window.print() },
            'Drucken oder als PDF sichern',
          ),
          h(
            'button',
            { class: 'mn-btn', onclick: () => exportTaxCsv(year) },
            'Als CSV exportieren',
          ),
        ),
        h(
          'p',
          { class: 'mn-note' },
          'Buchungen mit steuerlicher Zuordnung landen automatisch im passenden Formular. Die Zuordnung kommt von der Kategorie und lässt sich pro Buchung ändern. Übertrage die Beträge in ELSTER; die App reicht nichts ein und ersetzt keine Steuerberatung.',
        ),
      ),
      h('div', { id: 'forms', class: 'forms' }, formsView(year)),
    ),
  ];
}
async function changeYear(n) {
  S.year += n;
  try {
    // the statistics compare with the year before
    await Promise.all([ensureYear(S.year), ensureYear(S.year - 1), ensureProfile(S.year)]);
  } catch {
    toast('Laden fehlgeschlagen.');
  }
  render();
}

// ---------- Einstellungen ----------
function taxSelect(name, value, withInherit) {
  return h(
    'select',
    { name, value },
    withInherit
      ? h('option', { value: '' }, withInherit)
      : h('option', { value: '' }, 'Nicht steuerlich relevant'),
    withInherit ? h('option', { value: 'none' }, 'Nicht steuerlich relevant') : null,
    FORMS.map((f) =>
      h(
        'optgroup',
        { label: f.title },
        Object.entries(FIELDS)
          .filter(([, x]) => x.form === f.id)
          .map(([k, x]) => h('option', { value: k }, x.label)),
      ),
    ),
  );
}
function catSelect(name, value, kind) {
  const list = cats().filter((c) => !kind || c.kind === kind);
  return h(
    'select',
    { name, value },
    h('option', { value: '' }, 'Ohne Kategorie'),
    list.map((c) => h('option', { value: c.id }, c.name)),
  );
}
function viewSettings() {
  const recs = [...S.recs.values()].sort((a, b) => a.text.localeCompare(b.text, 'de'));
  const row = (title, sub, onclick) =>
    h(
      'button',
      { type: 'button', class: 'mn-row mn-row--text', onclick },
      h(
        'span',
        {},
        h('span', { class: 'mn-row-title' }, title),
        sub ? h('span', { class: 'mn-row-sub' }, sub) : null,
      ),
      h('span', { class: 'mn-row-side' }, icon('right')),
    );
  const add = (onclick) => h('button', { class: 'mn-link', onclick }, 'Hinzufügen');
  return [
    h(
      'div',
      { class: 'mn-cols' },
      h(
        'div',
        {},
        sect(
          'Kategorien',
          add(() => editCategory(null)),
        ),
        Object.keys(KINDS).map((kind) => [
          h(
            'h3',
            { class: 'group-head' },
            kind === 'transfer' ? 'Umbuchungen (zählen nicht als Ausgabe)' : `${KINDS[kind]}n`,
          ),
          h(
            'div',
            { class: 'mn-list' },
            cats()
              .filter((c) => c.kind === kind)
              .map((c) =>
                row(
                  c.name,
                  [c.budget ? `${euro(c.budget)} / Monat` : '', c.tax ? FIELDS[c.tax].label : '']
                    .filter(Boolean)
                    .join(' · '),
                  () => editCategory(c.id),
                ),
              ),
          ),
        ]),
      ),
      h(
        'div',
        {},
        sect('Fixkosten und Daueraufträge'),
        h(
          'p',
          { class: 'mn-note' },
          `${recs.length ? `${recs.length} angelegt. ` : ''}Miete, Abos, Versicherungen, Rücklagen und Gehalt verwaltest du unter Planung.`,
          ' ',
          h(
            'button',
            {
              type: 'button',
              class: 'mn-link',
              onclick: () => {
                S.plan = 'fixed';
                go('plan');
              },
            },
            'Zur Planung',
          ),
        ),
        sect(
          'Regeln für den Import',
          add(() => editRule(null)),
        ),
        h(
          'p',
          { class: 'mn-note rules-note' },
          'Enthält der Empfänger oder Verwendungszweck eines der Wörter, bekommt die Buchung die Kategorie. Mehrere Wörter mit | trennen.',
        ),
        h(
          'div',
          { class: 'mn-list' },
          S.settings.rules.map((r, i) => row(r.match, `→ ${catName(r.cat)}`, () => editRule(i))),
        ),
        h(
          'button',
          { class: 'mn-btn apply-rules', onclick: applyRules },
          'Regeln auf Buchungen ohne Kategorie anwenden',
        ),
        sect('Daten'),
        h(
          'div',
          { class: 'mn-card' },
          h(
            'p',
            { class: 'mn-note data-note' },
            'Die Sicherung enthält alle Buchungen, Kategorien, Regeln, Daueraufträge und Steuerangaben, aber keine Belege.',
          ),
          h(
            'div',
            { class: 'data-actions' },
            h('button', { class: 'mn-btn', onclick: exportBackup }, 'Sicherung exportieren'),
            h(
              'label',
              { class: 'mn-btn filebtn' },
              'Sicherung importieren',
              h('input', {
                type: 'file',
                accept: '.json,application/json',
                onchange: (e) => {
                  const f = e.target.files[0];
                  e.target.value = '';
                  if (f) importBackup(f);
                },
              }),
            ),
            h(
              'button',
              { class: 'mn-btn', onclick: exportYearCsv },
              `Buchungen ${S.month.slice(0, 4)} als CSV`,
            ),
          ),
        ),
      ),
    ),
  ];
}
async function applyRules() {
  let n = 0;
  try {
    for (const [key, b] of S.tx) {
      if (b.cat) continue;
      const cat = matchRule(S.settings.rules, b, cats());
      if (cat) {
        await saveBooking({ ...b, cat }, key);
        n++;
      }
    }
    toast(
      n
        ? `${n} ${n === 1 ? 'Buchung' : 'Buchungen'} zugeordnet`
        : 'Keine passende Buchung gefunden',
    );
  } catch {
    toast('Speichern fehlgeschlagen.');
  }
  render();
}

// ---------- dialogs (App Kit sheets: focus trap, Escape, inert page) ----------
let sheetOpen = false;
/** Opens a sheet with a bar (Abbrechen, title), the form and a footer with the actions. */
function openDialog(title, body, actions, onClose) {
  const form = h(
    'form',
    { class: 'mn-form mn-sheet-body', novalidate: true },
    body,
    h('p', { class: 'mn-error', role: 'alert', hidden: true }),
  );
  const foot = h('div', { class: 'mn-sheet-foot' }, actions);
  // Enter in a field triggers the primary action instead of reloading the page.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    foot.querySelector('.mn-btn--primary:not([disabled])')?.click();
  });
  const content = document.createDocumentFragment();
  content.append(
    h(
      'div',
      { class: 'mn-sheet-bar' },
      h(
        'button',
        { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
        'Abbrechen',
      ),
      h('h2', {}, title),
      h('span', {}),
    ),
    form,
    foot,
  );
  nameSelects(form);
  new MutationObserver(() => nameSelects(form)).observe(form, { childList: true, subtree: true });
  sheetOpen = true;
  window.mnui.sheet.open(content, {
    tall: true,
    onClose: () => {
      sheetOpen = false;
      onClose?.();
    },
  });
  form.querySelector('input:not([type=hidden]):not([type=radio]),select,textarea')?.focus();
  return form;
}
/** A select wrapped in its label gets the selected option text in its accessible name; name it
 * after the label text only. */
function nameSelects(root) {
  for (const select of root.querySelectorAll('label.mn-field > select')) {
    const text = select.parentElement.firstChild;
    if (text?.nodeType === Node.TEXT_NODE)
      select.setAttribute('aria-label', text.textContent.trim());
  }
}
function closeDialog() {
  window.mnui.sheet.close();
}
function formError(form, message) {
  const p = form.querySelector('.mn-error');
  p.textContent = message;
  p.hidden = !message;
}
const val = (form, name) => String(new FormData(form).get(name) ?? '').trim();

function editBooking(key) {
  const old = key ? S.tx.get(key) : null;
  const b = old ?? {
    id: newId(),
    date: S.month === today().slice(0, 7) ? today() : `${S.month}-01`,
    cents: 0,
    kind: 'expense',
    cat: '',
    text: '',
    party: '',
  };
  let receipt = b.receipt;
  // Files uploaded in this dialog; whatever is not saved with the booking is removed on close.
  const uploaded = new Set();
  const dropUnsaved = () => {
    for (const path of uploaded) ready.then((mn) => mn.files.remove(path)).catch(() => {});
    uploaded.clear();
  };
  const receiptHost = h('div', { class: 'receipt' });
  const drawReceipt = () =>
    receiptHost.replaceChildren(
      receipt
        ? h(
            'span',
            { class: 'receipt-actions' },
            h(
              'button',
              { type: 'button', class: 'mn-link', onclick: () => openReceipt(receipt) },
              'Beleg öffnen',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'mn-link danger',
                onclick: () => {
                  receipt = undefined;
                  drawReceipt();
                },
              },
              'Entfernen',
            ),
          )
        : h(
            'label',
            { class: 'mn-btn filebtn' },
            icon('clip'),
            'Beleg anhängen',
            h('input', {
              type: 'file',
              accept: 'image/*,application/pdf',
              onchange: async (e) => {
                const file = e.target.files[0];
                e.target.value = '';
                if (!file) return;
                if (file.size > 20 * 1024 * 1024) {
                  toast('Der Beleg ist größer als 20 MB.');
                  return;
                }
                try {
                  const mn = await ready;
                  const name = file.name.replace(/[^\w.-]+/g, '_').slice(-60) || 'beleg';
                  const path = `belege/${val(form, 'date').slice(0, 4) || 'ohne-jahr'}/${b.id}-${Date.now().toString(36)}-${name}`;
                  await mn.files.upload(path, file, {
                    contentType: file.type || 'application/octet-stream',
                  });
                  uploaded.add(path);
                  receipt = path;
                  drawReceipt();
                } catch {
                  toast('Der Beleg konnte nicht hochgeladen werden.');
                }
              },
            }),
          ),
    );
  drawReceipt();
  const kindSeg = h(
    'div',
    { class: 'mn-seg kind-seg', role: 'radiogroup', 'aria-label': 'Art' },
    Object.entries(KINDS).map(([k, label]) =>
      h(
        'label',
        {},
        h('input', { type: 'radio', name: 'kind', value: k, checked: b.kind === k }),
        h('span', {}, label),
      ),
    ),
  );
  const catHost = h('label', { class: 'mn-field' }, 'Kategorie', catSelect('cat', b.cat, b.kind));
  kindSeg.addEventListener('change', () => {
    const kind = val(form, 'kind');
    catHost.replaceChildren(
      'Kategorie',
      catSelect('cat', catById(val(form, 'cat'))?.kind === kind ? val(form, 'cat') : '', kind),
    );
  });
  const inherit = (catId) => {
    const c = catById(catId);
    return c?.tax ? `Wie Kategorie: ${FIELDS[c.tax].label}` : 'Wie Kategorie (nicht steuerlich)';
  };
  const taxHost = h(
    'label',
    { class: 'mn-field' },
    'Steuererklärung',
    taxSelect('taxField', b.taxField ?? '', inherit(b.cat)),
  );
  // The first option names what the category would put into the tax return.
  const refreshTax = () =>
    taxHost.replaceChildren(
      'Steuererklärung',
      taxSelect('taxField', val(form, 'taxField'), inherit(val(form, 'cat'))),
    );
  kindSeg.addEventListener('change', refreshTax);
  catHost.addEventListener('change', () => {
    refreshTax();
  });
  const body = [
    kindSeg,
    h(
      'div',
      { class: 'mn-grid-2' },
      h(
        'label',
        { class: 'mn-field' },
        'Betrag in €',
        h('input', {
          name: 'amount',
          inputmode: 'decimal',
          autocomplete: 'off',
          required: true,
          value: b.cents ? plain(b.cents) : '',
          placeholder: '0,00',
        }),
      ),
      h(
        'label',
        { class: 'mn-field' },
        'Datum',
        h('input', { name: 'date', type: 'date', required: true, value: b.date }),
      ),
    ),
    h(
      'label',
      { class: 'mn-field' },
      'Beschreibung',
      h('input', {
        name: 'text',
        maxlength: 200,
        value: b.text,
        placeholder: 'z. B. Wocheneinkauf',
      }),
    ),
    h(
      'label',
      { class: 'mn-field' },
      'Empfänger oder Auftraggeber',
      h('input', { name: 'party', maxlength: 120, value: b.party }),
    ),
    catHost,
    taxHost,
    h(
      'label',
      { class: 'mn-field' },
      'Davon steuerlich absetzbar in €',
      h('input', {
        name: 'taxAmount',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: b.taxCents !== undefined ? plain(b.taxCents) : '',
        placeholder: 'ganzer Betrag',
      }),
      h('small', {}, 'Bei Handwerkern nur Arbeits- und Fahrtkosten, ohne Material.'),
    ),
    receiptHost,
  ];
  const form = openDialog(
    old ? 'Buchung bearbeiten' : 'Neue Buchung',
    body,
    [
      old
        ? h(
            'button',
            {
              type: 'button',
              class: 'mn-btn mn-btn--danger',
              onclick: async () => {
                try {
                  await deleteBooking(key);
                  closeDialog();
                  toast('Buchung gelöscht');
                  render();
                } catch {
                  formError(form, 'Löschen fehlgeschlagen.');
                }
              },
            },
            'Löschen',
          )
        : null,
      h('span', { class: 'mn-grow' }),
      h(
        'button',
        {
          type: 'submit',
          class: 'mn-btn mn-btn--primary',
          onclick: async (e) => {
            e.preventDefault();
            const cents = parseAmount(val(form, 'amount'));
            if (cents === null || cents <= 0)
              return formError(form, 'Gib einen Betrag größer als 0 ein, z. B. 12,50.');
            const date = val(form, 'date');
            if (!isDay(date)) return formError(form, 'Gib ein Datum an.');
            const taxRaw = val(form, 'taxAmount');
            const taxCents = taxRaw ? parseAmount(taxRaw) : undefined;
            if (taxRaw && (taxCents === null || taxCents < 0 || taxCents > cents))
              return formError(
                form,
                'Der absetzbare Anteil muss zwischen 0 und dem Betrag liegen.',
              );
            const next = cleanBooking(
              {
                ...b,
                cents: Math.abs(cents),
                date,
                kind: val(form, 'kind'),
                text: val(form, 'text'),
                party: val(form, 'party'),
                cat: val(form, 'cat'),
                taxField: val(form, 'taxField') || undefined,
                taxCents,
                receipt,
              },
              FIELDS,
            );
            try {
              await ensureYear(Number(date.slice(0, 4)));
              await saveBooking(next, key);
              uploaded.delete(receipt);
              if (old?.receipt && old.receipt !== receipt)
                ready.then((mn) => mn.files.remove(old.receipt)).catch(() => {});
              closeDialog();
              toast(old ? 'Gespeichert' : 'Buchung hinzugefügt');
              render();
            } catch {
              formError(form, 'Speichern fehlgeschlagen. Prüfe deine Verbindung.');
            }
          },
        },
        'Speichern',
      ),
    ],
    dropUnsaved,
  );
}
async function openReceipt(path) {
  // Open the tab synchronously so popup blockers allow it, then point it at the signed URL.
  const tab = window.open('', '_blank');
  try {
    const mn = await ready;
    const url = await mn.files.url(path, { expiresIn: 300 });
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else location.assign(url);
  } catch {
    tab?.close();
    toast('Der Beleg konnte nicht geöffnet werden.');
  }
}

function editCategory(id) {
  const c = id ? catById(id) : { id: '', name: '', kind: 'expense', budget: 0, tax: '' };
  const used = id ? bookings().some((b) => b.cat === id) : false;
  const form = openDialog(
    id ? 'Kategorie bearbeiten' : 'Neue Kategorie',
    [
      h(
        'label',
        { class: 'mn-field' },
        'Name',
        h('input', { name: 'name', required: true, maxlength: 60, value: c.name }),
      ),
      h(
        'label',
        { class: 'mn-field' },
        'Art',
        h(
          'select',
          { name: 'kind', value: c.kind },
          Object.entries(KINDS).map(([k, l]) => h('option', { value: k }, l)),
        ),
      ),
      h(
        'label',
        { class: 'mn-field' },
        'Monatsbudget in €',
        h('input', {
          name: 'budget',
          inputmode: 'decimal',
          value: c.budget ? plain(c.budget) : '',
          placeholder: 'kein Budget',
        }),
      ),
      h(
        'label',
        { class: 'mn-field' },
        'Steuererklärung',
        taxSelect('tax', c.tax, null),
        h('small', {}, 'Buchungen dieser Kategorie fließen automatisch in dieses Feld.'),
      ),
    ],
    [
      id
        ? h(
            'button',
            {
              type: 'button',
              class: 'mn-btn mn-btn--danger',
              onclick: async () => {
                S.settings.categories = cats().filter((x) => x.id !== id);
                S.settings.rules = S.settings.rules.filter((r) => r.cat !== id);
                try {
                  await saveSettings();
                  closeDialog();
                  toast(
                    used
                      ? 'Kategorie gelöscht, ihre Buchungen sind jetzt ohne Kategorie'
                      : 'Kategorie gelöscht',
                  );
                  render();
                } catch {
                  formError(form, 'Löschen fehlgeschlagen.');
                }
              },
            },
            'Löschen',
          )
        : null,
      h('span', { class: 'mn-grow' }),
      h(
        'button',
        {
          type: 'submit',
          class: 'mn-btn mn-btn--primary',
          onclick: async (e) => {
            e.preventDefault();
            const name = val(form, 'name');
            if (!name) return formError(form, 'Gib einen Namen an.');
            const budgetRaw = val(form, 'budget');
            const budget = budgetRaw ? parseAmount(budgetRaw) : 0;
            if (budget === null || budget < 0)
              return formError(form, 'Gib ein Budget wie 250 oder 99,90 ein.');
            const next = {
              id: c.id || newId().slice(0, 8),
              name,
              kind: val(form, 'kind'),
              budget,
              tax: val(form, 'tax'),
            };
            S.settings.categories = id
              ? cats().map((x) => (x.id === id ? next : x))
              : [...cats(), next];
            try {
              await saveSettings();
              closeDialog();
              render();
            } catch {
              formError(form, 'Speichern fehlgeschlagen.');
            }
          },
        },
        'Speichern',
      ),
    ],
  );
}
function editRule(index) {
  const r = index === null ? { match: '', cat: '' } : S.settings.rules[index];
  const form = openDialog(
    index === null ? 'Neue Regel' : 'Regel bearbeiten',
    [
      h(
        'label',
        { class: 'mn-field' },
        'Enthält',
        h('input', {
          name: 'match',
          required: true,
          value: r.match,
          placeholder: 'z. B. REWE|EDEKA',
        }),
      ),
      id
        ? h(
            'label',
            { class: 'mn-field' },
            'Neuer Betrag gilt ab',
            h('input', { name: 'from', type: 'month', value: thisMonth }),
            h(
              'small',
              {},
              r.changes.length
                ? `Bisher: ${[{ from: r.start, cents: r.cents }, ...r.changes].map((c) => `${euro(c.cents)} ab ${monthName(c.from)}`).join(', ')}`
                : 'Frühere Monate behalten ihren Betrag.',
            ),
          )
        : null,
      h('label', { class: 'mn-field' }, 'Kategorie', catSelect('cat', r.cat)),
      h(
        'label',
        { class: 'mn-field' },
        'Auf dem Kontoauszug erkennen an',
        h('input', {
          name: 'match',
          maxlength: 200,
          value: r.match,
          placeholder: 'z. B. NETFLIX oder Vermieter GmbH',
        }),
        h(
          'small',
          {},
          'Beim Import wird die Zahlung dann zugeordnet statt doppelt gebucht, und ein anderer Betrag fällt auf. Mehrere Wörter mit | trennen. Leer: die Beschreibung.',
        ),
      ),
    ],
    [
      index !== null
        ? h(
            'button',
            {
              type: 'button',
              class: 'mn-btn mn-btn--danger',
              onclick: async () => {
                S.settings.rules = S.settings.rules.filter((_, i) => i !== index);
                try {
                  await saveSettings();
                  closeDialog();
                  render();
                } catch {
                  formError(form, 'Löschen fehlgeschlagen.');
                }
              },
            },
            'Löschen',
          )
        : null,
      h('span', { class: 'mn-grow' }),
      h(
        'button',
        {
          type: 'submit',
          class: 'mn-btn mn-btn--primary',
          onclick: async (e) => {
            e.preventDefault();
            const next = { match: val(form, 'match'), cat: val(form, 'cat') };
            if (!next.match || !next.cat)
              return formError(form, 'Gib Wörter und eine Kategorie an.');
            S.settings.rules =
              index === null
                ? [...S.settings.rules, next]
                : S.settings.rules.map((x, i) => (i === index ? next : x));
            try {
              await saveSettings();
              closeDialog();
              render();
            } catch {
              formError(form, 'Speichern fehlgeschlagen.');
            }
          },
        },
        'Speichern',
      ),
    ],
  );
}
function editRecurring(id) {
  const r = id
    ? S.recs.get(id)
    : {
        id: newId(),
        text: '',
        cents: 0,
        kind: 'expense',
        cat: '',
        every: 1,
        day: 1,
        start: today().slice(0, 7),
        end: '',
        until: '',
        type: 'wohnen',
        match: '',
        changes: [],
        note: '',
      };
  const thisMonth = today().slice(0, 7);
  const form = openDialog(
    id ? 'Fixkosten bearbeiten' : 'Neue Fixkosten',
    [
      h(
        'label',
        { class: 'mn-field' },
        'Beschreibung',
        h('input', {
          name: 'text',
          required: true,
          maxlength: 200,
          value: r.text,
          placeholder: 'z. B. Miete, Netflix, Haftpflicht',
        }),
      ),
      h(
        'label',
        { class: 'mn-field' },
        'Gruppe',
        h(
          'select',
          { name: 'type', value: r.type },
          Object.entries(FIXED_TYPES).map(([k, l]) => h('option', { value: k }, l)),
        ),
      ),
      h(
        'div',
        { class: 'mn-grid-2' },
        h(
          'label',
          { class: 'mn-field' },
          'Betrag in €',
          h('input', {
            name: 'amount',
            inputmode: 'decimal',
            value: r.cents ? plain(amountFor(r, thisMonth)) : '',
            placeholder: '0,00',
          }),
        ),
        h(
          'label',
          { class: 'mn-field' },
          'Art',
          h(
            'select',
            { name: 'kind', value: r.kind },
            Object.entries(KINDS).map(([k, l]) => h('option', { value: k }, l)),
          ),
        ),
      ),
      h('label', { class: 'mn-field' }, 'Kategorie', catSelect('cat', r.cat)),
      h(
        'div',
        { class: 'mn-grid-2' },
        h(
          'label',
          { class: 'mn-field' },
          'Rhythmus',
          h(
            'select',
            { name: 'every', value: String(r.every) },
            [
              [1, 'Monatlich'],
              [3, 'Vierteljährlich'],
              [6, 'Halbjährlich'],
              [12, 'Jährlich'],
            ].map(([v, l]) => h('option', { value: String(v) }, l)),
          ),
        ),
        h(
          'label',
          { class: 'mn-field' },
          'Am Tag',
          h('input', { name: 'day', type: 'number', min: 1, max: 28, value: String(r.day) }),
        ),
      ),
      h(
        'div',
        { class: 'mn-grid-2' },
        h(
          'label',
          { class: 'mn-field' },
          'Erste Buchung',
          h('input', { name: 'start', type: 'month', value: r.start }),
        ),
        h(
          'label',
          { class: 'mn-field' },
          'Letzte Zahlung',
          h('input', { name: 'end', type: 'month', value: r.end }),
          h('small', {}, 'Gekündigt oder befristet? Der letzte Monat. Leer, solange es läuft.'),
        ),
      ),
      h(
        'p',
        { class: 'mn-note' },
        'Fällige Zahlungen werden beim Öffnen der App gebucht, auch rückwirkend ab der ersten.',
      ),
    ],
    [
      id
        ? h(
            'button',
            {
              type: 'button',
              class: 'mn-btn mn-btn--danger',
              onclick: async () => {
                try {
                  const mn = await ready;
                  await mn.kv.delete(`rec:${id}`);
                  S.recs.delete(id);
                  calendarSoon();
                  closeDialog();
                  toast('Fixkosten gelöscht, bisherige Buchungen bleiben');
                  render();
                } catch {
                  formError(form, 'Löschen fehlgeschlagen.');
                }
              },
            },
            'Löschen',
          )
        : null,
      h('span', { class: 'mn-grow' }),
      h(
        'button',
        {
          type: 'submit',
          class: 'mn-btn mn-btn--primary',
          onclick: async (e) => {
            e.preventDefault();
            const cents = parseAmount(val(form, 'amount'));
            if (cents === null || cents <= 0)
              return formError(form, 'Gib einen Betrag größer als 0 ein.');
            const start = val(form, 'start');
            const end = val(form, 'end');
            if (!start) return formError(form, 'Gib den Monat der ersten Buchung an.');
            if (end && end < start)
              return formError(form, 'Die letzte Buchung liegt vor der ersten.');
            // Months already generated stay done (\`until\`), so an edit never re-books a month the
            // user deleted or moved; new settings apply from the next due month on.
            // an existing one keeps its history: a new amount applies from the chosen month on
            const from = id ? val(form, 'from') || thisMonth : '';
            let base = Math.abs(cents);
            let changes = r.changes;
            if (id && Math.abs(cents) !== amountFor(r, from)) {
              if (from <= r.start) changes = [];
              else {
                base = r.cents;
                changes = [
                  ...r.changes.filter((c) => c.from < from),
                  { from, cents: Math.abs(cents) },
                ];
              }
            } else if (id) base = r.cents;
            const next = cleanRecurring({
              ...r,
              text: val(form, 'text'),
              type: val(form, 'type'),
              match: val(form, 'match'),
              changes,
              cents: base,
              kind: val(form, 'kind'),
              cat: val(form, 'cat'),
              every: Number(val(form, 'every')),
              day: Math.min(28, Math.max(1, Math.round(Number(val(form, 'day')) || 1))),
              start,
              end,
              until: r.until,
            });
            if (!next) return formError(form, 'Bitte prüfe die Angaben.');
            try {
              const mn = await ready;
              await mn.kv.set(`rec:${next.id}`, next);
              S.recs.set(next.id, next);
              const years = [
                ...new Set(dueRecurring(next, today()).map((d) => Number(d.month.slice(0, 4)))),
              ];
              await Promise.all(years.map(ensureYear));
              await runRecurring();
              calendarSoon();
              closeDialog();
              render();
            } catch {
              formError(form, 'Speichern fehlgeschlagen.');
            }
          },
        },
        'Speichern',
      ),
    ],
  );
}

// ---------- CSV import ----------
function openImport() {
  const form = openDialog(
    'Kontoauszug importieren',
    [
      h(
        'p',
        {},
        'Wähle einen Kontoauszug als PDF oder die Umsätze als CSV aus dem Online-Banking. Bereits importierte Buchungen werden erkannt und übersprungen. Der Auszug bleibt auf deinem Gerät, nur die Buchungen werden gespeichert.',
      ),
      h(
        'label',
        { class: 'mn-btn filebtn' },
        'PDF- oder CSV-Datei wählen',
        h('input', {
          type: 'file',
          accept: '.csv,.pdf,text/csv,text/plain,application/pdf',
          onchange: async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 5 * 1024 * 1024)
              return formError(form, 'Die Datei ist größer als 5 MB.');
            const buf = await file.arrayBuffer();
            if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf')
              return importPdf(form, buf);
            // Many banks still export Windows-1252; fall back when UTF-8 shows replacement chars.
            let text = new TextDecoder('utf-8').decode(buf);
            if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
            previewImport(analyse(text));
          },
        }),
      ),
    ],
    [h('span', { class: 'mn-grow' })],
  );
}
/** A PDF statement: text via pdf.js, then the same preview as a CSV. */
async function importPdf(form, buf) {
  formError(form, '');
  let parsed;
  try {
    parsed = parseStatement(await readPdf(buf));
  } catch (err) {
    return formError(
      form,
      err?.name === 'PasswordException'
        ? 'Der Auszug ist mit einem Passwort geschützt. Speichere ihn ohne Passwort oder nutze den CSV-Export.'
        : 'Die PDF-Datei konnte nicht gelesen werden.',
    );
  }
  if (!parsed.rows.length)
    return formError(
      form,
      'In diesem PDF wurden keine Buchungen erkannt (gescannte Auszüge enthalten keinen Text). Nutze sonst den CSV-Export deiner Bank.',
    );
  previewImport(parsed);
}

async function previewImport(parsed) {
  const pick = (name, label, index) =>
    h(
      'label',
      { class: 'mn-field' },
      label,
      h(
        'select',
        { name, value: String(index) },
        h('option', { value: '-1' }, '–'),
        parsed.header.map((c, i) => h('option', { value: String(i) }, c || `Spalte ${i + 1}`)),
      ),
    );
  const summary = h('div', { class: 'import-summary' });
  let prepared = [];
  const update = async () => {
    const map = {
      date: Number(val(form, 'date')),
      amount: Number(val(form, 'amount')),
      text: Number(val(form, 'text')),
      party: Number(val(form, 'party')),
      sign: parsed.map.sign,
    };
    const found = toBookings({ rows: parsed.rows, map });
    try {
      await Promise.all([...new Set(found.map((b) => Number(b.date.slice(0, 4))))].map(ensureYear));
    } catch {
      // Without the existing bookings the duplicate check would overwrite them.
      prepared = [];
      summary.replaceChildren(
        h(
          'p',
          { class: 'mn-error' },
          'Deine bisherigen Buchungen konnten nicht geladen werden. Versuche es gleich noch einmal.',
        ),
      );
      importBtn.disabled = true;
      return;
    }
    const seen = new Map();
    prepared = found.map((b) => {
      const base = hash(`${b.date}|${b.cents}|${b.kind}|${b.party}|${b.text}`);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const booking = { ...b, id: `i${base}${n > 1 ? `-${n}` : ''}`, source: 'import', cat: '' };
      booking.cat = matchRule(S.settings.rules, booking, cats());
      if (
        booking.cat &&
        catById(booking.cat).kind !== booking.kind &&
        catById(booking.cat).kind !== 'transfer'
      )
        booking.cat = '';
      // a payment of a fixed cost: linked to it (and its category unless a rule decided)
      const rec = matchFixed(recList(), booking);
      if (rec) {
        booking.rec = rec;
        if (!booking.cat) booking.cat = S.recs.get(rec)?.cat ?? '';
      }
      return booking;
    });
    const fresh = prepared.filter((b) => !S.tx.has(keyOf(b)));
    summary.replaceChildren(
      h(
        'p',
        {},
        found.length
          ? `${found.length} Buchungen erkannt, davon ${fresh.length} neu und ${fresh.filter((b) => b.cat).length} automatisch zugeordnet${fresh.some((b) => b.rec) ? `, ${fresh.filter((b) => b.rec).length} als Fixkosten` : ''}.`
          : 'Keine Buchungen erkannt. Prüfe die Spaltenzuordnung.',
      ),
      parsed.guessed
        ? h(
            'p',
            { class: 'mn-note' },
            `Bei ${parsed.guessed} ${parsed.guessed === 1 ? 'Buchung' : 'Buchungen'} zeigt der Auszug nicht eindeutig, ob Aus- oder Eingang. Sie sind nach dem Text zugeordnet; prüfe sie nach dem Import.`,
          )
        : null,
      fresh.length
        ? h(
            'ul',
            { class: 'mn-list preview' },
            fresh
              .slice(0, 5)
              .map((b) =>
                h(
                  'li',
                  {},
                  h('span', {}, `${b.date.split('-').reverse().join('.')} ${b.party || b.text}`),
                  h(
                    'span',
                    {},
                    `${b.kind === 'income' ? '+' : '−'}${euro(b.cents)} · ${catName(b.cat)}`,
                  ),
                ),
              ),
          )
        : null,
    );
    importBtn.disabled = !fresh.length;
    importBtn.textContent = fresh.length ? `${fresh.length} importieren` : 'Importieren';
  };
  const importBtn = h(
    'button',
    {
      type: 'submit',
      class: 'mn-btn mn-btn--primary',
      onclick: async (e) => {
        e.preventDefault();
        const fresh = prepared.filter((b) => !S.tx.has(keyOf(b)));
        importBtn.disabled = true;
        let done = 0;
        try {
          for (const b of fresh) {
            const clean = cleanBooking(b, FIELDS);
            if (clean) {
              await saveBooking(clean);
              done++;
              // the bank shows the real payment: the automatic booking of that month goes
              if (clean.rec) {
                const auto = `r-${clean.rec}-${clean.date.slice(0, 7)}`;
                const key = [...S.tx].find(([, x]) => x.id === auto)?.[0];
                if (key) await deleteBooking(key);
              }
            }
            if (done % 20 === 0) importBtn.textContent = `${done} von ${fresh.length} …`;
          }
          closeDialog();
          toast(`${done} Buchungen importiert`);
          const latest = fresh
            .map((b) => b.date)
            .sort()
            .pop();
          if (latest) S.month = latest.slice(0, 7);
          go('bookings');
        } catch {
          formError(
            form,
            `Nach ${done} Buchungen abgebrochen. Importiere die Datei erneut, bereits gespeicherte werden übersprungen.`,
          );
          importBtn.disabled = false;
        }
      },
    },
    'Importieren',
  );
  const form = openDialog(
    'Kontoauszug importieren',
    [
      h(
        'div',
        { class: 'grid2', onchange: () => update() },
        pick('date', 'Datum', parsed.map.date),
        pick('amount', 'Betrag', parsed.map.amount),
        pick('party', 'Empfänger / Auftraggeber', parsed.map.party),
        pick('text', 'Verwendungszweck', parsed.map.text),
      ),
      summary,
    ],
    [h('span', { class: 'mn-grow' }), importBtn],
  );
  await update();
}

// ---------- export / backup ----------
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
async function exportYearCsv() {
  const year = Number(S.month.slice(0, 4));
  await ensureYear(year).catch(() => {});
  const rows = bookings()
    .filter((b) => b.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
  download(
    `buchungen-${year}.csv`,
    csv([
      ['Datum', 'Art', 'Betrag', 'Kategorie', 'Beschreibung', 'Empfänger/Auftraggeber', 'Steuer'],
      ...rows.map((b) => [
        b.date,
        KINDS[b.kind],
        plain(b.kind === 'income' ? b.cents : -b.cents),
        catName(b.cat),
        b.text,
        b.party,
        taxFieldOf(b) ? FIELDS[taxFieldOf(b)].label : '',
      ]),
    ]),
    'text/csv',
  );
}
async function exportBackup() {
  try {
    const mn = await ready;
    const [tx, profiles] = await Promise.all([mn.kv.list('tx:'), mn.kv.list('profile:')]);
    const data = {
      app: 'mininode-haushalt',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: S.settings,
      recurring: [...S.recs.values()],
      profiles: Object.fromEntries(profiles.map((p) => [p.key.slice(8), p.value])),
      bookings: tx.map((t) => t.value),
    };
    download(`haushalt-sicherung-${today()}.json`, JSON.stringify(data), 'application/json');
  } catch {
    toast('Die Sicherung konnte nicht erstellt werden.');
  }
}
async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    data = null;
  }
  if (data?.app !== 'mininode-haushalt' || !Array.isArray(data.bookings)) {
    toast('Diese Datei ist keine Haushalt-Sicherung.');
    return;
  }
  try {
    const mn = await ready;
    if (data.settings) {
      S.settings = cleanSettings(data.settings, FIELDS);
      await saveSettings();
    }
    for (const raw of Array.isArray(data.recurring) ? data.recurring : []) {
      const r = cleanRecurring(raw);
      if (r) {
        await mn.kv.set(`rec:${r.id}`, r);
        S.recs.set(r.id, r);
      }
    }
    for (const [year, p] of Object.entries(data.profiles ?? {}))
      if (/^\d{4}$/.test(year)) await saveProfile(Number(year), cleanProfile(p));
    let n = 0;
    for (const raw of data.bookings) {
      const b = cleanBooking(raw, FIELDS);
      if (b) {
        delete b.receipt;
        await saveBooking(b);
        n++;
      }
    }
    S.years.clear();
    S.tx.clear();
    await Promise.all([ensureYear(Number(S.month.slice(0, 4))), ensureYear(S.year)]);
    toast(`${n} Buchungen wiederhergestellt`);
  } catch {
    toast('Die Sicherung konnte nicht vollständig importiert werden.');
  }
  render();
}

// ---------- shell ----------
const VIEWS = {
  overview: viewOverview,
  bookings: viewBookings,
  plan: viewPlan,
  stats: viewStats,
  tax: viewTax,
  settings: viewSettings,
};
const TITLES = {
  overview: 'Übersicht',
  bookings: 'Buchungen',
  plan: 'Planung',
  stats: 'Statistik',
  tax: 'Steuer',
  settings: 'Einstellungen',
};
function subtitle() {
  const list = inMonth(S.month);
  if (S.tab === 'overview' || S.tab === 'bookings') {
    const open = list.filter((b) => !b.cat).length;
    return `${list.length} ${list.length === 1 ? 'Buchung' : 'Buchungen'}${open ? `, ${open} ohne Kategorie` : ''}`;
  }
  if (S.tab === 'plan')
    return S.plan === 'budget' ? 'Monatsbudget je Kategorie' : 'Was regelmäßig kommt und geht';
  if (S.tab === 'stats') return `Einnahmen, Ausgaben und Fixkosten ${S.year}`;
  if (S.tab === 'tax') return 'Automatisch aus deinen Buchungen';
  return 'Kategorien, Regeln und Daten';
}
function render() {
  for (const tab of document.querySelectorAll('.mn-tab')) {
    if (tab.dataset.tab === S.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  $('#title').textContent = TITLES[S.tab];
  const view = $('#view');
  const tools = $('#tools');
  if (S.loading) {
    $('#subtitle').textContent = 'Wird geladen …';
    tools.replaceChildren();
    view.replaceChildren(
      h(
        'div',
        { class: 'loading', 'aria-hidden': 'true' },
        h('span', { class: 'mn-sk' }),
        h('span', { class: 'mn-sk' }),
        h('span', { class: 'mn-sk' }),
      ),
    );
    return;
  }
  $('#subtitle').textContent = subtitle();
  const settingsBtn = h(
    'button',
    {
      type: 'button',
      class: 'mn-icon-btn settings-btn',
      'aria-label': 'Einstellungen',
      onclick: () => go('settings'),
    },
    icon('gear'),
  );
  tools.replaceChildren(
    ...(S.tab === 'settings'
      ? []
      : S.tab === 'tax' || S.tab === 'stats'
        ? [
            stepper(
              S.tab === 'tax' ? 'Steuerjahr' : 'Jahr',
              String(S.year),
              'Vorheriges Jahr',
              'Nächstes Jahr',
              changeYear,
            ),
          ]
        : [monthStepper()]),
    S.tab === 'settings' ? null : settingsBtn,
  );
  view.replaceChildren(...VIEWS[S.tab]().flat(Number.POSITIVE_INFINITY).filter(Boolean));
}
function go(tab) {
  S.tab = tab;
  render();
  window.scrollTo(0, 0);
}
for (const tab of document.querySelectorAll('.mn-tab'))
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'stats')
      Promise.all([ensureYear(S.year), ensureYear(S.year - 1)]).then(
        () => go('stats'),
        () => go('stats'),
      );
    else if (tab.dataset.tab === 'tax')
      ensureProfile(S.year).then(
        () => go('tax'),
        () => go('tax'),
      );
    else go(tab.dataset.tab);
  });
// The add buttons exist before the data: wait for categories so the dialog is complete.
for (const add of document.querySelectorAll('[data-add]'))
  add.addEventListener('click', () => firstLoad.then(() => editBooking(null)));
// Other devices may have changed something while this tab was hidden: reload quietly and swap
// the data in one step, at most every 30 seconds.
let refreshedAt = Date.now();
async function refresh() {
  const mn = await ready;
  const years = [...S.years];
  const before = writes;
  const [settings, recs, ...lists] = await Promise.all([
    mn.kv.get('settings'),
    mn.kv.list('rec:'),
    ...years.map((y) => mn.kv.list(`tx:${y}-`)),
  ]);
  const next = new Map();
  for (const rows of lists)
    for (const { key, value } of rows) {
      const b = cleanBooking(value, FIELDS);
      if (b) next.set(key, b);
    }
  if (writes !== before) return;
  if (settings) S.settings = cleanSettings(settings, FIELDS);
  S.recs = new Map(
    recs
      .map((r) => cleanRecurring(r.value))
      .filter(Boolean)
      .map((r) => [r.id, r]),
  );
  S.tx = next;
  S.profiles.clear();
  await ensureProfile(S.year);
  await runRecurring();
  if (!sheetOpen) render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || S.loading || Date.now() - refreshedAt < 30_000) return;
  refreshedAt = Date.now();
  refresh().catch(() => {});
});
render();
const firstLoad = load();
