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
import {
  bookingTable,
  bookingToRow,
  copyFromKv,
  loadBookings,
  loadProfile,
  loadProfiles,
  loadRecurring,
  loadSettings,
  profileRow,
  profileTable,
  recRow,
  recTable,
  saveSettingsRows,
} from './store.js';
import { buildReturn, euro, FIELDS, FORMS } from './tax.js';

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const t = (key, params) => window.mnI18n.t(key, params);
/** The language of the page: 'de-DE' or 'en-GB' (kit/i18n.js). */
const loc = () => window.mnI18n.locale;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const newId = () => crypto.randomUUID();
const monthName = (ym) =>
  new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric' }).format(
    new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1),
  );
const shortMonth = (m) =>
  new Intl.DateTimeFormat(loc(), { month: 'short' }).format(new Date(2000, m, 1)).replace('.', '');
const dayLabel = (ds) =>
  new Intl.DateTimeFormat(loc(), { weekday: 'short', day: 'numeric', month: 'long' }).format(
    new Date(Number(ds.slice(0, 4)), Number(ds.slice(5, 7)) - 1, Number(ds.slice(8, 10))),
  );
/** '2026-10-01' → '01. Okt. 2026' (App Kit, the same in every app). */
const dateText = (ds) => window.mnui?.date.format(ds) || ds;
const shiftMonth = (ym, n) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
/** Cents → "1234,56" for inputs and for pasting into ELSTER (always German: the form wants it). */
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
const GERMAN_DEFAULTS = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));
/** An unrenamed starting category follows the language; a renamed or own one shows its own name. */
const catLabel = (c) => (GERMAN_DEFAULTS.get(c.id) === c.name ? t(`defaultCat.${c.id}`) : c.name);
const catName = (id) => {
  const c = catById(id);
  return c ? catLabel(c) : t(id ? 'category.deleted' : 'category.none');
};
const fieldLabel = (id) => t(FIELDS[id].label);
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
  // One list for all years: the table is read as a whole, also offline.
  for (const b of await loadBookings(mn, FIELDS)) {
    S.tx.set(keyOf(b), b);
    S.years.add(Number(b.date.slice(0, 4)));
  }
  S.years.add(year);
}
// Bumped on every write; a background refresh that overlaps a write is thrown away.
let writes = 0;
async function saveBooking(b, oldKey) {
  writes++;
  const mn = await ready;
  const key = keyOf(b);
  await bookingTable(mn).upsert(bookingToRow(b));
  S.tx.set(key, b);
  // A new date changes the key in memory; the row is the same one.
  if (oldKey && oldKey !== key) S.tx.delete(oldKey);
}
async function deleteBooking(key) {
  writes++;
  const mn = await ready;
  const b = S.tx.get(key);
  if (b) await bookingTable(mn).remove(b.id);
  S.tx.delete(key);
  if (b?.receipt) mn.files.remove(b.receipt).catch(() => {});
}
async function saveSettings() {
  const mn = await ready;
  await saveSettingsRows(mn, S.settings);
}
async function saveProfile(year, profile) {
  const mn = await ready;
  await profileTable(mn).upsert(profileRow(year, profile));
  S.profiles.set(year, profile);
}
async function ensureProfile(year) {
  if (S.profiles.has(year)) return;
  const mn = await ready;
  S.profiles.set(year, await loadProfile(mn, year));
}

/** Books what standing orders owe up to today. Ids are deterministic, so a second device or a
 * second run writes the same keys instead of duplicates. */
async function runRecurring() {
  const mn = await ready;
  const day = today();
  let added = 0;
  for (const rec of S.recs.values()) {
    const due = dueRecurring(rec, day);
    if (!due.length) continue;
    for (const { month, booking } of due) {
      const key = keyOf(booking);
      // paid through the bank (imported and recognised): not booked a second time
      if (paidByBank(rec.id, month)) continue;
      if (!S.tx.has(key)) {
        await bookingTable(mn).upsert(bookingToRow(booking));
        S.tx.set(key, booking);
        added++;
      }
    }
    const next = { ...rec, until: due[due.length - 1].month };
    await recTable(mn).upsert(recRow(next));
    S.recs.set(rec.id, next);
  }
  if (added) toast(t('toast.fixedBooked', { n: added }));
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
    const wanted = calendarPayments(
      recList(),
      today(),
      (id) => (id ? catName(id) : ''),
      12,
      t('fixed.fallbackName'),
    );
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
    // Older versions kept everything as kv entries: copy them into the tables once.
    await copyFromKv(mn, FIELDS);
    const [settings, recs] = await Promise.all([loadSettings(mn, FIELDS), loadRecurring(mn)]);
    if (settings) S.settings = settings;
    else {
      S.settings = { categories: DEFAULT_CATEGORIES, rules: DEFAULT_RULES };
      await saveSettings();
    }
    S.recs = new Map(recs.map((r) => [r.id, r]));
    const year = Number(today().slice(0, 4));
    // Standing orders may reach back into last year; the tax view usually wants it too.
    await Promise.all([ensureYear(year), ensureYear(year - 1), ensureProfile(S.year)]);
    await runRecurring();
    calendarSoon(5000);
  } catch {
    toast(t('error.loadData'));
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
  stepper(
    t('stepper.month'),
    monthName(S.month),
    t('stepper.prevMonth'),
    t('stepper.nextMonth'),
    changeMonth,
  );
async function changeMonth(n) {
  S.month = shiftMonth(S.month, n);
  await ensureYear(Number(S.month.slice(0, 4))).catch(() => toast(t('error.loadFailed')));
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
        t('overview.deviation', {
          n: devs.length,
          list: devs
            .map((d) =>
              t('overview.deviationItem', {
                name: d.rec.text || catName(d.rec.cat),
                actual: euro(d.booking.cents),
                expected: euro(d.expected),
              }),
            )
            .join(', '),
        }),
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
          t('common.view'),
        ),
      )
    : null;

  if (list.length === 0)
    return [
      moneyCard(),
      empty(
        t('overview.emptyTitle'),
        t('overview.emptyText'),
        h(
          'button',
          { class: 'mn-btn mn-btn--primary', onclick: () => editBooking(null) },
          t('action.addBooking'),
        ),
        h('button', { class: 'mn-btn', onclick: () => openImport() }, t('action.importStatement')),
      ),
    ];

  const chart = h(
    'div',
    { class: 'mn-card' },
    h(
      'div',
      { class: 'chart', role: 'img', 'aria-label': t('overview.chartLabel', { year }) },
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
            'aria-label': t('overview.monthLabel', {
              month: monthName(x.ym),
              income: euro(x.income),
              expense: euro(x.expense),
            }),
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
        t('overview.legendIncome', { amount: euro(months.reduce((s, x) => s + x.income, 0)) }),
      ),
      h(
        'span',
        {},
        h('i', { class: 'out' }),
        t('overview.legendExpense', { amount: euro(months.reduce((s, x) => s + x.expense, 0)) }),
      ),
    ),
  );

  return [
    moneyCard(),
    devBanner,
    h(
      'div',
      { class: 'mn-kpis' },
      kpi(t('common.income'), euro(income), 'pos'),
      kpi(t('common.expenses'), euro(expense)),
      kpi(
        t(saldo >= 0 ? 'overview.surplus' : 'overview.shortfall'),
        euro(Math.abs(saldo)),
        saldo >= 0 ? 'pos' : 'neg',
      ),
      kpi(
        t('overview.savingsRate'),
        income > 0 ? t('common.percent', { n: Math.round((saldo / income) * 100) }) : '–',
      ),
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
                t('overview.budget'),
                h(
                  'button',
                  {
                    class: 'mn-link',
                    onclick: () => {
                      S.plan = 'budget';
                      go('plan');
                    },
                  },
                  t('common.details'),
                ),
              ),
              h(
                'div',
                { class: 'mn-list' },
                barRow(
                  t('overview.budgetOf', { spent: euro(spentInBudget), budget: euro(budget) }),
                  spentInBudget > budget
                    ? t('overview.budgetOver', { amount: euro(spentInBudget - budget) })
                    : t('overview.budgetLeft', { amount: euro(budget - spentInBudget) }),
                  meter(spentInBudget, budget, spentInBudget > budget),
                  overCats.length
                    ? h(
                        'span',
                        { class: 'mn-chip mn-chip--bad over-note' },
                        t('overview.exceeded', {
                          list: overCats.map((c) => catLabel(c)).join(', '),
                        }),
                      )
                    : null,
                ),
              ),
            ]
          : null,
        top.length
          ? [
              sect(t('overview.byCategory')),
              h(
                'div',
                { class: 'mn-list' },
                top.map(([cat, cents]) =>
                  barRow(
                    catName(cat),
                    `${euro(cents)}, ${t('common.percent', { n: Math.round((cents / expense) * 100) })}`,
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
        sect(t('overview.year', { year })),
        chart,
        sect(
          t('overview.taxRelevant'),
          h(
            'button',
            {
              class: 'mn-link',
              onclick: () => {
                S.year = Number(year);
                go('tax');
              },
            },
            t('overview.toTax'),
          ),
        ),
        h(
          'div',
          { class: 'mn-card' },
          taxYear.length
            ? [
                h('span', { class: 'mn-big' }, euro(taxSum)),
                h('p', { class: 'mn-note' }, t('overview.taxFlow', { n: taxYear.length, year })),
              ]
            : h('p', { class: 'mn-note' }, t('overview.taxNone', { year })),
        ),
      ),
    ),
  ];
}

// ---------- Planung: Fixkosten und Budgets ----------
const everyLabel = (months) => t(`every.${months}`);
const recList = () => [...S.recs.values()];

/** Adopts a different payment as the new amount from its month on. */
async function adoptAmount(rec, booking) {
  const from = booking.date.slice(0, 7);
  const next = cleanRecurring({
    ...rec,
    changes: [...rec.changes.filter((c) => c.from < from), { from, cents: booking.cents }],
  });
  const mn = await ready;
  await recTable(mn).upsert(recRow(next));
  S.recs.set(next.id, next);
  calendarSoon();
  toast(
    t('toast.amountAdopted', {
      name: next.text || t('fixed.fallbackName'),
      amount: euro(booking.cents),
      month: monthName(from),
    }),
  );
  render();
}

function fixedRow(rec) {
  const day = today();
  const month = S.month;
  const st = fixedStatus(rec, month);
  const due = nextDue(rec, day);
  const amount = amountFor(rec, month);
  const dev = deviations(rec, bookings())[0];
  const parts = [`${euro(amount)} ${everyLabel(rec.every)}`];
  if (st === 'ended') parts.push(t('fixed.endedIn', { month: monthName(rec.end) }));
  else if (rec.end) parts.push(t('fixed.lastPayment', { month: monthName(rec.end) }));
  else if (due) parts.push(t('fixed.nextOn', { day: dayLabel(due) }));
  if (st === 'upcoming') parts.push(t('fixed.startsIn', { month: monthName(rec.start) }));
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
        t('fixed.perMonth'),
      ),
    ),
    st === 'ending'
      ? h('span', { class: 'mn-chip mn-chip--warn fixed-chip' }, t('fixed.endsThisMonth'))
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
            t('fixed.deviation', {
              day: dayLabel(dev.booking.date),
              actual: euro(dev.booking.cents),
              expected: euro(dev.expected),
              diff: `${dev.booking.cents > dev.expected ? '+' : '−'}${euro(Math.abs(dev.booking.cents - dev.expected))}`,
            }),
          ),
          h(
            'button',
            { type: 'button', class: 'mn-link', onclick: () => void adoptAmount(rec, dev.booking) },
            t('fixed.adopt'),
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
        t('fixed.emptyTitle'),
        t('fixed.emptyText'),
        h(
          'button',
          { class: 'mn-btn mn-btn--primary', onclick: () => editRecurring(null) },
          t('fixed.add'),
        ),
      ),
    ];
  const groups = Object.entries(FIXED_TYPES) // type → language key
    .map(([type, key]) => [t(key), live.filter((r) => r.type === type)])
    .filter(([, list]) => list.length);
  return [
    h(
      'div',
      { class: 'mn-kpis' },
      kpi(t('fixed.kpiCosts'), euro(costs)),
      kpi(t('fixed.kpiIncome'), euro(income), 'pos'),
      kpi(
        t(income - costs >= 0 ? 'fixed.leftPerMonth' : 'fixed.missingPerMonth'),
        euro(Math.abs(income - costs)),
        income - costs >= 0 ? 'pos' : 'neg',
      ),
      kpi(t('fixed.perYear'), euro(costs * 12)),
    ),
    h('p', { class: 'mn-note' }, t('fixed.note')),
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
          h('summary', {}, t('fixed.ended', { n: ended.length })),
          h('div', { class: 'mn-list' }, ended.map(fixedRow)),
        )
      : null,
    h(
      'button',
      { type: 'button', class: 'mn-btn fixed-add', onclick: () => editRecurring(null) },
      icon('plus'),
      t('fixed.add'),
    ),
  ];
}

function viewPlan() {
  const seg = h(
    'div',
    { class: 'mn-seg plan-seg', role: 'group', 'aria-label': t('plan.label') },
    [
      ['fixed', t('plan.fixed')],
      ['budget', t('plan.budgets')],
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
      h('h2', { class: 'money-title' }, t('money.title')),
      h('p', { class: 'mn-note' }, t('money.setup')),
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
        t('money.toPlan'),
      ),
    );
  const over = m.spent > m.available;
  const behind = m.ahead < 0;
  const state = over ? 'bad' : behind ? 'warn' : 'ok';
  const chip = over
    ? t('money.chipOver', { amount: euro(m.spent - m.available) })
    : !current
      ? day === days
        ? t('money.chipLeft', { amount: euro(m.left) })
        : t('money.chipPlanned')
      : behind
        ? t('money.chipBehind', { amount: euro(-m.ahead) })
        : t('money.chipAhead', { amount: euro(m.ahead) });
  const bar = h('span', { class: `money-fill money-${state}` });
  bar.style.transform = `scaleX(${m.available > 0 ? Math.min(1, m.spent / m.available) : 1})`;
  const mark = h('span', { class: 'money-mark', 'aria-hidden': 'true' });
  mark.style.left = `${m.available > 0 ? Math.min(100, (m.pace / m.available) * 100) : 0}%`;
  const headline = current
    ? over
      ? t('money.allSpent')
      : t('money.freeToday', { amount: euro(m.perDay ?? 0) })
    : day === days
      ? t(over ? 'money.overspent' : 'money.managed')
      : t('money.available', { amount: euro(m.available) });
  return h(
    'section',
    { class: 'mn-card money', 'aria-label': t('money.title') },
    h(
      'div',
      { class: 'money-head' },
      h('h2', { class: 'money-title' }, t('money.title')),
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
          days - day === 0
            ? t('money.noteLast', {
                left: euro(Math.max(0, m.left)),
                pace: euro(m.pace),
                spent: euro(m.spent),
              })
            : t('money.noteMore', {
                n: days - day,
                left: euro(Math.max(0, m.left)),
                pace: euro(m.pace),
                spent: euro(m.spent),
              }),
        )
      : null,
    h(
      'div',
      {
        class: 'money-track',
        role: 'meter',
        'aria-label': t('money.meter'),
        'aria-valuemin': '0',
        'aria-valuemax': String(Math.max(0, m.available) / 100),
        'aria-valuenow': String(m.spent / 100),
        'aria-valuetext': current
          ? t('money.valueTextPace', {
              spent: euro(m.spent),
              available: euro(m.available),
              pace: euro(m.pace),
            })
          : t('money.valueText', { spent: euro(m.spent), available: euro(m.available) }),
      },
      bar,
      current ? mark : null,
    ),
    h(
      'div',
      { class: 'money-scale' },
      h('span', {}, t('money.spent', { amount: euro(m.spent) })),
      h('span', {}, t('money.freeInMonth', { amount: euro(m.available) })),
    ),
    h(
      'dl',
      { class: 'mn-facts money-facts' },
      h(
        'div',
        {},
        h('dt', {}, t(m.basis === 'income' ? 'common.income' : 'plan.budgets')),
        h('dd', {}, euro(m.basis === 'income' ? m.income : budgets)),
      ),
      m.basis === 'income'
        ? h('div', {}, h('dt', {}, t('money.fixedAndSavings')), h('dd', {}, `−${euro(m.fixed)}`))
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
  if (!list.length) return [empty(t('stats.emptyTitle', { year }), t('stats.emptyText'))];
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
        'aria-label': t('overview.chartLabel', { year }),
      },
      months.map((x) => {
        const seg = (v, cls) => {
          const el = h('i', { class: cls });
          el.style.height = `${(v / max) * 100}%`;
          return el;
        };
        const label = t('stats.monthLabel', {
          month: monthName(x.ym),
          income: euro(x.income),
          fixed: euro(x.fixed),
          other: euro(x.variable),
        });
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
      h('span', {}, h('i', { class: 's1' }), t('overview.legendIncome', { amount: euro(income) })),
      h('span', {}, h('i', { class: 's2' }), t('stats.legendFixed', { amount: euro(fixedSum) })),
      h(
        'span',
        {},
        h('i', { class: 's3' }),
        t('stats.legendOther', { amount: euro(expense - fixedSum) }),
      ),
    ),
    h(
      'details',
      { class: 'mn-more' },
      h('summary', {}, t('stats.asTable')),
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
              ['month', 'income', 'fixed', 'other', 'saved', 'balance'].map((id) =>
                h('th', { scope: 'col' }, t(`stats.col.${id}`)),
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
      t('stats.delta', { pct: `${pct > 0 ? '+' : ''}${pct}`, year: prevYear }),
    );
  };

  return [
    h(
      'div',
      { class: 'mn-kpis' },
      kpi(t('stats.avgIncome'), euro(Math.round(income / n)), 'pos'),
      kpi(t('stats.avgExpense'), euro(Math.round(expense / n))),
      kpi(
        t('stats.fixedRate'),
        income > 0 ? t('common.percent', { n: Math.round((fixedSum / income) * 100) }) : '–',
      ),
      kpi(
        t('overview.savingsRate'),
        income > 0
          ? t('common.percent', { n: Math.round(((income - expense) / income) * 100) })
          : '–',
        income - expense >= 0 ? 'pos' : 'neg',
      ),
    ),
    h(
      'div',
      { class: 'mn-cols' },
      h('div', {}, sect(t('stats.months', { year })), chart),
      h(
        'div',
        {},
        sect(t('overview.byCategory')),
        h(
          'div',
          { class: 'mn-list' },
          topCats.map(([cat, cents]) =>
            barRow(
              catName(cat),
              t('stats.catLine', { total: euro(cents), avg: euro(Math.round(cents / n)) }),
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
        sect(t('stats.fixedByType')),
        types.length
          ? h(
              'div',
              { class: 'mn-list' },
              types.map(([type, cents]) =>
                barRow(
                  t(FIXED_TYPES[type]),
                  t('stats.perMonthAmount', { amount: euro(cents) }),
                  meter(cents, types[0][1]),
                ),
              ),
            )
          : h('p', { class: 'mn-note' }, t('stats.noFixed')),
      ),
      h(
        'div',
        {},
        sect(t('stats.topPayees')),
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
      h('span', { class: 'mn-row-title' }, b.text || b.party || t(KINDS[b.kind])),
      h(
        'span',
        { class: 'mn-row-sub' },
        [catName(b.cat), b.text && b.party ? b.party : ''].filter(Boolean).join(' · '),
      ),
      field || b.receipt
        ? h(
            'span',
            { class: 'tx-tags' },
            field
              ? h('span', { class: 'mn-chip' }, t('booking.taxChip', { field: fieldLabel(field) }))
              : null,
            b.receipt
              ? h('span', { class: 'mn-chip mn-chip--plain' }, icon('clip'), t('booking.receipt'))
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
        ? h('span', { class: 'neg' }, t('booking.noCategory'))
        : b.kind === 'expense'
          ? null
          : t(KINDS[b.kind]),
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
      ? h('p', { class: 'mn-note' }, t('bookings.noMatch'))
      : empty(t('bookings.emptyTitle'), t('bookings.emptyText'));
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
          placeholder: t('bookings.searchPlaceholder'),
          'aria-label': t('bookings.searchLabel'),
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
          'aria-label': t('bookings.filterLabel'),
          value: S.cat,
          onchange: (e) => {
            S.cat = e.target.value;
            refresh();
          },
        },
        h('option', { value: '' }, t('bookings.allCategories')),
        h('option', { value: '-' }, t('category.none')),
        cats().map((c) => h('option', { value: c.id }, catLabel(c))),
      ),
      h(
        'button',
        { class: 'mn-btn', onclick: () => openImport() },
        icon('upload'),
        t('action.importStatement'),
      ),
    ),
    uncategorised && S.cat !== '-'
      ? h(
          'div',
          { class: 'mn-banner mn-banner--warn', role: 'note' },
          h('span', {}, t('bookings.uncategorised', { n: uncategorised })),
          h(
            'button',
            {
              class: 'mn-link',
              onclick: () => {
                S.cat = '-';
                render();
              },
            },
            t('common.show'),
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
        h('label', { for: id }, catLabel(c)),
        h(
          'span',
          { class: 'budget-input' },
          h('input', {
            id,
            inputmode: 'decimal',
            autocomplete: 'off',
            placeholder: t('budget.none'),
            value: c.budget ? plain(c.budget) : '',
            onchange: async (e) => {
              const v = e.target.value.trim() ? parseAmount(e.target.value) : 0;
              if (v === null || v < 0) {
                toast(t('budget.invalid'));
                return;
              }
              c.budget = v;
              try {
                await saveSettings();
                render();
              } catch {
                toast(t('error.saveFailed'));
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
              h('span', {}, t('budget.spent', { amount: euro(s) })),
              h(
                'span',
                { class: over ? 'neg' : '' },
                over
                  ? t('overview.budgetOver', { amount: euro(s - c.budget) })
                  : t('overview.budgetLeft', { amount: euro(c.budget - s) }),
              ),
            ),
          ]
        : s
          ? h(
              'span',
              { class: 'mn-note budget-state' },
              t('budget.spentNoBudget', { amount: euro(s) }),
            )
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
          kpi(t('overview.budget'), euro(total)),
          kpi(t('budget.kpiSpent'), euro(totalSpent), totalSpent > total ? 'neg' : ''),
          kpi(
            t(totalSpent > total ? 'budget.kpiExceeded' : 'budget.kpiLeft'),
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
        sect(t('budget.with'), h('small', {}, String(withBudget.length))),
        withBudget.length
          ? h('div', { class: 'mn-list' }, withBudget.map(row))
          : h('p', { class: 'mn-note' }, t('budget.enterHint')),
        rest > 0
          ? h('p', { class: 'mn-note' }, t('budget.restWithout', { amount: euro(rest) }))
          : null,
      ),
      h(
        'div',
        {},
        sect(t('budget.without'), h('small', {}, String(without.length))),
        h('div', { class: 'mn-list' }, without.map(row)),
        h('p', { class: 'mn-note' }, t('budget.note')),
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
          toast(t('error.saveFailed'));
        }
      },
    },
    h(
      'div',
      { class: 'profile-fields' },
      field('commuteKm', t('profile.commuteKm')),
      field('commuteDays', t('profile.commuteDays')),
      field('homeofficeDays', t('profile.homeofficeDays'), t('profile.homeofficeHint')),
      field('children', t('profile.children')),
      field('income', t('profile.income'), t('profile.incomeHint'), {
        money: true,
        placeholder: t('profile.optional'),
      }),
    ),
    h(
      'div',
      { class: 'mn-checks' },
      h(
        'label',
        {},
        h('input', { type: 'checkbox', name: 'employee', checked: p.employee }),
        t('profile.employee'),
      ),
      h(
        'label',
        {},
        h('input', { type: 'checkbox', name: 'car', checked: p.car }),
        h('span', {}, t('profile.car'), h('small', {}, t('profile.carHint'))),
      ),
      h(
        'label',
        {},
        h('input', { type: 'checkbox', name: 'married', checked: p.married }),
        t('profile.married'),
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
    toast(t('tax.copied', { text }));
  } catch {
    toast(t('tax.copyFailed'));
  }
}
function formsView(year) {
  const profile = S.profiles.get(year) ?? cleanProfile(null);
  const forms = buildReturn(year, taxBookings(year), profile, t).filter(
    (f) => f.id !== 'N' || profile.employee,
  );
  return forms.map((f) => {
    const rows = f.rows.filter((r) => r.cents > 0);
    return h(
      'section',
      { class: 'form-sheet mn-card', 'aria-labelledby': `form-${f.id}` },
      h('header', {}, h('h3', { id: `form-${f.id}` }, t(f.title)), h('p', {}, t(f.sub))),
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
                h('th', { scope: 'col' }, t('tax.col.entry')),
                h('th', { scope: 'col', class: 'num' }, t('tax.col.amount')),
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
                      ? h(
                          'small',
                          { class: 'pos' },
                          t('tax.deductible', { amount: euro(r.deductible) }),
                        )
                      : null,
                    r.reduction
                      ? h(
                          'small',
                          { class: 'pos' },
                          t('tax.reduction', { amount: euro(r.reduction) }),
                        )
                      : null,
                    r.items?.length
                      ? h(
                          'details',
                          {},
                          h('summary', {}, t('tax.items', { n: r.items.length })),
                          h(
                            'ul',
                            {},
                            r.items.map((b) =>
                              h(
                                'li',
                                {},
                                h('span', {}, `${dateText(b.date)} ${b.text || b.party}`),
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
                        'aria-label': t('tax.copyAria', { label: r.label, amount: plain(r.cents) }),
                        onclick: () => copy(plain(r.cents)),
                      },
                      t('tax.copy'),
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
                h('th', { scope: 'row' }, t('tax.sum')),
                h('td', { class: 'num' }, euro(f.total)),
              ),
            ),
          )
        : h('p', { class: 'mn-note' }, t('tax.noEntries')),
      f.summary ? h('p', { class: 'summary' }, f.summary) : null,
    );
  });
}
function exportTaxCsv(year) {
  const profile = S.profiles.get(year) ?? cleanProfile(null);
  const lines = [
    [
      t('tax.csv.form'),
      t('tax.col.entry'),
      t('tax.col.amount'),
      t('tax.csv.deductible'),
      t('tax.csv.reduction'),
    ],
  ];
  for (const f of buildReturn(year, taxBookings(year), profile, t))
    for (const r of f.rows.filter((x) => x.cents > 0))
      lines.push([
        t(f.title),
        r.label,
        plain(r.cents),
        r.deductible !== undefined ? plain(r.deductible) : '',
        r.reduction ? plain(r.reduction) : '',
      ]);
  lines.push([]);
  lines.push([
    t('tax.csv.date'),
    t('tax.csv.booking'),
    t('tax.col.amount'),
    t('tax.col.entry'),
    t('tax.csv.category'),
  ]);
  for (const b of taxBookings(year))
    lines.push([
      b.date,
      b.text || b.party,
      plain((b.kind === 'income' ? -1 : 1) * (b.taxCents ?? b.cents)),
      fieldLabel(b.taxField),
      catName(b.cat),
    ]);
  download(t('tax.csv.file', { year }), csv(lines), 'text/csv');
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
          h('h3', {}, t('tax.detailsFor', { year })),
          h('p', { class: 'mn-note' }, t('tax.detailsNote')),
          profileForm(year),
        ),
        h(
          'div',
          { class: 'tax-actions' },
          h('button', { class: 'mn-btn', onclick: () => window.print() }, t('tax.print')),
          h('button', { class: 'mn-btn', onclick: () => exportTaxCsv(year) }, t('tax.exportCsv')),
        ),
        h('p', { class: 'mn-note' }, t('tax.note')),
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
    toast(t('error.loadFailed'));
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
      : h('option', { value: '' }, t('tax.notRelevant')),
    withInherit ? h('option', { value: 'none' }, t('tax.notRelevant')) : null,
    FORMS.map((f) =>
      h(
        'optgroup',
        { label: t(f.title) },
        Object.entries(FIELDS)
          .filter(([, x]) => x.form === f.id)
          .map(([k, x]) => h('option', { value: k }, t(x.label))),
      ),
    ),
  );
}
function catSelect(name, value, kind) {
  const list = cats().filter((c) => !kind || c.kind === kind);
  return h(
    'select',
    { name, value },
    h('option', { value: '' }, t('category.none')),
    list.map((c) => h('option', { value: c.id }, catLabel(c))),
  );
}
function viewSettings() {
  const recs = [...S.recs.values()].sort((a, b) => a.text.localeCompare(b.text, loc()));
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
  const add = (onclick) => h('button', { class: 'mn-link', onclick }, t('common.add'));
  return [
    h(
      'div',
      { class: 'mn-cols' },
      h(
        'div',
        {},
        sect(
          t('settings.categories'),
          add(() => editCategory(null)),
        ),
        Object.keys(KINDS).map((kind) => [
          h('h3', { class: 'group-head' }, t(`settings.group.${kind}`)),
          h(
            'div',
            { class: 'mn-list' },
            cats()
              .filter((c) => c.kind === kind)
              .map((c) =>
                row(
                  catLabel(c),
                  [
                    c.budget ? t('settings.perMonth', { amount: euro(c.budget) }) : '',
                    c.tax ? fieldLabel(c.tax) : '',
                  ]
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
        sect(t('settings.fixedTitle')),
        h(
          'p',
          { class: 'mn-note' },
          recs.length ? t('settings.fixedNoteCount', { n: recs.length }) : t('settings.fixedNote'),
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
            t('money.toPlan'),
          ),
        ),
        sect(
          t('settings.rules'),
          add(() => editRule(null)),
        ),
        h('p', { class: 'mn-note rules-note' }, t('settings.rulesNote')),
        h(
          'div',
          { class: 'mn-list' },
          S.settings.rules.map((r, i) =>
            row(r.match, t('settings.ruleTo', { cat: catName(r.cat) }), () => editRule(i)),
          ),
        ),
        h('button', { class: 'mn-btn apply-rules', onclick: applyRules }, t('settings.applyRules')),
        sect(t('settings.data')),
        h(
          'div',
          { class: 'mn-card' },
          h('p', { class: 'mn-note data-note' }, t('settings.backupNote')),
          h(
            'div',
            { class: 'data-actions' },
            h('button', { class: 'mn-btn', onclick: exportBackup }, t('settings.backupExport')),
            h(
              'label',
              { class: 'mn-btn filebtn' },
              t('settings.backupImport'),
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
              t('settings.yearCsv', { year: S.month.slice(0, 4) }),
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
    toast(n ? t('toast.assigned', { n }) : t('toast.nothingFound'));
  } catch {
    toast(t('error.saveFailed'));
  }
  render();
}

// ---------- dialogs (App Kit sheets: focus trap, Escape, inert page) ----------
let sheetOpen = false;
/** Opens a sheet with a bar (Cancel, title), the form and a footer with the actions. */
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
        t('common.cancel'),
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
              t('receipt.open'),
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
              t('common.remove'),
            ),
          )
        : h(
            'label',
            { class: 'mn-btn filebtn' },
            icon('clip'),
            t('receipt.attach'),
            h('input', {
              type: 'file',
              accept: 'image/*,application/pdf',
              onchange: async (e) => {
                const file = e.target.files[0];
                e.target.value = '';
                if (!file) return;
                if (file.size > 20 * 1024 * 1024) {
                  toast(t('receipt.tooBig'));
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
                  toast(t('receipt.uploadFailed'));
                }
              },
            }),
          ),
    );
  drawReceipt();
  const kindSeg = h(
    'div',
    { class: 'mn-seg kind-seg', role: 'radiogroup', 'aria-label': t('field.kind') },
    Object.entries(KINDS).map(([k, label]) =>
      h(
        'label',
        {},
        h('input', { type: 'radio', name: 'kind', value: k, checked: b.kind === k }),
        h('span', {}, t(label)),
      ),
    ),
  );
  const catHost = h(
    'label',
    { class: 'mn-field' },
    t('field.category'),
    catSelect('cat', b.cat, b.kind),
  );
  kindSeg.addEventListener('change', () => {
    const kind = val(form, 'kind');
    catHost.replaceChildren(
      t('field.category'),
      catSelect('cat', catById(val(form, 'cat'))?.kind === kind ? val(form, 'cat') : '', kind),
    );
  });
  const inherit = (catId) => {
    const c = catById(catId);
    return c?.tax ? t('tax.likeCategory', { field: fieldLabel(c.tax) }) : t('tax.likeCategoryNone');
  };
  const taxHost = h(
    'label',
    { class: 'mn-field' },
    t('field.taxReturn'),
    taxSelect('taxField', b.taxField ?? '', inherit(b.cat)),
  );
  // The first option names what the category would put into the tax return.
  const refreshTax = () =>
    taxHost.replaceChildren(
      t('field.taxReturn'),
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
        t('field.amountEur'),
        h('input', {
          name: 'amount',
          inputmode: 'decimal',
          autocomplete: 'off',
          required: true,
          value: b.cents ? plain(b.cents) : '',
          placeholder: t('field.amountPlaceholder'),
        }),
      ),
      h(
        'label',
        { class: 'mn-field' },
        t('field.date'),
        h('input', { name: 'date', type: 'date', required: true, value: b.date }),
      ),
    ),
    h(
      'label',
      { class: 'mn-field' },
      t('field.description'),
      h('input', {
        name: 'text',
        maxlength: 200,
        value: b.text,
        placeholder: t('field.descriptionPlaceholder'),
      }),
    ),
    h(
      'label',
      { class: 'mn-field' },
      t('field.party'),
      h('input', { name: 'party', maxlength: 120, value: b.party }),
    ),
    catHost,
    taxHost,
    h(
      'label',
      { class: 'mn-field' },
      t('field.taxAmount'),
      h('input', {
        name: 'taxAmount',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: b.taxCents !== undefined ? plain(b.taxCents) : '',
        placeholder: t('field.taxAmountPlaceholder'),
      }),
      h('small', {}, t('field.taxAmountHint')),
    ),
    receiptHost,
  ];
  const form = openDialog(
    t(old ? 'booking.edit' : 'booking.new'),
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
                  toast(t('toast.bookingDeleted'));
                  render();
                } catch {
                  formError(form, t('error.deleteFailed'));
                }
              },
            },
            t('common.delete'),
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
            if (cents === null || cents <= 0) return formError(form, t('booking.errAmount'));
            const date = val(form, 'date');
            if (!isDay(date)) return formError(form, t('booking.errDate'));
            const taxRaw = val(form, 'taxAmount');
            const taxCents = taxRaw ? parseAmount(taxRaw) : undefined;
            if (taxRaw && (taxCents === null || taxCents < 0 || taxCents > cents))
              return formError(form, t('booking.errTaxAmount'));
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
              toast(t(old ? 'toast.saved' : 'toast.bookingAdded'));
              render();
            } catch {
              formError(form, t('error.saveFailedConnection'));
            }
          },
        },
        t('common.save'),
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
    toast(t('receipt.openFailed'));
  }
}

function editCategory(id) {
  const c = id ? catById(id) : { id: '', name: '', kind: 'expense', budget: 0, tax: '' };
  const used = id ? bookings().some((b) => b.cat === id) : false;
  const form = openDialog(
    t(id ? 'category.edit' : 'category.new'),
    [
      h(
        'label',
        { class: 'mn-field' },
        t('field.name'),
        h('input', {
          name: 'name',
          required: true,
          maxlength: 60,
          value: id ? catLabel(c) : c.name,
        }),
      ),
      h(
        'label',
        { class: 'mn-field' },
        t('field.kind'),
        h(
          'select',
          { name: 'kind', value: c.kind },
          Object.entries(KINDS).map(([k, l]) => h('option', { value: k }, t(l))),
        ),
      ),
      h(
        'label',
        { class: 'mn-field' },
        t('field.budgetEur'),
        h('input', {
          name: 'budget',
          inputmode: 'decimal',
          value: c.budget ? plain(c.budget) : '',
          placeholder: t('budget.none'),
        }),
      ),
      h(
        'label',
        { class: 'mn-field' },
        t('field.taxReturn'),
        taxSelect('tax', c.tax, null),
        h('small', {}, t('category.taxHint')),
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
                  toast(t(used ? 'toast.categoryDeletedUsed' : 'toast.categoryDeleted'));
                  render();
                } catch {
                  formError(form, t('error.deleteFailed'));
                }
              },
            },
            t('common.delete'),
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
            let name = val(form, 'name');
            if (!name) return formError(form, t('category.errName'));
            // An unrenamed starting category keeps its stored name, so it follows the language.
            if (id && name === catLabel(c)) name = c.name;
            const budgetRaw = val(form, 'budget');
            const budget = budgetRaw ? parseAmount(budgetRaw) : 0;
            if (budget === null || budget < 0) return formError(form, t('category.errBudget'));
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
              formError(form, t('error.saveFailed'));
            }
          },
        },
        t('common.save'),
      ),
    ],
  );
}
function editRule(index) {
  const r = index === null ? { match: '', cat: '' } : S.settings.rules[index];
  const form = openDialog(
    t(index === null ? 'rule.new' : 'rule.edit'),
    [
      h(
        'label',
        { class: 'mn-field' },
        t('rule.contains'),
        h('input', {
          name: 'match',
          required: true,
          value: r.match,
          placeholder: t('rule.containsPlaceholder'),
        }),
      ),
      h('label', { class: 'mn-field' }, t('field.category'), catSelect('cat', r.cat)),
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
                  formError(form, t('error.deleteFailed'));
                }
              },
            },
            t('common.delete'),
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
            if (!next.match || !next.cat) return formError(form, t('rule.errFields'));
            S.settings.rules =
              index === null
                ? [...S.settings.rules, next]
                : S.settings.rules.map((x, i) => (i === index ? next : x));
            try {
              await saveSettings();
              closeDialog();
              render();
            } catch {
              formError(form, t('error.saveFailed'));
            }
          },
        },
        t('common.save'),
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
    t(id ? 'fixed.edit' : 'fixed.new'),
    [
      h(
        'label',
        { class: 'mn-field' },
        t('field.description'),
        h('input', {
          name: 'text',
          required: true,
          maxlength: 200,
          value: r.text,
          placeholder: t('fixed.descriptionPlaceholder'),
        }),
      ),
      h(
        'label',
        { class: 'mn-field' },
        t('fixed.group'),
        h(
          'select',
          { name: 'type', value: r.type },
          Object.entries(FIXED_TYPES).map(([k, l]) => h('option', { value: k }, t(l))),
        ),
      ),
      h(
        'div',
        { class: 'mn-grid-2' },
        h(
          'label',
          { class: 'mn-field' },
          t('field.amountEur'),
          h('input', {
            name: 'amount',
            inputmode: 'decimal',
            value: r.cents ? plain(amountFor(r, thisMonth)) : '',
            placeholder: t('field.amountPlaceholder'),
          }),
        ),
        h(
          'label',
          { class: 'mn-field' },
          t('field.kind'),
          h(
            'select',
            { name: 'kind', value: r.kind },
            Object.entries(KINDS).map(([k, l]) => h('option', { value: k }, t(l))),
          ),
        ),
      ),
      // An existing fixed cost keeps its history: a new amount applies from the chosen month on.
      id
        ? h(
            'label',
            { class: 'mn-field' },
            t('fixed.newAmountFrom'),
            h('input', { name: 'from', type: 'month', value: thisMonth }),
            h(
              'small',
              {},
              r.changes.length
                ? t('fixed.historyNow', {
                    list: [{ from: r.start, cents: r.cents }, ...r.changes]
                      .map((c) =>
                        t('fixed.historyItem', { amount: euro(c.cents), month: monthName(c.from) }),
                      )
                      .join(', '),
                  })
                : t('fixed.historyNone'),
            ),
          )
        : null,
      h('label', { class: 'mn-field' }, t('field.category'), catSelect('cat', r.cat)),
      h(
        'div',
        { class: 'mn-grid-2' },
        h(
          'label',
          { class: 'mn-field' },
          t('fixed.rhythm'),
          h(
            'select',
            { name: 'every', value: String(r.every) },
            [1, 3, 6, 12].map((v) => h('option', { value: String(v) }, t(`rhythm.${v}`))),
          ),
        ),
        h(
          'label',
          { class: 'mn-field' },
          t('fixed.onDay'),
          h('input', { name: 'day', type: 'number', min: 1, max: 28, value: String(r.day) }),
        ),
      ),
      h(
        'div',
        { class: 'mn-grid-2' },
        h(
          'label',
          { class: 'mn-field' },
          t('fixed.firstBooking'),
          h('input', { name: 'start', type: 'month', value: r.start }),
        ),
        h(
          'label',
          { class: 'mn-field' },
          t('fixed.lastBooking'),
          h('input', { name: 'end', type: 'month', value: r.end }),
          h('small', {}, t('fixed.lastHint')),
        ),
      ),
      h(
        'label',
        { class: 'mn-field' },
        t('fixed.recognise'),
        h('input', {
          name: 'match',
          maxlength: 200,
          value: r.match,
          placeholder: t('fixed.recognisePlaceholder'),
        }),
        h('small', {}, t('fixed.recogniseHint')),
      ),
      h('p', { class: 'mn-note' }, t('fixed.dueNote')),
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
                  await recTable(mn).remove(id);
                  S.recs.delete(id);
                  calendarSoon();
                  closeDialog();
                  toast(t('toast.fixedDeleted'));
                  render();
                } catch {
                  formError(form, t('error.deleteFailed'));
                }
              },
            },
            t('common.delete'),
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
            if (cents === null || cents <= 0) return formError(form, t('fixed.errAmount'));
            const start = val(form, 'start');
            const end = val(form, 'end');
            if (!start) return formError(form, t('fixed.errStart'));
            if (end && end < start) return formError(form, t('fixed.errOrder'));
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
            if (!next) return formError(form, t('error.checkInput'));
            try {
              const mn = await ready;
              await recTable(mn).upsert(recRow(next));
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
              formError(form, t('error.saveFailed'));
            }
          },
        },
        t('common.save'),
      ),
    ],
  );
}

// ---------- CSV import ----------
function openImport() {
  const form = openDialog(
    t('action.importStatement'),
    [
      h('p', {}, t('import.intro')),
      h(
        'label',
        { class: 'mn-btn filebtn' },
        t('import.chooseFile'),
        h('input', {
          type: 'file',
          accept: '.csv,.pdf,text/csv,text/plain,application/pdf',
          onchange: async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) return formError(form, t('import.tooBig'));
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
    // The column names of a PDF are the page's, not the parser's.
    parsed.header = [
      t('field.date'),
      t('tax.col.amount'),
      t('import.party'),
      t('import.reference'),
    ];
  } catch (err) {
    return formError(
      form,
      err?.name === 'PasswordException' ? t('import.pdfPassword') : t('import.pdfUnreadable'),
    );
  }
  if (!parsed.rows.length) return formError(form, t('import.pdfEmpty'));
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
        parsed.header.map((c, i) =>
          h('option', { value: String(i) }, c || t('import.column', { n: i + 1 })),
        ),
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
      summary.replaceChildren(h('p', { class: 'mn-error' }, t('import.loadFailed')));
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
          ? t(fresh.some((b) => b.rec) ? 'import.summaryFixed' : 'import.summary', {
              n: found.length,
              fresh: fresh.length,
              assigned: fresh.filter((b) => b.cat).length,
              fixed: fresh.filter((b) => b.rec).length,
            })
          : t('import.nothing'),
      ),
      parsed.guessed
        ? h('p', { class: 'mn-note' }, t('import.guessed', { n: parsed.guessed }))
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
                  h('span', {}, `${dateText(b.date)} ${b.party || b.text}`),
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
    importBtn.textContent = fresh.length
      ? t('import.run', { n: fresh.length })
      : t('import.runNone');
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
            if (done % 20 === 0)
              importBtn.textContent = t('import.progress', { done, total: fresh.length });
          }
          closeDialog();
          toast(t('toast.imported', { n: done }));
          const latest = fresh
            .map((b) => b.date)
            .sort()
            .pop();
          if (latest) S.month = latest.slice(0, 7);
          go('bookings');
        } catch {
          formError(form, t('import.aborted', { n: done }));
          importBtn.disabled = false;
        }
      },
    },
    t('import.runNone'),
  );
  const form = openDialog(
    t('action.importStatement'),
    [
      h(
        'div',
        { class: 'grid2', onchange: () => update() },
        pick('date', t('field.date'), parsed.map.date),
        pick('amount', t('tax.col.amount'), parsed.map.amount),
        pick('party', t('import.party'), parsed.map.party),
        pick('text', t('import.reference'), parsed.map.text),
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
    t('export.file', { year }),
    csv([
      [
        t('tax.csv.date'),
        t('field.kind'),
        t('tax.col.amount'),
        t('tax.csv.category'),
        t('field.description'),
        t('export.party'),
        t('export.tax'),
      ],
      ...rows.map((b) => [
        b.date,
        t(KINDS[b.kind]),
        plain(b.kind === 'income' ? b.cents : -b.cents),
        catName(b.cat),
        b.text,
        b.party,
        taxFieldOf(b) ? fieldLabel(taxFieldOf(b)) : '',
      ]),
    ]),
    'text/csv',
  );
}
async function exportBackup() {
  try {
    const mn = await ready;
    const [bookings, profiles] = await Promise.all([loadBookings(mn, FIELDS), loadProfiles(mn)]);
    const data = {
      app: 'mininode-haushalt',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: S.settings,
      recurring: [...S.recs.values()],
      profiles,
      bookings,
    };
    download(t('backup.file', { date: today() }), JSON.stringify(data), 'application/json');
  } catch {
    toast(t('backup.createFailed'));
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
    toast(t('backup.notABackup'));
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
        await recTable(mn).upsert(recRow(r));
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
    toast(t('backup.restored', { n }));
  } catch {
    toast(t('backup.importFailed'));
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
const titleOf = (tab) => t(`tab.${tab}`);
function subtitle() {
  const list = inMonth(S.month);
  if (S.tab === 'overview' || S.tab === 'bookings') {
    const open = list.filter((b) => !b.cat).length;
    return t(open ? 'subtitle.bookingsOpen' : 'subtitle.bookings', { n: list.length, open });
  }
  if (S.tab === 'plan') return t(S.plan === 'budget' ? 'subtitle.budget' : 'subtitle.fixed');
  if (S.tab === 'stats') return t('subtitle.stats', { year: S.year });
  if (S.tab === 'tax') return t('subtitle.tax');
  return t('subtitle.settings');
}
function render() {
  for (const tab of document.querySelectorAll('.mn-tab')) {
    if (tab.dataset.tab === S.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  $('#title').textContent = titleOf(S.tab);
  const view = $('#view');
  const tools = $('#tools');
  if (S.loading) {
    $('#subtitle').textContent = t('state.loading');
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
      'aria-label': t('tab.settings'),
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
              t(S.tab === 'tax' ? 'stepper.taxYear' : 'stepper.year'),
              String(S.year),
              t('stepper.prevYear'),
              t('stepper.nextYear'),
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
  const before = writes;
  const [settings, recs, list] = await Promise.all([
    loadSettings(mn, FIELDS),
    loadRecurring(mn),
    loadBookings(mn, FIELDS),
  ]);
  const next = new Map(list.map((b) => [keyOf(b), b]));
  if (writes !== before) return;
  if (settings) S.settings = settings;
  S.recs = new Map(recs.map((r) => [r.id, r]));
  for (const b of list) S.years.add(Number(b.date.slice(0, 4)));
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
// The packages must be there before the first text is made; a language change redraws.
await window.mnI18n.ready;
window.mnI18n.onChange(() => {
  if (!sheetOpen) render();
});
render();
const firstLoad = load();
