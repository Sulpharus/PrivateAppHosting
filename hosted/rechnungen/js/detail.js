// Detail sheets: an invoice (status, payments, PDF, e-mail, cancellation, history, attachments)
// and a customer (facts, notes with checklists, their invoices and what they still owe).
import { addPayment, cancel, mailDraft, openPdf, removePayment, sendMail } from './actions.js';
import { app } from './ctx.js';
import { amount, date, field, h, icon, locale, money, statusChip, t } from './dom.js';
import { openCustomerEditor, openInvoiceEditor } from './editors.js';
import { blankWindow, blobUrl, openStored } from './files.js';
import { amountField, busy, input, showErrors } from './forms.js';
import { statusOf, today } from './invoice.js';
import { validEmail } from './mail.js';
import { mdToDom, toggleCheck } from './md.js';
import { formatQuantity, formatRate, lineNet, maskIban } from './money.js';
import { chargesNoTax } from './rules.js';
import { customerName, customerTotals, initials, invoiceRow, invoiceTitle } from './views.js';

function bar(title, right = null) {
  return h(
    'div',
    { class: 'mn-sheet-bar' },
    h(
      'button',
      { class: 'mn-btn mn-btn--ghost', type: 'button', 'data-mn-close': '' },
      t('common.close'),
    ),
    h('h2', {}, title),
    right ?? h('span'),
  );
}

const fact = (label, value) =>
  value ? h('div', {}, h('dt', {}, label), h('dd', {}, value)) : null;

// ---------- invoice ----------
export function openInvoiceDetail(id) {
  const inv = app.store.get('invoices', id);
  if (!inv) return;
  const payments = app.store.paymentsOf(id);
  const status = statusOf(inv, app.store.all('payments'));
  const online = app.mn.offline.online();
  const isDraft = inv.status === 'draft';
  const reopen = () => openInvoiceDetail(id);

  const actions = h('div', { class: 'detail-actions' });
  if (isDraft) {
    actions.append(
      h(
        'button',
        {
          class: 'mn-btn mn-btn--primary',
          type: 'button',
          onclick: () => openInvoiceEditor({ id }),
        },
        t('detail.editAndIssue'),
      ),
    );
  } else if (['open', 'partial', 'overdue'].includes(status.key)) {
    actions.append(
      h(
        'button',
        {
          class: 'mn-btn mn-btn--primary',
          type: 'button',
          onclick: () => openPaymentSheet(inv, status.open),
        },
        t('payments.add'),
      ),
    );
  }
  actions.append(
    h(
      'button',
      {
        class: 'mn-btn',
        type: 'button',
        onclick: () => {
          const win = blankWindow();
          void openPdf(inv, win);
        },
      },
      icon('file'),
      isDraft ? t('detail.previewPdf') : t('detail.pdf'),
    ),
  );
  if (!isDraft && inv.kind !== 'cancellation') {
    const mailBtn = h(
      'button',
      {
        class: 'mn-btn',
        type: 'button',
        disabled: !online,
        title: online ? null : t('offline.notPossible'),
        onclick: () => openSendSheet(inv, status.key === 'overdue' ? 'reminder' : 'invoice'),
      },
      icon('mail'),
      status.key === 'overdue' ? t('mail.sendReminder') : t('mail.send'),
    );
    actions.append(mailBtn);
  }
  actions.append(
    h(
      'button',
      { class: 'mn-btn', type: 'button', onclick: () => openInvoiceEditor({ copyOf: id }) },
      t('detail.duplicate'),
    ),
  );

  const lines = h(
    'div',
    { class: 'mn-list' },
    (inv.lines ?? []).map((l) =>
      h(
        'div',
        { class: 'mn-row mn-row--text' },
        h(
          'span',
          {},
          h('span', { class: 'mn-row-title' }, l.title),
          h(
            'span',
            { class: 'mn-row-sub' },
            [
              `${formatQuantity(l.qty_milli, locale())} ${l.unit ?? ''}`.trim(),
              `× ${money(l.price_cents)}`,
              chargesNoTax(inv.tax_mode) ? '' : formatRate(l.tax_bp, locale()),
              l.description,
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        ),
        h('span', { class: 'mn-row-side' }, h('b', {}, amount(lineNet(l)))),
      ),
    ),
  );

  const payList = payments.length
    ? h(
        'div',
        { class: 'mn-list' },
        payments.map((p) =>
          h(
            'div',
            { class: 'mn-row mn-row--text' },
            h(
              'span',
              {},
              h('span', { class: 'mn-row-title' }, date(p.paid_on)),
              p.note ? h('span', { class: 'mn-row-sub' }, p.note) : null,
            ),
            h(
              'span',
              { class: 'mn-row-side' },
              h('b', {}, amount(p.amount_cents)),
              h(
                'button',
                {
                  class: 'mn-link',
                  type: 'button',
                  'aria-label': t('payments.removeLabel', { date: date(p.paid_on) }),
                  onclick: async () => {
                    await removePayment(p);
                    window.mnui.toast(t('payments.removed'), {
                      action: {
                        label: t('common.undo'),
                        onClick: async () => {
                          await app.store.save('payments', p);
                          app.render();
                          reopen();
                        },
                      },
                    });
                    app.render();
                    reopen();
                  },
                },
                t('common.remove'),
              ),
            ),
          ),
        ),
      )
    : h('p', { class: 'mn-note' }, isDraft ? t('payments.draftNone') : t('payments.none'));

  const history = app.store.historyOf(id);
  const timeFmt = new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const historyBlock = h(
    'details',
    { class: 'mn-more' },
    h('summary', {}, t('history.title')),
    h(
      'div',
      {},
      history.length
        ? h(
            'ul',
            { class: 'history' },
            history.map((e) =>
              h(
                'li',
                {},
                h('span', { class: 'mn-muted' }, timeFmt.format(new Date(e.at))),
                ' ',
                t(`history.${e.changes.action ?? 'edited'}`, {
                  number: e.changes.number ?? '',
                  amount: e.changes.amount_cents ? money(e.changes.amount_cents) : '',
                  to: e.changes.to ?? '',
                }),
              ),
            ),
          )
        : h('p', { class: 'mn-note' }, t('history.none')),
    ),
  );

  const attachments = (inv.attachments ?? []).length
    ? h(
        'div',
        { class: 'attachments' },
        inv.attachments.map((file) => {
          const thumb = h(
            'span',
            { class: 'mn-thumb', 'aria-hidden': 'true' },
            file.thumb ? '' : 'PDF',
          );
          if (file.thumb)
            blobUrl(file.thumb)
              .then((url) => thumb.append(h('img', { src: url, alt: '' })))
              .catch(() => undefined);
          return h(
            'button',
            { class: 'mn-row', type: 'button', onclick: () => openStored(file.path) },
            thumb,
            h('span', {}, h('span', { class: 'mn-row-title' }, file.name)),
            h('span', { class: 'mn-row-side' }, t('attachments.open')),
          );
        }),
      )
    : null;

  // Cancellation (issued, not paid in full) or deletion (drafts), at the end.
  let danger = null;
  if (isDraft) {
    danger = h(
      'button',
      {
        class: 'mn-btn mn-btn--danger',
        type: 'button',
        onclick: async () => {
          await app.store.softDelete('invoices', id);
          window.mnui.sheet.close();
          window.mnui.toast(t('detail.draftDeleted'), {
            action: {
              label: t('common.undo'),
              onClick: async () => {
                await app.store.restore('invoices', id);
                app.render();
              },
            },
          });
          app.render();
        },
      },
      t('detail.deleteDraft'),
    );
  } else if (inv.kind === 'invoice' && inv.status === 'issued') {
    let armed = false;
    danger = h(
      'button',
      {
        class: 'mn-btn mn-btn--danger',
        type: 'button',
        onclick: async (e) => {
          if (!armed) {
            armed = true;
            e.currentTarget.textContent = t('detail.cancelConfirm');
            return;
          }
          busy(e.currentTarget, true);
          const storno = await cancel(inv);
          window.mnui.toast(t('detail.cancelled', { number: storno.number }));
          app.render();
          openInvoiceDetail(storno.id);
        },
      },
      t('detail.cancel'),
    );
  }

  const cancelledBy =
    inv.status === 'cancelled' ? app.store.all('invoices').find((x) => x.cancels_id === id) : null;
  const original = inv.cancels_id ? app.store.get('invoices', inv.cancels_id) : null;
  const sheet = h(
    'div',
    {},
    bar(invoiceTitle(inv)),
    h(
      'div',
      { class: 'mn-sheet-body' },
      h('h2', { class: 'mn-sheet-title' }, customerName(inv)),
      h(
        'p',
        {},
        statusChip(status),
        ' ',
        inv.is_sample ? h('span', { class: 'mn-chip mn-chip--plain' }, t('common.sample')) : null,
        inv.sent_at
          ? h(
              'span',
              { class: 'mn-chip mn-chip--plain' },
              t('detail.sentOn', { date: date(inv.sent_at.slice(0, 10)) }),
            )
          : null,
      ),
      h(
        'div',
        { class: 'mn-big amount mn-num' },
        money(status.key === 'partial' || status.key === 'overdue' ? status.open : inv.gross_cents),
      ),
      h(
        'p',
        { class: 'mn-note' },
        status.key === 'partial' || status.key === 'overdue'
          ? t('detail.openOf', { total: money(inv.gross_cents) })
          : chargesNoTax(inv.tax_mode)
            ? t(`taxMode.${inv.tax_mode}`)
            : t('detail.grossIncl', { tax: money(inv.tax_cents) }),
      ),
      actions,
      h(
        'dl',
        { class: 'mn-facts' },
        fact(t('detail.number'), inv.number),
        fact(t('editor.issueDate'), date(inv.issue_date)),
        fact(
          t('editor.serviceDate'),
          inv.service_end && inv.service_end !== inv.service_date
            ? `${date(inv.service_date)} – ${date(inv.service_end)}`
            : date(inv.service_date),
        ),
        fact(t('editor.dueDate'), inv.kind === 'cancellation' ? null : date(inv.due_date)),
        fact(t('totals.net'), money(inv.net_cents)),
        fact(t('editor.reference'), inv.reference),
        fact(t('detail.layout'), t(`layout.${inv.layout}`)),
        cancelledBy ? fact(t('detail.cancelledBy'), cancelledBy.number) : null,
        original ? fact(t('detail.cancels'), original.number) : null,
        !isDraft && inv.seller?.iban ? fact(t('detail.paidTo'), maskIban(inv.seller.iban)) : null,
        fact(
          t('detail.stored'),
          inv.pdf_path
            ? t('detail.storedYes')
            : isDraft || inv.is_sample
              ? null
              : t('detail.storedLater'),
        ),
      ),
      h('h3', {}, t('detail.lines')),
      lines,
      isDraft || inv.kind === 'cancellation' ? null : h('h3', {}, t('payments.title')),
      isDraft || inv.kind === 'cancellation' ? null : payList,
      attachments ? h('h3', {}, t('attachments.title')) : null,
      attachments,
      historyBlock,
      danger
        ? h(
            'div',
            { class: 'detail-danger' },
            danger,
            inv.kind === 'invoice' && !isDraft
              ? h('p', { class: 'mn-hint' }, t('detail.cancelHint'))
              : null,
          )
        : null,
    ),
  );
  window.mnui.sheet.open(sheet, { tall: true });
}

// ---------- payment ----------
function openPaymentSheet(inv, open) {
  const day = input({ type: 'date', value: today() });
  const amountBox = amountField(t('payments.amount'), open, { required: true });
  const note = input({ maxlength: 300 });
  const dayBox = field(t('payments.date'), day, { required: true });
  const save = h('button', { class: 'mn-btn mn-btn--primary', type: 'button' }, t('payments.save'));
  const sheet = h(
    'div',
    {},
    bar(t('payments.add')),
    h(
      'div',
      { class: 'mn-sheet-body' },
      h(
        'form',
        { class: 'mn-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
        h('p', {}, t('payments.openAmount', { amount: money(open) })),
        dayBox,
        amountBox,
        field(t('payments.note'), note, { hint: t('payments.noteHint') }),
      ),
    ),
    h(
      'div',
      { class: 'mn-sheet-foot' },
      h(
        'button',
        { class: 'mn-btn mn-btn--ghost', type: 'button', 'data-mn-close': '' },
        t('common.cancel'),
      ),
      h('span', { class: 'mn-grow' }),
      save,
    ),
  );
  save.addEventListener('click', async () => {
    const cents = amountBox.read();
    const ok = showErrors([
      [dayBox, day.value ? null : t('form.requiredField')],
      [amountBox, cents === null || cents === 0 ? t('form.amountError') : null],
    ]);
    if (!ok) return;
    busy(save, true);
    await addPayment(inv, {
      paid_on: day.value,
      amount_cents: cents,
      note: note.value.trim() || null,
    });
    window.mnui.toast(t('payments.saved'));
    app.render();
    openInvoiceDetail(inv.id);
  });
  window.mnui.sheet.open(sheet, { modal: true });
}

// ---------- e-mail ----------
async function openSendSheet(inv, kind) {
  const connected = await app.mn.google.connected().catch(() => false);
  if (!connected) {
    window.mnui.sheet.open(
      h(
        'div',
        {},
        bar(t('mail.title')),
        h(
          'div',
          { class: 'mn-sheet-body' },
          h(
            'div',
            { class: 'mn-empty' },
            h('div', { class: 'mn-empty-icon' }, icon('mail')),
            h('h3', {}, t('mail.connectTitle')),
            h('p', {}, t('mail.connectText')),
            h(
              'a',
              {
                class: 'mn-btn mn-btn--primary',
                href: app.mn.google.connectUrl(),
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              t('mail.connect'),
            ),
          ),
        ),
      ),
    );
    return;
  }
  const draft = await mailDraft(inv, kind);
  const customer = inv.customer_id ? app.store.get('customers', inv.customer_id) : null;
  const to = input({
    type: 'email',
    autocomplete: 'email',
    value: customer?.email ?? inv.customer?.email ?? '',
  });
  const subject = input({ value: draft.subject, maxlength: 200 });
  const text = h('textarea', { rows: 8, maxlength: 5000 }, draft.text);
  const withFiles = h('input', { type: 'checkbox' });
  const toBox = field(t('mail.to'), to, { required: true });
  const send = h(
    'button',
    { class: 'mn-btn mn-btn--primary', type: 'button' },
    kind === 'reminder' ? t('mail.sendReminderNow') : t('mail.sendNow'),
  );
  const error = h('div', { role: 'alert' });
  const sheet = h(
    'div',
    {},
    bar(kind === 'reminder' ? t('mail.reminderTitle') : t('mail.title')),
    h(
      'div',
      { class: 'mn-sheet-body' },
      h(
        'form',
        { class: 'mn-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
        h('p', { class: 'mn-note' }, t('mail.whatHappens')),
        toBox,
        field(t('mail.subject'), subject),
        field(t('mail.text'), text),
        h(
          'p',
          { class: 'mn-hint' },
          icon('paperclip'),
          ' ',
          t('mail.attachment', { name: `${inv.number}.pdf` }),
        ),
        (inv.attachments ?? []).length
          ? h(
              'label',
              { class: 'checkline' },
              withFiles,
              h('span', {}, t('mail.withAttachments', { n: inv.attachments.length })),
            )
          : null,
        error,
      ),
    ),
    h(
      'div',
      { class: 'mn-sheet-foot' },
      h(
        'button',
        { class: 'mn-btn mn-btn--ghost', type: 'button', 'data-mn-close': '' },
        t('common.cancel'),
      ),
      h('span', { class: 'mn-grow' }),
      send,
    ),
  );
  send.addEventListener('click', async () => {
    if (!showErrors([[toBox, validEmail(to.value) ? null : t('form.emailError')]])) return;
    busy(send, true);
    error.textContent = '';
    try {
      await sendMail(inv, {
        to: to.value.trim(),
        subject: subject.value,
        text: text.value,
        withAttachments: withFiles.checked,
        kind,
      });
      window.mnui.toast(t('mail.sent', { to: to.value.trim() }));
      app.render();
      openInvoiceDetail(inv.id);
    } catch (err) {
      busy(send, false);
      const code = err?.code;
      const message =
        code === 'google_not_connected' || code === 'google_scope_missing'
          ? t('mail.connectText')
          : t('mail.failed');
      error.append(
        h(
          'div',
          { class: 'mn-banner mn-banner--bad' },
          h('span', {}, message),
          ' ',
          h(
            'button',
            { class: 'mn-btn', type: 'button', onclick: () => send.click() },
            t('common.retry'),
          ),
        ),
      );
    }
  });
  window.mnui.sheet.open(sheet, { tall: true, modal: true });
}

// ---------- customer ----------
export function openCustomerDetail(id) {
  const c = app.store.get('customers', id);
  if (!c) return;
  const totals = customerTotals(id);
  const invoices = app.store
    .all('invoices')
    .filter((inv) => inv.customer_id === id)
    .sort((a, b) => String(b.issue_date ?? '9999').localeCompare(String(a.issue_date ?? '9999')));
  const payments = app.store.all('payments');
  const notes = c.notes
    ? mdToDom(c.notes, {
        checkLabel: (text, done) => t(done ? 'customer.uncheck' : 'customer.check', { text }),
        onToggle: async (lineNo) => {
          await app.store.save('customers', { ...c, notes: toggleCheck(c.notes, lineNo) });
          openCustomerDetail(id);
        },
      })
    : null;
  const open = invoices.filter((inv) =>
    ['open', 'partial', 'overdue'].includes(statusOf(inv, payments).key),
  );
  const sheet = h(
    'div',
    {},
    bar(
      t('customer.title'),
      h(
        'button',
        {
          class: 'mn-btn',
          type: 'button',
          onclick: () => openCustomerEditor(id, { onSaved: () => openCustomerDetail(id) }),
        },
        t('common.edit'),
      ),
    ),
    h(
      'div',
      { class: 'mn-sheet-body' },
      h(
        'div',
        { class: 'customer-head' },
        h('span', { class: 'mn-thumb', 'aria-hidden': 'true' }, initials(c.name)),
        h('h2', { class: 'mn-sheet-title' }, c.name),
      ),
      h(
        'div',
        { class: 'mn-kpis' },
        h(
          'div',
          { class: 'mn-kpi' },
          h('b', {}, amount(totals.revenue)),
          h('span', {}, t('customer.revenueNet')),
        ),
        h(
          'div',
          { class: 'mn-kpi' },
          h('b', {}, amount(totals.open)),
          h('span', {}, t('customer.openAmount', { n: open.length })),
        ),
        h(
          'div',
          { class: 'mn-kpi' },
          h('b', { class: 'mn-num' }, String(totals.count)),
          h('span', {}, t('customer.invoices', { n: totals.count })),
        ),
      ),
      h(
        'div',
        { class: 'detail-actions' },
        h(
          'button',
          {
            class: 'mn-btn mn-btn--primary',
            type: 'button',
            onclick: () => openInvoiceEditor({ customerId: id }),
          },
          t('customer.newInvoice'),
        ),
      ),
      h(
        'dl',
        { class: 'mn-facts' },
        fact(t('customer.contact'), c.contact),
        fact(t('customer.email'), c.email),
        fact(t('customer.phone'), c.phone),
        fact(
          t('customer.address'),
          [
            c.street,
            `${c.zip ?? ''} ${c.city ?? ''}`.trim(),
            c.country ? new Intl.DisplayNames([locale()], { type: 'region' }).of(c.country) : '',
          ]
            .filter(Boolean)
            .join(', '),
        ),
        fact(t('customer.vatId'), c.vat_id),
        fact(t('customer.number'), c.number),
        fact(
          t('customer.paymentDays'),
          c.payment_days !== null && c.payment_days !== undefined
            ? t('customer.days', { n: c.payment_days })
            : null,
        ),
        fact(t('customer.lastInvoice'), totals.last ? date(totals.last) : null),
      ),
      notes ? h('h3', {}, t('customer.notes')) : null,
      notes,
      h('h3', {}, t('customer.history')),
      invoices.length
        ? h(
            'div',
            { class: 'mn-list' },
            invoices.map((inv) => invoiceRow(inv, { onOpen: () => openInvoiceDetail(inv.id) })),
          )
        : h('p', { class: 'mn-note' }, t('customer.noInvoices')),
    ),
  );
  window.mnui.sheet.open(sheet, { tall: true });
}
