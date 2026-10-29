import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { type DesktopSettings, desktopFiles } from './files.ts';
import { appliedMigrations, type MigrationFile, migrationsToRun } from './migrations.ts';
import { generateSecrets } from './secrets.ts';

/**
 * Writes this installation's `.env`, `kong.yml` and `roles.sql` into `dir`. Secrets are made
 * once: running it again keeps them unless `force` is set (which would lock the database out).
 */
export function initDesktop(
  dir: string,
  settings: DesktopSettings,
  options: { force?: boolean } = {},
): string[] {
  // The folder is private to the person who installed; the files the containers read must be
  // readable by the (other) user inside the container, the folder keeps everyone else out.
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const env = join(dir, '.env');
  if (existsSync(env) && !options.force)
    throw new Error(
      `${env} exists: this installation already has its secrets (use --force to replace them)`,
    );
  const files = desktopFiles(settings, generateSecrets());
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    const mode = name === '.env' ? 0o600 : 0o644;
    writeFileSync(path, content, { mode });
    // writeFileSync keeps the mode of a file that already existed.
    chmodSync(path, mode);
  }
  return Object.keys(files);
}

async function until<T>(
  what: string,
  check: () => Promise<T | undefined>,
  seconds = 180,
): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== undefined) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `${what} did not become ready within ${seconds} s${last ? `: ${String(last)}` : ''}`,
  );
}

/**
 * Applies supabase/migrations to the installation's database, once each, in order. Waits for the
 * sign-in and storage services first: the migrations build on their tables.
 */
export async function migrateDesktop(
  databaseUrl: string,
  files: MigrationFile[],
  log: (line: string) => void = console.log,
): Promise<string[]> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await until('the database', async () => (await sql`select 1 as ok`)[0]?.ok);
    await until('the sign-in service (auth.users)', async () => {
      const [row] = await sql<{ ok: boolean }[]>`
        select to_regclass('auth.users') is not null and to_regclass('auth.mfa_factors') is not null as ok`;
      return row?.ok ? true : undefined;
    });
    await until('the file service (storage.buckets)', async () => {
      const [row] = await sql<
        { ok: boolean }[]
      >`select to_regclass('storage.buckets') is not null as ok`;
      return row?.ok ? true : undefined;
    });
    await sql`create schema if not exists supabase_migrations`;
    await sql`create table if not exists supabase_migrations.schema_migrations (
      version text primary key, name text, statements text[])`;
    const done = appliedMigrations(
      (
        await sql<{ version: string }[]>`select version from supabase_migrations.schema_migrations`
      ).map((row) => row.version),
    );
    const applied: string[] = [];
    for (const file of migrationsToRun(files, done)) {
      await sql.begin(async (tx) => {
        await tx.unsafe(file.sql);
        await tx`insert into supabase_migrations.schema_migrations (version, name)
                 values (${file.version}, ${file.name})`;
      });
      log(`  applied ${file.version}_${file.name}`);
      applied.push(file.version);
    }
    // PostgREST started before the platform schema existed and keeps retrying with a back-off:
    // tell it to look again now.
    await sql`notify pgrst, 'reload schema'`;
    return applied;
  } finally {
    await sql.end();
  }
}

/** Waits until the data API serves the platform schema again after a migration (it answers 503 while it reloads). */
export async function waitForDataApi(supabaseUrl: string, secretKey: string): Promise<void> {
  await until('the data API', async () => {
    const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=role&limit=1`, {
      headers: { apikey: secretKey, 'Accept-Profile': 'platform' },
    });
    return response.status === 503 ? undefined : true;
  });
}

/** Creates the first (admin) account, or any account, through the sign-in service's admin API. */
export async function createDesktopAccount(
  supabaseUrl: string,
  secretKey: string,
  email: string,
  password: string,
): Promise<string> {
  await until('the sign-in service', async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: secretKey },
    });
    return response.ok ? true : undefined;
  });
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: secretKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    msg?: string;
    message?: string;
  };
  if (!response.ok || !body.id)
    throw new Error(
      `could not create the account (${response.status}): ${body.msg ?? body.message ?? 'unknown error'}`,
    );
  return body.id;
}

/** Sets a new password for an existing account (the recovery path when no email is configured). */
export async function setDesktopPassword(
  supabaseUrl: string,
  secretKey: string,
  email: string,
  password: string,
): Promise<void> {
  const headers = { apikey: secretKey, 'Content-Type': 'application/json' };
  const list = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers });
  const body = (await list.json().catch(() => ({}))) as {
    users?: { id: string; email?: string }[];
  };
  const user = body.users?.find(
    (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!list.ok || !user) throw new Error(`no account with the address ${email}`);
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as { msg?: string; message?: string };
    throw new Error(
      `could not set the password (${response.status}): ${failure.msg ?? failure.message ?? 'unknown error'}`,
    );
  }
}
