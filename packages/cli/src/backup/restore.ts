// `mininode backup restore`: puts a backup folder back into a Supabase project whose structure
// is already there (the migrations, and the apps' own migrations, have been applied).
//
//   database  every table in the backup is emptied and refilled in one transaction; the
//             triggers do not run (session_replication_role = replica), so nothing is created
//             twice. The transaction is only committed when pg_restore finished cleanly and the
//             row counts match the backup, otherwise it is rolled back. Sessions are not part of
//             a backup: everybody signs in again.
//   storage   buckets are created or brought to their saved settings, every file is uploaded
//             again (an existing file of the same name is replaced).

import { createReadStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import type { BackupManifest } from './manifest.ts';
import { connectionEnv, finished, LOCAL_HOSTS, pickRunner, type Runner } from './pg.ts';
import { type BucketInfo, ensureBucket, inParallel, type ObjectInfo, upload } from './storage.ts';
import { verifyBackup } from './verify.ts';

export interface RestoreOptions {
  dir: string;
  databaseUrl?: string;
  supabaseUrl?: string;
  serviceKey?: string;
  /** Restore the database (default). */
  database?: boolean;
  /** Restore the files in Storage (default). */
  storage?: boolean;
  /** Required for anything that changes the target. */
  yes?: boolean;
  /** Restore although the target lacks migrations of the backup, or other tables refer to it. */
  force?: boolean;
  /** The host of the database, repeated on purpose: required with `yes` for a remote target. */
  confirm?: string;
  /** Tools to run instead of the detected ones (tests). */
  runner?: Runner;
  log?: (message: string) => void;
}

export interface RestorePlan {
  /** Where the database part would go. */
  target: { host: string; database: string } | null;
  /** Tables outside the backup that refer to its tables and are emptied with them (cascade). */
  dependents: string[];
  /** Of those, the ones that are not the sign-in service's own bookkeeping. */
  unexpectedDependents: string[];
  tables: { schema: string; table: string; backup: number; target: number | null }[];
  missingTables: string[];
  missingMigrations: string[];
  buckets: number;
  objects: number;
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const qualified = (schema: string, table: string) => `${quote(schema)}.${quote(table)}`;

/** What a restore would do, from the manifest and the target database. */
export async function planRestore(
  manifest: BackupManifest,
  databaseUrl: string | undefined,
): Promise<RestorePlan> {
  const plan: RestorePlan = {
    target: null,
    dependents: [],
    unexpectedDependents: [],
    tables: [],
    missingTables: [],
    missingMigrations: [],
    buckets: manifest.storage.buckets.length,
    objects: manifest.storage.buckets.reduce((n, b) => n + b.objects, 0),
  };
  if (!databaseUrl) {
    plan.tables = manifest.database.tables.map((t) => ({
      schema: t.schema,
      table: t.table,
      backup: t.rows,
      target: null,
    }));
    return plan;
  }
  const env = connectionEnv(databaseUrl);
  plan.target = { host: env.PGHOST ?? '', database: env.PGDATABASE ?? '' };
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    plan.dependents = await dependentTables(sql, manifest);
    plan.unexpectedDependents = plan.dependents.filter((name) => !name.startsWith('auth.'));
    const present = new Set(
      (
        await sql<{ name: string }[]>`
          select schemaname || '.' || tablename as name from pg_tables`
      ).map((row) => row.name),
    );
    const applied = new Set(
      (
        await sql<{ version: string }[]>`
          select version from supabase_migrations.schema_migrations`.catch(() => [])
      ).map((row) => row.version),
    );
    plan.missingMigrations = manifest.database.migrations.filter((v) => !applied.has(v));
    for (const t of manifest.database.tables) {
      const name = `${t.schema}.${t.table}`;
      if (!present.has(name)) {
        plan.missingTables.push(name);
        plan.tables.push({ schema: t.schema, table: t.table, backup: t.rows, target: null });
        continue;
      }
      const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
        select count(*)::int as n from ${sql(name)}`;
      plan.tables.push({ schema: t.schema, table: t.table, backup: t.rows, target: n });
    }
  } finally {
    await sql.end();
  }
  return plan;
}

/** Tables that are not in the backup but refer to its tables: a cascading truncate empties them. */
async function dependentTables(sql: postgres.Sql, manifest: BackupManifest): Promise<string[]> {
  const edges = await sql<{ child: string; parent: string }[]>`
    select cn.nspname || '.' || cc.relname as child, pn.nspname || '.' || pc.relname as parent
    from pg_constraint k
    join pg_class cc on cc.oid = k.conrelid
    join pg_namespace cn on cn.oid = cc.relnamespace
    join pg_class pc on pc.oid = k.confrelid
    join pg_namespace pn on pn.oid = pc.relnamespace
    where k.contype = 'f'`;
  const inBackup = new Set(manifest.database.tables.map((t) => `${t.schema}.${t.table}`));
  const reached = new Set(inBackup);
  for (let grew = true; grew; ) {
    grew = false;
    for (const { child, parent } of edges) {
      if (reached.has(parent) && !reached.has(child)) {
        reached.add(child);
        grew = true;
      }
    }
  }
  return [...reached].filter((name) => !inBackup.has(name)).sort();
}

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** SQL that stops the transaction early, with a readable reason, when the target cannot take it. */
export function preflightSql(manifest: BackupManifest): string {
  const names = manifest.database.tables.map((t) => literal(qualified(t.schema, t.table)));
  return `do $$
declare t text;
begin
  if current_setting('session_replication_role') <> 'replica' then
    raise exception 'this database role may not switch off triggers (session_replication_role)';
  end if;
  foreach t in array array[${names.join(', ')}] loop
    if not (has_table_privilege(t, 'TRUNCATE') and has_table_privilege(t, 'INSERT')) then
      raise exception 'this database role may not empty and fill %', t;
    end if;
  end loop;
end $$;`;
}

/** SQL that stops the transaction when a table does not hold as many rows as the backup says. */
export function countCheckSql(manifest: BackupManifest): string {
  return manifest.database.tables
    .map((t) => {
      const name = qualified(t.schema, t.table);
      return `do $$ begin if (select count(*) from ${name}) <> ${t.rows} then raise exception 'row count of % differs from the backup (${t.rows})', ${literal(name)}; end if; end $$;`;
    })
    .join('\n');
}

export async function restoreDatabase(
  dir: string,
  manifest: BackupManifest,
  databaseUrl: string,
  log: (message: string) => void,
  injected?: Runner,
): Promise<void> {
  let major = 17;
  if (!injected) {
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    try {
      const [row] = await sql<{ number: number }[]>`
        select current_setting('server_version_num')::int as number`;
      major = Math.floor((row?.number ?? 170000) / 10000);
    } finally {
      await sql.end();
    }
  }
  const runner = injected ?? pickRunner(databaseUrl, major);
  log(`pg_restore (${runner.kind})`);
  const tables = manifest.database.tables.map((t) => qualified(t.schema, t.table));
  const prelude = [
    'set client_min_messages = warning;',
    'begin;',
    'set local session_replication_role = replica;',
    preflightSql(manifest),
    // Everything the backup covers is replaced; cascade reaches what refers to those tables
    // (planRestore lists them; sessions of accounts that no longer exist, for one).
    `truncate table ${tables.join(', ')} cascade;`,
    '',
  ].join('\n');

  const restore = runner.start(
    'pg_restore',
    ['--data-only', '--no-owner', '--no-privileges', '-f', '-'],
    {
      stdin: true,
      stdout: true,
    },
  );
  const psql = runner.start('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], {
    stdin: true,
    stdout: true,
  });
  // The dump's own SELECT setval(...) lines print their results; nobody needs to read them.
  psql.stdout?.resume();
  if (!restore.stdin || !restore.stdout || !psql.stdin)
    throw new Error('could not start the tools');

  const restoreDone = finished(restore, 'pg_restore');
  const psqlDone = finished(psql, 'psql');
  // Whichever side stops first must not leave the other one waiting.
  restoreDone.catch(() => psql.kill());
  psqlDone.catch(() => restore.kill());
  // A tool that stops early closes the pipe; its own exit code tells why, so the write errors
  // are not reported on top.
  for (const stream of [psql.stdin, restore.stdin]) stream.on('error', () => {});
  psql.stdin.write(prelude);
  const fed = pipeline(createReadStream(join(dir, 'database', 'data.dump')), restore.stdin);
  const forwarded = (async () => {
    try {
      for await (const chunk of restore.stdout as AsyncIterable<Buffer>) {
        if (!psql.stdin?.write(chunk)) await new Promise((r) => psql.stdin?.once('drain', r));
      }
      // Only a pg_restore that ended cleanly may be committed.
      await restoreDone;
    } catch (error) {
      psql.stdin?.end('\nrollback;\n');
      throw error;
    }
    psql.stdin?.end(`\n${countCheckSql(manifest)}\ncommit;\n`);
  })();
  await Promise.all([fed, forwarded, restoreDone, psqlDone]);
}

async function restoreStorage(
  dir: string,
  manifest: BackupManifest,
  supabaseUrl: string,
  serviceKey: string,
  log: (message: string) => void,
): Promise<number> {
  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const buckets = JSON.parse(
    readFileSync(join(dir, 'storage', 'buckets.json'), 'utf8'),
  ) as BucketInfo[];
  for (const bucket of buckets) await ensureBucket(client, bucket);
  const entries = JSON.parse(
    readFileSync(join(dir, 'storage', 'objects.json'), 'utf8'),
  ) as (ObjectInfo & {
    file: string;
  })[];
  log(`storage: ${buckets.length} buckets, ${entries.length} files`);
  let done = 0;
  await inParallel(entries, 4, async (entry) => {
    await upload(client, entry, readFileSync(join(dir, entry.file)));
    done++;
    if (done % 100 === 0) log(`  ${done}/${entries.length} files`);
  });
  if (
    manifest.storage.included &&
    entries.length !== manifest.storage.buckets.reduce((n, b) => n + b.objects, 0)
  )
    log('note: some files were left out when the backup was made (see the backup log)');
  return entries.length;
}

/** Runs the restore. Without `yes` nothing is changed; the plan is returned for display. */
export async function restoreBackup(options: RestoreOptions): Promise<RestorePlan> {
  const log = options.log ?? (() => {});
  const doDatabase = options.database ?? true;
  const doStorage = options.storage ?? true;
  const { manifest, problems } = await verifyBackup(options.dir);
  if (!manifest || problems.length > 0)
    throw new Error(`the backup folder is damaged:\n  ${problems.join('\n  ')}`);
  if (doDatabase && !options.databaseUrl) throw new Error('SUPABASE_DB_URL is required');
  if (doStorage && manifest.storage.included && (!options.supabaseUrl || !options.serviceKey))
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required for the files');

  const plan = await planRestore(manifest, doDatabase ? options.databaseUrl : undefined);
  if (doDatabase) {
    if (plan.missingMigrations.length > 0 && !options.force)
      throw new Error(
        `the target lacks ${plan.missingMigrations.length} migration(s) of the backup (${plan.missingMigrations[0]} …). ` +
          'Deploy the repository state of the backup first (see the runbook), or pass --force.',
      );
    if (plan.unexpectedDependents.length > 0 && !options.force)
      throw new Error(
        `these tables are not in the backup but refer to tables that are, and would be emptied with them: ${plan.unexpectedDependents.join(', ')}. ` +
          'Pass --force if that is fine.',
      );
    if (plan.missingTables.length > 0)
      throw new Error(
        `the target lacks tables of the backup: ${plan.missingTables.slice(0, 8).join(', ')}${
          plan.missingTables.length > 8 ? ' …' : ''
        }. Deploy the apps whose schemas these are (pnpm mininode deploy), then restore again.`,
      );
  }
  if (!options.yes) return plan;
  if (
    doDatabase &&
    plan.target &&
    !LOCAL_HOSTS.has(plan.target.host) &&
    options.confirm !== plan.target.host
  )
    throw new Error(
      `this would replace the data of ${plan.target.host}/${plan.target.database}. ` +
        `If that is the right database, pass --confirm ${plan.target.host} as well.`,
    );

  if (doDatabase && options.databaseUrl) {
    await restoreDatabase(options.dir, manifest, options.databaseUrl, log, options.runner);
    // The row counts were checked inside the transaction, before it was committed.
    log(`database restored: ${manifest.database.tables.length} tables`);
  }
  if (doStorage && options.supabaseUrl && options.serviceKey)
    await restoreStorage(options.dir, manifest, options.supabaseUrl, options.serviceKey, log);
  return plan;
}
