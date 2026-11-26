// Amounts are integers in cents everywhere; this module turns typed text into cents and cents into
// text for the person's language. Tax is computed per rate from the summed net cents and rounded once.

/**
 * Reads a typed amount ("12,5", "1.234,50", "1,234.50", "-3") as cents. Returns null for anything
 * that is not a number with at most two decimals.
 */
export function parseCents(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  let text = String(input ?? '')
    .trim()
    .replace(/[\s  €]/g, '')
    .replace(/^EUR|EUR$/i, '');
  if (!text) return null;
  let sign = 1;
  if (text.startsWith('-') || text.startsWith('−')) {
    sign = -1;
    text = text.slice(1);
  }
  if (!/^[\d.,']+$/.test(text)) return null;
  text = text.replace(/'/g, '');
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let decimal = null;
  if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0) {
    // "1,234" with exactly three digits after a single comma reads as thousands only in English
    // style with more groups ("1,234,567"); a lone comma is a decimal comma ("12,5").
    decimal = text.split(',').length > 2 ? null : ',';
  } else if (lastDot >= 0) {
    const parts = text.split('.');
    decimal = parts.length > 2 || (parts[1]?.length === 3 && parts[0] !== '0') ? null : '.';
  }
  let whole = text;
  let fraction = '';
  if (decimal) {
    const at = text.lastIndexOf(decimal);
    whole = text.slice(0, at);
    fraction = text.slice(at + 1);
  }
  const thousands = decimal === ',' ? '.' : ',';
  if (decimal) whole = whole.split(thousands).join('');
  else whole = whole.replace(/[.,]/g, '');
  if (decimal && whole.includes(decimal)) return null;
  if (!/^\d*$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return null;
  if (!whole && !fraction) return null;
  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) ? sign * cents : null;
}

/** Reads a quantity ("1,5", "2", "0.25"); up to three decimals. Returns thousandths or null. */
export function parseQuantity(input) {
  const text = String(input ?? '')
    .trim()
    .replace(/\s/g, '');
  if (!/^\d+([.,]\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(',', '.').split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

/** A rate typed in percent ("20", "7,7") as basis points (2000, 770). */
export function parseRate(input) {
  const text = String(input ?? '')
    .trim()
    .replace(/\s|%/g, '');
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(',', '.').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

const currencyFormats = new Map();
/** "1.234,50 €" / "€1,234.50". */
export function formatCents(cents, locale, currency = 'EUR') {
  const key = `${locale}|${currency}`;
  let format = currencyFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: 'currency', currency });
    currencyFormats.set(key, format);
  }
  return format.format((cents ?? 0) / 100);
}

/** Cents as plain number text for inputs and CSV ("1234,50" in German, "1234.50" in English). */
export function centsToInput(cents, locale) {
  if (cents === null || cents === undefined) return '';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(cents / 100);
}

/** Thousandths as text ("1,5"). */
export function formatQuantity(milli, locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(milli / 1000);
}

/** Basis points as "20 %" / "20%". */
export function formatRate(bp, locale) {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(
    bp / 10000,
  );
}

/** Net cents of one line: quantity (thousandths) × unit price, minus a discount in basis points. */
export function lineNet(line) {
  const gross = Math.round((line.qty_milli * line.price_cents) / 1000);
  const discount = Math.round((gross * (line.discount_bp ?? 0)) / 10000);
  return gross - discount;
}

/**
 * Totals of an invoice. Tax is computed once per rate from the summed net amounts of that rate
 * (the usual way on German and Austrian invoices), so the rows of the tax table add up.
 * With `noTax` (small business, reverse charge, tax-free) every rate counts as 0.
 */
export function totals(lines, { noTax = false } = {}) {
  const byRate = new Map();
  let net = 0;
  for (const line of lines) {
    const amount = lineNet(line);
    net += amount;
    const rate = noTax ? 0 : (line.tax_bp ?? 0);
    byRate.set(rate, (byRate.get(rate) ?? 0) + amount);
  }
  const rates = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, base]) => ({ rate, net: base, tax: Math.round((base * rate) / 10000) }));
  const tax = rates.reduce((sum, r) => sum + r.tax, 0);
  return { net, tax, gross: net + tax, rates };
}

/** Splits `total` cents into `parts` amounts that add up exactly (remainder to the first parts). */
export function split(total, parts) {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  let rest = total - base * parts;
  return Array.from({ length: parts }, () => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return base + extra;
  });
}

/** "AT61 •••• 1234": an IBAN shortened for lists. */
export function maskIban(iban) {
  const clean = String(iban ?? '').replace(/\s/g, '');
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}

/** IBAN in groups of four. */
export function formatIban(iban) {
  return String(iban ?? '')
    .replace(/\s/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** Checks an IBAN with its mod-97 checksum. */
export function validIban(iban) {
  const clean = String(iban ?? '')
    .replace(/\s/g, '')
    .toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(clean)) return false;
  const moved = clean.slice(4) + clean.slice(0, 4);
  let rest = 0;
  for (const char of moved) {
    const value = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97;
  }
  return rest === 1;
}
