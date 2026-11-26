// Editor sheets: invoice (four steps), customer, product/service (Baustein) and the company profile.
import { issue, issuesOf, openPdf } from './actions.js';
import { app, companyReady, DEFAULT_COMPANY, saveCompany } from './ctx.js';
import { field, h, icon, locale, money, t } from './dom.js';
import {
  ACCEPT,
  acceptable,
  blankWindow,
  blobUrl,
  openStored,
  removeFiles,
  uploadAttachment,
  uploadLogo,
} from './files.js';
import {
  amountField,
  busy,
  editorSheet,
  input,
  markdownField,
  select,
  showErrors,
  steps,
} from './forms.js';
import { addDays, emptyLine, nextNumber, today, validNumberFormat, withTotals } from './invoice.js';
import { LAYOUTS } from './invoice-pdf.js';
import {
  formatQuantity,
  formatRate,
  lineNet,
  parseQuantity,
  parseRate,
  totals,
  validIban,
} from './money.js';
import { COUNTRIES, chargesNoTax, plausibleVatId, ratesFor, TAX_MODES } from './rules.js';

// Countries a customer can be in (a short list; the name comes from the browser in each language).
export const CUSTOMER_COUNTRIES = [
  'DE',
  'AT',
  'CH',
  'LI',
  'IT',
  'FR',
  'NL',
  'BE',
  'LU',
  'PL',
  'CZ',
  'SK',
  'HU',
  'SI',
  'HR',
  'DK',
  'SE',
  'ES',
  'PT',
  'IE',
  'GB',
  'US',
];
const regionNames = () => new Intl.DisplayNames([locale()], { type: 'region' });
const countryOptions = (list) => {
  const names = regionNames();
  return list.map((code) => ({ value: code, label: names.of(code) ?? code }));
};
const rateOptions = (country, current) => {
  const rates = [...ratesFor(country)];
  if (current !== undefined && !rates.includes(current)) rates.push(current);
  return rates.map((bp) => ({ value: bp, label: formatRate(bp, locale()) }));
};

// ---------- invoice ----------
/**
 * Opens the invoice editor for a draft (`id`), a copy of an invoice (`copyOf`) or a new one.
 * Issued invoices are never edited.
 */
export function openInvoiceEditor({ id = null, copyOf = null, customerId = null } = {}) {
  const store = app.store;
  const company = app.company;
  const country = company.country === 'AT' ? 'AT' : 'DE';
  const existing = id ? store.get('invoices', id) : null;
  if (existing && existing.status !== 'draft') return;
  const source = copyOf ? store.get('invoices', copyOf) : existing;
  const day = today();
  const base = {
    id: existing?.id ?? store.newId(),
    kind: 'invoice',
    status: 'draft',
    customer_id: source?.customer_id ?? customerId,
    customer: {},
    lines: source
      ? source.lines.map((l) => ({ ...l, id: store.newId(), price_cents: Math.abs(l.price_cents) }))
      : [],
    tax_mode: source?.tax_mode ?? (company.small_business ? 'small' : 'standard'),
    lang: source?.lang ?? company.lang ?? 'de',
    layout: source?.layout ?? company.layout ?? 'din',
    issue_date: existing?.issue_date ?? day,
    service_date: existing?.service_date ?? day,
    service_end: existing?.service_end ?? null,
    due_date: existing?.due_date ?? null,
    reference: source?.reference ?? null,
    intro: source?.intro ?? (company.intro || null),
    closing: source?.closing ?? (company.closing || null),
    attachments: existing?.attachments ?? [],
    is_sample: existing?.is_sample ?? false,
  };
  const customerOf = (cid) => (cid ? store.get('customers', cid) : null);
  const days = () => customerOf(base.customer_id)?.payment_days ?? company.payment_days ?? 14;
  if (!base.due_date) base.due_date = addDays(base.issue_date, days());
  if (!base.lines.length) base.lines.push(emptyLine(store.newId(), ratesFor(country)[0]));

  let draft = structuredClone(base);
  const initial = JSON.stringify(draft);
  const uploaded = [];
  let step = 0;
  let saved = false;
  const labels = [
    t('editor.stepCustomer'),
    t('editor.stepLines'),
    t('editor.stepDetails'),
    t('editor.stepCheck'),
  ];

  const sheet = editorSheet({
    title: existing ? t('editor.editInvoice') : t('editor.newInvoice'),
    isDirty: () => !saved && JSON.stringify(draft) !== initial,
    draftKey: 'draft:invoice',
    getDraft: () => draft,
    onClosed: () => {
      // Uploads of an editor that was left without saving go again.
      if (!saved) void removeFiles(uploaded.flatMap((f) => [f.path, f.thumb]));
    },
    build: () => undefined,
  });
  const { body, foot } = sheet;

  // A stored draft of the form from a closed session: offer it once.
  void app.mn.kv.get('draft:invoice').then((stored) => {
    if (!stored || stored.id === draft.id || existing || copyOf) return;
    const banner = h(
      'div',
      { class: 'mn-banner', role: 'status' },
      h('span', {}, t('form.draftRestored')),
      ' ',
      h(
        'button',
        {
          class: 'mn-btn mn-btn--ghost',
          type: 'button',
          onclick: async () => {
            await app.mn.kv.delete('draft:invoice');
            draft = structuredClone(base);
            banner.remove();
            draw();
          },
        },
        t('form.discard'),
      ),
    );
    draft = { ...base, ...stored, id: base.id, status: 'draft' };
    draw();
    body.prepend(banner);
  });

  // ----- step 1: customer -----
  let newCustomer = null;
  function drawCustomer(box) {
    const customers = store
      .all('customers')
      .sort((a, b) => new Intl.Collator(locale()).compare(a.name, b.name));
    const mode = newCustomer || !customers.length ? 'new' : 'existing';
    box.append(
      h(
        'div',
        { class: 'mn-seg', role: 'group', 'aria-label': t('editor.customerMode') },
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(mode === 'existing'),
            disabled: !customers.length,
            onclick: () => {
              newCustomer = null;
              draw();
            },
          },
          t('editor.existingCustomer'),
        ),
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(mode === 'new'),
            onclick: () => {
              newCustomer ??= {
                name: '',
                email: '',
                street: '',
                zip: '',
                city: '',
                country,
                vat_id: '',
              };
              draw();
            },
          },
          t('editor.newCustomer'),
        ),
      ),
    );
    if (mode === 'existing') {
      const sel = select(
        [
          { value: '', label: t('editor.pickCustomer') },
          ...customers.map((c) => ({
            value: c.id,
            label: [c.name, c.city].filter(Boolean).join(', '),
          })),
        ],
        draft.customer_id ?? '',
        {
          onchange: () => {
            draft.customer_id = sel.value || null;
            const pd = customerOf(draft.customer_id)?.payment_days;
            if (pd !== null && pd !== undefined) draft.due_date = addDays(draft.issue_date, pd);
            draw();
          },
        },
      );
      const box1 = field(t('editor.customer'), sel, { required: true });
      box1.dataset.check = 'customer';
      box.append(box1);
      const c = customerOf(draft.customer_id);
      if (c)
        box.append(
          h(
            'dl',
            { class: 'mn-facts' },
            h(
              'div',
              {},
              h('dt', {}, t('customer.address')),
              h(
                'dd',
                {},
                [c.street, `${c.zip ?? ''} ${c.city ?? ''}`.trim()].filter(Boolean).join(', ') ||
                  t('customer.noAddress'),
              ),
            ),
            c.vat_id ? h('div', {}, h('dt', {}, t('customer.vatId')), h('dd', {}, c.vat_id)) : null,
          ),
        );
    } else {
      newCustomer ??= { name: '', email: '', street: '', zip: '', city: '', country, vat_id: '' };
      const nc = newCustomer;
      const bind = (key, attrs = {}) => {
        const el = input({ value: nc[key] ?? '', ...attrs });
        el.addEventListener('input', () => {
          nc[key] = el.value;
        });
        return el;
      };
      const name = field(t('customer.name'), bind('name', { autocomplete: 'organization' }), {
        required: true,
      });
      name.dataset.check = 'newName';
      const countrySel = select(countryOptions(CUSTOMER_COUNTRIES), nc.country, {
        onchange: () => {
          nc.country = countrySel.value;
        },
      });
      box.append(
        h(
          'div',
          { class: 'mn-group' },
          name,
          field(t('customer.email'), bind('email', { type: 'email', autocomplete: 'email' })),
          field(t('customer.street'), bind('street', { autocomplete: 'street-address' })),
          h(
            'div',
            { class: 'mn-grid-2' },
            field(t('customer.zip'), bind('zip', { autocomplete: 'postal-code' })),
            field(t('customer.city'), bind('city', { autocomplete: 'address-level2' })),
          ),
          h(
            'div',
            { class: 'mn-grid-2' },
            field(t('customer.country'), countrySel),
            field(t('customer.vatId'), bind('vat_id')),
          ),
          h('p', { class: 'mn-hint' }, t('editor.newCustomerHint')),
        ),
      );
    }
    const ref = input({ value: draft.reference ?? '', maxlength: 120 });
    ref.addEventListener('input', () => {
      draft.reference = ref.value;
    });
    box.append(field(t('editor.reference'), ref, { hint: t('editor.referenceHint') }));
  }

  // ----- step 2: lines -----
  function drawLines(box) {
    const noTax = chargesNoTax(draft.tax_mode);
    const sumBox = h('div', { class: 'totals', 'aria-live': 'polite' });
    const drawSum = () => {
      const sum = totals(draft.lines, { noTax });
      sumBox.textContent = '';
      sumBox.append(
        h(
          'dl',
          { class: 'mn-facts' },
          h('div', {}, h('dt', {}, t('totals.net')), h('dd', { class: 'mn-num' }, money(sum.net))),
          ...sum.rates
            .filter(() => !noTax)
            .map((r) =>
              h(
                'div',
                {},
                h('dt', {}, t('totals.tax', { rate: formatRate(r.rate, locale()) })),
                h('dd', { class: 'mn-num' }, money(r.tax)),
              ),
            ),
          h(
            'div',
            { class: 'grand' },
            h('dt', {}, noTax ? t('totals.totalNoTax') : t('totals.gross')),
            h('dd', { class: 'mn-num' }, money(sum.gross)),
          ),
        ),
      );
    };
    draft.lines.forEach((line, index) => {
      const titleEl = input({ value: line.title, maxlength: 200 });
      const desc = h('textarea', { rows: 2, maxlength: 2000 }, line.description ?? '');
      const qty = input({ inputmode: 'decimal', value: formatQuantity(line.qty_milli, locale()) });
      const unit = input({ value: line.unit ?? '', maxlength: 20, list: 'units' });
      const price = amountField(t('line.price'), line.price_cents, { required: true });
      const rate = select(rateOptions(country, line.tax_bp), line.tax_bp, { disabled: noTax });
      const discount = input({
        inputmode: 'decimal',
        value: line.discount_bp ? formatQuantity(line.discount_bp * 10, locale()) : '',
      });
      const lineTotal = h('span', { class: 'mn-num linetotal' });
      const qtyBox = field(t('line.qty'), qty, { required: true });
      const titleBox = field(t('line.title'), titleEl, { required: true });
      const discountBox = field(t('line.discount'), discount);
      const refresh = () => {
        lineTotal.textContent = t('line.total', { amount: money(lineNet(line)) });
        drawSum();
      };
      titleEl.addEventListener('input', () => {
        line.title = titleEl.value;
      });
      titleEl.addEventListener('blur', () =>
        titleBox.setError(titleEl.value.trim() ? null : t('form.requiredField')),
      );
      desc.addEventListener('input', () => {
        line.description = desc.value;
      });
      unit.addEventListener('input', () => {
        line.unit = unit.value;
      });
      qty.addEventListener('input', () => {
        const v = parseQuantity(qty.value);
        if (v !== null) line.qty_milli = v;
        refresh();
      });
      qty.addEventListener('blur', () =>
        qtyBox.setError(parseQuantity(qty.value) > 0 ? null : t('line.qtyError')),
      );
      price.input.addEventListener('input', () => {
        const v = price.read();
        if (v !== null) line.price_cents = v;
        refresh();
      });
      price.input.addEventListener('blur', () =>
        price.setError(price.read() === null ? t('form.amountError') : null),
      );
      rate.addEventListener('change', () => {
        line.tax_bp = Number(rate.value);
        refresh();
      });
      discount.addEventListener('input', () => {
        const v = discount.value.trim() ? parseRate(discount.value) : 0;
        if (v !== null && v <= 10000) line.discount_bp = v;
        refresh();
      });
      discount.addEventListener('blur', () => {
        const v = discount.value.trim() ? parseRate(discount.value) : 0;
        discountBox.setError(v === null || v > 10000 ? t('line.discountError') : null);
      });
      const move = (delta) => {
        const to = index + delta;
        if (to < 0 || to >= draft.lines.length) return;
        [draft.lines[index], draft.lines[to]] = [draft.lines[to], draft.lines[index]];
        draw();
        body.querySelectorAll('.lineedit')[to]?.querySelector('input')?.focus();
      };
      const lineName = line.title || t('line.number', { n: index + 1 });
      box.append(
        h(
          'fieldset',
          { class: 'mn-group lineedit', dataset: { line: String(index) } },
          h('legend', {}, t('line.number', { n: index + 1 })),
          titleBox,
          field(t('line.description'), desc),
          h('div', { class: 'mn-grid-2' }, qtyBox, field(t('line.unit'), unit)),
          h(
            'div',
            { class: 'mn-grid-2' },
            price,
            field(t('line.rate'), rate, { hint: noTax ? t('line.noTaxHint') : null }),
          ),
          h(
            'details',
            { class: 'mn-more' },
            h('summary', {}, t('line.more')),
            h('div', {}, discountBox),
          ),
          h(
            'div',
            { class: 'lineactions' },
            lineTotal,
            h('span', { class: 'mn-grow' }),
            h(
              'button',
              {
                class: 'mn-icon-btn',
                type: 'button',
                'aria-label': t('line.up', { name: lineName }),
                disabled: index === 0,
                onclick: () => move(-1),
              },
              icon('up'),
            ),
            h(
              'button',
              {
                class: 'mn-icon-btn',
                type: 'button',
                'aria-label': t('line.down', { name: lineName }),
                disabled: index === draft.lines.length - 1,
                onclick: () => move(1),
              },
              icon('down'),
            ),
            h(
              'button',
              {
                class: 'mn-icon-btn',
                type: 'button',
                'aria-label': t('line.remove', { name: lineName }),
                onclick: () => {
                  draft.lines.splice(index, 1);
                  draw();
                },
              },
              icon('trash'),
            ),
          ),
        ),
      );
      lineTotal.textContent = t('line.total', { amount: money(lineNet(line)) });
    });
    box.append(
      h(
        'datalist',
        { id: 'units' },
        ['units.hour', 'units.piece', 'units.day', 'units.flat', 'units.km', 'units.month'].map(
          (k) => h('option', { value: t(k) }),
        ),
      ),
    );
    const items = app.store
      .all('items')
      .sort((a, b) => new Intl.Collator(locale()).compare(a.title, b.title));
    const picker = select(
      [
        { value: '', label: t('editor.pickItem') },
        ...items.map((i) => ({ value: i.id, label: `${i.title} · ${money(i.price_cents)}` })),
      ],
      '',
      {
        'aria-label': t('editor.insertItem'),
        onchange: () => {
          const item = app.store.get('items', picker.value);
          if (!item) return;
          draft.lines = draft.lines.filter((l) => l.title || l.price_cents);
          draft.lines.push({
            id: store.newId(),
            item_id: item.id,
            title: item.title,
            description: item.description ?? '',
            unit: item.unit ?? '',
            qty_milli: 1000,
            price_cents: item.price_cents,
            tax_bp: item.tax_bp,
            discount_bp: 0,
          });
          draw();
        },
      },
    );
    box.append(
      h(
        'div',
        { class: 'lineadd' },
        items.length
          ? h('label', { class: 'mn-field' }, t('editor.insertItem'), picker)
          : h('p', { class: 'mn-note' }, t('editor.noItems')),
        h(
          'button',
          {
            class: 'mn-btn',
            type: 'button',
            onclick: () => {
              draft.lines.push(emptyLine(store.newId(), ratesFor(country)[0]));
              draw();
              body
                .querySelectorAll('.lineedit')
                [draft.lines.length - 1]?.querySelector('input')
                ?.focus();
            },
          },
          icon('plus'),
          t('editor.addLine'),
        ),
      ),
    );
    box.append(sumBox);
    drawSum();
  }

  // ----- step 3: details -----
  function drawDetails(box) {
    const issueDate = input({ type: 'date', value: draft.issue_date ?? '' });
    const serviceDate = input({ type: 'date', value: draft.service_date ?? '' });
    const serviceEnd = input({ type: 'date', value: draft.service_end ?? '' });
    const dueDate = input({ type: 'date', value: draft.due_date ?? '' });
    issueDate.addEventListener('change', () => {
      const before = draft.issue_date;
      draft.issue_date = issueDate.value || null;
      if (draft.service_date === before) {
        draft.service_date = draft.issue_date;
        serviceDate.value = draft.issue_date ?? '';
      }
    });
    serviceDate.addEventListener('change', () => {
      draft.service_date = serviceDate.value || null;
    });
    serviceEnd.addEventListener('change', () => {
      draft.service_end = serviceEnd.value || null;
    });
    dueDate.addEventListener('change', () => {
      draft.due_date = dueDate.value || null;
    });
    const quick = h(
      'div',
      { class: 'mn-chips', role: 'group', 'aria-label': t('editor.terms') },
      [0, 7, 14, 30].map((n) =>
        h(
          'button',
          {
            class: 'mn-filter',
            type: 'button',
            'aria-pressed': String(
              draft.issue_date && draft.due_date === addDays(draft.issue_date, n),
            ),
            onclick: () => {
              draft.due_date = addDays(draft.issue_date ?? today(), n);
              draw();
            },
          },
          n === 0 ? t('editor.termsNow') : t('editor.termsDays', { n }),
        ),
      ),
    );
    const mode = select(
      TAX_MODES.map((m) => ({ value: m, label: t(`taxMode.${m}`) })),
      draft.tax_mode,
      {
        onchange: () => {
          draft.tax_mode = mode.value;
          draw();
        },
      },
    );
    const lang = select(
      [
        { value: 'de', label: t('lang.de') },
        { value: 'en', label: t('lang.en') },
      ],
      draft.lang,
      {
        onchange: () => {
          draft.lang = lang.value;
        },
      },
    );
    const layout = h(
      'div',
      { class: 'mn-seg', role: 'group', 'aria-label': t('editor.layout') },
      LAYOUTS.map((l) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(draft.layout === l),
            onclick: () => {
              draft.layout = l;
              draw();
            },
          },
          t(`layout.${l}`),
        ),
      ),
    );
    const intro = markdownField(t('editor.intro'), draft.intro, {
      rows: 3,
      hint: t('editor.introHint'),
    });
    intro.input.addEventListener('input', () => {
      draft.intro = intro.read();
    });
    const closing = markdownField(t('editor.closing'), draft.closing, {
      rows: 3,
      hint: t('editor.closingHint'),
    });
    closing.input.addEventListener('input', () => {
      draft.closing = closing.read();
    });
    const issueBox = field(t('editor.issueDate'), issueDate, { required: true });
    issueBox.dataset.check = 'issueDate';
    const serviceBox = field(t('editor.serviceDate'), serviceDate, { required: true });
    serviceBox.dataset.check = 'serviceDate';
    box.append(
      h(
        'fieldset',
        {},
        h('legend', {}, t('editor.dates')),
        h('div', { class: 'mn-grid-2' }, issueBox, field(t('editor.dueDate'), dueDate)),
        quick,
        h(
          'div',
          { class: 'mn-grid-2' },
          serviceBox,
          field(t('editor.serviceEnd'), serviceEnd, { hint: t('editor.serviceEndHint') }),
        ),
      ),
      h(
        'fieldset',
        {},
        h('legend', {}, t('editor.taxAndLook')),
        field(t('editor.taxMode'), mode, { hint: t(`taxModeHint.${draft.tax_mode}`) }),
        h('div', { class: 'mn-field' }, t('editor.layout'), layout),
        h('p', { class: 'mn-hint' }, t(`layoutHint.${draft.layout}`)),
        field(t('editor.lang'), lang),
      ),
      h('fieldset', {}, h('legend', {}, t('editor.texts')), intro, closing),
      attachmentsBlock(),
    );
  }

  function attachmentsBlock() {
    const list = h('div', { class: 'attachments' });
    const drawList = () => {
      list.textContent = '';
      for (const file of draft.attachments) {
        const thumb = h(
          'span',
          { class: 'mn-thumb', 'aria-hidden': 'true' },
          file.thumb ? '' : 'PDF',
        );
        if (file.thumb)
          blobUrl(file.thumb)
            .then((url) => thumb.append(h('img', { src: url, alt: '' })))
            .catch(() => undefined);
        list.append(
          h(
            'div',
            { class: 'mn-row mn-row--text' },
            thumb,
            h(
              'span',
              {},
              h(
                'button',
                { class: 'mn-link', type: 'button', onclick: () => openStored(file.path) },
                file.name,
              ),
            ),
            h(
              'span',
              { class: 'mn-row-side' },
              h(
                'button',
                {
                  class: 'mn-icon-btn',
                  type: 'button',
                  'aria-label': t('attachments.remove', { name: file.name }),
                  onclick: () => {
                    draft.attachments = draft.attachments.filter((f) => f.path !== file.path);
                    drawList();
                  },
                },
                icon('trash'),
              ),
            ),
          ),
        );
      }
    };
    drawList();
    const online = app.mn.offline.online();
    const picker = h('input', {
      type: 'file',
      accept: ACCEPT,
      multiple: true,
      class: 'mn-sr-only',
      id: 'attach-input',
    });
    const status = h(
      'p',
      { class: 'mn-hint', 'aria-live': 'polite' },
      online ? t('attachments.hint') : t('offline.notPossible'),
    );
    picker.addEventListener('change', async () => {
      for (const file of picker.files ?? []) {
        const problem = acceptable(file);
        if (problem) {
          status.textContent = t(`attachments.${problem}`, { name: file.name });
          continue;
        }
        if (draft.attachments.length >= 20) break;
        status.textContent = t('attachments.uploading', { name: file.name });
        try {
          const stored = await uploadAttachment(draft.id, file);
          uploaded.push(stored);
          draft.attachments.push(stored);
          status.textContent = t('attachments.added', { name: file.name });
        } catch {
          status.textContent = t('attachments.failed', { name: file.name });
        }
        drawList();
      }
      picker.value = '';
    });
    return h(
      'fieldset',
      {},
      h('legend', {}, t('attachments.title')),
      list,
      picker,
      h(
        'label',
        {
          class: `mn-btn${online ? '' : ' is-disabled'}`,
          for: 'attach-input',
          'aria-disabled': String(!online),
          title: online ? null : t('offline.notPossible'),
        },
        icon('paperclip'),
        t('attachments.add'),
      ),
      status,
    );
  }

  // ----- step 4: check -----
  function drawCheck(box) {
    const row = withTotals({
      ...draft,
      customer_id: newCustomer ? null : draft.customer_id,
      customer: newCustomer ? { ...newCustomer } : draft.customer,
    });
    const issues = issuesOf(row);
    const errors = issues.filter((i) => i.level === 'error');
    const warns = issues.filter((i) => i.level === 'warn');
    const noTax = chargesNoTax(row.tax_mode);
    const nextNo = nextNumber(
      company.number_format,
      row.issue_date ?? today(),
      store
        .all('invoices', { deleted: true })
        .map((i) => i.number)
        .filter(Boolean),
    );
    box.append(
      h(
        'dl',
        { class: 'mn-facts' },
        h(
          'div',
          {},
          h('dt', {}, t('editor.customer')),
          h(
            'dd',
            {},
            newCustomer?.name || customerOf(row.customer_id)?.name || t('invoices.noCustomer'),
          ),
        ),
        h('div', {}, h('dt', {}, t('editor.numberWillBe')), h('dd', { class: 'mn-num' }, nextNo)),
        h(
          'div',
          {},
          h('dt', {}, t('totals.net')),
          h('dd', { class: 'mn-num' }, money(row.net_cents)),
        ),
        noTax
          ? null
          : h(
              'div',
              {},
              h('dt', {}, t('totals.taxSum')),
              h('dd', { class: 'mn-num' }, money(row.tax_cents)),
            ),
        h(
          'div',
          { class: 'grand' },
          h('dt', {}, noTax ? t('totals.totalNoTax') : t('totals.gross')),
          h('dd', { class: 'mn-num' }, money(row.gross_cents)),
        ),
      ),
    );
    if (!companyReady())
      box.append(
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
    if (errors.length)
      box.append(
        h(
          'div',
          { class: 'mn-banner mn-banner--bad', role: 'alert' },
          h('strong', {}, t('check.errorsTitle', { n: errors.length })),
          h(
            'ul',
            {},
            errors.map((i) => h('li', {}, t(i.key, i.params))),
          ),
        ),
      );
    if (warns.length)
      box.append(
        h(
          'div',
          { class: 'mn-banner mn-banner--warn', role: 'note' },
          h('strong', {}, t('check.warnsTitle', { n: warns.length })),
          h(
            'ul',
            {},
            warns.map((i) => h('li', {}, t(i.key, i.params))),
          ),
        ),
      );
    if (!issues.length)
      box.append(
        h('div', { class: 'mn-banner mn-banner--ok', role: 'status' }, t('check.allGood')),
      );
    box.append(
      h('p', { class: 'mn-hint' }, t('editor.issueHint')),
      h(
        'button',
        {
          class: 'mn-btn',
          type: 'button',
          onclick: () => {
            const win = blankWindow();
            void openPdf(withTotals({ ...draft, customer: newCustomer ?? {} }), win);
          },
        },
        icon('file'),
        t('editor.previewPdf'),
      ),
    );
    return errors;
  }

  // ----- frame -----
  function draw() {
    body.textContent = '';
    foot.textContent = '';
    body.append(
      steps(labels, step, (i) => {
        step = i;
        draw();
      }),
    );
    const box = h('div', { class: 'mn-form stepbody' });
    body.append(box);
    if (step === 0) drawCustomer(box);
    if (step === 1) drawLines(box);
    if (step === 2) drawDetails(box);
    let errors = [];
    if (step === 3) errors = drawCheck(box);
    const back = h(
      'button',
      {
        class: 'mn-btn mn-btn--ghost',
        type: 'button',
        disabled: step === 0,
        onclick: () => {
          step -= 1;
          draw();
        },
      },
      t('common.back'),
    );
    const save = h(
      'button',
      {
        class: `mn-btn${step === 3 ? '' : ' mn-btn--primary'}`,
        type: 'button',
        onclick: () => saveDraft(save),
      },
      t('editor.saveDraft'),
    );
    foot.append(back, h('span', { class: 'mn-grow' }));
    if (step < 3)
      foot.append(
        h(
          'button',
          {
            class: 'mn-btn',
            type: 'button',
            onclick: () => {
              if (validStep(step)) {
                step += 1;
                draw();
              }
            },
          },
          t('common.next'),
        ),
        save,
      );
    else {
      const issueBtn = h(
        'button',
        {
          class: 'mn-btn mn-btn--primary',
          type: 'button',
          onclick: () => doIssue(issueBtn, errors),
        },
        t('editor.issue'),
      );
      foot.append(save, issueBtn);
    }
    body.scrollTop = 0;
  }

  /** Checks the fields of a step; marks the problems and returns false when one is wrong. */
  function validStep(i) {
    if (i === 0 && newCustomer) {
      const box = body.querySelector('[data-check=newName]');
      return showErrors([[box, newCustomer.name.trim() ? null : t('form.requiredField')]]);
    }
    if (i === 1) {
      const problems = [];
      body.querySelectorAll('.lineedit').forEach((fs, index) => {
        const line = draft.lines[index];
        const boxes = fs.querySelectorAll('.fieldbox');
        problems.push([boxes[0], line.title.trim() ? null : t('form.requiredField')]);
        problems.push([boxes[2], line.qty_milli > 0 ? null : t('line.qtyError')]);
      });
      return showErrors(problems);
    }
    if (i === 2) {
      const issueBox = body.querySelector('[data-check=issueDate]');
      const serviceBox = body.querySelector('[data-check=serviceDate]');
      return showErrors([
        [issueBox, draft.issue_date ? null : t('form.requiredField')],
        [serviceBox, draft.service_date ? null : t('form.requiredField')],
      ]);
    }
    return true;
  }

  async function storeCustomer() {
    if (!newCustomer?.name.trim()) return;
    const row = await store.save('customers', {
      id: store.newId(),
      ...newCustomer,
      name: newCustomer.name.trim(),
      country: newCustomer.country || country,
    });
    draft.customer_id = row.id;
    newCustomer = null;
  }

  async function persist() {
    await storeCustomer();
    draft.lines = draft.lines.filter((l) => l.title.trim() || l.price_cents);
    const row = await store.save('invoices', { ...draft, status: 'draft' });
    await store.log(row.id, existing ? 'edited' : 'created');
    await app.mn.kv.delete('draft:invoice');
    saved = true;
    return row;
  }

  async function saveDraft(button) {
    if (!validStep(step)) return;
    busy(button, true);
    try {
      await persist();
      sheet.close();
      window.mnui.toast(t('editor.draftSaved'));
      app.render();
    } catch {
      busy(button, false);
      window.mnui.toast(t('common.saveError'));
    }
  }

  async function doIssue(button, errors) {
    if (errors.length) {
      // Jump to the step the first problem belongs to.
      const key = errors[0].key;
      step = key.startsWith('check.customer')
        ? 0
        : key.startsWith('check.line') || key === 'check.noLines'
          ? 1
          : key.startsWith('check.seller')
            ? 3
            : 2;
      if (key.startsWith('check.seller')) {
        openCompanyEditor();
        return;
      }
      draw();
      return;
    }
    busy(button, true);
    try {
      const row = await persist();
      const issued = await issue(row);
      sheet.close();
      window.mnui.toast(t('editor.issued', { number: issued.number }));
      app.render();
    } catch {
      busy(button, false);
      window.mnui.toast(t('common.saveError'));
    }
  }

  draw();
}

// ---------- customer ----------
export function openCustomerEditor(id = null, { onSaved } = {}) {
  const store = app.store;
  const existing = id ? store.get('customers', id) : null;
  const country = app.company.country === 'AT' ? 'AT' : 'DE';
  const row = { id: existing?.id ?? store.newId(), country, ...existing };
  const initial = JSON.stringify(row);
  let saved = false;
  const values = { ...row };
  const sheet = editorSheet({
    title: existing ? t('customer.edit') : t('customer.new'),
    isDirty: () => !saved && JSON.stringify(values) !== initial,
    build: () => undefined,
  });
  const fields = {};
  const text = (key, label, attrs = {}, opts = {}) => {
    const el = input({ value: values[key] ?? '', ...attrs });
    el.addEventListener('input', () => {
      values[key] = el.value;
    });
    fields[key] = field(label, el, opts);
    return fields[key];
  };
  const countrySel = select(countryOptions(CUSTOMER_COUNTRIES), values.country ?? country, {
    onchange: () => {
      values.country = countrySel.value;
    },
  });
  const days = input({ inputmode: 'numeric', value: values.payment_days ?? '' });
  days.addEventListener('input', () => {
    values.payment_days = days.value;
  });
  fields.payment_days = field(t('customer.paymentDays'), days, {
    hint: t('customer.paymentDaysHint', { n: app.company.payment_days ?? 14 }),
  });
  const notes = markdownField(t('customer.notes'), values.notes, {
    rows: 5,
    max: 20000,
    hint: t('customer.notesHint'),
  });
  notes.input.addEventListener('input', () => {
    values.notes = notes.read();
  });
  const vat = text(
    'vat_id',
    t('customer.vatId'),
    { maxlength: 20 },
    { hint: t('customer.vatIdHint') },
  );
  vat.querySelector('input').addEventListener('blur', (e) => {
    const v = e.target.value.trim();
    vat.setError(v && !plausibleVatId(v) ? t('customer.vatIdError') : null);
  });
  const saveBtn = h(
    'button',
    { class: 'mn-btn mn-btn--primary', type: 'button' },
    t('common.save'),
  );
  sheet.body.append(
    h(
      'form',
      { class: 'mn-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
      h(
        'fieldset',
        {},
        h('legend', {}, t('customer.legend')),
        text(
          'name',
          t('customer.name'),
          { autocomplete: 'organization', maxlength: 200 },
          { required: true },
        ),
        text('contact', t('customer.contact'), { autocomplete: 'name', maxlength: 200 }),
        h(
          'div',
          { class: 'mn-grid-2' },
          text('email', t('customer.email'), { type: 'email', autocomplete: 'email' }),
          text('phone', t('customer.phone'), { type: 'tel', autocomplete: 'tel' }),
        ),
      ),
      h(
        'fieldset',
        {},
        h('legend', {}, t('customer.address')),
        text('street', t('customer.street'), { autocomplete: 'street-address' }),
        h(
          'div',
          { class: 'mn-grid-2' },
          text('zip', t('customer.zip'), { autocomplete: 'postal-code', maxlength: 20 }),
          text('city', t('customer.city'), { autocomplete: 'address-level2' }),
        ),
        field(t('customer.country'), countrySel),
      ),
      h(
        'fieldset',
        {},
        h('legend', {}, t('customer.business')),
        h(
          'div',
          { class: 'mn-grid-2' },
          vat,
          text('number', t('customer.number'), { maxlength: 40 }),
        ),
        fields.payment_days,
      ),
      notes,
    ),
  );
  const del = existing
    ? h(
        'button',
        {
          class: 'mn-btn mn-btn--danger',
          type: 'button',
          onclick: async () => {
            saved = true;
            await store.softDelete('customers', existing.id);
            sheet.close();
            window.mnui.toast(t('customer.deleted'), {
              action: {
                label: t('common.undo'),
                onClick: async () => {
                  await store.restore('customers', existing.id);
                  app.render();
                },
              },
            });
            app.render();
          },
        },
        t('common.delete'),
      )
    : null;
  sheet.foot.append(del ?? h('span'), h('span', { class: 'mn-grow' }), saveBtn);
  saveBtn.addEventListener('click', async () => {
    const email = (values.email ?? '').trim();
    const pd = String(values.payment_days ?? '').trim();
    const ok = showErrors([
      [fields.name, (values.name ?? '').trim() ? null : t('form.requiredField')],
      [
        fields.email,
        !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : t('form.emailError'),
      ],
      [
        fields.payment_days,
        !pd || (/^\d{1,3}$/.test(pd) && Number(pd) <= 365) ? null : t('customer.paymentDaysError'),
      ],
    ]);
    if (!ok) return;
    busy(saveBtn, true);
    try {
      const out = await store.save('customers', {
        ...values,
        name: values.name.trim(),
        email: email || null,
        vat_id: (values.vat_id ?? '').replace(/\s/g, '').toUpperCase() || null,
        payment_days: pd ? Number(pd) : null,
      });
      saved = true;
      sheet.close();
      window.mnui.toast(t('customer.saved'));
      onSaved?.(out);
      app.render();
    } catch {
      busy(saveBtn, false);
      window.mnui.toast(t('common.saveError'));
    }
  });
}

// ---------- item (Baustein) ----------
export function openItemEditor(id = null) {
  const store = app.store;
  const existing = id ? store.get('items', id) : null;
  const country = app.company.country === 'AT' ? 'AT' : 'DE';
  const values = {
    id: existing?.id ?? store.newId(),
    kind: 'service',
    tax_bp: ratesFor(country)[0],
    ...existing,
  };
  const initial = JSON.stringify(values);
  let saved = false;
  const sheet = editorSheet({
    title: existing ? t('items.edit') : t('items.new'),
    isDirty: () => !saved && JSON.stringify(values) !== initial,
    build: () => undefined,
  });
  const kind = h(
    'div',
    { class: 'mn-seg', role: 'group', 'aria-label': t('items.kindLabel') },
    ['service', 'product'].map((k) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(values.kind === k),
          onclick: (e) => {
            values.kind = k;
            for (const b of kind.children)
              b.setAttribute('aria-pressed', String(b === e.currentTarget));
          },
        },
        t(`items.kind.${k}`),
      ),
    ),
  );
  const title = input({ value: values.title ?? '', maxlength: 200 });
  title.addEventListener('input', () => {
    values.title = title.value;
  });
  const titleBox = field(t('items.title'), title, { required: true });
  const desc = h('textarea', { rows: 3, maxlength: 2000 }, values.description ?? '');
  desc.addEventListener('input', () => {
    values.description = desc.value;
  });
  const unit = input({ value: values.unit ?? '', maxlength: 20, list: 'item-units' });
  unit.addEventListener('input', () => {
    values.unit = unit.value;
  });
  const price = amountField(t('items.price'), existing?.price_cents ?? null, {
    required: true,
    hint: t('items.priceHint'),
  });
  price.input.addEventListener('input', () => {
    values.price_cents = price.read();
  });
  const rate = select(rateOptions(country, values.tax_bp), values.tax_bp, {
    onchange: () => {
      values.tax_bp = Number(rate.value);
    },
  });
  const number = input({ value: values.number ?? '', maxlength: 40 });
  number.addEventListener('input', () => {
    values.number = number.value;
  });
  sheet.body.append(
    h(
      'form',
      { class: 'mn-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
      h('div', { class: 'mn-field' }, t('items.kindLabel'), kind),
      titleBox,
      field(t('items.description'), desc, { hint: t('items.descriptionHint') }),
      h('div', { class: 'mn-grid-2' }, price, field(t('items.unit'), unit)),
      h(
        'div',
        { class: 'mn-grid-2' },
        field(t('items.rate'), rate),
        field(t('items.number'), number),
      ),
      h(
        'datalist',
        { id: 'item-units' },
        ['units.hour', 'units.piece', 'units.day', 'units.flat', 'units.km', 'units.month'].map(
          (k) => h('option', { value: t(k) }),
        ),
      ),
    ),
  );
  const saveBtn = h(
    'button',
    { class: 'mn-btn mn-btn--primary', type: 'button' },
    t('common.save'),
  );
  const del = existing
    ? h(
        'button',
        {
          class: 'mn-btn mn-btn--danger',
          type: 'button',
          onclick: async () => {
            saved = true;
            await store.softDelete('items', existing.id);
            sheet.close();
            window.mnui.toast(t('items.deleted'), {
              action: {
                label: t('common.undo'),
                onClick: async () => {
                  await store.restore('items', existing.id);
                  app.render();
                },
              },
            });
            app.render();
          },
        },
        t('common.delete'),
      )
    : null;
  sheet.foot.append(del ?? h('span'), h('span', { class: 'mn-grow' }), saveBtn);
  saveBtn.addEventListener('click', async () => {
    const cents = price.read();
    const ok = showErrors([
      [titleBox, (values.title ?? '').trim() ? null : t('form.requiredField')],
      [price, cents === null ? t('form.amountError') : null],
    ]);
    if (!ok) return;
    busy(saveBtn, true);
    try {
      await store.save('items', { ...values, title: values.title.trim(), price_cents: cents });
      saved = true;
      sheet.close();
      window.mnui.toast(t('items.saved'));
      app.render();
    } catch {
      busy(saveBtn, false);
      window.mnui.toast(t('common.saveError'));
    }
  });
}

// ---------- company profile ----------
export function openCompanyEditor() {
  const values = { ...DEFAULT_COMPANY, ...app.company };
  const initial = JSON.stringify(values);
  let saved = false;
  let step = 0;
  const labels = [
    t('company.stepCompany'),
    t('company.stepTax'),
    t('company.stepBank'),
    t('company.stepInvoice'),
  ];
  const sheet = editorSheet({
    title: t('company.title'),
    isDirty: () => !saved && JSON.stringify(values) !== initial,
    build: () => undefined,
  });
  const boxes = {};
  const text = (key, label, attrs = {}, opts = {}) => {
    const el = input({ value: values[key] ?? '', ...attrs });
    el.addEventListener('input', () => {
      values[key] = el.value;
    });
    boxes[key] = field(label, el, opts);
    return boxes[key];
  };
  const check = (key, label) => {
    const el = h('input', { type: 'checkbox', checked: Boolean(values[key]) });
    el.addEventListener('change', () => {
      values[key] = el.checked;
      draw();
    });
    return h('label', { class: 'checkline' }, el, h('span', {}, label));
  };
  function draw() {
    const { body, foot } = sheet;
    body.textContent = '';
    foot.textContent = '';
    body.append(
      steps(labels, step, (i) => {
        step = i;
        draw();
      }),
    );
    const form = h('div', { class: 'mn-form stepbody' });
    body.append(form);
    if (step === 0) {
      const countrySel = select(
        COUNTRIES.map((c) => ({ value: c, label: regionNames().of(c) ?? c })),
        values.country,
        {
          onchange: () => {
            values.country = countrySel.value;
            draw();
          },
        },
      );
      form.append(
        text(
          'name',
          t('company.name'),
          { autocomplete: 'organization', maxlength: 70 },
          { required: true, hint: t('company.nameHint') },
        ),
        text('owner', t('company.owner'), { autocomplete: 'name' }),
        text(
          'street',
          t('customer.street'),
          { autocomplete: 'street-address' },
          { required: true },
        ),
        h(
          'div',
          { class: 'mn-grid-2' },
          text('zip', t('customer.zip'), { autocomplete: 'postal-code' }, { required: true }),
          text('city', t('customer.city'), { autocomplete: 'address-level2' }, { required: true }),
        ),
        field(t('company.country'), countrySel, { hint: t('company.countryHint') }),
        h(
          'div',
          { class: 'mn-grid-2' },
          text('email', t('customer.email'), { type: 'email', autocomplete: 'email' }),
          text('phone', t('customer.phone'), { type: 'tel', autocomplete: 'tel' }),
        ),
        text('website', t('company.website'), { type: 'url', autocomplete: 'url' }),
        logoBlock(),
      );
    }
    if (step === 1) {
      const at = values.country === 'AT';
      form.append(
        check('small_business', at ? t('company.smallAT') : t('company.smallDE')),
        h('p', { class: 'mn-hint' }, at ? t('company.smallHintAT') : t('company.smallHintDE')),
        text(
          'vat_id',
          at ? t('company.uid') : t('company.vatId'),
          { maxlength: 20 },
          { hint: at ? t('company.uidHint') : t('company.vatIdHint') },
        ),
        at
          ? null
          : text(
              'tax_number',
              t('company.taxNumber'),
              { maxlength: 30 },
              { hint: t('company.taxNumberHint') },
            ),
        text(
          'register',
          at ? t('company.registerAT') : t('company.registerDE'),
          { maxlength: 120 },
          { hint: t('company.registerHint') },
        ),
      );
    }
    if (step === 2) {
      form.append(
        text('bank', t('company.bank'), { maxlength: 80 }),
        text('iban', 'IBAN', { maxlength: 42, autocomplete: 'off' }),
        text('bic', 'BIC', { maxlength: 11 }),
        check('qr', t('company.qr')),
        h('p', { class: 'mn-hint' }, t('company.qrHint')),
      );
    }
    if (step === 3) {
      const numbers = app.store
        .all('invoices', { deleted: true })
        .map((i) => i.number)
        .filter(Boolean);
      const preview = h('p', { class: 'mn-hint', 'aria-live': 'polite' });
      const showNext = () => {
        preview.textContent = validNumberFormat(values.number_format)
          ? t('company.nextNumber', { number: nextNumber(values.number_format, today(), numbers) })
          : t('company.numberFormatError', { counter: '{NNNN}' });
      };
      const nf = text(
        'number_format',
        t('company.numberFormat'),
        { maxlength: 40 },
        {
          hint: t('company.numberFormatHint', {
            year: '{YYYY}',
            short: '{YY}',
            month: '{MM}',
            counter: '{NNNN}',
          }),
        },
      );
      nf.querySelector('input').addEventListener('input', showNext);
      nf.append(preview);
      showNext();
      const days = text('payment_days', t('company.paymentDays'), { inputmode: 'numeric' });
      const layout = select(
        LAYOUTS.map((l) => ({ value: l, label: t(`layout.${l}`) })),
        values.layout,
        {
          onchange: () => {
            values.layout = layout.value;
          },
        },
      );
      const lang = select(
        [
          { value: 'de', label: t('lang.de') },
          { value: 'en', label: t('lang.en') },
        ],
        values.lang,
        {
          onchange: () => {
            values.lang = lang.value;
          },
        },
      );
      const intro = markdownField(t('editor.intro'), values.intro, { rows: 3 });
      intro.input.addEventListener('input', () => {
        values.intro = intro.read();
      });
      const closing = markdownField(t('editor.closing'), values.closing, { rows: 3 });
      closing.input.addEventListener('input', () => {
        values.closing = closing.read();
      });
      form.append(
        nf,
        days,
        h(
          'div',
          { class: 'mn-grid-2' },
          field(t('company.layout'), layout),
          field(t('company.lang'), lang),
        ),
        intro,
        closing,
      );
    }
    const back = h(
      'button',
      {
        class: 'mn-btn mn-btn--ghost',
        type: 'button',
        disabled: step === 0,
        onclick: () => {
          step -= 1;
          draw();
        },
      },
      t('common.back'),
    );
    const save = h(
      'button',
      { class: 'mn-btn mn-btn--primary', type: 'button', onclick: () => doSave(save) },
      t('common.save'),
    );
    foot.append(back, h('span', { class: 'mn-grow' }));
    if (step < 3)
      foot.append(
        h(
          'button',
          {
            class: 'mn-btn',
            type: 'button',
            onclick: () => {
              step += 1;
              draw();
            },
          },
          t('common.next'),
        ),
      );
    foot.append(save);
  }

  function logoBlock() {
    const online = app.mn.offline.online();
    const preview = h('span', { class: 'logo-preview', 'aria-hidden': 'true' });
    if (values.logo)
      blobUrl(values.logo)
        .then((url) => preview.append(h('img', { src: url, alt: '' })))
        .catch(() => undefined);
    const status = h(
      'p',
      { class: 'mn-hint', 'aria-live': 'polite' },
      online ? t('company.logoHint') : t('offline.notPossible'),
    );
    const picker = h('input', {
      type: 'file',
      accept: 'image/*',
      class: 'mn-sr-only',
      id: 'logo-input',
    });
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024 || !file.type.startsWith('image/')) {
        status.textContent = t('company.logoError');
        return;
      }
      status.textContent = t('attachments.uploading', { name: file.name });
      try {
        values.logo = await uploadLogo(file);
        status.textContent = t('company.logoAdded');
        draw();
      } catch {
        status.textContent = t('attachments.failed', { name: file.name });
      }
    });
    return h(
      'fieldset',
      {},
      h('legend', {}, t('company.logo')),
      h(
        'div',
        { class: 'logo-row' },
        preview,
        h(
          'label',
          {
            class: `mn-btn${online ? '' : ' is-disabled'}`,
            for: 'logo-input',
            'aria-disabled': String(!online),
          },
          values.logo ? t('company.logoChange') : t('company.logoAdd'),
        ),
        values.logo
          ? h(
              'button',
              {
                class: 'mn-btn mn-btn--ghost',
                type: 'button',
                onclick: () => {
                  values.logo = null;
                  draw();
                },
              },
              t('company.logoRemove'),
            )
          : null,
      ),
      picker,
      status,
    );
  }

  async function doSave(button) {
    const iban = (values.iban ?? '').replace(/\s/g, '').toUpperCase();
    const pd = String(values.payment_days ?? '').trim();
    const problems = [];
    for (const key of ['name', 'street', 'zip', 'city'])
      if (!(values[key] ?? '').trim())
        problems.push({ key, step: 0, message: t('form.requiredField') });
    if (iban && !validIban(iban))
      problems.push({ key: 'iban', step: 2, message: t('company.ibanError') });
    if (!validNumberFormat(values.number_format))
      problems.push({
        key: 'number_format',
        step: 3,
        message: t('company.numberFormatError', { counter: '{NNNN}' }),
      });
    if (!/^\d{1,3}$/.test(pd) || Number(pd) > 365)
      problems.push({ key: 'payment_days', step: 3, message: t('customer.paymentDaysError') });
    if (problems.length) {
      const first = Math.min(...problems.map((p) => p.step));
      if (first !== step) {
        step = first;
        draw();
      }
      showErrors(problems.filter((p) => p.step === step).map((p) => [boxes[p.key], p.message]));
      return;
    }
    busy(button, true);
    try {
      await saveCompany({
        ...values,
        name: values.name.trim(),
        iban: iban || '',
        bic: (values.bic ?? '').replace(/\s/g, '').toUpperCase(),
        vat_id: (values.vat_id ?? '').replace(/\s/g, '').toUpperCase(),
        payment_days: Number(pd),
      });
      saved = true;
      sheet.close();
      window.mnui.toast(t('company.saved'));
      app.render();
    } catch {
      busy(button, false);
      window.mnui.toast(t('common.saveError'));
    }
  }
  draw();
}
