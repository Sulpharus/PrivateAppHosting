// What happens to invoices beyond the screen: issuing (number, snapshot, PDF in mn.files),
// payments, cancellation, reminders (bell and scheduled push) and sending by Gmail.
import { app, saveSettings } from './ctx.js';
import { safeName, t } from './dom.js';
import { addDays, cancellationOf, daysBetween, nextNumber, statusOf, today } from './invoice.js';
import { invoicePdf } from './invoice-pdf.js';
import { buildMessage } from './mail.js';
import { checkInvoice } from './rules.js';

// ---------- document texts in the invoice's language ----------
const packages = new Map();
/** A text function for the invoice language, read from the app's own language package. */
export async function docTexts(lang) {
  const code = lang === 'en' ? 'en' : 'de';
  if (!packages.has(code)) {
    packages.set(
      code,
      fetch(`/i18n/${code}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    );
  }
  const texts = await packages.get(code);
  return (key, params = {}) => {
    const value = texts[key] ?? window.mnI18n.t(key, params);
    const text = typeof value === 'object' ? (value.other ?? '') : String(value);
    return text.replace(/\{(\w+)\}/g, (_m, name) => String(params[name] ?? ''));
  };
}

// ---------- seller snapshot and PDF ----------
const SELLER_FIELDS = [
  'name',
  'owner',
  'street',
  'zip',
  'city',
  'country',
  'email',
  'phone',
  'website',
  'tax_number',
  'vat_id',
  'register',
  'bank',
  'iban',
  'bic',
  'qr',
  'small_business',
  'logo',
];

export function sellerSnapshot(company = app.company) {
  return Object.fromEntries(SELLER_FIELDS.map((f) => [f, company[f] ?? null]));
}

export function customerSnapshot(customer) {
  if (!customer) return {};
  const fields = [
    'name',
    'contact',
    'email',
    'street',
    'zip',
    'city',
    'country',
    'vat_id',
    'number',
  ];
  return Object.fromEntries(fields.map((f) => [f, customer[f] ?? null]));
}

const logoCache = new Map();
async function logoBytes(path) {
  if (!path) return null;
  if (!logoCache.has(path)) {
    logoCache.set(
      path,
      (async () => {
        const url = await app.mn.files.url(path);
        const res = await fetch(url);
        return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
      })().catch(() => null),
    );
  }
  return logoCache.get(path);
}

/** The PDF bytes of an invoice (drafts use the current company profile). */
export async function pdfBytes(invoice) {
  const draft = invoice.status === 'draft';
  const seller = draft ? sellerSnapshot() : invoice.seller;
  const customer =
    draft && invoice.customer_id
      ? customerSnapshot(app.store.get('customers', invoice.customer_id))
      : invoice.customer;
  const doc = { ...invoice, seller, customer };
  const texts = await docTexts(invoice.lang);
  const original = invoice.cancels_id ? app.store.get('invoices', invoice.cancels_id) : null;
  return invoicePdf({
    invoice: doc,
    t: texts,
    logo: await logoBytes(seller?.logo),
    cancelled: original ? { number: original.number, issue_date: original.issue_date } : null,
  });
}

export function pdfName(invoice) {
  const label = invoice.number ?? t('status.draft');
  return `${safeName(label)}${invoice.customer?.name ? ` ${safeName(invoice.customer.name)}` : ''}.pdf`;
}

/** Opens the PDF in a new tab (made on the device, so it also works offline). */
export async function openPdf(invoice, win = null) {
  const bytes = await pdfBytes(invoice);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  if (win) win.location.href = url;
  else window.location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/** Stores the PDF of an issued invoice in mn.files (online only); returns the row. */
export async function uploadPdf(invoice) {
  if (invoice.status === 'draft' || invoice.pdf_path || !app.mn.offline.online()) return invoice;
  const bytes = await pdfBytes(invoice);
  const year = (invoice.issue_date ?? today()).slice(0, 4);
  const path = `rechnungen/${year}/${safeName(invoice.number).replace(/\s/g, '_')}-${invoice.id.slice(0, 8)}.pdf`;
  await app.mn.files.upload(path, new Blob([bytes], { type: 'application/pdf' }), {
    contentType: 'application/pdf',
  });
  return app.store.save('invoices', { id: invoice.id, pdf_path: path });
}

/** Uploads PDFs that were issued offline. */
export async function uploadMissingPdfs() {
  if (!app.mn.offline.online()) return;
  for (const inv of app.store.all('invoices'))
    if (inv.status !== 'draft' && !inv.pdf_path && !inv.is_sample) {
      try {
        await uploadPdf(inv);
      } catch {
        return;
      }
    }
}

// ---------- issuing ----------
export function issuesOf(invoice) {
  const customer = invoice.customer_id
    ? customerSnapshot(app.store.get('customers', invoice.customer_id))
    : invoice.customer;
  return checkInvoice({ seller: app.company, customer, invoice });
}

/** The number format: sample invoices count in their own range, never in the real one. */
function numberFormat(invoice) {
  return invoice.is_sample ? `${t('sample.numberPrefix')}-{YYYY}-{NNN}` : app.company.number_format;
}

function takenNumbers() {
  return app.store
    .all('invoices', { deleted: true })
    .map((i) => i.number)
    .filter(Boolean);
}

/** The dates an invoice gets when it is issued today: the payment term keeps its length. */
export function issueDates(invoice, day = today()) {
  if (!invoice.issue_date || invoice.issue_date === day)
    return { issue_date: day, due_date: invoice.due_date };
  const term = invoice.due_date ? daysBetween(invoice.issue_date, invoice.due_date) : null;
  return { issue_date: day, due_date: term === null ? null : addDays(day, Math.max(0, term)) };
}

/**
 * Gives the invoice its number and freezes it; dated today (an invoice is dated the day it is
 * issued). Online only: two devices issuing offline could pick the same number.
 */
export async function issue(invoice) {
  if (!app.mn.offline.online()) throw Object.assign(new Error('offline'), { code: 'offline' });
  const dates = issueDates(invoice);
  const number = nextNumber(numberFormat(invoice), dates.issue_date, takenNumbers());
  const customer = invoice.customer_id
    ? customerSnapshot(app.store.get('customers', invoice.customer_id))
    : invoice.customer;
  let row = await app.store.save('invoices', {
    id: invoice.id,
    status: 'issued',
    number,
    ...dates,
    customer,
    seller: sellerSnapshot(),
  });
  await app.store.log(row.id, 'issued', { number });
  try {
    row = await uploadPdf(row);
  } catch {
    // Stays without pdf_path; uploaded again when the app opens online.
  }
  await scheduleReminder(row);
  return row;
}

/** Cancels an issued invoice with a cancellation invoice; returns the cancellation. */
export async function cancel(invoice) {
  if (!app.mn.offline.online()) throw Object.assign(new Error('offline'), { code: 'offline' });
  const current = app.store.get('invoices', invoice.id) ?? invoice;
  if (current.status !== 'issued' || current.kind !== 'invoice') return null;
  const day = today();
  const number = nextNumber(numberFormat(current), day, takenNumbers());
  let storno = cancellationOf(current, app.store.newId(), number, day);
  storno = await app.store.save('invoices', storno);
  await app.store.save('invoices', { id: current.id, status: 'cancelled' });
  await app.store.log(current.id, 'cancelled', { number });
  await app.store.log(storno.id, 'issued', { number });
  await cancelReminder(current.id);
  try {
    storno = await uploadPdf(storno);
  } catch {
    // later
  }
  return storno;
}

export async function addPayment(invoice, { paid_on, amount_cents, note }) {
  const row = await app.store.save('payments', {
    id: app.store.newId(),
    invoice_id: invoice.id,
    paid_on,
    amount_cents,
    note,
    is_sample: invoice.is_sample,
  });
  await app.store.log(invoice.id, 'payment', { amount_cents, paid_on });
  if (statusOf(invoice, app.store.all('payments')).key === 'paid') await cancelReminder(invoice.id);
  return row;
}

/**
 * Books what is still open on an invoice as paid today. Works from the current payments, so a
 * second tap finds nothing open and books nothing. Returns false when nothing was open.
 */
export async function payOpen(invoice, day = today()) {
  const current = app.store.get('invoices', invoice.id) ?? invoice;
  const status = statusOf(current, app.store.all('payments'), day);
  if (!['open', 'partial', 'overdue'].includes(status.key) || status.open <= 0) return false;
  await addPayment(current, { paid_on: day, amount_cents: status.open, note: null });
  return true;
}

export async function removePayment(payment) {
  await app.store.remove('payments', payment.id);
  const invoice = app.store.get('invoices', payment.invoice_id);
  if (invoice) {
    await app.store.log(invoice.id, 'paymentRemoved', { amount_cents: payment.amount_cents });
    await scheduleReminder(invoice);
  }
}

// ---------- reminders ----------
/** 09:00 in Central European time on a day, as a Date. */
export function morningOf(day) {
  const probe = new Date(`${day}T09:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'shortOffset',
  }).formatToParts(probe);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const hours = Number(offset.replace('GMT', '') || '0');
  return new Date(probe.getTime() - hours * 3600000);
}

const reminderKey = (id) => `due:${id}`;

/** Plans the push for the morning after the due date (or removes it when nothing is owed). */
export async function scheduleReminder(invoice) {
  try {
    const status = statusOf(invoice, app.store.all('payments'));
    if (
      !app.settings.push ||
      invoice.is_sample ||
      !invoice.due_date ||
      !['open', 'partial'].includes(status.key)
    ) {
      await app.mn.push.cancel(reminderKey(invoice.id));
      return;
    }
    const at = morningOf(addDays(invoice.due_date, 1));
    if (at.getTime() < Date.now()) return;
    await app.mn.push.schedule({
      key: reminderKey(invoice.id),
      at,
      title: t('notify.dueTitle'),
      body: t('notify.dueBody'),
      path: `/?view=invoices&id=${invoice.id}`,
    });
  } catch {
    // Push is an extra; the bell reminder at start-up still works.
  }
}

export async function cancelReminder(id) {
  try {
    await app.mn.push.cancel(reminderKey(id));
  } catch {
    // see above
  }
}

/** At start-up: one bell message for invoices that became overdue, and the push plan in order. */
export async function remindOverdue() {
  if (!app.settings.reminders) return;
  const day = today();
  const payments = app.store.all('payments');
  const due = app.store
    .all('invoices')
    .filter(
      (inv) => !inv.is_sample && statusOf(inv, payments, day).key === 'overdue' && !inv.reminded_on,
    );
  if (due.length) {
    const title =
      due.length === 1
        ? t('notify.overdueOneTitle')
        : t('notify.overdueManyTitle', { n: due.length });
    const path = due.length === 1 ? `/?view=invoices&id=${due[0].id}` : '/?view=invoices&f=overdue';
    try {
      await app.mn.notify(title, t('notify.overdueBody'), path);
      for (const inv of due) await app.store.save('invoices', { id: inv.id, reminded_on: day });
    } catch {
      // try again next time
    }
  }
  if (!app.settings.push) return;
  try {
    const planned = new Set((await app.mn.push.list()).map((p) => p.key));
    for (const inv of app.store.all('invoices'))
      if (!planned.has(reminderKey(inv.id)) && inv.status === 'issued' && inv.due_date >= day)
        await scheduleReminder(inv);
  } catch {
    // not available here
  }
}

export async function setPush(on) {
  await saveSettings({ push: on });
  for (const inv of app.store.all('invoices'))
    if (inv.status === 'issued') await (on ? scheduleReminder(inv) : cancelReminder(inv.id));
}

// ---------- e-mail ----------
/** Default subject and text of the mail for an invoice (kind 'invoice' or 'reminder'). */
export async function mailDraft(invoice, kind) {
  const tx = await docTexts(invoice.lang);
  const status = statusOf(invoice, app.store.all('payments'));
  const locale = invoice.lang === 'en' ? 'en-GB' : app.company.country === 'AT' ? 'de-AT' : 'de-DE';
  const fmt = (c) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(c / 100);
  const fmtDate = (iso) =>
    iso
      ? new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${iso}T00:00:00Z`))
      : '';
  const params = {
    number: invoice.number ?? '',
    company: invoice.seller?.name ?? app.company.name,
    name: invoice.customer?.contact || invoice.customer?.name || '',
    amount: fmt(kind === 'reminder' ? status.open : invoice.gross_cents),
    date: fmtDate(invoice.due_date),
  };
  const greeting = params.name ? tx('mail.greeting', params) : tx('mail.greetingNoName');
  const body =
    kind === 'reminder'
      ? tx('mail.bodyReminder', params)
      : invoice.due_date
        ? tx('mail.bodyInvoice', params)
        : tx('mail.bodyInvoiceNow', params);
  const parts = [greeting, body];
  if (kind !== 'reminder') parts.push(tx('mail.thanks'));
  parts.push(`${tx('mail.regards')}\n${params.company}`);
  return {
    subject: tx(kind === 'reminder' ? 'mail.subjectReminder' : 'mail.subjectInvoice', params),
    text: parts.join('\n\n'),
  };
}

/** Sends the invoice by Gmail; attachments of the invoice can go along. */
export async function sendMail(invoice, { to, subject, text, withAttachments, kind }) {
  const attachments = [
    { name: pdfName(invoice), type: 'application/pdf', bytes: await pdfBytes(invoice) },
  ];
  if (withAttachments)
    for (const file of invoice.attachments ?? []) {
      const url = await app.mn.files.url(file.path);
      const res = await fetch(url);
      if (res.ok)
        attachments.push({
          name: file.name,
          type: file.type || 'application/octet-stream',
          bytes: new Uint8Array(await res.arrayBuffer()),
        });
    }
  const raw = buildMessage({
    to,
    subject,
    text,
    attachments,
    boundary: `mn-${invoice.id.slice(0, 8)}`,
  });
  const res = await app.mn.google.fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    },
  );
  if (!res.ok) {
    const error = new Error(`gmail ${res.status}`);
    error.status = res.status;
    throw error;
  }
  const row =
    kind === 'invoice'
      ? await app.store.save('invoices', { id: invoice.id, sent_at: new Date().toISOString() })
      : app.store.get('invoices', invoice.id);
  await app.store.log(invoice.id, kind === 'reminder' ? 'reminderSent' : 'sent', { to });
  return row;
}
