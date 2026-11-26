// Einstellungen: company profile, reminders, business year, backup (JSON) and CSV import, the bin,
// sample data, hints, and deleting everything.
import { cancelReminder, setPush, uploadMissingPdfs } from './actions.js';
import { originalsFirst, planImport } from './backup.js';
import { decodeText, guessMapping, IMPORT_FIELDS, idFrom, parseCsv } from './csv.js';
import {
  app,
  companyReady,
  DEFAULT_COMPANY,
  hasSamples,
  saveCompany,
  saveSettings,
} from './ctx.js';
import { date, download, field, h, icon, locale, t } from './dom.js';
import { openCompanyEditor } from './editors.js';
import { removeFiles } from './files.js';
import { openShortcuts, resetHints } from './help.js';
import { addDays, emptyLine, today, withTotals } from './invoice.js';
import { maskIban, parseCents, parseRate } from './money.js';
import { ratesFor } from './rules.js';
import { TABLES } from './store.js';

// ---------- start-up chores ----------
export async function purgeOld() {
  try {
    const purged = await app.store.purge();
    for (const { table, row } of purged)
      if (table === 'invoices')
        await removeFiles((row.attachments ?? []).flatMap((f) => [f.path, f.thumb]));
  } catch {
    // Next time.
  }
}

// ---------- sample data ----------
export async function addSampleData() {
  const s = app.store;
  const country = app.company.country === 'AT' ? 'AT' : 'DE';
  const [rate, reduced] = ratesFor(country);
  const day = today();
  const c1 = {
    id: s.newId(),
    name: t('sample.customer1'),
    contact: 'Max Muster',
    email: 'max@example.com',
    street: t('sample.street1'),
    zip: country === 'AT' ? '1010' : '10115',
    city: country === 'AT' ? 'Wien' : 'Berlin',
    country,
    payment_days: 14,
    notes: `- [x] ${t('sample.note1')}\n- [ ] ${t('sample.note2')}`,
    is_sample: true,
  };
  const c2 = {
    id: s.newId(),
    name: t('sample.customer2'),
    email: 'erika@example.com',
    street: t('sample.street2'),
    zip: country === 'AT' ? '8010' : '80331',
    city: country === 'AT' ? 'Graz' : 'München',
    country,
    is_sample: true,
  };
  const i1 = {
    id: s.newId(),
    kind: 'service',
    title: t('sample.item1'),
    unit: t('units.hour'),
    price_cents: 9500,
    tax_bp: rate,
    is_sample: true,
  };
  const i2 = {
    id: s.newId(),
    kind: 'service',
    title: t('sample.item2'),
    description: t('sample.item2Desc'),
    unit: t('units.flat'),
    price_cents: 45000,
    tax_bp: rate,
    is_sample: true,
  };
  const i3 = {
    id: s.newId(),
    kind: 'product',
    title: t('sample.item3'),
    unit: t('units.piece'),
    price_cents: 2490,
    tax_bp: reduced,
    is_sample: true,
  };
  await s.saveMany('customers', [c1, c2]);
  await s.saveMany('items', [i1, i2, i3]);
  const line = (item, qty) => ({
    ...emptyLine(s.newId(), item.tax_bp),
    item_id: item.id,
    title: item.title,
    description: item.description ?? '',
    unit: item.unit,
    qty_milli: qty,
    price_cents: item.price_cents,
  });
  const seller = {
    ...app.company,
    name: app.company.name || t('sample.seller'),
    street: app.company.street || t('sample.street1'),
    zip: app.company.zip || c1.zip,
    city: app.company.city || c1.city,
    country,
  };
  const mk = (n, customer, lines, issued, dueIn, extra = {}) =>
    withTotals({
      id: s.newId(),
      kind: 'invoice',
      status: 'issued',
      number: `${t('sample.numberPrefix')}-${day.slice(0, 4)}-${String(n).padStart(3, '0')}`,
      customer_id: customer.id,
      customer: { ...customer },
      seller,
      lines,
      tax_mode: 'standard',
      lang: 'de',
      layout: 'din',
      issue_date: issued,
      service_date: issued,
      due_date: addDays(issued, dueIn),
      is_sample: true,
      ...extra,
    });
  const a = mk(1, c1, [line(i1, 12000), line(i3, 4000)], addDays(day, -45), 14);
  const b = mk(2, c2, [line(i2, 1000)], addDays(day, -20), 14);
  const c = mk(3, c1, [line(i1, 6500)], addDays(day, -5), 14);
  const draft = withTotals({
    ...mk(4, c2, [line(i1, 3000)], day, 14),
    status: 'draft',
    number: null,
    seller: {},
    customer: {},
  });
  await s.saveMany('invoices', [a, b, c, draft]);
  await s.saveMany('payments', [
    {
      id: s.newId(),
      invoice_id: a.id,
      paid_on: addDays(a.issue_date, 10),
      amount_cents: a.gross_cents,
      is_sample: true,
    },
  ]);
  window.mnui.toast(t('sample.added'));
}

export async function removeSampleData() {
  const s = app.store;
  try {
    for (const p of s.all('payments')) if (p.is_sample) await s.remove('payments', p.id);
    // Cancellations before the invoices they cancel.
    const invoices = originalsFirst(s.all('invoices', { deleted: true })).reverse();
    for (const row of invoices) if (row.is_sample) await s.purgeOne('invoices', row.id);
    for (const table of ['customers', 'items'])
      for (const row of s.all(table, { deleted: true }))
        if (row.is_sample) await s.purgeOne(table, row.id);
    window.mnui.toast(t('sample.removed'));
  } catch {
    window.mnui.toast(t('common.saveError'));
  }
}

// ---------- backup ----------
function exportBackup() {
  const data = {
    app: 'rechnungen',
    version: 1,
    exportedAt: new Date().toISOString(),
    company: app.company,
    settings: app.settings,
  };
  for (const table of TABLES) data[table] = app.store.all(table, { deleted: true });
  download(`rechnungen-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  void saveSettings({ lastBackup: new Date().toISOString() });
  window.mnui.toast(t('backup.exported'));
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(decodeText(new Uint8Array(await file.arrayBuffer())));
  } catch {
    window.mnui.toast(t('backup.invalid'));
    return;
  }
  if (data?.app !== 'rechnungen') {
    window.mnui.toast(t('backup.invalid'));
    return;
  }
  const plan = planImport(data, (table, id) => Boolean(app.store.get(table, id)));
  let count = 0;
  let failed = 0;
  for (const [table, rows] of Object.entries(plan))
    for (const row of rows) {
      try {
        await app.store.save(table, row);
        if (table !== 'history') count += 1;
      } catch {
        failed += 1;
      }
    }
  // The company profile comes back only where none is filled in yet.
  if (!app.company.name && data.company && typeof data.company === 'object') {
    const company = Object.fromEntries(
      Object.keys(DEFAULT_COMPANY).map((key) => [key, data.company[key] ?? DEFAULT_COMPANY[key]]),
    );
    if (typeof company.name === 'string') await saveCompany({ ...company, logo: null });
  }
  window.mnui.toast(
    failed ? t('backup.importedSome', { n: count, failed }) : t('backup.imported', { n: count }),
  );
  app.render();
  void uploadMissingPdfs();
}

// ---------- CSV import ----------
function openCsvImport(kind) {
  const country = app.company.country === 'AT' ? 'AT' : 'DE';
  const body = h('div', { class: 'mn-sheet-body' });
  const save = h(
    'button',
    { class: 'mn-btn mn-btn--primary', type: 'button', disabled: true },
    t('csvImport.import'),
  );
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
      h('h2', {}, t(`csvImport.title.${kind}`)),
      h('span'),
    ),
    body,
    h('div', { class: 'mn-sheet-foot' }, h('span', { class: 'mn-grow' }), save),
  );
  const picker = h('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
  body.append(h('p', {}, t(`csvImport.intro.${kind}`)), field(t('csvImport.file'), picker));
  const area = h('div', {});
  body.append(area);
  let rows = [];
  let header = [];
  let map = {};
  const buildRows = async () => {
    // The user's id is part of the hash: the same row of two people never gets the same id.
    const owner = (await app.mn.auth.user())?.id ?? '';
    const out = [];
    for (const r of rows) {
      const get = (f) => (map[f] >= 0 ? (r[map[f]] ?? '').trim() : '');
      if (kind === 'customers') {
        const name = get('name');
        if (!name) continue;
        const code = get('country').toUpperCase();
        out.push({
          id: await idFrom(`${owner}|customer|${name}|${get('zip')}|${get('email')}`),
          name,
          contact: get('contact'),
          email: get('email'),
          phone: get('phone'),
          street: get('street'),
          zip: get('zip'),
          city: get('city'),
          country: /^[A-Z]{2}$/.test(code) ? code : country,
          vat_id: get('vat_id').replace(/\s/g, '').toUpperCase(),
          number: get('number'),
        });
      } else {
        const title = get('title');
        const price = parseCents(get('price'));
        if (!title || price === null) continue;
        const rate = parseRate(get('tax'));
        out.push({
          id: await idFrom(`${owner}|item|${title}|${price}`),
          kind: 'service',
          title,
          description: get('description'),
          unit: get('unit'),
          price_cents: price,
          tax_bp: rate !== null && rate <= 10000 ? rate : ratesFor(country)[0],
          number: get('number'),
        });
      }
    }
    return out;
  };
  const drawPreview = async () => {
    area.textContent = '';
    const fields = IMPORT_FIELDS[kind];
    area.append(
      h(
        'fieldset',
        {},
        h('legend', {}, t('csvImport.mapping')),
        h(
          'div',
          { class: 'mapgrid' },
          fields.map((f) => {
            const sel = h(
              'select',
              {
                onchange: () => {
                  map[f] = Number(sel.value);
                  void drawPreview();
                },
              },
              h('option', { value: '-1' }, t('csvImport.none')),
              header.map((name, i) =>
                h(
                  'option',
                  { value: String(i), selected: map[f] === i },
                  name || t('csvImport.column', { n: i + 1 }),
                ),
              ),
            );
            return h('label', { class: 'mn-field' }, t(`csvImport.field.${f}`), sel);
          }),
        ),
      ),
    );
    const parsed = await buildRows();
    const fresh = parsed.filter((r) => !app.store.get(kind, r.id));
    area.append(
      h(
        'p',
        { 'aria-live': 'polite' },
        t('csvImport.found', { n: parsed.length, fresh: fresh.length }),
      ),
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
              header.map((name) => h('th', { scope: 'col' }, name)),
            ),
          ),
          h(
            'tbody',
            {},
            rows.slice(0, 5).map((r) =>
              h(
                'tr',
                {},
                header.map((_, i) => h('td', {}, r[i] ?? '')),
              ),
            ),
          ),
        ),
      ),
    );
    save.disabled = fresh.length === 0;
    save.textContent = t('csvImport.importN', { n: fresh.length });
    save.onclick = async () => {
      save.disabled = true;
      let done = 0;
      for (const row of fresh) {
        try {
          await app.store.save(kind, row);
          done += 1;
        } catch {
          // counted below
        }
      }
      window.mnui.sheet.close();
      window.mnui.toast(
        done < fresh.length
          ? t('backup.importedSome', { n: done, failed: fresh.length - done })
          : t('csvImport.done', { n: done }),
      );
      app.render();
    };
  };
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      area.textContent = '';
      area.append(h('p', { class: 'mn-error', role: 'alert' }, t('csvImport.tooBig')));
      return;
    }
    const text = decodeText(new Uint8Array(await file.arrayBuffer()));
    const all = parseCsv(text);
    if (all.length < 2) {
      area.textContent = '';
      area.append(h('p', { class: 'mn-error', role: 'alert' }, t('csvImport.empty')));
      return;
    }
    header = all[0].map((x) => x.slice(0, 60));
    rows = all.slice(1, 5001);
    map = guessMapping(header, kind);
    await drawPreview();
  });
  window.mnui.sheet.open(sheet, { tall: true });
}

// ---------- bin ----------
function openTrash() {
  const draw = () => {
    const items = app.store.trash();
    const body = h(
      'div',
      { class: 'mn-sheet-body' },
      h('p', { class: 'mn-note' }, t('trash.hint')),
      items.length
        ? h(
            'div',
            { class: 'mn-list' },
            items.map(({ table, row }) =>
              h(
                'div',
                { class: 'mn-row mn-row--text' },
                h(
                  'span',
                  {},
                  h(
                    'span',
                    { class: 'mn-row-title' },
                    row.name ?? row.title ?? row.customer?.name ?? t('invoices.draftTitle'),
                  ),
                  h(
                    'span',
                    { class: 'mn-row-sub' },
                    `${t(`trash.kind.${table}`)} · ${t('trash.deletedOn', { date: date(row.deleted_at.slice(0, 10)) })}`,
                  ),
                ),
                h(
                  'span',
                  { class: 'mn-row-side trash-actions' },
                  h(
                    'button',
                    {
                      class: 'mn-btn',
                      type: 'button',
                      onclick: async () => {
                        await app.store.restore(table, row.id);
                        window.mnui.toast(t('trash.restored'));
                        app.render();
                        open();
                      },
                    },
                    t('trash.restore'),
                  ),
                  h(
                    'button',
                    {
                      class: 'mn-btn mn-btn--danger',
                      type: 'button',
                      onclick: async (e) => {
                        if (e.currentTarget.dataset.armed !== '1') {
                          e.currentTarget.dataset.armed = '1';
                          e.currentTarget.textContent = t('common.tapAgain');
                          return;
                        }
                        if (table === 'invoices')
                          await removeFiles(
                            (row.attachments ?? []).flatMap((f) => [f.path, f.thumb]),
                          );
                        await app.store.purgeOne(table, row.id);
                        window.mnui.toast(t('trash.purged'));
                        app.render();
                        open();
                      },
                    },
                    t('trash.purge'),
                  ),
                ),
              ),
            ),
          )
        : h(
            'div',
            { class: 'mn-empty' },
            h('div', { class: 'mn-empty-icon' }, icon('trash')),
            h('h3', {}, t('trash.emptyTitle')),
            h('p', {}, t('trash.emptyText')),
          ),
    );
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { class: 'mn-btn mn-btn--ghost', type: 'button', 'data-mn-close': '' },
          t('common.close'),
        ),
        h('h2', {}, t('trash.title')),
        h('span'),
      ),
      body,
    );
  };
  const open = () => window.mnui.sheet.open(draw(), { tall: true });
  open();
}

// ---------- delete everything ----------
function openDeleteAll() {
  const confirmInput = h('input', { type: 'text', autocomplete: 'off' });
  const word = t('danger.word');
  const go = h(
    'button',
    { class: 'mn-btn mn-btn--danger mn-btn--block', type: 'button' },
    t('danger.deleteAll'),
  );
  const box = field(t('danger.typeWord', { word }), confirmInput);
  go.addEventListener('click', async () => {
    if (confirmInput.value.trim().toLowerCase() !== word.toLowerCase()) {
      box.setError(t('danger.wordError', { word }));
      return;
    }
    go.disabled = true;
    const files = [];
    for (const inv of app.store.all('invoices', { deleted: true })) {
      files.push(inv.pdf_path, ...(inv.attachments ?? []).flatMap((f) => [f.path, f.thumb]));
      await cancelReminder(inv.id);
    }
    files.push(app.company.logo);
    try {
      for (const table of ['history', 'payments', 'invoices', 'items', 'customers']) {
        let rows = app.store.all(table, { deleted: true });
        if (table === 'invoices') rows = originalsFirst(rows).reverse();
        for (const row of rows) await app.store.remove(table, row.id);
      }
    } catch {
      go.disabled = false;
      box.setError(t('danger.failed'));
      return;
    }
    await removeFiles(files);
    for (const key of ['company', 'settings', 'draft:invoice']) await app.mn.kv.delete(key);
    window.mnui.sheet.close();
    window.mnui.toast(t('danger.deleted'));
    window.location.reload();
  });
  window.mnui.sheet.open(
    h(
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
        h('h2', {}, t('danger.title')),
        h('span'),
      ),
      h(
        'div',
        { class: 'mn-sheet-body' },
        h('p', {}, t('danger.text')),
        h('p', { class: 'mn-note' }, t('danger.legal')),
        box,
        go,
      ),
    ),
    { modal: true },
  );
}

// ---------- view ----------
export function renderSettings(main) {
  const c = app.company;
  const ready = companyReady();
  const card = (title, ...content) =>
    h('section', { class: 'mn-card setcard' }, h('h2', {}, title), ...content);
  const switchRow = (label, checked, onChange, hint) => {
    const el = h('input', { type: 'checkbox', checked, onchange: () => onChange(el.checked) });
    return h(
      'div',
      {},
      h('label', { class: 'checkline' }, el, h('span', {}, label)),
      hint ? h('p', { class: 'mn-hint' }, hint) : null,
    );
  };
  const pushHint = h('p', { class: 'mn-hint', 'aria-live': 'polite' });
  void app.mn.push
    .status()
    .then((status) => {
      if (status === 'off') {
        pushHint.textContent = '';
        pushHint.append(
          t('push.off'),
          ' ',
          h(
            'a',
            { href: app.mn.push.settingsUrl(), target: '_blank', rel: 'noopener noreferrer' },
            t('push.turnOn'),
          ),
        );
      } else if (status === 'unsupported') pushHint.textContent = t('push.unsupported');
    })
    .catch(() => undefined);
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Intl.DateTimeFormat(locale(), { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, i, 1)),
    ),
  }));
  const fiscal = h(
    'select',
    {
      onchange: async () => {
        await saveSettings({ fiscalStart: Number(fiscal.value) });
        window.mnui.toast(t('settings.saved'));
      },
    },
    months.map((m) =>
      h(
        'option',
        { value: String(m.value), selected: m.value === (app.settings.fiscalStart ?? 1) },
        m.label,
      ),
    ),
  );
  const backupInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'mn-sr-only',
    id: 'backup-input',
  });
  backupInput.addEventListener('change', async () => {
    const file = backupInput.files?.[0];
    if (file) await importBackup(file);
    backupInput.value = '';
  });

  main.append(
    card(
      t('settings.company'),
      ready
        ? h(
            'dl',
            { class: 'mn-facts' },
            h('div', {}, h('dt', {}, t('company.name')), h('dd', {}, c.name)),
            h(
              'div',
              {},
              h('dt', {}, t('customer.address')),
              h('dd', {}, `${c.street}, ${c.zip} ${c.city}`),
            ),
            h(
              'div',
              {},
              h('dt', {}, c.country === 'AT' ? t('company.uid') : t('company.vatId')),
              h('dd', {}, c.vat_id || c.tax_number || t('settings.missing')),
            ),
            h(
              'div',
              {},
              h('dt', {}, 'IBAN'),
              h('dd', {}, c.iban ? maskIban(c.iban) : t('settings.missing')),
            ),
            h(
              'div',
              {},
              h('dt', {}, t('settings.taxRule')),
              h('dd', {}, c.small_business ? t('taxMode.small') : t('taxMode.standard')),
            ),
          )
        : h('p', {}, t('company.missing')),
      h(
        'button',
        { class: 'mn-btn mn-btn--primary', type: 'button', onclick: () => openCompanyEditor() },
        ready ? t('settings.editCompany') : t('company.fill'),
      ),
    ),
    card(
      t('settings.reminders'),
      switchRow(
        t('settings.remindersBell'),
        Boolean(app.settings.reminders),
        async (on) => {
          await saveSettings({ reminders: on });
          window.mnui.toast(t('settings.saved'));
        },
        t('settings.remindersBellHint'),
      ),
      switchRow(
        t('settings.remindersPush'),
        Boolean(app.settings.push),
        async (on) => {
          await setPush(on);
          window.mnui.toast(t('settings.saved'));
        },
        t('settings.remindersPushHint'),
      ),
      pushHint,
    ),
    card(
      t('settings.view'),
      h('label', { class: 'mn-field' }, t('settings.fiscalStart'), fiscal),
      h('p', { class: 'mn-hint' }, t('settings.fiscalHint')),
      switchRow(t('common.hideAmounts'), Boolean(app.settings.hideAmounts), async (on) => {
        await saveSettings({ hideAmounts: on });
        app.render();
      }),
    ),
    card(
      t('backup.title'),
      h('p', {}, t('backup.text')),
      h(
        'p',
        { class: 'mn-note' },
        app.settings.lastBackup
          ? t('backup.last', { date: date(app.settings.lastBackup.slice(0, 10)) })
          : t('backup.never'),
      ),
      h(
        'div',
        { class: 'detail-actions' },
        h('button', { class: 'mn-btn', type: 'button', onclick: exportBackup }, t('backup.export')),
        h('label', { class: 'mn-btn', for: 'backup-input' }, t('backup.import')),
        backupInput,
      ),
      h('h3', {}, t('csvImport.heading')),
      h(
        'div',
        { class: 'detail-actions' },
        h(
          'button',
          { class: 'mn-btn', type: 'button', onclick: () => openCsvImport('customers') },
          t('csvImport.customers'),
        ),
        h(
          'button',
          { class: 'mn-btn', type: 'button', onclick: () => openCsvImport('items') },
          t('csvImport.items'),
        ),
      ),
    ),
    card(
      t('settings.more'),
      h(
        'div',
        { class: 'detail-actions' },
        h(
          'button',
          { class: 'mn-btn', type: 'button', onclick: openTrash },
          t('trash.title'),
          app.store.trash().length ? ` (${app.store.trash().length})` : '',
        ),
        hasSamples()
          ? h(
              'button',
              {
                class: 'mn-btn',
                type: 'button',
                onclick: async () => {
                  await removeSampleData();
                  app.render();
                },
              },
              t('sample.remove'),
            )
          : h(
              'button',
              {
                class: 'mn-btn',
                type: 'button',
                onclick: async () => {
                  await addSampleData();
                  app.render();
                },
              },
              t('sample.add'),
            ),
        h(
          'button',
          {
            class: 'mn-btn',
            type: 'button',
            onclick: async () => {
              await resetHints();
              window.mnui.toast(t('settings.hintsReset'));
            },
          },
          t('settings.resetHints'),
        ),
        h('button', { class: 'mn-btn', type: 'button', onclick: openShortcuts }, t('keys.title')),
      ),
    ),
    card(
      t('settings.data'),
      h('p', {}, t('settings.dataText')),
      h(
        'div',
        { class: 'detail-actions' },
        h(
          'button',
          { class: 'mn-btn', type: 'button', onclick: exportBackup },
          t('settings.exportAll'),
        ),
        h(
          'button',
          { class: 'mn-btn mn-btn--danger', type: 'button', onclick: openDeleteAll },
          t('danger.deleteAll'),
        ),
      ),
    ),
  );
  return { subtitle: ready ? c.name : t('company.missingShort') };
}
