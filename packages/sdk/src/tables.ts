// Rows of the app's own tables (`app_<slug>`), offline like `mn.kv`: the same local copy and the
// same queue of changes (offline.ts). A table needs `id uuid primary key`; `owner_id` is filled by
// the database (`platform.secure_table`). For queries, joins and sums on the server use `mn.db`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { appSchema } from './config.ts';
import type { Json } from './kv.ts';
import type { RemoteKv } from './offline.ts';

/** Rows per request; must not exceed PostgREST's max_rows (supabase/config.toml). */
const PAGE = 1000;
const TABLE = /^[a-z][a-z0-9_]{0,62}$/;
/** Filled by the database: sending them back would only fail the row-level policy. */
const SERVER_COLUMNS = ['owner_id', 'created_at', 'updated_at'];

export interface TableRow {
  id: string;
  [column: string]: unknown;
}

export interface TableHandle<Row extends TableRow = TableRow> {
  /** A new row id (uuid), made on this device so rows can be added offline. */
  newId(): string;
  /** All rows of the table (the local copy offline; refreshed from the server online). */
  list(): Promise<Row[]>;
  get(id: string): Promise<Row | null>;
  /** Inserts or replaces the row with this `id`; offline it is queued and sent later. */
  upsert(row: Row): Promise<void>;
  /** Several rows, one after the other. */
  upsertMany(rows: Row[]): Promise<void>;
  remove(id: string): Promise<void>;
}

export type TableFactory = <Row extends TableRow = TableRow>(name: string) => TableHandle<Row>;

function failure(error: { message: string }, status: number): Error {
  return Object.assign(error instanceof Error ? error : new Error(error.message), error, {
    status,
  });
}

/** `<table>/<id>` → its parts. */
function split(key: string): { table: string; id: string } {
  const at = key.indexOf('/');
  const table = key.slice(0, at);
  const id = key.slice(at + 1);
  if (at < 1 || !id || !TABLE.test(table)) throw new Error(`mininode: bad table key ${key}`);
  return { table, id };
}

/** The server side of the rows: the app's tables through PostgREST. */
export function createTableRemote(supabase: SupabaseClient, appSlug: string): RemoteKv {
  const schema = () => supabase.schema(appSchema(appSlug));
  return {
    async get(key) {
      const { table, id } = split(key);
      const { data, error, status } = await schema()
        .from(table)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw failure(error, status);
      return (data as Json | null) ?? null;
    },

    async set(key, value) {
      const { table, id } = split(key);
      const row: Record<string, Json> = { ...(value as Record<string, Json>), id };
      for (const column of SERVER_COLUMNS) delete row[column];
      const { error, status } = await schema().from(table).upsert(row, { onConflict: 'id' });
      if (error) throw failure(error, status);
    },

    async delete(key) {
      const { table, id } = split(key);
      const { error, status } = await schema().from(table).delete().eq('id', id);
      if (error) throw failure(error, status);
    },

    async list(prefix = '') {
      const table = prefix.replace(/\/$/, '');
      if (!TABLE.test(table)) throw new Error(`mininode: bad table name ${table}`);
      const out: { key: string; value: Json }[] = [];
      // PostgREST caps every response (max_rows, 1000 on Supabase): page until a short page.
      for (let from = 0; ; from += PAGE) {
        const { data, error, status } = await schema()
          .from(table)
          .select('*')
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) throw failure(error, status);
        const rows = (data ?? []) as { id: string }[];
        for (const row of rows)
          out.push({ key: `${table}/${row.id}`, value: row as unknown as Json });
        if (rows.length < PAGE) return out;
      }
    },
  };
}

/** What `mn.table(name)` returns: rows through the offline copy and queue. */
export function createTables(rows: {
  get(key: string): Promise<Json | null>;
  list(prefix: string): Promise<{ key: string; value: Json }[]>;
  set(key: string, value: Json): Promise<void>;
  delete(key: string): Promise<void>;
}): TableFactory {
  return <Row extends TableRow = TableRow>(name: string): TableHandle<Row> => {
    if (!TABLE.test(name)) throw new Error(`mininode: bad table name ${name}`);
    const key = (id: string) => {
      if (!id || id.includes('/')) throw new Error('mininode: a row needs an id without "/"');
      return `${name}/${id}`;
    };
    const upsert = async (row: Row) => rows.set(key(row.id), row as unknown as Json);
    return {
      newId: () => crypto.randomUUID(),
      async list() {
        return (await rows.list(`${name}/`)).map((entry) => entry.value as unknown as Row);
      },
      async get(id) {
        return ((await rows.get(key(id))) as unknown as Row | null) ?? null;
      },
      upsert,
      async upsertMany(list) {
        for (const row of list) await upsert(row);
      },
      remove: async (id) => rows.delete(key(id)),
    };
  };
}
