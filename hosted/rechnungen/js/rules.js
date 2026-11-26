// What the law asks of an invoice, per country of the seller (Germany: § 14 UStG, Austria: § 11 UStG).
// The checks return keys of the language packages; the app shows them before an invoice is issued.
import { totals, validIban } from './money.js';

export const COUNTRIES = ['DE', 'AT'];

/** VAT rates in basis points, the usual one first. */
export const RATES = {
  DE: [1900, 700, 0],
  AT: [2000, 1300, 1000, 0],
};

/** Simplified invoices (Kleinbetragsrechnung) up to this gross amount need no customer address. */
export const SMALL_AMOUNT_CENTS = { DE: 25000, AT: 40000 };

/** Above this gross amount an Austrian invoice to a business names the customer's UID. */
export const AT_CUSTOMER_UID_FROM_CENTS = 1000000;

/** Tax treatments; every one except `standard` puts a legal note on the invoice and charges no VAT. */
export const TAX_MODES = ['standard', 'small', 'reverse', 'intra', 'export', 'nontaxable'];

export function ratesFor(country) {
  return RATES[country] ?? RATES.DE;
}

export function defaultRate(country) {
  return ratesFor(country)[0];
}

export function chargesNoTax(mode) {
  return mode !== 'standard';
}

/** The key of the legal note printed for a tax mode, or null. */
export function taxNoteKey(mode, country) {
  if (mode === 'small') return country === 'AT' ? 'doc.note.smallAT' : 'doc.note.smallDE';
  if (mode === 'reverse') return 'doc.note.reverse';
  if (mode === 'intra') return 'doc.note.intra';
  if (mode === 'export') return 'doc.note.export';
  if (mode === 'nontaxable') return 'doc.note.nontaxable';
  return null;
}

const filled = (value) => typeof value === 'string' && value.trim().length > 0;
const hasAddress = (party) =>
  filled(party?.name) && filled(party?.street) && filled(party?.zip) && filled(party?.city);

/**
 * Problems that stop an invoice from being issued (`error`) or that the person should look at
 * (`warn`). `seller` is the company profile, `customer` the customer snapshot, `invoice` the row.
 */
export function checkInvoice({ seller, customer, invoice }) {
  const issues = [];
  const add = (level, key, params) => issues.push({ level, key, params });
  const country = seller?.country === 'AT' ? 'AT' : 'DE';
  const mode = invoice.tax_mode ?? 'standard';
  const lines = invoice.lines ?? [];
  const sum = totals(lines, { noTax: chargesNoTax(mode) });

  if (!hasAddress(seller)) add('error', 'check.sellerAddress');
  if (country === 'DE' && !filled(seller?.tax_number) && !filled(seller?.vat_id))
    add('error', 'check.sellerTaxDE');
  if (country === 'AT' && !filled(seller?.vat_id)) {
    if (mode === 'small') add('warn', 'check.sellerUidSmallAT');
    else add('error', 'check.sellerUidAT');
  }
  if (mode === 'small' && !seller?.small_business) add('warn', 'check.smallNotSet');
  if (mode !== 'small' && seller?.small_business) add('warn', 'check.smallButCharged');

  if (!customer || !filled(customer.name)) add('error', 'check.customerName');
  else if (!hasAddress(customer)) {
    if (Math.abs(sum.gross) <= SMALL_AMOUNT_CENTS[country])
      add('warn', 'check.customerAddressSmall');
    else add('error', 'check.customerAddress');
  }
  if ((mode === 'reverse' || mode === 'intra') && !filled(customer?.vat_id))
    add('error', 'check.customerVatId');
  if ((mode === 'reverse' || mode === 'intra') && !filled(seller?.vat_id))
    add('error', 'check.sellerVatId');
  if (
    country === 'AT' &&
    mode === 'standard' &&
    Math.abs(sum.gross) > AT_CUSTOMER_UID_FROM_CENTS &&
    !filled(customer?.vat_id)
  )
    add('warn', 'check.customerUidAT');

  if (lines.length === 0) add('error', 'check.noLines');
  if (lines.some((l) => !filled(l.title))) add('error', 'check.lineTitle');
  if (lines.some((l) => !(l.qty_milli > 0))) add('error', 'check.lineQty');
  if (mode === 'standard' && lines.some((l) => !ratesFor(country).includes(l.tax_bp)))
    add('warn', 'check.unusualRate');

  if (!invoice.issue_date) add('error', 'check.issueDate');
  if (!invoice.service_date) add('error', 'check.serviceDate');
  if (invoice.service_end && invoice.service_date && invoice.service_end < invoice.service_date)
    add('error', 'check.servicePeriod');
  if (invoice.due_date && invoice.issue_date && invoice.due_date < invoice.issue_date)
    add('error', 'check.dueBeforeIssue');

  if (filled(seller?.iban) && !validIban(seller.iban)) add('warn', 'check.iban');
  if (!filled(seller?.iban)) add('warn', 'check.noIban');
  return issues;
}

/** Checks a VAT ID's form (not whether it exists): DE + 9 digits, ATU + 8 digits, other EU forms. */
export function plausibleVatId(value) {
  const id = String(value ?? '')
    .replace(/[\s.-]/g, '')
    .toUpperCase();
  if (id.startsWith('DE')) return /^DE\d{9}$/.test(id);
  if (id.startsWith('AT')) return /^ATU\d{8}$/.test(id);
  return /^[A-Z]{2}[A-Z0-9+*]{2,13}$/.test(id);
}
