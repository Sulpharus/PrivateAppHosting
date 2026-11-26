// The data of the app: five tables through mn.table (offline-capable, one queue) plus settings in
// mn.kv. Rows are kept in memory after loading; every write goes to the table and the memory copy.
import { withTotals } from './invoice.js';

export const TABLES = ['customers', 'items', 'invoices', 'payments', 'history'];
const TRASH_DAYS = 30;
const HISTORY_KEEP = 20;

// Every column of every table (upsert writes whole rows: a missing column would be cleared).
const COLUMNS = {
  customers: {
    name: '',
    contact: null,
    email: null,
    phone: null,
    street: null,
    zip: null,
    city: null,
    country: 'DE',
    vat_id: null,
    number: null,
    payment_days: null,
    notes: null,
    is_sample: false,
    deleted_at: null,
  },
  items: {
    kind: 'service',
    title: '',
    description: null,
    unit: null,
    price_cents: 0,
    tax_bp: 0,
    number: null,
    is_sample: false,
    deleted_at: null,
  },
  invoices: {
    kind: 'invoice',
    status: 'draft',
    number: null,
    customer_id: null,
    customer: {},
    seller: {},
    lines: [],
    tax_mode: 'standard',
    lang: 'de',
    layout: 'din',
    issue_date: null,
    service_date: null,
    service_end: null,
    due_date: null,
    net_cents: 0,
    tax_cents: 0,
    gross_cents: 0,
    reference: null,
    intro: null,
    closing: null,
    cancels_id: null,
    pdf_path: null,
    attachments: [],
    sent_at: null,
    reminded_on: null,
    is_sample: false,
    deleted_at: null,
  },
  payments: { invoice_id: null, paid_on: null, amount_cents: 0, note: null, is_sample: false },
  history: { item_id: null, at: null, changes: {} },
};

// The length limits of the text columns, exactly as in db/001_init.sql: a longer text would be
// refused by the database (and an offline change refused at sync is lost).
export const LIMITS = {
  customers: {
    name: 200,
    contact: 200,
    email: 200,
    phone: 60,
    street: 200,
    zip: 20,
    city: 120,
    vat_id: 20,
    number: 40,
    notes: 20000,
  },
  items: { title: 200, description: 2000, unit: 20, number: 40 },
  invoices: { number: 40, reference: 120, intro: 4000, closing: 4000, pdf_path: 200 },
  payments: { note: 300 },
  history: {},
};

const ENUMS = {
  customers: {},
  items: { kind: ['service', 'product'] },
  invoices: {
    kind: ['invoice', 'cancellation'],
    status: ['draft', 'issued', 'cancelled'],
    tax_mode: ['standard', 'small', 'reverse', 'intra', 'export', 'nontaxable'],
    lang: ['de', 'en'],
    layout: ['din', 'modern', 'compact'],
  },
  payments: {},
  history: {},
};

/** A row with exactly the table's columns, unknown fields dropped and defaults filled in. */
export function shape(table, row) {
  const out = { id: row.id };
  for (const [column, fallback] of Object.entries(COLUMNS[table])) {
    let value = row[column] === undefined ? fallback : row[column];
    if (typeof value === 'string') {
      const limit = LIMITS[table][column];
      if (limit) value = value.slice(0, limit);
      if (value === '' && fallback === null) value = null;
    }
    const allowed = ENUMS[table][column];
    if (allowed && !allowed.includes(value)) value = fallback;
    out[column] = value;
  }
  if (table === 'customers' && !/^[A-Z]{2}$/.test(String(out.country))) out.country = 'DE';
  if (table === 'invoices') return withTotals(out);
  return out;
}

export function createStore(mn) {
  const rows = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
  const tables = Object.fromEntries(TABLES.map((t) => [t, mn.table(t)]));

  const store = {
    rows,
    newId: () => tables.invoices.newId(),

    async load() {
      const lists = await Promise.all(TABLES.map((t) => tables[t].list()));
      TABLES.forEach((t, i) => {
        rows[t] = new Map(lists[i].map((r) => [r.id, r]));
      });
      store.rows = rows;
    },

    all(table, { deleted = false } = {}) {
      const list = [...rows[table].values()];
      return deleted ? list : list.filter((r) => !r.deleted_at);
    },

    get(table, id) {
      return rows[table].get(id) ?? null;
    },

    async save(table, row) {
      const shaped = shape(table, { ...(rows[table].get(row.id) ?? {}), ...row });
      const before = rows[table].get(row.id);
      rows[table].set(shaped.id, { ...before, ...shaped });
      await tables[table].upsert(shaped);
      return rows[table].get(shaped.id);
    },

    async saveMany(table, list) {
      const shaped = list.map((row) =>
        shape(table, { ...(rows[table].get(row.id) ?? {}), ...row }),
      );
      for (const row of shaped) rows[table].set(row.id, { ...rows[table].get(row.id), ...row });
      if (shaped.length) await tables[table].upsertMany(shaped);
    },

    async remove(table, id) {
      rows[table].delete(id);
      await tables[table].remove(id);
    },

    async softDelete(table, id) {
      const row = rows[table].get(id);
      if (!row) return null;
      return store.save(table, { ...row, deleted_at: new Date().toISOString() });
    },

    async restore(table, id) {
      const row = rows[table].get(id);
      if (!row) return null;
      return store.save(table, { ...row, deleted_at: null });
    },

    /** Entries in the bin (deleted, not purged), newest first. */
    trash() {
      const list = [];
      for (const table of ['invoices', 'customers', 'items'])
        for (const row of rows[table].values()) if (row.deleted_at) list.push({ table, row });
      return list.sort((a, b) => String(b.row.deleted_at).localeCompare(String(a.row.deleted_at)));
    },

    /** Removes bin entries older than 30 days; returns the purged invoices (their files go too). */
    async purge(now = Date.now()) {
      const cutoff = now - TRASH_DAYS * 86400000;
      const purged = [];
      for (const { table, row } of store.trash())
        if (Date.parse(row.deleted_at) < cutoff) {
          purged.push({ table, row });
          await store.purgeOne(table, row.id);
        }
      return purged;
    },

    /** Deletes a row for good, with what hangs on it. */
    async purgeOne(table, id) {
      if (table === 'invoices') {
        for (const p of store.all('payments')) if (p.invoice_id === id) rows.payments.delete(p.id);
        for (const h of store.all('history')) if (h.item_id === id) rows.history.delete(h.id);
      }
      if (table === 'customers')
        for (const inv of rows.invoices.values())
          if (inv.customer_id === id) rows.invoices.set(inv.id, { ...inv, customer_id: null });
      await store.remove(table, id);
    },

    /** Notes a change of an invoice; keeps the last 20 per invoice. */
    async log(invoiceId, action, details = {}) {
      const entry = {
        id: store.newId(),
        item_id: invoiceId,
        at: new Date().toISOString(),
        changes: { action, ...details },
      };
      await store.save('history', entry);
      const list = store
        .all('history')
        .filter((h) => h.item_id === invoiceId)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
      for (const old of list.slice(HISTORY_KEEP)) await store.remove('history', old.id);
    },

    historyOf(invoiceId) {
      return store
        .all('history')
        .filter((h) => h.item_id === invoiceId)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    },

    paymentsOf(invoiceId) {
      return store
        .all('payments')
        .filter((p) => p.invoice_id === invoiceId)
        .sort((a, b) => String(a.paid_on).localeCompare(String(b.paid_on)));
    },
  };
  return store;
}
