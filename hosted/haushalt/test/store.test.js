// Rows of the tables and back, and the one-time copy of the old kv entries.
import { describe, expect, it } from 'vitest';
import { cleanBooking, DEFAULT_CATEGORIES, DEFAULT_RULES, dueRecurring } from '../data.js';
import {
  bookingToRow,
  copyFromKv,
  MIGRATED,
  profileRow,
  recRow,
  rowBooking,
  rowProfile,
  rowRec,
  rowsSettings,
  settingsRows,
} from '../store.js';
import { FIELDS } from '../tax.js';

/** A stand-in for `mn`: kv entries and tables in memory, like the SDK's api. */
function fakeMn(kv = {}) {
  const store = new Map(Object.entries(kv));
  const tables = new Map();
  const table = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    const rows = tables.get(name);
    return {
      list: async () => [...rows.values()],
      get: async (id) => rows.get(id) ?? null,
      upsert: async (row) => void rows.set(row.id, row),
      upsertMany: async (list) => {
        for (const row of list) rows.set(row.id, row);
      },
      remove: async (id) => void rows.delete(id),
    };
  };
  const mn = {
    table,
    kv: {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => void store.set(key, value),
      list: async (prefix) =>
        [...store.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([key, value]) => ({ key, value })),
    },
  };
  return { mn, store, tables };
}

const booking = {
  id: 'abc',
  date: '2026-03-04',
  cents: 12345,
  kind: 'expense',
  cat: 'handwerker',
  text: 'Heizung',
  party: 'Firma',
  taxField: 'hh_handwerker',
  taxCents: 9000,
  receipt: 'belege/a.pdf',
  source: 'import',
  rec: 'miete',
};

describe('rows and objects', () => {
  it('keeps a booking with every field, and one without the optional ones', () => {
    const fields = FIELDS;
    const fieldId = Object.keys(fields)[0];
    const full = cleanBooking({ ...booking, taxField: fieldId }, fields);
    expect(rowBooking(bookingToRow(full), fields)).toEqual(full);
    const plain = cleanBooking({ id: 'x', date: '2026-01-01', cents: 1, text: 't' }, fields);
    const row = bookingToRow(plain);
    expect(row).toMatchObject({ tax_field: null, tax_cents: null, receipt: null, rec_id: null });
    expect(rowBooking(row, fields)).toEqual(plain);
  });

  it('keeps a fixed cost with its price changes, as months of the first day', () => {
    const rec = {
      id: 'netflix',
      text: 'Netflix',
      cents: 1299,
      kind: 'expense',
      cat: 'abos',
      every: 1,
      day: 5,
      start: '2025-01',
      end: '',
      until: '2026-02',
      type: 'abo',
      match: 'NETFLIX',
      changes: [{ from: '2026-01', cents: 1499 }],
      note: '',
    };
    const row = recRow(rec);
    expect(row).toMatchObject({
      start_month: '2025-01-01',
      end_month: null,
      until_month: '2026-02-01',
    });
    expect(rowRec(row)).toEqual(rec);
  });

  it('keeps the bookings a fixed cost made, deterministic ids included', () => {
    const [due] = dueRecurring(
      {
        id: 'miete',
        text: 'Miete',
        cents: 90000,
        kind: 'expense',
        cat: 'miete',
        every: 1,
        day: 1,
        start: '2026-02',
        end: '',
        until: '',
      },
      '2026-02-10',
    );
    const b = cleanBooking(due.booking, FIELDS);
    expect(rowBooking(bookingToRow(b), FIELDS)).toEqual(b);
  });

  it('keeps a tax profile', () => {
    const p = {
      commuteKm: 12.5,
      commuteDays: 200,
      homeofficeDays: 40,
      children: 2,
      married: true,
      car: false,
      income: 54321.5,
      employee: true,
    };
    expect(rowProfile(profileRow(2025, p))).toEqual(p);
    expect(profileRow(2025, p)).toMatchObject({ id: '2025', year: 2025 });
  });

  it('keeps the order of categories and rules', () => {
    const settings = { categories: DEFAULT_CATEGORIES, rules: DEFAULT_RULES };
    const rows = settingsRows(settings);
    const shuffled = {
      categories: [...rows.categories].reverse(),
      rules: [...rows.rules].reverse(),
    };
    expect(rowsSettings(shuffled.categories, shuffled.rules, FIELDS)).toEqual(
      rowsSettings(rows.categories, rows.rules, FIELDS),
    );
    expect(rowsSettings(rows.categories, rows.rules, FIELDS).rules.map((r) => r.cat)).toEqual(
      DEFAULT_RULES.map((r) => r.cat),
    );
  });
});

describe('copy from the old kv storage', () => {
  const old = {
    'tx:2026-03-04:abc': {
      id: 'abc',
      date: '2026-03-04',
      cents: 500,
      kind: 'expense',
      cat: '',
      text: 'a',
      party: '',
    },
    'tx:2026-03-05:abc': {
      id: 'abc',
      date: '2026-03-05',
      cents: 700,
      kind: 'expense',
      cat: '',
      text: 'b',
      party: '',
    },
    'tx:2026-03-06:bad': { id: 'bad', date: 'not a day', cents: 1 },
    'rec:miete': {
      id: 'miete',
      text: 'Miete',
      cents: 90000,
      kind: 'expense',
      cat: 'miete',
      every: 1,
      day: 1,
      start: '2026-01',
    },
    'profile:2025': { commuteKm: 10, income: 40000 },
    settings: {
      categories: [{ id: 'eigen', name: 'Eigene', kind: 'expense', budget: 5000, tax: '' }],
      rules: [{ match: 'X', cat: 'eigen' }],
    },
  };

  it('copies everything once, repairs a shared id, skips unusable entries and keeps kv', async () => {
    const { mn, store, tables } = fakeMn(old);
    await copyFromKv(mn, FIELDS);
    const ids = [...tables.get('bookings').keys()].sort();
    expect(ids).toEqual(['abc', 'abc-2026-03-05']);
    expect([...tables.get('recurring').keys()]).toEqual(['miete']);
    expect(tables.get('tax_profiles').get('2025')).toMatchObject({
      commute_km: 10,
      income: 40000,
      year: 2025,
    });
    expect([...tables.get('categories').keys()]).toEqual(['eigen']);
    expect(tables.get('rules').get('0')).toMatchObject({ match: 'X', cat: 'eigen' });
    expect(store.has('tx:2026-03-04:abc')).toBe(true);
    expect(store.has(MIGRATED)).toBe(true);
    // a second start does nothing, even after a row was deleted
    tables.get('bookings').delete('abc');
    await copyFromKv(mn, FIELDS);
    expect(tables.get('bookings').has('abc')).toBe(false);
  });

  it('does not overwrite what is in the tables, and seeds the starting categories for a new account', async () => {
    const { mn, tables } = fakeMn({ 'tx:2026-03-04:abc': old['tx:2026-03-04:abc'] });
    await mn.table('bookings').upsert({
      id: 'abc',
      booked_on: '2026-03-09',
      cents: 1,
      kind: 'expense',
      cat: '',
      text: 'neu',
      party: '',
    });
    await copyFromKv(mn, FIELDS);
    expect(tables.get('bookings').get('abc').text).toBe('neu');
    expect(tables.get('categories').size).toBe(DEFAULT_CATEGORIES.length);
    expect(tables.get('rules').size).toBe(DEFAULT_RULES.length);
  });
});
