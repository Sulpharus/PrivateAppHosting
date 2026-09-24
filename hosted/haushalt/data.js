// Defaults and validation for the household book. Amounts are integer cents.

export const KINDS = { expense: 'Ausgabe', income: 'Einnahme', transfer: 'Umbuchung' };

/** Starting categories; the tax field is only a default and can be changed per category. */
export const DEFAULT_CATEGORIES = [
  ['miete', 'Miete und Nebenkosten', 'expense', 0, ''],
  ['energie', 'Strom und Heizung', 'expense', 0, ''],
  ['lebensmittel', 'Lebensmittel', 'expense', 0, ''],
  ['drogerie', 'Drogerie und Haushalt', 'expense', 0, ''],
  ['mobilitaet', 'Mobilität', 'expense', 0, ''],
  ['versicherungen', 'Versicherungen', 'expense', 0, 'va_weitere'],
  ['krankenversicherung', 'Kranken- und Pflegeversicherung', 'expense', 0, 'va_kv'],
  ['gesundheit', 'Gesundheit und Arzt', 'expense', 0, 'ab_krankheit'],
  ['kinderbetreuung', 'Kinderbetreuung', 'expense', 0, 'kind_betreuung'],
  ['haushaltshilfe', 'Reinigung und Gartenpflege', 'expense', 0, 'hh_dienstleistungen'],
  ['handwerker', 'Handwerker', 'expense', 0, 'hh_handwerker'],
  ['spenden', 'Spenden', 'expense', 0, 'sa_spenden'],
  ['arbeitsmittel', 'Arbeitsmittel', 'expense', 0, 'wk_arbeitsmittel'],
  ['fortbildung', 'Fortbildung', 'expense', 0, 'wk_fortbildung'],
  ['kontofuehrung', 'Kontoführung', 'expense', 0, 'wk_kontofuehrung'],
  ['abos', 'Abos und Medien', 'expense', 0, ''],
  ['essen', 'Restaurant und Café', 'expense', 0, ''],
  ['freizeit', 'Freizeit und Sport', 'expense', 0, ''],
  ['kleidung', 'Kleidung', 'expense', 0, ''],
  ['urlaub', 'Urlaub', 'expense', 0, ''],
  ['sonstiges', 'Sonstiges', 'expense', 0, ''],
  ['gehalt', 'Gehalt', 'income', 0, ''],
  ['kindergeld', 'Kindergeld', 'income', 0, ''],
  ['erstattungen', 'Erstattungen', 'income', 0, ''],
  ['einnahmen', 'Sonstige Einnahmen', 'income', 0, ''],
  ['sparen', 'Sparen und Anlage', 'transfer', 0, ''],
].map(([id, name, kind, budget, tax]) => ({ id, name, kind, budget, tax }));

/** "Contains" rules for imports; several words separated by "|". */
export const DEFAULT_RULES = [
  ['REWE|EDEKA|ALDI|LIDL|PENNY|NETTO|KAUFLAND|TEGUT|NORMA', 'lebensmittel'],
  ['DM-DROGERIE|DM DROGERIE|ROSSMANN|MUELLER|MÜLLER', 'drogerie'],
  ['MVG|DB VERTRIEB|DEUTSCHE BAHN|DEUTSCHLANDTICKET|ARAL|SHELL|ESSO|TOTAL|JET ', 'mobilitaet'],
  ['MIETE', 'miete'],
  ['STADTWERKE|SWM|E.ON|EON |VATTENFALL|ENBW|NATURSTROM|LICHTBLICK', 'energie'],
  ['SPOTIFY|NETFLIX|DISNEY|AMAZON PRIME|APPLE.COM|RUNDFUNK', 'abos'],
  ['HAFTPFLICHT|HUK|ALLIANZ|ERGO|DEVK|HANSEMERKUR', 'versicherungen'],
  ['APOTHEKE', 'gesundheit'],
  ['SPENDE', 'spenden'],
  ['KONTOFUEHRUNG|KONTOFÜHRUNG|ENTGELT', 'kontofuehrung'],
  ['LOHN|GEHALT|BEZUEGE|BEZÜGE', 'gehalt'],
  ['KINDERGELD|FAMILIENKASSE', 'kindergeld'],
].map(([match, cat]) => ({ match, cat }));

export const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isMonth = (v) => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const cents = (v) => (Number.isInteger(v) && v >= 0 && v < 1e11 ? v : null);

/** Keeps only well-formed fields; returns null for unusable bookings. */
export function cleanBooking(raw, fields) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && /^[\w-]{1,90}$/.test(raw.id) ? raw.id : null;
  const amount = cents(raw.cents);
  if (!id || !isDay(raw.date) || amount === null) return null;
  const b = {
    id,
    date: raw.date,
    cents: amount,
    kind: raw.kind in KINDS ? raw.kind : 'expense',
    cat: str(raw.cat, 60),
    text: str(raw.text, 200),
    party: str(raw.party, 120),
  };
  if (raw.taxField === 'none' || (typeof raw.taxField === 'string' && raw.taxField in fields))
    b.taxField = raw.taxField;
  if (cents(raw.taxCents) !== null) b.taxCents = raw.taxCents;
  if (
    typeof raw.receipt === 'string' &&
    raw.receipt.startsWith('belege/') &&
    !raw.receipt.includes('..')
  )
    b.receipt = raw.receipt.slice(0, 200);
  if (raw.source === 'import' || raw.source === 'rec') b.source = raw.source;
  return b;
}

export function cleanSettings(raw, fields) {
  const cats = Array.isArray(raw?.categories) ? raw.categories : [];
  const categories = cats
    .filter((c) => c && typeof c.id === 'string' && /^[\w-]{1,60}$/.test(c.id) && c.name)
    .map((c) => ({
      id: c.id,
      name: str(c.name, 60),
      kind: c.kind in KINDS ? c.kind : 'expense',
      budget: cents(c.budget) ?? 0,
      tax: typeof c.tax === 'string' && c.tax in fields ? c.tax : '',
    }));
  const rules = (Array.isArray(raw?.rules) ? raw.rules : [])
    .filter((r) => r && typeof r.match === 'string' && r.match.trim() && typeof r.cat === 'string')
    .map((r) => ({ match: str(r.match, 200), cat: str(r.cat, 60) }));
  return { categories, rules };
}

export function cleanRecurring(raw) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof raw.id !== 'string' ||
    !/^[\w-]{1,60}$/.test(raw.id)
  )
    return null;
  const amount = cents(raw.cents);
  if (amount === null || !isMonth(raw.start)) return null;
  return {
    id: raw.id,
    text: str(raw.text, 200),
    cents: amount,
    kind: raw.kind in KINDS ? raw.kind : 'expense',
    cat: str(raw.cat, 60),
    every: [1, 3, 6, 12].includes(raw.every) ? raw.every : 1,
    day: Number.isInteger(raw.day) && raw.day >= 1 && raw.day <= 28 ? raw.day : 1,
    start: raw.start,
    end: isMonth(raw.end) ? raw.end : '',
    until: isMonth(raw.until) ? raw.until : '',
  };
}

export function cleanProfile(raw) {
  const num = (v, max) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : 0;
  return {
    commuteKm: num(raw?.commuteKm, 1000),
    commuteDays: num(raw?.commuteDays, 366),
    homeofficeDays: num(raw?.homeofficeDays, 366),
    children: num(raw?.children, 20),
    married: raw?.married === true,
    car: raw?.car === true,
    income: num(raw?.income, 1e11),
    employee: raw?.employee !== false,
  };
}

/** First rule whose words occur in party or text (case-insensitive) → category id, or "". */
export function matchRule(rules, booking, categories) {
  const hay = `${booking.party} ${booking.text}`.toUpperCase();
  for (const rule of rules) {
    const words = rule.match
      .split('|')
      .map((w) => w.trim().toUpperCase())
      .filter(Boolean);
    if (words.some((w) => hay.includes(w)) && categories.some((c) => c.id === rule.cat))
      return rule.cat;
  }
  return '';
}

/** Months "YYYY-MM" from start through end, inclusive. */
export function monthsBetween(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Bookings a standing order still owes up to today: [{ month, booking }], deterministic ids. */
export function dueRecurring(rec, today) {
  const current = today.slice(0, 7);
  const last = rec.end && rec.end < current ? rec.end : current;
  if (rec.start > last) return [];
  const out = [];
  monthsBetween(rec.start, last).forEach((month, index) => {
    if (index % rec.every !== 0 || (rec.until && month <= rec.until)) return;
    const date = `${month}-${String(rec.day).padStart(2, '0')}`;
    if (date > today) return;
    out.push({
      month,
      booking: {
        id: `r-${rec.id}-${month}`,
        date,
        cents: rec.cents,
        kind: rec.kind,
        cat: rec.cat,
        text: rec.text,
        party: '',
        source: 'rec',
      },
    });
  });
  return out;
}
