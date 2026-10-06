// Storage in the app's own tables (ADR 0022): bookings, fixed costs, categories, import rules and
// tax profiles. The rows are turned into the objects the app works with by the `clean*` functions
// of data.js, so a row can never carry something the screens do not expect.
import {
  cleanBooking,
  cleanProfile,
  cleanRecurring,
  cleanSettings,
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
} from './data.js';

/** Months are stored as the first day of the month. */
const monthDate = (m) => (m ? `${m}-01` : null);
const dateMonth = (d) => (typeof d === 'string' ? d.slice(0, 7) : '');

/* ---------- rows <-> objects ---------- */
export function bookingToRow(b) {
  return {
    id: b.id,
    booked_on: b.date,
    cents: b.cents,
    kind: b.kind,
    cat: b.cat,
    text: b.text,
    party: b.party,
    tax_field: b.taxField ?? null,
    tax_cents: b.taxCents ?? null,
    receipt: b.receipt ?? null,
    source: b.source ?? null,
    rec_id: b.rec ?? null,
  };
}

export function rowBooking(r, fields) {
  return cleanBooking(
    {
      id: r.id,
      date: r.booked_on,
      cents: r.cents,
      kind: r.kind,
      cat: r.cat,
      text: r.text,
      party: r.party,
      taxField: r.tax_field ?? undefined,
      taxCents: r.tax_cents ?? undefined,
      receipt: r.receipt ?? undefined,
      source: r.source ?? undefined,
      rec: r.rec_id ?? undefined,
    },
    fields,
  );
}

export function recRow(r) {
  return {
    id: r.id,
    text: r.text,
    cents: r.cents,
    kind: r.kind,
    cat: r.cat,
    every: r.every,
    day: r.day,
    start_month: monthDate(r.start),
    end_month: monthDate(r.end),
    until_month: monthDate(r.until),
    type: r.type,
    match: r.match,
    changes: r.changes,
    note: r.note,
  };
}

export function rowRec(r) {
  return cleanRecurring({
    id: r.id,
    text: r.text,
    cents: r.cents,
    kind: r.kind,
    cat: r.cat,
    every: r.every,
    day: r.day,
    start: dateMonth(r.start_month),
    end: dateMonth(r.end_month),
    until: dateMonth(r.until_month),
    type: r.type,
    match: r.match,
    changes: r.changes,
    note: r.note,
  });
}

export function profileRow(year, p) {
  return {
    id: String(year),
    year,
    commute_km: p.commuteKm,
    commute_days: p.commuteDays,
    homeoffice_days: p.homeofficeDays,
    children: p.children,
    married: p.married,
    car: p.car,
    income: p.income,
    employee: p.employee,
  };
}

export function rowProfile(r) {
  return cleanProfile({
    commuteKm: Number(r.commute_km),
    commuteDays: Number(r.commute_days),
    homeofficeDays: Number(r.homeoffice_days),
    children: Number(r.children),
    married: r.married,
    car: r.car,
    income: Number(r.income),
    employee: r.employee,
  });
}

/** The categories and rules of the settings as rows; the position is the order in the list. */
export function settingsRows(settings) {
  return {
    categories: settings.categories.map((c, position) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      budget_cents: c.budget,
      tax_field: c.tax,
      position,
    })),
    rules: settings.rules.map((r, position) => ({
      id: String(position),
      match: r.match,
      cat: r.cat,
      position,
    })),
  };
}

export function rowsSettings(categories, rules, fields) {
  const byPosition = (a, b) => a.position - b.position;
  return cleanSettings(
    {
      categories: [...categories].sort(byPosition).map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        budget: c.budget_cents,
        tax: c.tax_field,
      })),
      rules: [...rules].sort(byPosition).map((r) => ({ match: r.match, cat: r.cat })),
    },
    fields,
  );
}

/* ---------- the tables ---------- */
const KEY = { conflict: 'owner_id,id' };
export const bookingTable = (mn) => mn.table('bookings', KEY);
export const recTable = (mn) => mn.table('recurring', KEY);
export const categoryTable = (mn) => mn.table('categories', KEY);
export const ruleTable = (mn) => mn.table('rules', KEY);
export const profileTable = (mn) => mn.table('tax_profiles', KEY);

/** The flag in kv that says the old kv entries were copied. */
export const MIGRATED = 'meta:tablesFrom';

/** All bookings of every year (the offline copy when there is no connection). */
export async function loadBookings(mn, fields) {
  return (await bookingTable(mn).list()).map((r) => rowBooking(r, fields)).filter(Boolean);
}

export async function loadRecurring(mn) {
  return (await recTable(mn).list()).map(rowRec).filter(Boolean);
}

export async function loadProfile(mn, year) {
  const row = await profileTable(mn).get(String(year));
  return cleanProfile(row ? rowProfile(row) : null);
}

export async function loadProfiles(mn) {
  return Object.fromEntries((await profileTable(mn).list()).map((r) => [r.id, rowProfile(r)]));
}

/** The settings, or null when there are no categories (a fresh account). */
export async function loadSettings(mn, fields) {
  const [categories, rules] = await Promise.all([categoryTable(mn).list(), ruleTable(mn).list()]);
  return categories.length ? rowsSettings(categories, rules, fields) : null;
}

/** Writes the settings: every category and rule as a row, rows that are gone are removed. */
export async function saveSettingsRows(mn, settings) {
  const rows = settingsRows(settings);
  const [oldCats, oldRules] = await Promise.all([categoryTable(mn).list(), ruleTable(mn).list()]);
  await categoryTable(mn).upsertMany(rows.categories);
  await ruleTable(mn).upsertMany(rows.rules);
  const keepCats = new Set(rows.categories.map((c) => c.id));
  const keepRules = new Set(rows.rules.map((r) => r.id));
  for (const c of oldCats) if (!keepCats.has(c.id)) await categoryTable(mn).remove(c.id);
  for (const r of oldRules) if (!keepRules.has(r.id)) await ruleTable(mn).remove(r.id);
}

/**
 * Copies what older versions kept as kv entries into the tables, once: bookings (tx:<date>:<id>),
 * fixed costs (rec:<id>), tax profiles (profile:<year>) and the settings entry (categories and
 * rules; a fresh account gets the starting categories). Rows that exist already are never
 * overwritten, since another device may have copied or edited them. The kv entries stay as a
 * backup. A failure leaves the flag unset, so the next start tries again.
 */
// kv-collection-ok: reads the old kv entries once to copy them into the tables
export async function copyFromKv(mn, fields) {
  if (await mn.kv.get(MIGRATED)) return;
  const [txs, recs, profiles, settings, haveBookings, haveRecs, haveProfiles, haveCats] =
    await Promise.all([
      mn.kv.list('tx:'),
      mn.kv.list('rec:'),
      mn.kv.list('profile:'),
      mn.kv.get('settings'),
      bookingTable(mn).list(),
      recTable(mn).list(),
      profileTable(mn).list(),
      categoryTable(mn).list(),
    ]);
  const inTable = new Set(haveBookings.map((r) => r.id));
  const inRun = new Set();
  const bookings = [];
  for (const { value } of txs) {
    const b = cleanBooking(value, fields);
    if (!b || inTable.has(b.id)) continue;
    // The key had the day in it, so two bookings could share an id; the table needs it unique.
    if (inRun.has(b.id)) b.id = `${b.id}-${b.date}`.slice(0, 90);
    if (inRun.has(b.id)) continue;
    inRun.add(b.id);
    bookings.push(b);
  }
  await bookingTable(mn).upsertMany(bookings.map(bookingToRow));

  const hasRec = new Set(haveRecs.map((r) => r.id));
  for (const { value } of recs) {
    const r = cleanRecurring(value);
    if (r && !hasRec.has(r.id)) await recTable(mn).upsert(recRow(r));
  }
  const hasProfile = new Set(haveProfiles.map((r) => r.id));
  for (const { key, value } of profiles) {
    const year = key.slice('profile:'.length);
    if (/^\d{4}$/.test(year) && !hasProfile.has(year))
      await profileTable(mn).upsert(profileRow(Number(year), cleanProfile(value)));
  }
  if (!haveCats.length) {
    const next = settings
      ? cleanSettings(settings, fields)
      : { categories: DEFAULT_CATEGORIES, rules: DEFAULT_RULES };
    await saveSettingsRows(mn, next);
  }
  await mn.kv.set(MIGRATED, Date.now());
}
