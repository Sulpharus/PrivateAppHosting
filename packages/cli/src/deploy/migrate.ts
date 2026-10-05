// Applies hosted/<slug>/db/*.sql in filename order, each in its own transaction, recording a
// checksum so re-deploys skip applied files and edited, already-applied files fail loudly.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

export interface MigrationFile {
  filename: string;
  sql: string;
  checksum: string;
}

export function migrationFiles(appDir: string): MigrationFile[] {
  const dir = join(appDir, 'db');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const sql = readFileSync(join(dir, filename), 'utf8');
      return { filename, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

export type Plan = { apply: MigrationFile[]; changed: string[] };

export function plan(files: MigrationFile[], applied: Map<string, string>): Plan {
  const changed = files.filter(
    (f) => applied.has(f.filename) && applied.get(f.filename) !== f.checksum,
  );
  return {
    apply: files.filter((f) => !applied.has(f.filename)),
    changed: changed.map((f) => f.filename),
  };
}

export async function migrateApp(
  databaseUrl: string,
  slug: string,
  appDir: string,
): Promise<string[]> {
  const files = migrationFiles(appDir);
  if (files.length === 0) return [];
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ filename: string; checksum: string }[]>`
      select filename, checksum from platform.app_migrations where app_slug = ${slug}`;
    const { apply, changed } = plan(
      files,
      new Map(rows.map((row) => [row.filename, row.checksum])),
    );
    if (changed.length > 0) {
      throw new Error(
        `already-applied migrations were edited: ${changed.join(', ')} — add a new file instead`,
      );
    }
    for (const file of apply) {
      await sql.begin(async (tx) => {
        await tx.unsafe(file.sql);
        await tx`insert into platform.app_migrations (app_slug, filename, checksum)
                 values (${slug}, ${file.filename}, ${file.checksum})`;
      });
    }
    return apply.map((file) => file.filename);
  } finally {
    await sql.end();
  }
}

/** Adds the app schemas to the Data API's exposed schemas (Supabase Management API). */
export async function exposeSchemas(options: {
  projectRef: string;
  accessToken: string;
  schemas: string[];
  fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  const base = `https://api.supabase.com/v1/projects/${options.projectRef}/postgrest`;
  const headers = {
    Authorization: `Bearer ${options.accessToken}`,
    'Content-Type': 'application/json',
  };
  const current = (await (await fetcher(base, { headers })).json()) as { db_schema?: string };
  const existing = (current.db_schema ?? 'public,graphql_public')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const wanted = [...new Set([...existing, 'platform', ...options.schemas])];
  if (wanted.length === existing.length) return;
  const response = await fetcher(base, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ db_schema: wanted.join(',') }),
  });
  if (!response.ok)
    throw new Error(`exposing schemas failed: ${response.status} ${await response.text()}`);
}

/**
 * Takes app schemas out of the Data API's exposed schemas (before they are dropped). Stops with an
 * error unless the setting was really read, and confirms afterwards that the schemas are gone: a
 * dropped schema that is still listed makes PostgREST fail for every request.
 */
export async function unexposeSchemas(options: {
  projectRef: string;
  accessToken: string;
  schemas: string[];
  fetcher?: typeof fetch;
  /** Waits between the checks after the change (tests pass 0). */
  settleMs?: number;
}): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  const base = `https://api.supabase.com/v1/projects/${options.projectRef}/postgrest`;
  const headers = {
    Authorization: `Bearer ${options.accessToken}`,
    'Content-Type': 'application/json',
  };
  const read = async (): Promise<string[]> => {
    const response = await fetcher(base, { headers });
    if (!response.ok) throw new Error(`reading the exposed schemas failed: ${response.status}`);
    const body = (await response.json()) as { db_schema?: unknown };
    if (typeof body.db_schema !== 'string')
      throw new Error('reading the exposed schemas failed: the answer has no db_schema');
    return body.db_schema
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const existing = await read();
  const wanted = existing.filter((schema) => !options.schemas.includes(schema));
  if (wanted.length === existing.length) return;
  const response = await fetcher(base, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ db_schema: wanted.join(',') }),
  });
  if (!response.ok)
    throw new Error(`hiding schemas failed: ${response.status} ${await response.text()}`);
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await read()).every((schema) => !options.schemas.includes(schema))) return;
    await new Promise((resolve) => setTimeout(resolve, options.settleMs ?? 1000));
  }
  throw new Error('the schemas are still exposed after the change; nothing was dropped');
}
