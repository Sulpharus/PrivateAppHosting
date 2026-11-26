// Invoice logic without the page: status from payments, numbering, deadlines and business years.
import { totals } from './money.js';
import { chargesNoTax } from './rules.js';

export const TIME_ZONE = 'Europe/Berlin';

/** Today as YYYY-MM-DD in Central European time. */
export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A YYYY-MM-DD day plus `days` (negative goes back). */
export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a, b) {
  const toUtc = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/** Recomputes the stored sums of an invoice row from its lines. */
export function withTotals(invoice) {
  const sum = totals(invoice.lines ?? [], { noTax: chargesNoTax(invoice.tax_mode ?? 'standard') });
  return { ...invoice, net_cents: sum.net, tax_cents: sum.tax, gross_cents: sum.gross };
}

/** Sum of the payments booked on an invoice. */
export function paidCents(invoiceId, payments) {
  let sum = 0;
  for (const p of payments) if (p.invoice_id === invoiceId) sum += p.amount_cents;
  return sum;
}

/**
 * The state shown for an invoice: draft, cancelled (or a cancellation itself), paid, partial,
 * overdue or open. `open` is what is still owed in cents.
 */
export function statusOf(invoice, payments, day = today()) {
  if (invoice.status === 'draft') return { key: 'draft', open: 0, paid: 0 };
  if (invoice.kind === 'cancellation') return { key: 'cancellation', open: 0, paid: 0 };
  if (invoice.status === 'cancelled') return { key: 'cancelled', open: 0, paid: 0 };
  const paid = paidCents(invoice.id, payments);
  const open = invoice.gross_cents - paid;
  if (open <= 0) return { key: 'paid', open: 0, paid };
  if (invoice.due_date && invoice.due_date < day)
    return { key: 'overdue', open, paid, days: daysBetween(invoice.due_date, day) };
  if (paid > 0) return { key: 'partial', open, paid };
  return { key: 'open', open, paid };
}

/** The format tokens of invoice numbers: {YYYY}, {YY}, {MM} and {N}, {NN} … (counter width). */
export const DEFAULT_NUMBER_FORMAT = 'RE-{YYYY}-{NNNN}';

function patternParts(format, issueDate) {
  const [year, month] = issueDate.split('-');
  const filled = format
    .replaceAll('{YYYY}', year)
    .replaceAll('{YY}', year.slice(2))
    .replaceAll('{MM}', month);
  const match = filled.match(/\{(N+)\}/);
  if (!match) return null;
  const at = filled.indexOf(match[0]);
  return {
    before: filled.slice(0, at),
    after: filled.slice(at + match[0].length),
    width: match[1].length,
  };
}

/**
 * The next free number for `format` on `issueDate`: one above the highest counter among
 * `existing` numbers that share the same prefix and suffix (so it restarts each year when the
 * format contains the year).
 */
export function nextNumber(format, issueDate, existing) {
  const parts =
    patternParts(format || DEFAULT_NUMBER_FORMAT, issueDate) ??
    patternParts(DEFAULT_NUMBER_FORMAT, issueDate);
  if (!parts) return '';
  let highest = 0;
  for (const number of existing) {
    if (!number?.startsWith(parts.before) || !number.endsWith(parts.after)) continue;
    const middle = number.slice(parts.before.length, number.length - parts.after.length);
    if (/^\d+$/.test(middle)) highest = Math.max(highest, Number(middle));
  }
  return `${parts.before}${String(highest + 1).padStart(parts.width, '0')}${parts.after}`;
}

/** Is the format usable (it has a counter)? */
export function validNumberFormat(format) {
  return /\{N+\}/.test(format ?? '') && String(format).length <= 40;
}

/** The business year that starts in `startMonth` (1–12) of `year`: { from, to } as dates. */
export function businessYear(year, startMonth = 1) {
  const m = String(startMonth).padStart(2, '0');
  const from = `${year}-${m}-01`;
  const to = addDays(`${year + 1}-${m}-01`, -1);
  return { from, to };
}

/** The business year (its start year) a day belongs to. */
export function businessYearOf(iso, startMonth = 1) {
  const [y, m] = iso.split('-').map(Number);
  return m >= startMonth ? y : y - 1;
}

/** Empty line of an invoice. */
export function emptyLine(id, taxBp) {
  return {
    id,
    item_id: null,
    title: '',
    description: '',
    unit: '',
    qty_milli: 1000,
    price_cents: 0,
    tax_bp: taxBp,
    discount_bp: 0,
  };
}

/** A cancellation (Stornorechnung) of an issued invoice: the same lines with negative prices. */
export function cancellationOf(invoice, id, number, day) {
  return withTotals({
    ...invoice,
    id,
    kind: 'cancellation',
    status: 'issued',
    number,
    cancels_id: invoice.id,
    issue_date: day,
    due_date: null,
    lines: (invoice.lines ?? []).map((line) => ({ ...line, price_cents: -line.price_cents })),
    pdf_path: null,
    attachments: [],
    sent_at: null,
    reminded_on: null,
    is_sample: invoice.is_sample ?? false,
    deleted_at: null,
  });
}

/**
 * The lines of an invoice copied into a new draft (new ids). A copy of a cancellation turns its
 * prices positive again; a normal copy keeps every sign (a discount line stays negative).
 */
export function copyLines(lines, kind, newId) {
  return (lines ?? []).map((line) => ({
    ...line,
    id: newId(),
    price_cents: kind === 'cancellation' ? -line.price_cents : line.price_cents,
  }));
}
