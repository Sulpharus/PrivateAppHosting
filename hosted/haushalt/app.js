// Haushalt: household book with monthly budgets, bank CSV import, standing orders and the
// automatic transfer of tax-relevant bookings into the forms of the income tax return.
// Storage is private mn.kv: settings, one key per booking (tx:<date>:<id>), per standing order
// (rec:<id>) and per tax year (profile:<year>). Receipts are files in mn.files (belege/...).
import { analyse, hash, parseAmount, toBookings } from './csv.js';
import {
  cleanBooking,
  cleanProfile,
  cleanRecurring,
  cleanSettings,
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  dueRecurring,
  isDay,
  KINDS,
  matchRule,
} from './data.js';
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
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  clip: 'M8 12.5l5.5-5.5a2.5 2.5 0 013.5 3.5l-7 7a4 4 0 01-5.7-5.7L11 5',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.append(path);
  return svg;
}
let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

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
async function saveBooking(b, oldKey) {
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
    for (const { booking } of due) {
      const key = keyOf(booking);
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
  if (added) toast(`${added} ${added === 1 ? 'Dauerauftrag' : 'Daueraufträge'} gebucht`);
}

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
  } catch {
    toast('Deine Daten konnten nicht geladen werden. Lade die Seite neu.');
  } finally {
    S.loading = false;
    render();
  }
}

// ---------- shared view parts ----------
function monthNav(onChange) {
  return h(
    'div',
    { class: 'period' },
    h(
      'button',
      { class: 'icon', 'aria-label': 'Vorheriger Monat', onclick: () => onChange(-1) },
      icon('left'),
    ),
    h('h2', {}, monthName(S.month)),
    h(
      'button',
      { class: 'icon', 'aria-label': 'Nächster Monat', onclick: () => onChange(1) },
      icon('right'),
    ),
  );
}
async function changeMonth(n) {
  S.month = shiftMonth(S.month, n);
  await ensureYear(Number(S.month.slice(0, 4))).catch(() => toast('Laden fehlgeschlagen.'));
  render();
}
function meter(value, max, over) {
  const pct = max > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0;
  const bar = h('i', {});
  bar.style.width = `${pct}%`;
  return h('span', { class: `meter${over ? ' over' : ''}`, 'aria-hidden': 'true' }, bar);
}
function kpi(label, value, cls) {
  return h('div', { class: 'kpi' }, h('b', { class: cls }, value), h('span', {}, label));
}
function empty(title, text, ...actions) {
  return h('div', { class: 'empty' }, h('h3', {}, title), h('p', {}, text), ...actions);
}
function signed(b) {
  if (b.kind === 'income') return `+${euro(b.cents)}`;
  if (b.kind === 'transfer') return euro(b.cents);
  return `−${euro(b.cents)}`;
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

  return [
    monthNav(changeMonth),
    list.length === 0 && !S.loading
      ? empty(
          'Noch keine Buchungen in diesem Monat',
          'Trage Ausgaben und Einnahmen ein oder importiere den Kontoauszug deiner Bank als CSV.',
          h(
            'div',
            { class: 'actions' },
            h(
              'button',
              { class: 'btn primary', onclick: () => editBooking(null) },
              'Buchung hinzufügen',
            ),
            h('button', { class: 'btn', onclick: () => openImport() }, 'Kontoauszug importieren'),
          ),
        )
      : null,
    h(
      'div',
      { class: 'kpis' },
      kpi('Einnahmen', euro(income), 'pos'),
      kpi('Ausgaben', euro(expense)),
      kpi(
        saldo >= 0 ? 'Überschuss' : 'Fehlbetrag',
        euro(Math.abs(saldo)),
        saldo >= 0 ? 'pos' : 'neg',
      ),
      kpi('Sparquote', income > 0 ? `${Math.round((saldo / income) * 100)} %` : '–'),
    ),
    budget > 0
      ? h(
          'section',
          { class: 'card' },
          h(
            'div',
            { class: 'card-head' },
            h('h3', {}, 'Budget'),
            h('button', { class: 'link', onclick: () => go('budget') }, 'Details'),
          ),
          h(
            'p',
            { class: 'line' },
            h('span', {}, `${euro(spentInBudget)} von ${euro(budget)}`),
            h(
              'span',
              { class: spentInBudget > budget ? 'neg' : 'muted' },
              spentInBudget > budget
                ? `${euro(spentInBudget - budget)} drüber`
                : `${euro(budget - spentInBudget)} übrig`,
            ),
          ),
          meter(spentInBudget, budget, spentInBudget > budget),
          overCats.length
            ? h(
                'p',
                { class: 'muted small' },
                `Überschritten: ${overCats.map((c) => c.name).join(', ')}`,
              )
            : null,
        )
      : null,
    top.length
      ? h(
          'section',
          { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', {}, 'Ausgaben nach Kategorie')),
          h(
            'ul',
            { class: 'bars' },
            top.map(([cat, cents]) =>
              h(
                'li',
                {},
                h(
                  'p',
                  { class: 'line' },
                  h('span', {}, catName(cat)),
                  h('span', {}, `${euro(cents)}, ${Math.round((cents / expense) * 100)} %`),
                ),
                meter(cents, top[0][1]),
              ),
            ),
          ),
        )
      : null,
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h('h3', {}, `Jahr ${year}`),
        h(
          'span',
          { class: 'legend' },
          h('i', { class: 'in' }),
          'Einnahmen',
          h('i', { class: 'out' }),
          'Ausgaben',
        ),
      ),
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
              class: `col${x.ym === S.month ? ' sel' : ''}`,
              'aria-label': `${monthName(x.ym)}: Einnahmen ${euro(x.income)}, Ausgaben ${euro(x.expense)}`,
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
        { class: 'line small' },
        h('span', {}, `Einnahmen ${euro(months.reduce((s, x) => s + x.income, 0))}`),
        h('span', {}, `Ausgaben ${euro(months.reduce((s, x) => s + x.expense, 0))}`),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h('h3', {}, 'Steuerlich relevant'),
        h(
          'button',
          {
            class: 'link',
            onclick: () => {
              S.year = Number(year);
              go('tax');
            },
          },
          'Zur Steuer',
        ),
      ),
      h(
        'p',
        {},
        taxYear.length
          ? `${taxYear.length} ${taxYear.length === 1 ? 'Buchung' : 'Buchungen'} mit ${euro(taxSum)} fließen ${year} automatisch in die Steuererklärung.`
          : `Noch keine steuerlich relevanten Buchungen in ${year}. Kategorien wie Handwerker, Spenden oder Arbeitsmittel werden automatisch übernommen.`,
      ),
    ),
  ];
}

// ---------- Buchungen ----------
function bookingRow([key, b]) {
  const field = taxFieldOf(b);
  return h(
    'li',
    {},
    h(
      'button',
      { class: 'tx', onclick: () => editBooking(key) },
      h(
        'span',
        { class: 'tx-main' },
        h('b', {}, b.text || b.party || KINDS[b.kind]),
        h(
          'small',
          {},
          [catName(b.cat), b.text && b.party ? b.party : ''].filter(Boolean).join(' · '),
        ),
      ),
      h(
        'span',
        { class: 'tx-side' },
        h(
          'b',
          { class: b.kind === 'income' ? 'pos' : b.kind === 'transfer' ? 'muted' : '' },
          signed(b),
        ),
        field ? h('small', { class: 'tag' }, `Steuer: ${FIELDS[field].label}`) : null,
        b.receipt ? h('small', { class: 'muted' }, 'Beleg') : null,
      ),
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
    return h(
      'p',
      { class: 'muted' },
      S.q || S.cat ? 'Keine Buchung passt zum Filter.' : 'Keine Buchungen in diesem Monat.',
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
        h('ul', { class: 'txs' }, list.map(bookingRow)),
      ),
    ),
  );
}
function viewBookings() {
  const uncategorised = inMonth(S.month).filter((b) => !b.cat).length;
  const listHost = h('div', { id: 'txlist' }, bookingList());
  const refresh = () => listHost.replaceChildren(bookingList());
  return [
    monthNav(changeMonth),
    h(
      'div',
      { class: 'toolbar' },
      h(
        'button',
        { class: 'btn primary', onclick: () => editBooking(null) },
        icon('plus'),
        'Buchung',
      ),
      h('button', { class: 'btn', onclick: () => openImport() }, 'Kontoauszug importieren'),
    ),
    h(
      'div',
      { class: 'filters' },
      h('label', { class: 'sr-only', for: 'q' }, 'Buchungen durchsuchen'),
      h('input', {
        id: 'q',
        type: 'search',
        placeholder: 'Suchen',
        value: S.q,
        autocomplete: 'off',
        oninput: (e) => {
          S.q = e.target.value;
          refresh();
        },
      }),
      h('label', { class: 'sr-only', for: 'catfilter' }, 'Nach Kategorie filtern'),
      h(
        'select',
        {
          id: 'catfilter',
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
    ),
    uncategorised
      ? h(
          'p',
          { class: 'note' },
          `${uncategorised} ${uncategorised === 1 ? 'Buchung ist' : 'Buchungen sind'} noch ohne Kategorie.`,
          h(
            'button',
            {
              class: 'link',
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
  return [
    monthNav(changeMonth),
    h(
      'p',
      { class: 'muted' },
      'Monatsbudget je Kategorie. Leer lassen, wenn es für eine Kategorie kein Budget gibt. Änderungen gelten für alle Monate.',
    ),
    total
      ? h(
          'div',
          { class: 'kpis three' },
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
      'ul',
      { class: 'budgets card' },
      expenseCats.map((c) => {
        const s = spent(c.id);
        const over = c.budget > 0 && s > c.budget;
        const id = `budget-${c.id}`;
        return h(
          'li',
          {},
          h(
            'div',
            { class: 'line' },
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
                h(
                  'p',
                  { class: 'line small' },
                  h('span', {}, `${euro(s)} ausgegeben`),
                  h(
                    'span',
                    { class: over ? 'neg' : 'muted' },
                    over ? `${euro(s - c.budget)} drüber` : `${euro(c.budget - s)} übrig`,
                  ),
                ),
                meter(s, c.budget, over),
              ]
            : s
              ? h('p', { class: 'small muted' }, `${euro(s)} ausgegeben`)
              : null,
        );
      }),
    ),
    rest > 0 ? h('p', { class: 'muted' }, `${euro(rest)} in Kategorien ohne Budget.`) : null,
  ];
}

// ---------- Steuer ----------
function profileForm(year) {
  const p = S.profiles.get(year) ?? cleanProfile(null);
  const field = (key, label, hint, opts = {}) =>
    h(
      'label',
      { class: 'f' },
      label,
      h('input', {
        name: key,
        inputmode: opts.money ? 'decimal' : 'numeric',
        autocomplete: 'off',
        value: opts.money ? (p[key] ? plain(p[key]) : '') : p[key] ? String(p[key]) : '',
        placeholder: opts.placeholder ?? '0',
      }),
      hint ? h('small', {}, hint) : null,
    );
  const form = h(
    'form',
    {
      class: 'profile',
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
      { class: 'grid2' },
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
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', name: 'employee', checked: p.employee }),
      'Ich bin Arbeitnehmer:in (Anlage N)',
    ),
    h(
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', name: 'married', checked: p.married }),
      'Zusammenveranlagung (verheiratet)',
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
      { class: 'form-sheet', 'aria-labelledby': `form-${f.id}` },
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
                        class: 'btn small no-print',
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
        : h('p', { class: 'muted' }, 'Keine Einträge.'),
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
      { class: 'period' },
      h(
        'button',
        { class: 'icon', 'aria-label': 'Vorheriges Jahr', onclick: () => changeYear(-1) },
        icon('left'),
      ),
      h('h2', {}, `Steuererklärung ${year}`),
      h(
        'button',
        { class: 'icon', 'aria-label': 'Nächstes Jahr', onclick: () => changeYear(1) },
        icon('right'),
      ),
    ),
    h(
      'p',
      { class: 'muted' },
      'Buchungen mit steuerlicher Zuordnung landen automatisch im passenden Formular. Die Zuordnung kommt von der Kategorie und lässt sich pro Buchung ändern. Übertrage die Beträge in ELSTER, die App reicht nichts ein und ersetzt keine Steuerberatung.',
    ),
    h(
      'section',
      { class: 'card no-print' },
      h('div', { class: 'card-head' }, h('h3', {}, `Angaben für ${year}`)),
      profileForm(year),
    ),
    h(
      'div',
      { class: 'toolbar no-print' },
      h('button', { class: 'btn', onclick: () => window.print() }, 'Drucken oder als PDF sichern'),
      h('button', { class: 'btn', onclick: () => exportTaxCsv(year) }, 'Als CSV exportieren'),
    ),
    h('div', { id: 'forms' }, formsView(year)),
  ];
}
async function changeYear(n) {
  S.year += n;
  try {
    await Promise.all([ensureYear(S.year), ensureProfile(S.year)]);
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
  return [
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h('h3', {}, 'Kategorien'),
        h('button', { class: 'link', onclick: () => editCategory(null) }, 'Hinzufügen'),
      ),
      h(
        'ul',
        { class: 'plain' },
        Object.keys(KINDS).map((kind) => [
          h(
            'li',
            { class: 'group' },
            KINDS[kind] === 'Umbuchung'
              ? 'Umbuchungen (zählen nicht als Ausgabe)'
              : `${KINDS[kind]}n`,
          ),
          cats()
            .filter((c) => c.kind === kind)
            .map((c) =>
              h(
                'li',
                {},
                h(
                  'button',
                  { class: 'rowbtn', onclick: () => editCategory(c.id) },
                  h('span', {}, c.name),
                  h(
                    'small',
                    {},
                    [c.budget ? `${euro(c.budget)} / Monat` : '', c.tax ? FIELDS[c.tax].label : '']
                      .filter(Boolean)
                      .join(' · '),
                  ),
                ),
              ),
            ),
        ]),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h('h3', {}, 'Daueraufträge'),
        h('button', { class: 'link', onclick: () => editRecurring(null) }, 'Hinzufügen'),
      ),
      recs.length
        ? h(
            'ul',
            { class: 'plain' },
            recs.map((r) =>
              h(
                'li',
                {},
                h(
                  'button',
                  { class: 'rowbtn', onclick: () => editRecurring(r.id) },
                  h('span', {}, r.text || catName(r.cat)),
                  h(
                    'small',
                    {},
                    `${r.kind === 'income' ? '+' : '−'}${euro(r.cents)} ${{ 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' }[r.every]} am ${r.day}.${r.end ? `, bis ${monthName(r.end)}` : ''}`,
                  ),
                ),
              ),
            ),
          )
        : h(
            'p',
            { class: 'muted' },
            'Miete, Versicherungen oder Gehalt werden jeden Monat automatisch gebucht.',
          ),
    ),
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h('h3', {}, 'Regeln für den Import'),
        h('button', { class: 'link', onclick: () => editRule(null) }, 'Hinzufügen'),
      ),
      h(
        'p',
        { class: 'muted small' },
        'Enthält der Empfänger oder Verwendungszweck eines der Wörter, bekommt die Buchung die Kategorie. Mehrere Wörter mit | trennen.',
      ),
      h(
        'ul',
        { class: 'plain' },
        S.settings.rules.map((r, i) =>
          h(
            'li',
            {},
            h(
              'button',
              { class: 'rowbtn', onclick: () => editRule(i) },
              h('span', {}, r.match),
              h('small', {}, `→ ${catName(r.cat)}`),
            ),
          ),
        ),
      ),
      h(
        'button',
        { class: 'btn', onclick: applyRules },
        'Regeln auf Buchungen ohne Kategorie anwenden',
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', {}, 'Daten')),
      h(
        'p',
        { class: 'muted small' },
        'Die Sicherung enthält alle Buchungen, Kategorien, Regeln, Daueraufträge und Steuerangaben, aber keine Belege.',
      ),
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn', onclick: exportBackup }, 'Sicherung exportieren'),
        h(
          'label',
          { class: 'btn filebtn' },
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
          { class: 'btn', onclick: exportYearCsv },
          `Buchungen ${S.month.slice(0, 4)} als CSV`,
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

// ---------- dialogs ----------
const dlg = () => $('#dlg');
function openDialog(title, body, actions) {
  const d = dlg();
  const form = h(
    'form',
    { method: 'dialog', class: 'dlg-form' },
    h('header', {}, h('h2', { id: 'dlg-title' }, title)),
    h('div', { class: 'dlg-body' }, body),
    h('p', { class: 'error', role: 'alert', hidden: true }),
    h('footer', {}, actions),
  );
  form.addEventListener('submit', (e) => e.preventDefault());
  d.setAttribute('aria-labelledby', 'dlg-title');
  d.replaceChildren(form);
  nameSelects(form);
  new MutationObserver(() => nameSelects(form)).observe(form, { childList: true, subtree: true });
  if (!d.open) d.showModal();
  d.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  return form;
}
/** A select wrapped in its label gets the selected option text in its accessible name; name it
 * after the label text only. */
function nameSelects(root) {
  for (const select of root.querySelectorAll('label.f > select')) {
    const text = select.parentElement.firstChild;
    if (text?.nodeType === Node.TEXT_NODE)
      select.setAttribute('aria-label', text.textContent.trim());
  }
}
function closeDialog() {
  if (dlg().open) dlg().close();
}
function formError(form, message) {
  const p = form.querySelector('.error');
  p.textContent = message;
  p.hidden = false;
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
  const receiptHost = h('div', { class: 'receipt' });
  const drawReceipt = () =>
    receiptHost.replaceChildren(
      receipt
        ? h(
            'span',
            { class: 'line' },
            h(
              'button',
              { type: 'button', class: 'link', onclick: () => openReceipt(receipt) },
              'Beleg öffnen',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'link danger',
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
            { class: 'btn filebtn' },
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
    { class: 'seg', role: 'radiogroup', 'aria-label': 'Art' },
    Object.entries(KINDS).map(([k, label]) =>
      h(
        'label',
        {},
        h('input', { type: 'radio', name: 'kind', value: k, checked: b.kind === k }),
        h('span', {}, label),
      ),
    ),
  );
  const catHost = h('label', { class: 'f' }, 'Kategorie', catSelect('cat', b.cat, b.kind));
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
    { class: 'f' },
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
      { class: 'grid2' },
      h(
        'label',
        { class: 'f' },
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
        { class: 'f' },
        'Datum',
        h('input', { name: 'date', type: 'date', required: true, value: b.date }),
      ),
    ),
    h(
      'label',
      { class: 'f' },
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
      { class: 'f' },
      'Empfänger oder Auftraggeber',
      h('input', { name: 'party', maxlength: 120, value: b.party }),
    ),
    catHost,
    taxHost,
    h(
      'label',
      { class: 'f' },
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
  const form = openDialog(old ? 'Buchung bearbeiten' : 'Neue Buchung', body, [
    old
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn danger',
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
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Abbrechen'),
    h(
      'button',
      {
        type: 'submit',
        class: 'btn primary',
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
            return formError(form, 'Der absetzbare Anteil muss zwischen 0 und dem Betrag liegen.');
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
  ]);
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
        { class: 'f' },
        'Name',
        h('input', { name: 'name', required: true, maxlength: 60, value: c.name }),
      ),
      h(
        'label',
        { class: 'f' },
        'Art',
        h(
          'select',
          { name: 'kind', value: c.kind },
          Object.entries(KINDS).map(([k, l]) => h('option', { value: k }, l)),
        ),
      ),
      h(
        'label',
        { class: 'f' },
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
        { class: 'f' },
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
              class: 'btn danger',
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
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Abbrechen'),
      h(
        'button',
        {
          type: 'submit',
          class: 'btn primary',
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
        { class: 'f' },
        'Enthält',
        h('input', {
          name: 'match',
          required: true,
          value: r.match,
          placeholder: 'z. B. REWE|EDEKA',
        }),
      ),
      h('label', { class: 'f' }, 'Kategorie', catSelect('cat', r.cat)),
    ],
    [
      index !== null
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn danger',
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
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Abbrechen'),
      h(
        'button',
        {
          type: 'submit',
          class: 'btn primary',
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
      };
  const form = openDialog(
    id ? 'Dauerauftrag bearbeiten' : 'Neuer Dauerauftrag',
    [
      h(
        'label',
        { class: 'f' },
        'Beschreibung',
        h('input', {
          name: 'text',
          required: true,
          maxlength: 200,
          value: r.text,
          placeholder: 'z. B. Miete',
        }),
      ),
      h(
        'div',
        { class: 'grid2' },
        h(
          'label',
          { class: 'f' },
          'Betrag in €',
          h('input', {
            name: 'amount',
            inputmode: 'decimal',
            value: r.cents ? plain(r.cents) : '',
            placeholder: '0,00',
          }),
        ),
        h(
          'label',
          { class: 'f' },
          'Art',
          h(
            'select',
            { name: 'kind', value: r.kind },
            Object.entries(KINDS).map(([k, l]) => h('option', { value: k }, l)),
          ),
        ),
      ),
      h('label', { class: 'f' }, 'Kategorie', catSelect('cat', r.cat)),
      h(
        'div',
        { class: 'grid2' },
        h(
          'label',
          { class: 'f' },
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
          { class: 'f' },
          'Am Tag',
          h('input', { name: 'day', type: 'number', min: 1, max: 28, value: String(r.day) }),
        ),
      ),
      h(
        'div',
        { class: 'grid2' },
        h(
          'label',
          { class: 'f' },
          'Erste Buchung',
          h('input', { name: 'start', type: 'month', value: r.start }),
        ),
        h(
          'label',
          { class: 'f' },
          'Letzte Buchung',
          h('input', { name: 'end', type: 'month', value: r.end }),
          h('small', {}, 'Leer lassen, solange er läuft'),
        ),
      ),
      h(
        'p',
        { class: 'muted small' },
        'Fällige Buchungen entstehen beim Öffnen der App, auch rückwirkend ab der ersten Buchung.',
      ),
    ],
    [
      id
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn danger',
              onclick: async () => {
                try {
                  const mn = await ready;
                  await mn.kv.delete(`rec:${id}`);
                  S.recs.delete(id);
                  closeDialog();
                  toast('Dauerauftrag gelöscht, bisherige Buchungen bleiben');
                  render();
                } catch {
                  formError(form, 'Löschen fehlgeschlagen.');
                }
              },
            },
            'Löschen',
          )
        : null,
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Abbrechen'),
      h(
        'button',
        {
          type: 'submit',
          class: 'btn primary',
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
            // Changing the start or rhythm restarts generation from the new start; existing keys are
            // skipped, so nothing is booked twice.
            const restart = start !== r.start || Number(val(form, 'every')) !== r.every;
            const next = cleanRecurring({
              ...r,
              text: val(form, 'text'),
              cents: Math.abs(cents),
              kind: val(form, 'kind'),
              cat: val(form, 'cat'),
              every: Number(val(form, 'every')),
              day: Math.min(28, Math.max(1, Math.round(Number(val(form, 'day')) || 1))),
              start,
              end,
              until: restart ? '' : r.until,
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
        'Exportiere im Online-Banking die Umsätze als CSV und wähle die Datei hier aus. Bereits importierte Buchungen werden erkannt und übersprungen.',
      ),
      h(
        'label',
        { class: 'btn filebtn' },
        'CSV-Datei wählen',
        h('input', {
          type: 'file',
          accept: '.csv,text/csv,text/plain',
          onchange: async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 5 * 1024 * 1024)
              return formError(form, 'Die Datei ist größer als 5 MB.');
            const buf = await file.arrayBuffer();
            // Many banks still export Windows-1252; fall back when UTF-8 shows replacement chars.
            let text = new TextDecoder('utf-8').decode(buf);
            if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
            previewImport(analyse(text));
          },
        }),
      ),
    ],
    [
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Abbrechen'),
    ],
  );
}
async function previewImport(parsed) {
  const pick = (name, label, index) =>
    h(
      'label',
      { class: 'f' },
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
    };
    const found = toBookings({ rows: parsed.rows, map });
    try {
      await Promise.all([...new Set(found.map((b) => Number(b.date.slice(0, 4))))].map(ensureYear));
    } catch {
      /* shown as not loaded below */
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
      return booking;
    });
    const fresh = prepared.filter((b) => !S.tx.has(keyOf(b)));
    summary.replaceChildren(
      h(
        'p',
        {},
        found.length
          ? `${found.length} Buchungen erkannt, davon ${fresh.length} neu und ${fresh.filter((b) => b.cat).length} automatisch zugeordnet.`
          : 'Keine Buchungen erkannt. Prüfe die Spaltenzuordnung.',
      ),
      fresh.length
        ? h(
            'ul',
            { class: 'preview' },
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
      class: 'btn primary',
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
    [
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Abbrechen'),
      importBtn,
    ],
  );
  await update();
}

// ---------- export / backup ----------
function csv(lines) {
  const cell = (v) => {
    const s = String(v ?? '');
    // Prefix formula starters so spreadsheet apps do not execute imported text.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return `﻿${lines.map((l) => l.map(cell).join(';')).join('\r\n')}`;
}
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
  budget: viewBudget,
  tax: viewTax,
  settings: viewSettings,
};
function render() {
  for (const tab of document.querySelectorAll('[data-tab]')) {
    if (tab.dataset.tab === S.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  document.body.dataset.tab = S.tab;
  const view = $('#view');
  if (S.loading) {
    view.replaceChildren(h('p', { class: 'muted loading' }, 'Wird geladen …'));
    return;
  }
  view.replaceChildren(...VIEWS[S.tab]().flat().filter(Boolean));
}
function go(tab) {
  S.tab = tab;
  render();
  window.scrollTo(0, 0);
}
for (const tab of document.querySelectorAll('[data-tab]'))
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'tax')
      ensureProfile(S.year).then(
        () => go('tax'),
        () => go('tax'),
      );
    else go(tab.dataset.tab);
  });
// The header button exists before the data: wait for categories so the dialog is complete.
$('#add').addEventListener('click', () => firstLoad.then(() => editBooking(null)));
// A closed dialog keeps no stale form behind (Escape closes it natively).
dlg().addEventListener('close', () => dlg().replaceChildren());
// Other devices may have changed something while this tab was hidden: reload quietly and swap
// the data in one step, at most every 30 seconds.
let refreshedAt = Date.now();
async function refresh() {
  const mn = await ready;
  const years = [...S.years];
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
  if (!dlg().open) render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || S.loading || Date.now() - refreshedAt < 30_000) return;
  refreshedAt = Date.now();
  refresh().catch(() => {});
});
render();
const firstLoad = load();
