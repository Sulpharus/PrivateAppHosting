// Backup import without the page: every imported row is checked and cleaned, rows that exist are
// left alone (an import only fills gaps, it never overwrites newer data), and parents come before
// the rows that point at them.
import { withTotals } from './invoice.js';
import { shape } from './store.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Checks and cleans one imported row; null when it cannot be used. */
export function cleanRow(table, raw) {
  if (!raw || typeof raw !== 'object' || !UUID.test(String(raw.id))) return null;
  const row = shape(table, raw);
  const str = (v, max = 200) =>
    typeof v === 'string'
      ? v.slice(0, max)
      : v === null || v === undefined
        ? null
        : String(v).slice(0, max);
  const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
  const day = (v) => (typeof v === 'string' && DAY.test(v) ? v : null);
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || typeof v === 'boolean' || (v !== null && typeof v === 'object')) continue;
    if (typeof v === 'number') row[k] = int(v);
    else if (k.endsWith('_date') || k === 'service_end' || k === 'paid_on' || k === 'reminded_on')
      row[k] = day(v);
    else if (v !== null)
      row[k] = str(v, k === 'notes' ? 20000 : ['intro', 'closing'].includes(k) ? 4000 : 2000);
  }
  if (table === 'customers' && !row.name) return null;
  if (table === 'items' && !row.title) return null;
  if (
    table === 'payments' &&
    (!UUID.test(String(row.invoice_id)) || !row.paid_on || !row.amount_cents)
  )
    return null;
  if (table === 'history' && !UUID.test(String(row.item_id))) return null;
  if (table === 'invoices') {
    if (!Array.isArray(row.lines)) row.lines = [];
    row.lines = row.lines.slice(0, 200).map((l) => ({
      id: UUID.test(String(l?.id)) ? l.id : crypto.randomUUID(),
      item_id: UUID.test(String(l?.item_id)) ? l.item_id : null,
      title: str(l?.title) ?? '',
      description: str(l?.description, 2000) ?? '',
      unit: str(l?.unit, 20) ?? '',
      qty_milli: int(l?.qty_milli) || 1000,
      price_cents: int(l?.price_cents),
      tax_bp: Math.min(10000, Math.max(0, int(l?.tax_bp))),
      discount_bp: Math.min(10000, Math.max(0, int(l?.discount_bp))),
    }));
    if (!Array.isArray(row.attachments)) row.attachments = [];
    if (row.status !== 'draft' && (!row.number || !row.issue_date)) row.status = 'draft';
    for (const key of ['customer', 'seller'])
      if (!row[key] || typeof row[key] !== 'object' || Array.isArray(row[key])) row[key] = {};
    return withTotals(row);
  }
  return row;
}

/** Cancellations last, so the invoice they point at exists; also the order for deleting reversed. */
export function originalsFirst(invoices) {
  return [...invoices].sort((a, b) => (a.kind === 'cancellation') - (b.kind === 'cancellation'));
}

/**
 * The rows to write, per table in a safe order: cleaned, without ids that exist (`has(table, id)`),
 * payments and history only for invoices that exist or come along. Stored PDFs are not part of a
 * backup, so pdf_path is cleared and the PDF made again from the frozen content.
 */
export function planImport(data, has) {
  const plan = {};
  const invoiceIds = new Set();
  for (const table of ['customers', 'items', 'invoices', 'payments', 'history']) {
    let rows = (Array.isArray(data?.[table]) ? data[table] : [])
      .map((raw) => cleanRow(table, raw))
      .filter((row) => row && !has(table, row.id));
    if (table === 'invoices') {
      rows = originalsFirst(rows).map((row) => ({ ...row, pdf_path: null, reminded_on: null }));
      for (const row of rows) invoiceIds.add(row.id);
    }
    const known = (id) => invoiceIds.has(id) || has('invoices', id);
    if (table === 'payments') rows = rows.filter((row) => known(row.invoice_id));
    if (table === 'history') rows = rows.filter((row) => known(row.item_id));
    plan[table] = rows;
  }
  return plan;
}
