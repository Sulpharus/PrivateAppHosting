// `mininode backup create`: writes one folder with everything needed to rebuild the platform's
// data: the database (data only; the structure comes from the migrations), the files in
// Storage, readable copies of the hosting settings and a manifest with a checksum per file.
// The folder is not encrypted: the backup workflow packs it into a password-protected archive.

import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import {
  BACKUP_FORMAT,
  type BackupBucket,
  type BackupFile,
  type BackupManifest,
  MANIFEST_FILE,
  sha256File,
} from './manifest.ts';
import { finished, pickRunner } from './pg.ts';
import { download, inParallel, listBuckets, listObjects, type ObjectInfo } from './storage.ts';

export interface CreateOptions {
  databaseUrl: string;
  supabaseUrl: string;
  serviceKey: string;
  out: string;
  /** Copy the files in Storage too (default). */
  files?: boolean;
  commit?: string | null;
  log?: (message: string) => void;
}

/**
 * The accounts of the sign-in service: people, their logins and second factors, passkeys.
 * Sessions, tokens and the service's own bookkeeping are left out: everybody signs in again.
 */
export const AUTH_TABLES = ['users', 'identities', 'mfa_factors', 'webauthn_credentials'];

/** The hosting settings that are worth reading without a database tool. */
export const READABLE_SETTINGS = [
  'apps',
  'app_categories',
  'app_grants',
  'app_origins',
  'app_sets',
  'app_set_items',
  'app_type_grants',
  'app_api_services',
  'api_services',
  'ai_budgets',
  'profiles',
  'record_types',
];

/** Columns that hold keys or hashes stay out of the readable copies (the dump has them all). */
export const SECRET_COLUMN = /(_enc$|cipher|secret|token|hash|password|key_value|api_?key|_key$)/i;

export function readableRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([name]) => !SECRET_COLUMN.test(name)));
}

function readme(manifest: BackupManifest): string {
  return `MiniNode backup, ${manifest.createdAt}
================================================

This folder holds the data of the platform. It is not usable on its own: restore it with
\`pnpm mininode backup restore <this folder>\` (docs/runbooks/backups.md in the repository).

  database/data.dump     all rows of platform, the app schemas and the sign-in accounts
                         (password hashes included), PostgreSQL custom format, data only
  database/tables.json   which tables and how many rows
  storage/               the files of the apps (storage/files/<bucket>/<number>.<ext>) and
                         the bucket settings; objects.json says which file is which object
  settings/              readable copies of the hosting settings and the list of accounts;
                         keys and hashes are left out there
  manifest.json          what is inside, with a SHA-256 checksum for every file

Not inside, on purpose: the secrets of the Workers and the GitHub environment (re-enter them from
your password manager, see "Secrets" in the runbook) and the code of the apps (it is in git).

Treat this folder like the passwords it contains: anyone who has it has all accounts' data.
`;
}

function walk(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(root, join(dir, entry.name))
      : [relative(root, join(dir, entry.name))],
  );
}

export async function createBackup(options: CreateOptions): Promise<BackupManifest> {
  const log = options.log ?? (() => {});
  const files = options.files ?? true;
  const out = options.out;
  if (existsSync(out) && readdirSync(out).length > 0)
    throw new Error(`${out} is not empty: choose a new folder`);
  for (const sub of ['database', 'settings', 'storage'])
    mkdirSync(join(out, sub), { recursive: true });

  const sql = postgres(options.databaseUrl, { max: 1, onnotice: () => {} });
  let manifest: Omit<BackupManifest, 'files'>;
  try {
    // One snapshot for the counts, the readable copies and pg_dump (it joins through
    // pg_export_snapshot), so the manifest describes exactly what the dump holds even while the
    // platform is being used. The transaction stays open until the dump is done.
    manifest = await sql.begin('isolation level repeatable read read only', async (tx) => {
      const [snapshot] = await tx<{ id: string }[]>`select pg_export_snapshot() as id`;
      const [{ version = '', number = 170000 } = {}] = await tx<
        { version: string; number: number }[]
      >`
        select current_setting('server_version') as version,
               current_setting('server_version_num')::int as number`;
      const major = Math.floor(number / 10000);

      const tableRows = await tx<{ schema: string; table: string }[]>`
        select schemaname as schema, tablename as "table"
        from pg_tables
        where schemaname = 'platform'
           or schemaname like 'app\_%'
           or (schemaname = 'auth' and tablename = any(${AUTH_TABLES}))
        order by schemaname, tablename`;
      const tables: BackupManifest['database']['tables'] = [];
      for (const { schema, table } of tableRows) {
        const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`
          select count(*)::int as n from ${tx(schema)}.${tx(table)}`;
        tables.push({ schema, table, rows: n });
      }
      const schemas = [...new Set(tables.map((t) => t.schema))];

      // Checked first: a missing table would abort the transaction.
      const [{ present = false } = {}] = await tx<{ present: boolean }[]>`
        select to_regclass('supabase_migrations.schema_migrations') is not null as present`;
      const migrations = present
        ? await tx<{ version: string }[]>`
            select version from supabase_migrations.schema_migrations order by version`
        : [];

      log(
        `database: ${tables.length} tables in ${schemas.length} schemas, ${tables.reduce((n, t) => n + t.rows, 0)} rows`,
      );

      // The dump: data only. The structure (tables, policies, grants) is the migrations' business
      // and stays exactly as they define it, so a restore cannot loosen any rule.
      const runner = pickRunner(options.databaseUrl, major);
      log(`pg_dump (${runner.kind})`);
      const dump = runner.start(
        'pg_dump',
        [
          '--format=custom',
          '--data-only',
          '--no-owner',
          '--no-privileges',
          `--snapshot=${snapshot?.id ?? ''}`,
          '--table=platform.*',
          '--table=app_*.*',
          ...AUTH_TABLES.map((table) => `--table=auth.${table}`),
        ],
        { stdout: true },
      );
      if (!dump.stdout) throw new Error('pg_dump has no output');
      const written = pipeline(dump.stdout, createWriteStream(join(out, 'database', 'data.dump')));
      await Promise.all([finished(dump, 'pg_dump'), written]);
      writeFileSync(join(out, 'database', 'tables.json'), `${JSON.stringify(tables, null, 2)}\n`);

      // Readable settings (without keys and hashes) and the list of accounts.
      for (const table of READABLE_SETTINGS) {
        if (!tables.some((t) => t.schema === 'platform' && t.table === table)) continue;
        const rows = await tx<{ row: Record<string, unknown> }[]>`
          select to_jsonb(t) as row from platform.${tx(table)} t`;
        writeFileSync(
          join(out, 'settings', `platform.${table}.json`),
          `${JSON.stringify(
            rows.map((r) => readableRow(r.row)),
            null,
            2,
          )}\n`,
        );
      }
      const users = await tx`
        select id, email, phone, created_at, last_sign_in_at, email_confirmed_at, banned_until,
               raw_app_meta_data, raw_user_meta_data
        from auth.users order by created_at`;
      writeFileSync(join(out, 'settings', 'accounts.json'), `${JSON.stringify(users, null, 2)}\n`);
      writeFileSync(
        join(out, 'settings', 'deployment.json'),
        `${JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            commit: options.commit ?? null,
            supabaseUrl: options.supabaseUrl,
            serverVersion: version,
            migrations: migrations.length,
            note: 'Worker secrets and GitHub secrets are not part of a backup; see docs/runbooks/backups.md.',
          },
          null,
          2,
        )}\n`,
      );

      return {
        format: BACKUP_FORMAT,
        createdAt: new Date().toISOString(),
        commit: options.commit ?? null,
        database: {
          serverVersion: version,
          migrations: migrations.map((row) => row.version),
          schemas,
          tables,
        },
        storage: { included: files, buckets: [] },
      };
    });
  } finally {
    await sql.end();
  }

  // Storage: bucket settings always, the files unless they were left out.
  const client = createClient(options.supabaseUrl, options.serviceKey, {
    auth: { persistSession: false },
  });
  const buckets = await listBuckets(client);
  const objects: ObjectInfo[] = [];
  const bucketInfo: BackupBucket[] = [];
  for (const bucket of buckets) {
    const list = files ? await listObjects(client, bucket.id) : [];
    objects.push(...list);
    bucketInfo.push({
      ...bucket,
      objects: list.length,
      bytes: list.reduce((n, o) => n + o.bytes, 0),
    });
  }
  const skippedNames: string[] = [];
  const copy: (ObjectInfo & { file: string })[] = [];
  for (const object of objects) {
    if (object.name.split('/').some((segment) => segment === '')) {
      skippedNames.push(`${object.bucket}/${object.name}`);
      continue;
    }
    // The name on disk is only a number (and the extension): object names can be long, contain
    // anything and collide on case-insensitive systems. objects.json maps it to the real name.
    const extension = /\.[A-Za-z0-9]{1,8}$/.exec(object.name)?.[0] ?? '';
    copy.push({
      ...object,
      file: `storage/files/${object.bucket}/${String(copy.length + 1).padStart(8, '0')}${extension.toLowerCase()}`,
    });
  }
  log(`storage: ${bucketInfo.length} buckets, ${copy.length} files`);
  let done = 0;
  await inParallel(copy, 4, async (object) => {
    const target = join(out, object.file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, await download(client, object));
    done++;
    if (done % 100 === 0) log(`  ${done}/${copy.length} files`);
  });
  if (skippedNames.length > 0)
    log(
      `skipped ${skippedNames.length} files with empty path segments: ${skippedNames.join(', ')}`,
    );
  writeFileSync(join(out, 'storage', 'buckets.json'), `${JSON.stringify(buckets, null, 2)}\n`);
  writeFileSync(
    join(out, 'storage', 'objects.json'),
    `${JSON.stringify(
      copy.map(({ bucket, name, bytes, contentType, file }) => ({
        bucket,
        name,
        bytes,
        contentType,
        file,
      })),
      null,
      2,
    )}\n`,
  );
  manifest.storage.buckets = bucketInfo;

  const full: BackupManifest = { ...manifest, files: [] };
  writeFileSync(join(out, 'README-RESTORE.txt'), readme(full));
  const entries: BackupFile[] = [];
  for (const path of walk(out).sort()) {
    const { sha256, bytes } = await sha256File(join(out, path));
    entries.push({ path: path.split('\\').join('/'), bytes, sha256 });
  }
  full.files = entries;
  writeFileSync(join(out, MANIFEST_FILE), `${JSON.stringify(full, null, 2)}\n`);
  return full;
}

/** The commit of the checkout (git), or null outside a repository. */
export function currentCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
