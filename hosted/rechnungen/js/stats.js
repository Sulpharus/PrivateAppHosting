// Statistik: estimated net (invoiced) and actual gross income (payments received) per business
// year, monthly chart, payment heat grid, top customers, and the year export for the tax return
// (ZIP with all invoice PDFs and CSV lists, CSV files, a printable report).
import { pdfBytes, pdfName } from './actions.js';
import { csvAmount, toCsv } from './csv.js';
import { app, saveSettings } from './ctx.js';
import { amount, date, download, h, icon, locale, money, safeName, sect, t } from './dom.js';
import { hint } from './help.js';
import { addDays, businessYear, businessYearOf, statusOf, today } from './invoice.js';
import { formatRate, totals } from './money.js';
import { chargesNoTax } from './rules.js';
import { hideAmountsTool } from './views.js';
import { zip } from './zip.js';

const SVG = 'http://www.w3.org/2000/svg';

function yearLabel(year, start) {
  if (start === 1) return String(year);
  return `${year}/${String(year + 1).slice(2)}`;
}

/** Everything the statistics and the export need for one business year. */
export function yearData(year, start = app.settings.fiscalStart ?? 1) {
  const { from, to } = businessYear(year, start);
  const inRange = (iso) => iso && iso >= from && iso <= to;
  const allPayments = app.store.all('payments');
  const invoices = app.store
    .all('invoices')
    .filter((inv) => inv.status !== 'draft' && inRange(inv.issue_date))
    .sort(
      (a, b) =>
        String(a.issue_date).localeCompare(String(b.issue_date)) ||
        String(a.number).localeCompare(String(b.number)),
    );
  const payments = allPayments
    .filter((p) => inRange(p.paid_on) && app.store.get('invoices', p.invoice_id))
    .sort((a, b) => String(a.paid_on).localeCompare(String(b.paid_on)));
  const net = invoices.reduce((s, i) => s + i.net_cents, 0);
  const tax = invoices.reduce((s, i) => s + i.tax_cents, 0);
  const gross = invoices.reduce((s, i) => s + i.gross_cents, 0);
  const received = payments.reduce((s, p) => s + p.amount_cents, 0);
  const open = invoices.reduce((s, i) => s + statusOf(i, allPayments).open, 0);
  const months = Array.from({ length: 12 }, (_, i) => {
    const first = addMonths(from, i);
    const key = first.slice(0, 7);
    return {
      key,
      net: invoices
        .filter((x) => x.issue_date.startsWith(key))
        .reduce((s, x) => s + x.net_cents, 0),
      received: payments
        .filter((p) => p.paid_on.startsWith(key))
        .reduce((s, p) => s + p.amount_cents, 0),
    };
  });
  // VAT by rate (from the invoices of the year).
  const byRate = new Map();
  for (const inv of invoices) {
    const sum = totals(inv.lines ?? [], { noTax: chargesNoTax(inv.tax_mode) });
    for (const r of sum.rates) {
      const key = chargesNoTax(inv.tax_mode) ? `mode:${inv.tax_mode}` : `rate:${r.rate}`;
      const cur = byRate.get(key) ?? { key, rate: r.rate, mode: inv.tax_mode, net: 0, tax: 0 };
      cur.net += r.net;
      cur.tax += r.tax;
      byRate.set(key, cur);
    }
  }
  const customers = new Map();
  for (const inv of invoices) {
    const name = inv.customer?.name ?? t('invoices.noCustomer');
    customers.set(name, (customers.get(name) ?? 0) + inv.net_cents);
  }
  return {
    year,
    start,
    from,
    to,
    invoices,
    payments,
    net,
    tax,
    gross,
    received,
    open,
    months,
    rates: [...byRate.values()],
    customers,
  };
}

function addMonths(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function chart(data) {
  const width = 640;
  const height = 220;
  const pad = { left: 8, right: 8, top: 12, bottom: 28 };
  const max = Math.max(1, ...data.months.flatMap((m) => [m.net, m.received]));
  const slot = (width - pad.left - pad.right) / 12;
  const barW = Math.max(4, slot * 0.34);
  const monthFmt = new Intl.DateTimeFormat(locale(), { month: 'narrow', timeZone: 'UTC' });
  const longFmt = new Intl.DateTimeFormat(locale(), { month: 'long', timeZone: 'UTC' });
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    data.months
      .map((m) =>
        t('stats.chartMonth', {
          month: longFmt.format(new Date(`${m.key}-01T00:00:00Z`)),
          net: money(m.net),
          received: money(m.received),
        }),
      )
      .join('; '),
  );
  const el = (tag, attrs) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
    return node;
  };
  const base = height - pad.bottom;
  el('line', { x1: pad.left, x2: width - pad.right, y1: base, y2: base, class: 'axis' });
  data.months.forEach((m, i) => {
    const x = pad.left + i * slot + slot / 2;
    const hNet = (Math.max(0, m.net) / max) * (base - pad.top);
    const hRec = (Math.max(0, m.received) / max) * (base - pad.top);
    el('rect', { x: x - barW - 1, y: base - hNet, width: barW, height: hNet, rx: 2, class: 's1' });
    el('rect', { x: x + 1, y: base - hRec, width: barW, height: hRec, rx: 2, class: 's2' });
    const label = el('text', { x, y: height - 8, 'text-anchor': 'middle', class: 'tick' });
    label.textContent = monthFmt.format(new Date(`${m.key}-01T00:00:00Z`));
  });
  return svg;
}

function heat(data) {
  // One cell per day of the business year, weeks as columns, Monday on top.
  const byDay = new Map();
  for (const p of data.payments) byDay.set(p.paid_on, (byDay.get(p.paid_on) ?? 0) + 1);
  for (const inv of data.invoices) byDay.set(inv.issue_date, (byDay.get(inv.issue_date) ?? 0) + 1);
  const values = [...byDay.values()].sort((a, b) => a - b);
  const q = (p) => values[Math.floor((values.length - 1) * p)] ?? 1;
  const [a, b] = [q(0.5), q(0.85)];
  const grid = h('div', {
    class: 'mn-heat yearheat',
    role: 'img',
    'aria-label': t('stats.heatLabel', { n: byDay.size }),
  });
  const [y, m, d] = data.from.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  for (let i = 0; i < lead; i += 1) grid.append(h('i', { class: 'blank' }));
  for (let day = data.from; day <= data.to; day = addDays(day, 1)) {
    const n = byDay.get(day) ?? 0;
    grid.append(
      h('i', {
        class: n === 0 ? '' : n <= a ? 'l1' : n <= b ? 'l2' : 'l3',
        title: n ? `${date(day)}: ${t('stats.heatDay', { n })}` : null,
      }),
    );
  }
  return grid;
}

export function renderStats(main, params) {
  const start = app.settings.fiscalStart ?? 1;
  const thisYear = businessYearOf(today(), start);
  const year = /^\d{4}$/.test(params.get('year') ?? '') ? Number(params.get('year')) : thisYear;
  const data = yearData(year, start);
  const stepper = h(
    'div',
    { class: 'mn-stepper', role: 'group', 'aria-label': t('stats.year') },
    h(
      'button',
      {
        class: 'mn-icon-btn',
        type: 'button',
        'aria-label': t('stats.prevYear'),
        onclick: () => app.go('stats', { year: year - 1 }),
      },
      icon('left'),
    ),
    h('b', {}, yearLabel(year, start)),
    h(
      'button',
      {
        class: 'mn-icon-btn',
        type: 'button',
        'aria-label': t('stats.nextYear'),
        onclick: () => app.go('stats', { year: year + 1 }),
      },
      icon('right'),
    ),
  );
  const tools = [stepper, hideAmountsTool()];
  const subtitle =
    start === 1
      ? t('stats.subCalendar')
      : t('stats.subFiscal', { from: date(data.from), to: date(data.to) });
  if (!data.invoices.length && !data.payments.length) {
    main.append(
      h(
        'div',
        { class: 'mn-empty' },
        h('div', { class: 'mn-empty-icon' }, icon('chart')),
        h('h3', {}, t('stats.emptyTitle', { year: yearLabel(year, start) })),
        h('p', {}, t('stats.emptyText')),
        year !== thisYear
          ? h(
              'button',
              { class: 'mn-btn mn-btn--primary', type: 'button', onclick: () => app.go('stats') },
              t('stats.toThisYear'),
            )
          : null,
      ),
    );
    return { subtitle, tools };
  }
  main.append(
    h(
      'div',
      { class: 'mn-kpis' },
      kpi(amount(data.net), t('stats.kpiNet')),
      kpi(amount(data.received), t('stats.kpiReceived')),
      kpi(amount(data.tax), t('stats.kpiTax')),
      kpi(amount(data.open), t('stats.kpiOpen')),
    ),
  );
  hint('statsMeaning', main);

  const legend = h(
    'p',
    { class: 'legend chartlegend' },
    h('span', { class: 'key s1', 'aria-hidden': 'true' }),
    ` ${t('stats.seriesNet')}: `,
    amount(data.net),
    '  ',
    h('span', { class: 'key s2', 'aria-hidden': 'true' }),
    ` ${t('stats.seriesReceived')}: `,
    amount(data.received),
  );
  const monthFmt = new Intl.DateTimeFormat(locale(), { month: 'long', timeZone: 'UTC' });
  const table = h(
    'details',
    { class: 'mn-more' },
    h('summary', {}, t('stats.asTable')),
    h(
      'div',
      { class: 'tablewrap' },
      h(
        'table',
        { class: 'numtable' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, t('stats.month')),
            h('th', { scope: 'col' }, t('stats.seriesNet')),
            h('th', { scope: 'col' }, t('stats.seriesReceived')),
          ),
        ),
        h(
          'tbody',
          {},
          data.months.map((m) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, monthFmt.format(new Date(`${m.key}-01T00:00:00Z`))),
              h('td', {}, amount(m.net)),
              h('td', {}, amount(m.received)),
            ),
          ),
        ),
      ),
    ),
  );
  main.append(
    sect(t('stats.byMonth')),
    h('div', { class: 'mn-card chartcard' }, chart(data), legend, table),
  );

  const topCustomers = [...data.customers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCustomer = Math.max(1, ...topCustomers.map(([, v]) => v));
  const rateRows = data.rates.map((r) =>
    h(
      'div',
      {},
      h(
        'dt',
        {},
        r.key.startsWith('mode:')
          ? t(`taxMode.${r.mode}`)
          : t('stats.rate', { rate: formatRate(r.rate, locale()) }),
      ),
      h(
        'dd',
        {},
        amount(r.net),
        r.tax
          ? h('span', { class: 'mn-muted' }, ` · ${t('stats.taxAmount')} `, amount(r.tax))
          : null,
      ),
    ),
  );
  main.append(
    h(
      'div',
      { class: 'mn-cols' },
      h(
        'div',
        {},
        sect(t('stats.topCustomers'), topCustomers.length),
        h(
          'div',
          { class: 'mn-card' },
          topCustomers.map(([name, cents]) =>
            h(
              'div',
              { class: 'mn-bar' },
              h(
                'span',
                { class: 'mn-bar-top' },
                h('b', {}, name),
                h(
                  'span',
                  {},
                  amount(cents),
                  ` · ${t('stats.share', { n: data.net > 0 ? Math.round((cents / data.net) * 100) : 0 })}`,
                ),
              ),
              h(
                'span',
                { class: 'mn-meter' },
                h('i', {
                  style: {
                    '--mn-value': String(Math.max(0, Math.round((cents / maxCustomer) * 100))),
                  },
                }),
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        {},
        sect(t('stats.byRate')),
        h('div', { class: 'mn-card' }, h('dl', { class: 'mn-facts' }, rateRows)),
      ),
    ),
  );
  const heatCard = h(
    'div',
    { class: 'mn-card heatcard' },
    heat(data),
    h('p', { class: 'mn-note' }, t('stats.heatHint')),
  );
  main.append(sect(t('stats.activity')), heatCard);
  // Show the latest weeks first on narrow screens.
  requestAnimationFrame(() => {
    heatCard.scrollLeft = heatCard.scrollWidth;
  });
  main.append(sect(t('export.title', { year: yearLabel(year, start) })), exportCard(data));
  return { subtitle, tools };
}

function kpi(value, label) {
  return h('div', { class: 'mn-kpi' }, h('b', {}, value), h('span', {}, label));
}

// ---------- export ----------
export function invoicesCsv(invoices) {
  const lang = window.mnI18n.lang;
  const payments = app.store.all('payments');
  const head = [
    'number',
    'kind',
    'issueDate',
    'serviceDate',
    'dueDate',
    'customer',
    'customerVatId',
    'country',
    'net',
    'tax',
    'gross',
    'paid',
    'open',
    'status',
    'taxMode',
    'rates',
  ].map((k) => t(`csv.${k}`));
  const rows = invoices.map((inv) => {
    const st = statusOf(inv, payments);
    const sum = totals(inv.lines ?? [], { noTax: chargesNoTax(inv.tax_mode) });
    return [
      inv.number ?? '',
      t(`csv.kind.${inv.kind}`),
      inv.issue_date ?? '',
      inv.service_end ? `${inv.service_date} – ${inv.service_end}` : (inv.service_date ?? ''),
      inv.due_date ?? '',
      inv.customer?.name ?? '',
      inv.customer?.vat_id ?? '',
      inv.customer?.country ?? '',
      csvAmount(inv.net_cents, lang),
      csvAmount(inv.tax_cents, lang),
      csvAmount(inv.gross_cents, lang),
      csvAmount(st.paid, lang),
      csvAmount(st.open, lang),
      t(`status.${st.key}`),
      t(`taxMode.${inv.tax_mode}`),
      sum.rates.map((r) => formatRate(r.rate, locale())).join(' / '),
    ];
  });
  return toCsv([head, ...rows], lang);
}

function paymentsCsv(payments) {
  const lang = window.mnI18n.lang;
  const head = ['paidOn', 'number', 'customer', 'amount', 'note'].map((k) => t(`csv.${k}`));
  const rows = payments.map((p) => {
    const inv = app.store.get('invoices', p.invoice_id);
    return [
      p.paid_on,
      inv?.number ?? '',
      inv?.customer?.name ?? '',
      csvAmount(p.amount_cents, lang),
      p.note ?? '',
    ];
  });
  return toCsv([head, ...rows], lang);
}

function ratesCsv(data) {
  const lang = window.mnI18n.lang;
  const head = ['rateOrMode', 'net', 'tax'].map((k) => t(`csv.${k}`));
  const rows = data.rates.map((r) => [
    r.key.startsWith('mode:') ? t(`taxMode.${r.mode}`) : formatRate(r.rate, locale()),
    csvAmount(r.net, lang),
    csvAmount(r.tax, lang),
  ]);
  rows.push([t('csv.sum'), csvAmount(data.net, lang), csvAmount(data.tax, lang)]);
  return toCsv([head, ...rows], lang);
}

function exportCard(data) {
  const label = yearLabel(data.year, data.start);
  const status = h('p', { class: 'mn-hint', 'aria-live': 'polite' });
  const fileBase = `${t('export.filePrefix')}-${safeName(label).replace('/', '-')}`;
  const zipBtn = h(
    'button',
    {
      class: 'mn-btn mn-btn--primary',
      type: 'button',
      onclick: async () => {
        zipBtn.disabled = true;
        status.textContent = t('export.preparing', { n: data.invoices.length });
        try {
          const enc = new TextEncoder();
          const files = [
            {
              name: `${t('export.invoicesFile')}.csv`,
              bytes: enc.encode(invoicesCsv(data.invoices)),
            },
            {
              name: `${t('export.paymentsFile')}.csv`,
              bytes: enc.encode(paymentsCsv(data.payments)),
            },
            { name: `${t('export.ratesFile')}.csv`, bytes: enc.encode(ratesCsv(data)) },
          ];
          const used = new Set();
          for (const inv of data.invoices) {
            let name = pdfName(inv);
            while (used.has(name)) name = name.replace(/\.pdf$/, '-1.pdf');
            used.add(name);
            files.push({ name: `${t('export.pdfFolder')}/${name}`, bytes: await pdfBytes(inv) });
          }
          download(`${fileBase}.zip`, new Blob([zip(files)], { type: 'application/zip' }));
          status.textContent = '';
          window.mnui.toast(t('export.zipDone', { n: data.invoices.length }));
          await saveSettings({ lastExport: new Date().toISOString() });
        } catch {
          status.textContent = t('export.failed');
        } finally {
          zipBtn.disabled = false;
        }
      },
    },
    t('export.zip'),
  );
  return h(
    'div',
    { class: 'mn-card' },
    h('p', {}, t('export.text', { from: date(data.from), to: date(data.to) })),
    h(
      'dl',
      { class: 'mn-facts' },
      h(
        'div',
        {},
        h('dt', {}, t('export.invoiceCount')),
        h('dd', {}, String(data.invoices.length)),
      ),
      h('div', {}, h('dt', {}, t('stats.kpiNet')), h('dd', {}, amount(data.net))),
      h('div', {}, h('dt', {}, t('stats.kpiTax')), h('dd', {}, amount(data.tax))),
      h('div', {}, h('dt', {}, t('stats.kpiReceived')), h('dd', {}, amount(data.received))),
    ),
    h(
      'div',
      { class: 'detail-actions' },
      zipBtn,
      h(
        'button',
        {
          class: 'mn-btn',
          type: 'button',
          onclick: () => {
            download(
              `${fileBase}-${t('export.invoicesFile')}.csv`,
              invoicesCsv(data.invoices),
              'text/csv;charset=utf-8',
            );
            window.mnui.toast(t('export.done'));
          },
        },
        t('export.csvInvoices'),
      ),
      h(
        'button',
        {
          class: 'mn-btn',
          type: 'button',
          onclick: () => {
            download(
              `${fileBase}-${t('export.paymentsFile')}.csv`,
              paymentsCsv(data.payments),
              'text/csv;charset=utf-8',
            );
            window.mnui.toast(t('export.done'));
          },
        },
        t('export.csvPayments'),
      ),
      h(
        'button',
        { class: 'mn-btn', type: 'button', onclick: () => app.go('print', { year: data.year }) },
        t('export.print'),
      ),
    ),
    status,
    h('p', { class: 'mn-hint' }, t('export.hint')),
  );
}

// ---------- print view ----------
export function renderPrint(main, params) {
  const start = app.settings.fiscalStart ?? 1;
  const year = /^\d{4}$/.test(params.get('year') ?? '')
    ? Number(params.get('year'))
    : businessYearOf(today(), start);
  const data = yearData(year, start);
  const label = yearLabel(year, start);
  const payments = app.store.all('payments');
  main.append(
    h(
      'div',
      { class: 'print-only-head' },
      h('p', { class: 'mn-muted' }, `${app.company.name || t('app.title')} · ${t('app.title')}`),
      h('h2', {}, t('print.title', { year: label })),
      h('p', {}, t('print.range', { from: date(data.from), to: date(data.to) })),
    ),
    h(
      'div',
      { class: 'tablewrap' },
      h(
        'table',
        { class: 'numtable printtable' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ['number', 'issueDate', 'customer', 'net', 'tax', 'gross', 'status'].map((k) =>
              h('th', { scope: 'col' }, t(`csv.${k}`)),
            ),
          ),
        ),
        h(
          'tbody',
          {},
          data.invoices.map((inv) =>
            h(
              'tr',
              {},
              h('td', {}, inv.number),
              h('td', {}, date(inv.issue_date)),
              h('td', {}, inv.customer?.name ?? ''),
              h('td', {}, money(inv.net_cents)),
              h('td', {}, money(inv.tax_cents)),
              h('td', {}, money(inv.gross_cents)),
              h('td', {}, t(`status.${statusOf(inv, payments).key}`)),
            ),
          ),
        ),
        h(
          'tfoot',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'row', colspan: '3' }, t('csv.sum')),
            h('td', {}, money(data.net)),
            h('td', {}, money(data.tax)),
            h('td', {}, money(data.gross)),
            h('td'),
          ),
        ),
      ),
    ),
    h(
      'dl',
      { class: 'mn-facts' },
      h('div', {}, h('dt', {}, t('stats.kpiReceived')), h('dd', {}, money(data.received))),
      h('div', {}, h('dt', {}, t('stats.kpiOpen')), h('dd', {}, money(data.open))),
    ),
    h('p', { class: 'mn-note' }, t('print.printedOn', { date: date(today()) })),
  );
  const tools = [
    h(
      'button',
      { class: 'mn-btn', type: 'button', onclick: () => app.go('stats', { year }) },
      t('common.back'),
    ),
    h(
      'button',
      { class: 'mn-btn mn-btn--primary', type: 'button', onclick: () => window.print() },
      t('print.print'),
    ),
  ];
  return { title: t('print.heading'), subtitle: label, tools };
}
