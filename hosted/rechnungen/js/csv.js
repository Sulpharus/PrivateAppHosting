// CSV in and out: reading customer and product lists (UTF-8 or Windows-1252, ; or , separated,
// quoted cells) and writing lists for the tax adviser (German: ";" and decimal comma, English:
// "," and decimal point, UTF-8 with BOM so spreadsheet programs read umlauts correctly).

/** Bytes of a file as text: UTF-8 when it decodes cleanly, otherwise Windows-1252. */
export function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Splits CSV text into rows; handles quotes, doubled quotes and line breaks inside quotes. */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x));
}

export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  const counts = [';', ',', '\t'].map((d) => [d, sample.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

/** "24.09.2026" / "24.09.26" / "2026-09-24" / "24/09/2026" → "2026-09-24", else null. */
export function parseDate(value) {
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) return validDate(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), +m[2], +m[1]);
  return null;
}

function validDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The fields a CSV column can be mapped to, per kind of import. */
export const IMPORT_FIELDS = {
  customers: [
    'name',
    'contact',
    'email',
    'phone',
    'street',
    'zip',
    'city',
    'country',
    'vat_id',
    'number',
  ],
  items: ['title', 'description', 'unit', 'price', 'tax', 'number'],
};

const GUESS = {
  name: /^(name|firma|firmenname|kunde|company|customer)$/i,
  contact: /^(ansprechpartner|kontakt|contact|contact person)$/i,
  email: /^(e-?mail|mail)$/i,
  phone: /^(telefon|tel|phone|mobil)$/i,
  street: /^(straße|strasse|adresse|street|address)$/i,
  zip: /^(plz|postleitzahl|zip|postcode|postal code)$/i,
  city: /^(ort|stadt|city|town)$/i,
  country: /^(land|country)$/i,
  vat_id: /^(ust-?id(nr)?|uid|vat( id)?|ust-idnr\.?)$/i,
  number: /^(kundennummer|kundennr\.?|nummer|artikelnummer|nr\.?|number|no\.?)$/i,
  title: /^(bezeichnung|titel|leistung|produkt|artikel|title|item|name)$/i,
  description: /^(beschreibung|description|details)$/i,
  unit: /^(einheit|unit)$/i,
  price: /^(preis|einzelpreis|netto|price|net price|unit price)$/i,
  tax: /^(ust|mwst|steuersatz|ust-satz|tax|vat rate|tax rate)$/i,
};

/** Guesses which column holds which field: { field: columnIndex } (-1 when none). */
export function guessMapping(header, kind) {
  const map = {};
  for (const field of IMPORT_FIELDS[kind]) {
    map[field] = header.findIndex((h) => GUESS[field]?.test(h.trim()));
  }
  return map;
}

/** A stable UUID from text (SHA-256 based), so importing the same row twice finds the same id. */
export async function idFrom(text) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  ).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Rows to CSV text with a BOM; German uses ";" (numbers come pre-formatted by the caller). */
export function toCsv(rows, lang) {
  const delimiter = lang === 'en' ? ',' : ';';
  const cell = (value) => {
    let text = value === null || value === undefined ? '' : String(value);
    // Spreadsheet programs run cells that start with = + - @ as formulas; numbers stay numbers.
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`;
    const special = text.includes(delimiter) || /["\n\r]/.test(text);
    return special ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map((row) => row.map(cell).join(delimiter)).join('\r\n')}\r\n`;
}

/** Cents as a plain number for CSV in the language's form ("1234,50" / "1234.50"). */
export function csvAmount(cents, lang) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const text = `${Math.floor(abs / 100)}${lang === 'en' ? '.' : ','}${String(abs % 100).padStart(2, '0')}`;
  return `${sign}${text}`;
}
