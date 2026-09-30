// Bank statements as PDF (Kontoauszug): pdf.js extracts the text with positions, this module
// turns it into lines and the lines into bookings. German statements differ per bank, so the
// parser looks for the common shape: a line starting with a date (dd.mm. or dd.mm.yyyy, often a
// second value date), a description, and an amount at the end ("45,67-", "-45,67", "45,67 S",
// or amounts in separate Soll/Haben columns); the lines below it until the next booking belong
// to it (payee, purpose). The result has the same shape as a CSV analysis, so the import
// preview and column check are shared.

const AMOUNT = /^([+-])?\s?(\d{1,3}(?:[.\s]\d{3})*|\d+),(\d{2})\s?(€|EUR)?\s?([+-]|S|H)?$/i;
const DATE_START = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})?(?=\s|$)/;
const STOP =
  /^(alter|neuer|letzter)?\s*(konto)?stand|^saldo|^übertrag|^uebertrag|^zwischensumme|^summe|^seite \d|^kontoauszug|^iban|^bic|^rechnungsabschluss|^bitte beachten/i;
const GENERIC =
  /^(lastschrift|basislastschrift|sepa[- ]?lastschrift|überweisung|ueberweisung|gutschrift|dauerauftrag|kartenzahlung|karte|girocard|debitkarte|visa|mastercard|bargeldauszahlung|bargeld|entgelt|abschluss|zinsen|echtzeitüberweisung|folgelastschrift|erstlastschrift|lohn|gehalt|rente)\b/i;
const INCOME_HINT = /gutschrift|gehalt|lohn|rente|eingang|zinsgutschrift|erstattung|kindergeld/i;

/**
 * Groups pdf.js text items ({ str, x, y, w, page }) into lines, top to bottom per page. Items
 * whose baselines differ by less than `tolerance` share a line; cells keep their x positions.
 */
export function linesFromItems(items, tolerance = 2.5) {
  const pages = new Map();
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    if (!pages.has(it.page)) pages.set(it.page, []);
    pages.get(it.page).push(it);
  }
  const lines = [];
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    const sorted = pages.get(page).sort((a, b) => b.y - a.y || a.x - b.x);
    let current = null;
    for (const it of sorted) {
      if (!current || Math.abs(current.y - it.y) > tolerance) {
        current = { page, y: it.y, cells: [] };
        lines.push(current);
      }
      current.cells.push({ str: it.str.trim(), x: it.x, right: it.x + (it.w ?? 0) });
    }
  }
  for (const line of lines) {
    line.cells.sort((a, b) => a.x - b.x);
    // a sign, S/H or € printed as its own item belongs to the amount before it
    line.cells = line.cells.reduce((out, cell) => {
      const prev = out[out.length - 1];
      if (prev && /^([+-]|S|H|€|EUR)$/i.test(cell.str) && readAmount(prev.str)) {
        prev.str = `${prev.str} ${cell.str}`;
        prev.right = cell.right;
      } else out.push(cell);
      return out;
    }, []);
    line.text = line.cells
      .map((c) => c.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return lines;
}

/** Cents and sign mark of an amount text; null if it is none. */
export function readAmount(text) {
  const m = AMOUNT.exec(String(text).trim());
  if (!m) return null;
  const cents = Number(`${m[2].replace(/[.\s]/g, '')}${m[3]}`);
  const mark = (m[5] ?? m[1] ?? '').toUpperCase();
  const sign = mark === '-' || mark === 'S' ? -1 : mark === '+' || mark === 'H' ? 1 : 0;
  return { cents, sign };
}

/** The statement's period or year, to complete dates written as dd.mm. */
export function statementYears(lines, fallbackYear) {
  const all = lines.map((l) => l.text).join('\n');
  const period =
    /(?:vom|zeitraum|von)\s*(\d{2})\.(\d{2})\.(\d{4})\s*(?:bis|-|–)\s*(\d{2})\.(\d{2})\.(\d{4})/i.exec(
      all,
    );
  if (period)
    return {
      from: `${period[3]}-${period[2]}-${period[1]}`,
      to: `${period[6]}-${period[5]}-${period[4]}`,
    };
  const years = new Map();
  for (const m of all.matchAll(/\b\d{2}\.\d{2}\.(20\d{2})\b/g))
    years.set(m[1], (years.get(m[1]) ?? 0) + 1);
  for (const m of all.matchAll(/(?:kontoauszug|auszug)[^\n]*?\b(20\d{2})\b/gi))
    years.set(m[1], (years.get(m[1]) ?? 0) + 5);
  const year = [...years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? String(fallbackYear);
  return { year: Number(year) };
}

function fullDate(day, month, yearText, context) {
  let year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : null;
  if (!year && context.from) {
    // the year that puts the date into the statement period (a week of slack)
    const fromYear = Number(context.from.slice(0, 4));
    const toYear = Number(context.to.slice(0, 4));
    year = fromYear;
    if (toYear !== fromYear) {
      const candidate = `${fromYear}-${month}-${day}`;
      if (candidate < context.from.replace(/-\d{2}$/, '-01')) year = toYear;
    }
  }
  year ??= context.year;
  const d = new Date(Date.UTC(year, Number(month) - 1, Number(day)));
  if (d.getUTCMonth() !== Number(month) - 1) return null;
  return `${String(day).padStart(2, '0')}.${month}.${year}`;
}

/** x positions of "Soll"/"Haben" (or Belastung/Gutschrift) column headers, if the bank uses them. */
function signColumns(lines) {
  for (const line of lines) {
    const minus = line.cells.find((c) =>
      /^(soll|belastung|lastschrift|ausgang|abgang)$/i.test(c.str),
    );
    const plus = line.cells.find((c) => /^(haben|gutschrift|eingang|zugang)$/i.test(c.str));
    if (minus && plus) return { minus: minus.right, plus: plus.right };
  }
  return null;
}

/**
 * Bookings of a statement as a CSV-like table: header, rows [date, amount, party, text] and the
 * column map. `guessed` counts rows whose direction came from the words, not the statement.
 */
export function parseStatement(lines, fallbackYear = new Date().getFullYear()) {
  const context = statementYears(lines, fallbackYear);
  const columns = signColumns(lines);
  const rows = [];
  let guessed = 0;
  let open = null;
  const finish = () => {
    if (!open) return;
    const [first, ...rest] = open.extra;
    let party = '';
    let text = open.desc;
    if (!open.desc || GENERIC.test(open.desc)) {
      party = first ?? '';
      text = [open.desc, ...rest].filter(Boolean).join(' ');
    } else {
      party = open.desc;
      text = open.extra.join(' ');
    }
    let sign = open.sign;
    if (!sign) {
      guessed++;
      sign = INCOME_HINT.test(`${open.desc} ${open.extra.join(' ')}`) ? 1 : -1;
    }
    rows.push([
      open.date,
      `${sign < 0 ? '-' : ''}${(open.cents / 100).toFixed(2).replace('.', ',')}`,
      party.slice(0, 120),
      text.replace(/\s+/g, ' ').trim().slice(0, 200),
    ]);
    open = null;
  };

  for (const line of lines) {
    const start = DATE_START.exec(line.text);
    // the amount is the last cell that reads as one (a balance column may follow on some
    // statements, so prefer the first amount after the description when there are two)
    const amounts = line.cells
      .map((c, i) => ({ i, c, a: readAmount(c.str) }))
      .filter((x) => x.a && x.i > 0);
    if (start && amounts.length) {
      finish();
      const date = fullDate(start[1], start[2], start[3], context);
      if (!date) continue;
      const pick = amounts.length > 1 ? amounts[amounts.length - 2] : amounts[0];
      let sign = pick.a.sign;
      if (!sign && columns)
        sign =
          Math.abs(pick.c.right - columns.minus) < Math.abs(pick.c.right - columns.plus) ? -1 : 1;
      const desc = line.cells
        .slice(0, pick.i)
        .map((c) => c.str)
        .join(' ')
        .replace(/^(\d{2}\.\d{2}\.(\d{2,4})?\s*){1,2}/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (STOP.test(desc)) continue;
      open = { date, cents: pick.a.cents, sign, desc, extra: [] };
      continue;
    }
    if (!open) continue;
    if (STOP.test(line.text) || open.extra.length >= 4 || DATE_START.test(line.text)) {
      finish();
      continue;
    }
    open.extra.push(line.text);
  }
  finish();
  return {
    header: ['Datum', 'Betrag', 'Empfänger / Auftraggeber', 'Verwendungszweck'],
    rows,
    map: { date: 0, amount: 1, party: 2, text: 3, sign: -1 },
    guessed,
  };
}

/** Text lines of a PDF file (ArrayBuffer) via the vendored pdf.js; runs in the browser only. */
export async function readPdf(buffer) {
  const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    './vendor/pdfjs/pdf.worker.min.mjs',
    import.meta.url,
  ).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false });
  try {
    const doc = await task.promise;
    const items = [];
    for (let n = 1; n <= Math.min(doc.numPages, 60); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const it of content.items)
        if ('str' in it)
          items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, page: n });
    }
    return linesFromItems(items);
  } finally {
    await task.destroy();
  }
}
