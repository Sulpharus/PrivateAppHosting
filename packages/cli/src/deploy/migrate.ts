// Applies hosted/<slug>/db/*.sql in filename order, each in its own transaction, recording a
// checksum so re-deploys skip applied files and edited, already-applied files fail loudly.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { appSchemaName } from '@mininode/manifest';
import postgres from 'postgres';

interface MigrationFile {
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

type Plan = { apply: MigrationFile[]; changed: string[] };

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

/**
 * The schemas the Data API exposes now; stops unless the setting was really read. The Management
 * API now and then answers 5xx or 429 for a valid token and works seconds later: a few tries.
 */
async function readExposed(
  fetcher: typeof fetch,
  base: string,
  headers: Record<string, string>,
  retryMs = 3000,
): Promise<string[]> {
  let response = await fetcher(base, { headers });
  for (
    let attempt = 1;
    attempt < 4 && (response.status >= 500 || response.status === 429);
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, retryMs * attempt));
    response = await fetcher(base, { headers });
  }
  if (!response.ok) throw new Error(`reading the exposed schemas failed: ${response.status}`);
  const body = (await response.json()) as { db_schema?: unknown };
  if (typeof body.db_schema !== 'string')
    throw new Error('reading the exposed schemas failed: the answer has no db_schema');
  return body.db_schema
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Adds the app schemas to the Data API's exposed schemas (Supabase Management API). The list is
 * replaced as a whole, so it is only written after it was really read: a guessed list would hide
 * every other app's schema.
 */
export async function exposeSchemas(options: {
  projectRef: string;
  accessToken: string;
  schemas: string[];
  fetcher?: typeof fetch;
  /** Waits between tries of a failed read (tests pass 0). */
  retryMs?: number;
}): Promise<string[]> {
  const fetcher = options.fetcher ?? fetch;
  const base = `https://api.supabase.com/v1/projects/${options.projectRef}/postgrest`;
  const headers = {
    Authorization: `Bearer ${options.accessToken}`,
    'Content-Type': 'application/json',
  };
  const existing = await readExposed(fetcher, base, headers, options.retryMs);
  const wanted = [...new Set([...existing, 'platform', ...options.schemas])];
  const added = wanted.filter((schema) => !existing.includes(schema));
  if (added.length === 0) return [];
  const response = await fetcher(base, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ db_schema: wanted.join(',') }),
  });
  if (!response.ok)
    throw new Error(`exposing schemas failed: ${response.status} ${await response.text()}`);
  return added;
}

/** `app_<slug>` of every hosted app with SQL migrations (`db/`), from its folder name. */
export function appSchemasWithTables(appDirs: string[]): string[] {
  return appDirs
    .filter((dir) => migrationFiles(dir).length > 0)
    .map((dir) => appSchemaName(basename(dir)));
}

/**
 * The app schemas (`app_<slug>`) of these apps that exist in the database. Only those may be
 * exposed: one listed schema that does not exist makes PostgREST fail for every request.
 */
export async function existingAppSchemas(
  databaseUrl: string,
  schemas: string[],
): Promise<string[]> {
  if (schemas.length === 0) return [];
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ nspname: string }[]>`
      select nspname from pg_namespace where nspname = any(${schemas})`;
    const found = new Set(rows.map((row) => row.nspname));
    return schemas.filter((schema) => found.has(schema));
  } finally {
    await sql.end();
  }
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
  const read = () => readExposed(fetcher, base, headers, options.settleMs);
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
