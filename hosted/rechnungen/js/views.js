// The views behind the tabs: Übersicht, Rechnungen (list and calendar), Kunden, Bausteine.
// Statistik and Einstellungen live in their own modules.
import { payOpen } from './actions.js';
import { app, companyReady, hasSamples, saveSettings } from './ctx.js';
import { openCustomerDetail, openInvoiceDetail } from './detail.js';
import {
  amount,
  date,
  debounce,
  download,
  empty,
  fold,
  h,
  highlight,
  icon,
  locale,
  sect,
  statusChip,
  t,
} from './dom.js';
import {
  openCompanyEditor,
  openCustomerEditor,
  openInvoiceEditor,
  openItemEditor,
} from './editors.js';
import { hint } from './help.js';
import { addDays, daysBetween, statusOf, today } from './invoice.js';
import { formatRate } from './money.js';
import { addSampleData, removeSampleData, renderSettings } from './settings.js';
import { invoicesCsv, renderPrint, renderStats } from './stats.js';

// ---------- shared pieces ----------
export function customerName(invoice) {
  if (invoice.status !== 'draft' && invoice.customer?.name) return invoice.customer.name;
  const c = invoice.customer_id ? app.store.get('customers', invoice.customer_id) : null;
  return c?.name ?? invoice.customer?.name ?? t('invoices.noCustomer');
}

export function invoiceTitle(invoice) {
  if (invoice.status === 'draft') return t('invoices.draftTitle');
  return invoice.number ?? '';
}

/** One invoice as a list row. */
export function invoiceRow(invoice, { query = '', onOpen } = {}) {
  const status = statusOf(invoice, app.store.all('payments'));
  const sub = [
    invoice.issue_date ? date(invoice.issue_date) : t('invoices.notIssued'),
    status.key === 'open' || status.key === 'partial'
      ? invoice.due_date
        ? dueText(invoice.due_date)
        : ''
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return h(
    'button',
    {
      class: 'mn-row mn-row--text',
      type: 'button',
      dataset: { id: invoice.id },
      onclick: () => (onOpen ? onOpen(invoice) : openInvoiceDetail(invoice.id)),
    },
    h(
      'span',
      {},
      h('span', { class: 'mn-row-title' }, highlight(customerName(invoice), query)),
      h(
        'span',
        { class: 'mn-row-sub' },
        h('span', { class: 'mn-num' }, highlight(invoiceTitle(invoice), query)),
        invoice.is_sample
          ? h('span', { class: 'mn-chip mn-chip--plain sample' }, t('common.sample'))
          : null,
        sub ? ` ${sub}` : '',
      ),
    ),
    h(
      'span',
      { class: 'mn-row-side' },
      h(
        'b',
        {},
        amount(
          status.key === 'partial' || status.key === 'overdue' ? status.open : invoice.gross_cents,
        ),
      ),
      statusChip(status),
    ),
  );
}

/** "fällig in 3 Tagen" / "heute fällig" / "seit 2 Tagen überfällig". */
export function dueText(due) {
  const days = daysBetween(today(), due);
  if (days === 0) return t('due.today');
  if (days > 0) return t('due.inDays', { n: days });
  return t('due.overdueDays', { n: -days });
}

function hideAmountsTool() {
  const on = Boolean(app.settings.hideAmounts);
  return h(
    'button',
    {
      class: 'mn-icon-btn',
      type: 'button',
      'aria-pressed': String(on),
      'aria-label': t('common.hideAmounts'),
      title: t('common.hideAmounts'),
      onclick: async () => {
        await saveSettings({ hideAmounts: !on });
        app.render();
      },
    },
    icon(on ? 'eyeOff' : 'eye'),
  );
}

export { hideAmountsTool };

function sampleBanner() {
  if (!hasSamples()) return null;
  return h(
    'div',
    { class: 'mn-banner', role: 'note' },
    h('span', {}, t('sample.banner')),
    ' ',
    h(
      'button',
      {
        class: 'mn-btn mn-btn--ghost',
        type: 'button',
        onclick: async () => {
          await removeSampleData();
          app.render();
        },
      },
      t('sample.remove'),
    ),
  );
}

/** Remembers the list settings of a view in kv (the URL holds them while the view is open). */
const rememberView = debounce((view, state) => {
  void saveSettings({ views: { ...app.settings.views, [view]: state } });
}, 600);

function listState(view, params, defaults) {
  const saved = app.settings.views?.[view] ?? {};
  const fromUrl = Object.fromEntries([...params.entries()].filter(([k]) => k in defaults));
  const hasUrl = Object.keys(fromUrl).length > 0;
  return { ...defaults, ...(hasUrl ? fromUrl : saved) };
}

function searchBox(value, placeholder, label, onInput) {
  const input = h('input', {
    type: 'search',
    value,
    placeholder,
    'aria-label': label,
    autocomplete: 'off',
  });
  input.addEventListener(
    'input',
    debounce(() => onInput(input.value), 150),
  );
  return { box: h('div', { class: 'mn-search' }, icon('search'), input), input };
}

function chips(label, options, current, onPick) {
  return h(
    'div',
    { class: 'mn-chips', role: 'group', 'aria-label': label },
    options.map((o) =>
      h(
        'button',
        {
          class: 'mn-filter',
          type: 'button',
          'aria-pressed': String(o.value === current),
          onclick: () => onPick(o.value),
        },
        o.count === undefined ? o.label : `${o.label} ${o.count}`,
      ),
    ),
  );
}

function sortSelect(label, options, current, onPick) {
  const select = h(
    'select',
    { 'aria-label': label, onchange: () => onPick(select.value) },
    options.map((o) => h('option', { value: o.value, selected: o.value === current }, o.label)),
  );
  return h('label', { class: 'mn-field sortfield' }, label, select);
}

// ---------- Übersicht ----------
function renderOverview(main) {
  const s = app.store;
  const invoices = s.all('invoices');
  const payments = s.all('payments');
  const day = today();
  const nothing = !invoices.length && !s.all('customers').length && !s.all('items').length;
  if (nothing) {
    main.append(
      empty({
        iconName: 'invoice',
        title: t('overview.welcomeTitle'),
        text: t('overview.welcomeText'),
        action: companyReady()
          ? { label: t('invoices.addFirst'), onClick: () => openInvoiceEditor() }
          : { label: t('company.fill'), onClick: () => openCompanyEditor() },
        secondary: {
          label: t('sample.add'),
          onClick: async () => {
            await addSampleData();
            app.render();
          },
        },
      }),
    );
    return { subtitle: t('overview.subEmpty') };
  }
  const banner = sampleBanner();
  if (banner) main.append(banner);
  if (!companyReady())
    main.append(
      h(
        'div',
        { class: 'mn-banner mn-banner--warn', role: 'note' },
        h('span', {}, t('company.missing')),
        ' ',
        h(
          'button',
          { class: 'mn-btn', type: 'button', onclick: () => openCompanyEditor() },
          t('company.fill'),
        ),
      ),
    );

  const states = invoices.map((inv) => ({ inv, st: statusOf(inv, payments, day) }));
  const open = states.filter((x) => ['open', 'partial', 'overdue'].includes(x.st.key));
  const overdue = open.filter((x) => x.st.key === 'overdue');
  const month = day.slice(0, 7);
  const received = payments
    .filter((p) => p.paid_on?.startsWith(month))
    .reduce((a, p) => a + p.amount_cents, 0);
  const drafts = states.filter((x) => x.st.key === 'draft');
  main.append(
    h(
      'div',
      { class: 'mn-kpis' },
      kpi(
        amount(open.reduce((a, x) => a + x.st.open, 0)),
        t('overview.kpiOpen', { n: open.length }),
      ),
      kpi(
        amount(overdue.reduce((a, x) => a + x.st.open, 0)),
        t('overview.kpiOverdue', { n: overdue.length }),
      ),
      kpi(amount(received), t('overview.kpiReceived')),
      kpi(String(drafts.length), t('overview.kpiDrafts', { n: drafts.length })),
    ),
  );

  // Due first: overdue and due within 7 days.
  const soon = open
    .filter((x) => x.st.key === 'overdue' || (x.inv.due_date && x.inv.due_date <= addDays(day, 7)))
    .sort((a, b) => String(a.inv.due_date).localeCompare(String(b.inv.due_date)));
  main.append(sect(t('overview.due'), soon.length || null));
  if (soon.length) {
    main.append(
      h(
        'div',
        { class: 'mn-list' },
        soon.slice(0, 8).map((x) => {
          const row = invoiceRow(x.inv);
          return h(
            'div',
            { class: 'duerow' },
            row,
            h(
              'button',
              {
                class: 'mn-btn',
                type: 'button',
                onclick: async (event) => {
                  event.currentTarget.disabled = true;
                  try {
                    if (await payOpen(x.inv, day)) window.mnui.toast(t('payments.markedPaid'));
                  } catch {
                    window.mnui.toast(t('common.saveError'));
                  }
                  app.render();
                },
              },
              t('payments.markPaid'),
            ),
          );
        }),
      ),
    );
  } else main.append(h('p', { class: 'mn-note' }, t('overview.nothingDue')));

  const recent = [...invoices]
    .sort((a, b) =>
      String(b.updated_at ?? b.issue_date ?? '').localeCompare(
        String(a.updated_at ?? a.issue_date ?? ''),
      ),
    )
    .slice(0, 6);
  main.append(
    sect(t('overview.recent'), null, {
      label: t('common.showAll'),
      onClick: () => app.go('invoices'),
    }),
  );
  main.append(
    recent.length
      ? h(
          'div',
          { class: 'mn-list' },
          recent.map((inv) => invoiceRow(inv)),
        )
      : empty({
          title: t('invoices.emptyTitle'),
          text: t('invoices.emptyText'),
          action: { label: t('invoices.addFirst'), onClick: () => openInvoiceEditor() },
        }),
  );
  const overdueCount = overdue.length;
  return {
    subtitle: overdueCount ? t('overview.subOverdue', { n: overdueCount }) : t('overview.subOk'),
    tools: [hideAmountsTool()],
  };
}

function kpi(value, label) {
  return h('div', { class: 'mn-kpi' }, h('b', {}, value), h('span', {}, label));
}

// ---------- Rechnungen ----------
const INVOICE_DEFAULTS = { q: '', f: 'all', s: 'new', y: '', mode: 'list', m: '' };
const selection = new Set();
let lastClicked = null;

function renderInvoices(main, params) {
  const state = listState('invoices', params, INVOICE_DEFAULTS);
  const s = app.store;
  const payments = s.all('payments');
  const day = today();
  const update = (patch) => {
    const next = { ...state, ...patch };
    app.setQuery(next);
    rememberView('invoices', { f: next.f, s: next.s, y: next.y, mode: next.mode });
    app.render();
  };
  // Detail from the URL (links from the bell and push messages).
  const openId = params.get('id');
  if (openId && s.get('invoices', openId)) {
    queueMicrotask(() => {
      app.setQuery({ id: null });
      openInvoiceDetail(openId);
    });
  }

  main.append(
    h(
      'div',
      { class: 'mn-seg modeswitch', role: 'group', 'aria-label': t('invoices.mode') },
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(state.mode !== 'cal'),
          onclick: () => update({ mode: 'list' }),
        },
        icon('list'),
        t('invoices.modeList'),
      ),
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(state.mode === 'cal'),
          onclick: () => update({ mode: 'cal' }),
        },
        icon('calendar'),
        t('invoices.modeCalendar'),
      ),
    ),
  );
  if (state.mode === 'cal') return renderCalendar(main, state, update);

  const all = s.all('invoices').map((inv) => ({ inv, st: statusOf(inv, payments, day) }));
  if (!all.length) {
    main.append(
      empty({
        title: t('invoices.emptyTitle'),
        text: t('invoices.emptyText'),
        action: { label: t('invoices.addFirst'), onClick: () => openInvoiceEditor() },
      }),
    );
    return { subtitle: t('invoices.count', { n: 0 }) };
  }
  const years = [
    ...new Set(all.map((x) => (x.inv.issue_date ?? x.inv.created_at ?? day).slice(0, 4))),
  ]
    .sort()
    .reverse();
  const groups = {
    all: () => true,
    draft: (x) => x.st.key === 'draft',
    open: (x) => ['open', 'partial', 'overdue'].includes(x.st.key),
    overdue: (x) => x.st.key === 'overdue',
    paid: (x) => x.st.key === 'paid',
    cancelled: (x) => ['cancelled', 'cancellation'].includes(x.st.key),
  };
  const inYear = all.filter(
    (x) => !state.y || (x.inv.issue_date ?? x.inv.created_at ?? day).startsWith(state.y),
  );
  const q = fold(state.q).trim();
  const matches = (x) =>
    !q ||
    fold(
      [
        x.inv.number,
        customerName(x.inv),
        x.inv.reference,
        ...(x.inv.lines ?? []).map((l) => l.title),
      ].join(' '),
    ).includes(q);
  const searched = inYear.filter(matches);
  const shown = searched.filter(groups[state.f] ?? groups.all);
  const collator = new Intl.Collator(locale());
  const sorters = {
    new: (a, b) =>
      String(b.inv.issue_date ?? '9999').localeCompare(String(a.inv.issue_date ?? '9999')) ||
      String(b.inv.number ?? '').localeCompare(String(a.inv.number ?? '')),
    old: (a, b) =>
      String(a.inv.issue_date ?? '9999').localeCompare(String(b.inv.issue_date ?? '9999')),
    due: (a, b) => String(a.inv.due_date ?? '9999').localeCompare(String(b.inv.due_date ?? '9999')),
    amount: (a, b) => b.inv.gross_cents - a.inv.gross_cents,
    customer: (a, b) => collator.compare(customerName(a.inv), customerName(b.inv)),
  };
  shown.sort(sorters[state.s] ?? sorters.new);

  const { box } = searchBox(
    state.q,
    t('invoices.searchPlaceholder'),
    t('invoices.searchLabel'),
    (value) => update({ q: value }),
  );
  main.append(box);
  main.append(
    chips(
      t('common.filter'),
      Object.keys(groups).map((key) => ({
        value: key,
        label: t(`invoices.filter.${key}`),
        count: searched.filter(groups[key]).length,
      })),
      state.f,
      (value) => update({ f: value }),
    ),
  );
  const filtersActive = state.q || state.f !== 'all' || state.y;
  main.append(
    h(
      'div',
      { class: 'listbar' },
      sortSelect(
        t('common.sort'),
        ['new', 'old', 'due', 'amount', 'customer'].map((v) => ({
          value: v,
          label: t(`invoices.sort.${v}`),
        })),
        state.s,
        (value) => update({ s: value }),
      ),
      sortSelect(
        t('invoices.year'),
        [{ value: '', label: t('common.all') }, ...years.map((y) => ({ value: y, label: y }))],
        state.y,
        (value) => update({ y: value }),
      ),
      filtersActive
        ? h(
            'button',
            { class: 'mn-link', type: 'button', onclick: () => update({ q: '', f: 'all', y: '' }) },
            t('common.resetFilters'),
          )
        : null,
    ),
  );
  main.append(
    h('p', { class: 'mn-note', 'aria-live': 'polite' }, t('invoices.count', { n: shown.length })),
  );
  hint('invoicesLocked', main);

  if (!shown.length) {
    main.append(
      empty({
        iconName: 'search',
        title: state.q ? t('common.nothingFoundFor', { q: state.q }) : t('common.nothingFound'),
        action: {
          label: state.q ? t('common.clearSearch') : t('common.resetFilters'),
          onClick: () => update({ q: '', f: 'all', y: '' }),
        },
      }),
    );
    return { subtitle: t('invoices.count', { n: all.length }) };
  }

  // Multi-select: a checkbox per row; Shift selects a range.
  for (const id of [...selection]) if (!s.get('invoices', id)) selection.delete(id);
  const ids = shown.map((x) => x.inv.id);
  const list = h('div', { class: `mn-list selectable${selection.size ? ' selecting' : ''}` });
  for (const x of shown) {
    const box = h('input', {
      type: 'checkbox',
      class: 'pick',
      checked: selection.has(x.inv.id),
      'aria-label': t('invoices.select', { name: `${invoiceTitle(x.inv)} ${customerName(x.inv)}` }),
      onclick: (event) => {
        const on = box.checked;
        if (event.shiftKey && lastClicked) {
          const [a, b] = [ids.indexOf(lastClicked), ids.indexOf(x.inv.id)].sort((m, n) => m - n);
          for (const id of ids.slice(a, b + 1)) on ? selection.add(id) : selection.delete(id);
        } else on ? selection.add(x.inv.id) : selection.delete(x.inv.id);
        lastClicked = x.inv.id;
        app.render();
      },
    });
    list.append(
      h(
        'div',
        { class: 'pickrow' },
        h('span', { class: 'pickbox' }, box),
        invoiceRow(x.inv, { query: state.q }),
      ),
    );
  }
  main.append(list);
  if (selection.size) main.append(selectionBar(shown));
  return { subtitle: t('invoices.count', { n: all.length }) };
}

function selectionBar(shown) {
  const chosen = shown.filter((x) => selection.has(x.inv.id));
  const payable = chosen.filter((x) => ['open', 'partial', 'overdue'].includes(x.st.key));
  const drafts = chosen.filter((x) => x.st.key === 'draft');
  return h(
    'div',
    { class: 'selbar', role: 'region', 'aria-label': t('invoices.selection') },
    h('span', { 'aria-live': 'polite' }, t('invoices.selected', { n: selection.size })),
    h('span', { class: 'mn-grow' }),
    payable.length
      ? h(
          'button',
          {
            class: 'mn-btn',
            type: 'button',
            onclick: async (event) => {
              event.currentTarget.disabled = true;
              let done = 0;
              try {
                for (const x of payable) if (await payOpen(x.inv)) done += 1;
                window.mnui.toast(t('payments.markedPaidMany', { n: done }));
              } catch {
                window.mnui.toast(t('common.saveError'));
              }
              selection.clear();
              app.render();
            },
          },
          t('payments.markPaidMany', { n: payable.length }),
        )
      : null,
    h(
      'button',
      {
        class: 'mn-btn',
        type: 'button',
        onclick: () => {
          download(
            `${t('export.invoicesFile')}.csv`,
            invoicesCsv(chosen.map((x) => x.inv)),
            'text/csv;charset=utf-8',
          );
          window.mnui.toast(t('export.done'));
        },
      },
      t('export.csv'),
    ),
    drafts.length
      ? h(
          'button',
          {
            class: 'mn-btn mn-btn--danger',
            type: 'button',
            onclick: () => confirmDeleteDrafts(drafts.map((x) => x.inv)),
          },
          t('invoices.deleteDrafts', { n: drafts.length }),
        )
      : null,
    h(
      'button',
      {
        class: 'mn-btn mn-btn--ghost',
        type: 'button',
        onclick: () => {
          selection.clear();
          app.render();
        },
      },
      t('common.cancel'),
    ),
  );
}

function confirmDeleteDrafts(drafts) {
  const sheet = h(
    'div',
    {},
    h(
      'div',
      { class: 'mn-sheet-bar' },
      h(
        'button',
        { class: 'mn-btn mn-btn--ghost', type: 'button', 'data-mn-close': '' },
        t('common.cancel'),
      ),
      h('h2', {}, t('invoices.deleteDraftsTitle')),
      h('span'),
    ),
    h(
      'div',
      { class: 'mn-sheet-body' },
      h('p', {}, t('invoices.deleteDraftsText', { n: drafts.length })),
      h(
        'button',
        {
          class: 'mn-btn mn-btn--danger mn-btn--block',
          type: 'button',
          onclick: async () => {
            for (const d of drafts) await app.store.softDelete('invoices', d.id);
            selection.clear();
            window.mnui.sheet.close();
            window.mnui.toast(t('invoices.draftsDeleted', { n: drafts.length }));
            app.render();
          },
        },
        t('invoices.deleteDrafts', { n: drafts.length }),
      ),
    ),
  );
  window.mnui.sheet.open(sheet);
}

// ---------- Kalender (Fristen) ----------
function monthDays(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = addDays(`${month}-01`, -lead);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => addDays(start, i));
}

function renderCalendar(main, state, update) {
  const day = today();
  const month = /^\d{4}-\d{2}$/.test(state.m) ? state.m : day.slice(0, 7);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(app.params().get('d') ?? '')
    ? app.params().get('d')
    : day;
  const payments = app.store.all('payments');
  const invoices = app.store.all('invoices').filter((inv) => inv.status === 'issued');
  const byDay = new Map();
  const add = (iso, kind, inv) => {
    if (!iso) return;
    if (!byDay.has(iso)) byDay.set(iso, []);
    byDay.get(iso).push({ kind, inv });
  };
  for (const inv of invoices) {
    const st = statusOf(inv, payments, day);
    if (['open', 'partial', 'overdue'].includes(st.key)) add(inv.due_date, 'due', inv);
    add(inv.issue_date, 'issued', inv);
  }
  const [y, m] = month.split('-').map(Number);
  const shift = (n) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  };
  const monthLabel = new Intl.DateTimeFormat(locale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  const weekdayFmt = new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' });
  const fullFmt = new Intl.DateTimeFormat(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const pick = (iso) => {
    app.setQuery({ d: iso, m: iso.slice(0, 7) });
    app.render();
  };
  const grid = h(
    'div',
    { class: 'mn-card' },
    h(
      'div',
      { class: 'mn-cal-head' },
      h(
        'button',
        {
          class: 'mn-icon-btn',
          type: 'button',
          'aria-label': t('calendar.prevMonth'),
          onclick: () => update({ m: shift(-1) }),
        },
        icon('left'),
      ),
      h('h2', {}, monthLabel),
      h(
        'button',
        {
          class: 'mn-icon-btn',
          type: 'button',
          'aria-label': t('calendar.nextMonth'),
          onclick: () => update({ m: shift(1) }),
        },
        icon('right'),
      ),
    ),
    h(
      'div',
      { class: 'mn-cal' },
      Array.from({ length: 7 }, (_, i) =>
        h('span', { class: 'mn-dow' }, weekdayFmt.format(new Date(Date.UTC(2024, 0, 1 + i)))),
      ),
    ),
    h(
      'div',
      { class: 'mn-cal' },
      monthDays(month).map((iso) => {
        const items = byDay.get(iso) ?? [];
        const cls = ['mn-cell', iso.slice(0, 7) !== month ? 'out' : '', iso === day ? 'today' : '']
          .filter(Boolean)
          .join(' ');
        const label = [
          fullFmt.format(new Date(`${iso}T00:00:00Z`)),
          items.length ? t('calendar.entries', { n: items.length }) : '',
        ]
          .filter(Boolean)
          .join(', ');
        return h(
          'button',
          {
            class: cls,
            type: 'button',
            'aria-pressed': String(iso === selected),
            'aria-label': label,
            onclick: () => pick(iso),
          },
          h('b', {}, String(Number(iso.slice(8)))),
          items.length
            ? h(
                'span',
                { class: 'mn-dots' },
                items.slice(0, 3).map((x) => h('i', { class: x.kind === 'issued' ? 'o' : '' })),
              )
            : null,
        );
      }),
    ),
    h(
      'p',
      { class: 'mn-note legend' },
      h('span', { class: 'mn-dots' }, h('i')),
      ` ${t('calendar.legendDue')} `,
      h('span', { class: 'mn-dots' }, h('i', { class: 'o' })),
      ` ${t('calendar.legendIssued')}`,
    ),
  );
  const items = byDay.get(selected) ?? [];
  const dayList = h(
    'div',
    {},
    sect(fullFmt.format(new Date(`${selected}T00:00:00Z`)), items.length || null),
    items.length
      ? h(
          'div',
          { class: 'mn-list' },
          items.map((x) =>
            h(
              'div',
              { class: 'calrow' },
              h(
                'span',
                { class: 'mn-chip mn-chip--plain' },
                t(x.kind === 'due' ? 'calendar.due' : 'calendar.issued'),
              ),
              invoiceRow(x.inv),
            ),
          ),
        )
      : h('p', { class: 'mn-note' }, t('calendar.nothing')),
  );
  if (month !== day.slice(0, 7) || selected !== day)
    main.append(
      h(
        'button',
        {
          class: 'mn-link',
          type: 'button',
          onclick: () => {
            app.setQuery({ d: null, m: null });
            app.render();
          },
        },
        t('calendar.backToToday'),
      ),
    );
  main.append(
    h(
      'div',
      { class: 'mn-split mn-split--start' },
      h('div', { class: 'mn-sticky' }, grid),
      dayList,
    ),
  );
  return { subtitle: monthLabel };
}

// ---------- Kunden ----------
const CUSTOMER_DEFAULTS = { q: '', s: 'name' };

export function customerTotals(customerId) {
  const payments = app.store.all('payments');
  let revenue = 0;
  let open = 0;
  let count = 0;
  let last = null;
  for (const inv of app.store.all('invoices')) {
    if (inv.customer_id !== customerId || inv.status === 'draft') continue;
    const st = statusOf(inv, payments);
    if (inv.kind !== 'cancellation' && inv.status !== 'cancelled') {
      revenue += inv.net_cents;
      count += 1;
    }
    open += st.open;
    if (!last || inv.issue_date > last) last = inv.issue_date;
  }
  return { revenue, open, count, last };
}

function renderCustomers(main, params) {
  const state = listState('customers', params, CUSTOMER_DEFAULTS);
  const update = (patch) => {
    const next = { ...state, ...patch };
    app.setQuery(next);
    rememberView('customers', { s: next.s });
    app.render();
  };
  const openId = params.get('id');
  if (openId && app.store.get('customers', openId))
    queueMicrotask(() => {
      app.setQuery({ id: null });
      openCustomerDetail(openId);
    });
  const all = app.store.all('customers').map((c) => ({ c, tot: customerTotals(c.id) }));
  if (!all.length) {
    main.append(
      empty({
        iconName: 'people',
        title: t('customers.emptyTitle'),
        text: t('customers.emptyText'),
        action: { label: t('customers.addFirst'), onClick: () => openCustomerEditor() },
      }),
    );
    return { subtitle: t('customers.count', { n: 0 }) };
  }
  const q = fold(state.q).trim();
  const shown = all.filter(
    (x) =>
      !q || fold([x.c.name, x.c.contact, x.c.city, x.c.email, x.c.number].join(' ')).includes(q),
  );
  const collator = new Intl.Collator(locale());
  const sorters = {
    name: (a, b) => collator.compare(a.c.name, b.c.name),
    revenue: (a, b) => b.tot.revenue - a.tot.revenue,
    open: (a, b) => b.tot.open - a.tot.open,
    recent: (a, b) => String(b.tot.last ?? '').localeCompare(String(a.tot.last ?? '')),
  };
  shown.sort(sorters[state.s] ?? sorters.name);
  const { box } = searchBox(
    state.q,
    t('customers.searchPlaceholder'),
    t('customers.searchLabel'),
    (value) => update({ q: value }),
  );
  main.append(box);
  main.append(
    h(
      'div',
      { class: 'listbar' },
      sortSelect(
        t('common.sort'),
        ['name', 'revenue', 'open', 'recent'].map((v) => ({
          value: v,
          label: t(`customers.sort.${v}`),
        })),
        state.s,
        (value) => update({ s: value }),
      ),
    ),
  );
  main.append(
    h('p', { class: 'mn-note', 'aria-live': 'polite' }, t('customers.count', { n: shown.length })),
  );
  if (!shown.length) {
    main.append(
      empty({
        iconName: 'search',
        title: t('common.nothingFoundFor', { q: state.q }),
        action: { label: t('common.clearSearch'), onClick: () => update({ q: '' }) },
      }),
    );
    return { subtitle: t('customers.count', { n: all.length }) };
  }
  main.append(
    h(
      'div',
      { class: 'mn-list' },
      shown.map((x) =>
        h(
          'button',
          {
            class: 'mn-row',
            type: 'button',
            dataset: { id: x.c.id },
            onclick: () => openCustomerDetail(x.c.id),
          },
          h('span', { class: 'mn-thumb', 'aria-hidden': 'true' }, initials(x.c.name)),
          h(
            'span',
            {},
            h('span', { class: 'mn-row-title' }, highlight(x.c.name, state.q)),
            h(
              'span',
              { class: 'mn-row-sub' },
              x.c.is_sample
                ? h('span', { class: 'mn-chip mn-chip--plain sample' }, t('common.sample'))
                : null,
              [x.c.city, t('customers.invoiceCount', { n: x.tot.count })]
                .filter(Boolean)
                .join(' · '),
            ),
          ),
          h(
            'span',
            { class: 'mn-row-side' },
            x.tot.open > 0 ? h('b', {}, amount(x.tot.open)) : h('b', {}, amount(x.tot.revenue)),
            x.tot.open > 0 ? t('customers.open') : t('customers.revenue'),
          ),
        ),
      ),
    ),
  );
  return { subtitle: t('customers.count', { n: all.length }) };
}

export function initials(name) {
  return (
    String(name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

// ---------- Bausteine ----------
const ITEM_DEFAULTS = { q: '', f: 'all', s: 'name' };

function renderItems(main, params) {
  const state = listState('items', params, ITEM_DEFAULTS);
  const update = (patch) => {
    const next = { ...state, ...patch };
    app.setQuery(next);
    rememberView('items', { f: next.f, s: next.s });
    app.render();
  };
  const all = app.store.all('items');
  if (!all.length) {
    main.append(
      empty({
        iconName: 'blocks',
        title: t('items.emptyTitle'),
        text: t('items.emptyText'),
        action: { label: t('items.addFirst'), onClick: () => openItemEditor() },
      }),
    );
    return { subtitle: t('items.count', { n: 0 }) };
  }
  const q = fold(state.q).trim();
  const searched = all.filter(
    (i) => !q || fold([i.title, i.description, i.number].join(' ')).includes(q),
  );
  const kinds = {
    all: () => true,
    service: (i) => i.kind === 'service',
    product: (i) => i.kind === 'product',
  };
  const shown = searched.filter(kinds[state.f] ?? kinds.all);
  const collator = new Intl.Collator(locale());
  const sorters = {
    name: (a, b) => collator.compare(a.title, b.title),
    price: (a, b) => b.price_cents - a.price_cents,
  };
  shown.sort(sorters[state.s] ?? sorters.name);
  const { box } = searchBox(
    state.q,
    t('items.searchPlaceholder'),
    t('items.searchLabel'),
    (value) => update({ q: value }),
  );
  main.append(box);
  main.append(
    chips(
      t('common.filter'),
      Object.keys(kinds).map((k) => ({
        value: k,
        label: t(`items.filter.${k}`),
        count: searched.filter(kinds[k]).length,
      })),
      state.f,
      (value) => update({ f: value }),
    ),
  );
  main.append(
    h(
      'div',
      { class: 'listbar' },
      sortSelect(
        t('common.sort'),
        ['name', 'price'].map((v) => ({ value: v, label: t(`items.sort.${v}`) })),
        state.s,
        (value) => update({ s: value }),
      ),
    ),
  );
  main.append(
    h('p', { class: 'mn-note', 'aria-live': 'polite' }, t('items.count', { n: shown.length })),
  );
  hint('itemsReuse', main);
  if (!shown.length) {
    main.append(
      empty({
        iconName: 'search',
        title: state.q ? t('common.nothingFoundFor', { q: state.q }) : t('common.nothingFound'),
        action: { label: t('common.resetFilters'), onClick: () => update({ q: '', f: 'all' }) },
      }),
    );
    return { subtitle: t('items.count', { n: all.length }) };
  }
  main.append(
    h(
      'div',
      { class: 'mn-list' },
      shown.map((item) =>
        h(
          'button',
          {
            class: 'mn-row mn-row--text',
            type: 'button',
            dataset: { id: item.id },
            onclick: () => openItemEditor(item.id),
          },
          h(
            'span',
            {},
            h('span', { class: 'mn-row-title' }, highlight(item.title, state.q)),
            h(
              'span',
              { class: 'mn-row-sub' },
              item.is_sample
                ? h('span', { class: 'mn-chip mn-chip--plain sample' }, t('common.sample'))
                : null,
              [t(`items.kind.${item.kind}`), item.unit, formatRate(item.tax_bp, locale())]
                .filter(Boolean)
                .join(' · '),
            ),
          ),
          h(
            'span',
            { class: 'mn-row-side' },
            h('b', {}, amount(item.price_cents)),
            item.unit ? t('items.perUnit', { unit: item.unit }) : t('items.net'),
          ),
        ),
      ),
    ),
  );
  return { subtitle: t('items.count', { n: all.length }) };
}

export const VIEWS = {
  overview: { render: renderOverview, help: true },
  invoices: { render: renderInvoices, help: true },
  customers: { render: renderCustomers, help: false },
  items: { render: renderItems, help: true },
  stats: { render: renderStats, help: true },
  settings: { render: renderSettings, help: false },
  print: { render: renderPrint, help: false },
};
