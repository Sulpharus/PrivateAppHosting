// Bank statement import: parses the CSV exports of German banks (semicolon, "1.234,56",
// "24.09.2026", a few lines of preamble before the header) and generic CSV files.

/** Splits CSV text into rows; handles quotes, doubled quotes and line breaks inside quotes. */
export function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
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
  const sample = text.split(/\r?\n/).slice(0, 30).join('\n');
  const counts = [';', ',', '\t'].map((d) => [d, sample.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

/** "1.234,56" / "-12,30" / "1234.56" / "12,30 €" / "12,30 S" → cents (negative for debit). */
export function parseAmount(value) {
  let s = String(value ?? '').replace(/[\s€A-GI-RT-Za-z]/g, '');
  let sign = 1;
  if (/S$/.test(s)) sign = -1; // "S"/"H" = Soll/Haben in some exports
  s = s.replace(/[SH]$/, '');
  if (s.startsWith('-') || s.startsWith('−')) {
    sign *= -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) {
    sign *= -1;
    s = s.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const commas = s.split(',').length - 1;
  const dots = s.split('.').length - 1;
  let decimal;
  if (commas && dots) decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
  else if (commas)
    decimal = commas === 1 ? ',' : null; // German exports: "12,30"
  else if (dots)
    decimal = dots === 1 && !/^\d{1,3}\.\d{3}$/.test(s) ? '.' : null; // "1.234" = thousands
  else decimal = null;
  const thousands = decimal === ',' ? '.' : decimal === '.' ? ',' : /,/.test(s) ? ',' : '.';
  if (
    thousands &&
    s.includes(thousands) &&
    !new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})+(\\${decimal ?? 'x'}\\d*)?$`).test(s)
  )
    return null;
  const parts = s
    .split(thousands)
    .join('')
    .split(decimal ?? '\u0000');
  if (parts.length > 2 || (parts[1] ?? '').length > 2) return null;
  const euros = Number(parts[0] || '0');
  const cents = Number(`${parts[1] ?? ''}00`.slice(0, 2));
  if (!Number.isFinite(euros) || !Number.isFinite(cents)) return null;
  return sign * (euros * 100 + cents);
}

/** "24.09.2026" / "24.09.26" / "2026-09-24" / "24/09/2026" → "2026-09-24". */
export function parseDate(value) {
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, +m[2], +m[1]);
  }
  return null;
}

function valid(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const GUESS = {
  date: /^(buchungstag|buchungsdatum|datum|date|valuta|wertstellung|booking date)/i,
  amount: /^(betrag|umsatz|amount)/i,
  // Volksbank/Sparkasse: unsigned amount plus a separate "S"/"H" column.
  sign: /^(soll\/haben|s\/h|soll-haben|kennzeichen)$/i,
  text: /^(verwendungszweck|buchungstext|beschreibung|description|zweck|vorgang|purpose)/i,
  party:
    /^(beguenstigter|begünstigter|empfänger|empfaenger|auftraggeber|zahlungsempfänger|name|payee|gegenkonto|beguenstigter\/zahlungspflichtiger|zahlungspflichtiger)/i,
};

/**
 * Finds the header row (banks put account info above it) and guesses the columns.
 * Returns { header, rows, map: { date, amount, text, party, sign } } with column indexes or -1.
 */
export function analyse(text) {
  const delimiter = detectDelimiter(text);
  const all = parseCsv(text.replace(/^﻿/, ''), delimiter);
  let headerIndex = all.findIndex(
    (row) =>
      row.some((c) => GUESS.date.test(c)) &&
      row.some((c) => GUESS.amount.test(c) || /betrag|umsatz/i.test(c)),
  );
  if (headerIndex < 0) headerIndex = 0;
  const header = all[headerIndex] ?? [];
  const rows = all.slice(headerIndex + 1).filter((r) => r.length >= Math.min(header.length, 2));
  const find = (re, fallback) => {
    const i = header.findIndex((c) => re.test(c));
    return i >= 0 ? i : fallback;
  };
  const map = {
    date: find(GUESS.date, -1),
    amount: find(
      GUESS.amount,
      header.findIndex((c) => /betrag|umsatz/i.test(c)),
    ),
    text: find(GUESS.text, -1),
    party: find(GUESS.party, -1),
    sign: find(GUESS.sign, -1),
  };
  // Without a recognisable header: first date-like and amount-like columns of the first row.
  if (map.date < 0 && rows[0]) map.date = rows[0].findIndex((c) => parseDate(c));
  if (map.amount < 0 && rows[0])
    map.amount = rows[0].findIndex((c, i) => i !== map.date && parseAmount(c) !== null);
  return { header, rows, map };
}

/** Turns analysed rows into bookings: { date, cents (absolute), kind, text, party }. */
export function toBookings({ rows, map }) {
  const out = [];
  for (const row of rows) {
    const date = parseDate(row[map.date]);
    let cents = parseAmount(row[map.amount]);
    if (cents !== null && map.sign >= 0) {
      const mark = String(row[map.sign] ?? '')
        .trim()
        .toUpperCase();
      if (mark === 'S') cents = -Math.abs(cents);
      else if (mark === 'H') cents = Math.abs(cents);
    }
    if (!date || cents === null || cents === 0) continue;
    const party = map.party >= 0 ? (row[map.party] ?? '') : '';
    const text = map.text >= 0 ? (row[map.text] ?? '') : '';
    out.push({
      date,
      cents: Math.abs(cents),
      kind: cents < 0 ? 'expense' : 'income',
      party: party.replace(/\s+/g, ' ').slice(0, 120),
      text: text.replace(/\s+/g, ' ').slice(0, 200),
    });
  }
  return out;
}

/** Stable short hash for import de-duplication (FNV-1a, 32 bit, base 36). */
export function hash(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Rows → CSV for German spreadsheet apps (BOM, ";", CRLF). Text that starts like a formula is
 * prefixed with ' so imported bank text never runs as a formula; plain numbers stay numbers. */
export function toCsv(lines) {
  const cell = (v) => {
    const s = String(v ?? '');
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)*$/.test(s) ? `'${s}` : s;
    return /[";\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return `\uFEFF${lines.map((l) => l.map(cell).join(';')).join('\r\n')}`;
}
