// `mininode uninstall <slug> [--purge]`: takes a hosted app off the platform (ADR 0020).
//
//   always   the app is disabled (nobody can open it), its Worker is deleted
//   --purge  and its data goes: the Data API stops exposing its schema, the schema is dropped,
//            its files in Storage (and its logo) are deleted, and the registry row is deleted,
//            which takes grants, kv data, push subscriptions, game results, … with it
//
// Every step can be repeated: a run that stopped halfway is simply started again. The code in
// hosted/<slug> is removed by the workflow's pull request, not here.

import { appSchemaName, RESERVED_SLUGS, slugSchema } from '@mininode/manifest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { listObjects, removeObjects } from '../backup/storage.ts';
import { type DeployEnv, environmentSettings } from './environment.ts';
import { unexposeSchemas } from './migrate.ts';

export interface UninstallOptions {
  /** Also delete the app's data (default: only take it offline). */
  purge?: boolean;
  log?: (line: string) => void;
  fetch?: typeof fetch;
}

export interface UninstallResult {
  slug: string;
  worker: 'deleted' | 'none' | 'not-cloudflare' | 'local';
  schema: 'dropped' | 'none' | 'kept';
  files: number;
  registry: 'deleted' | 'disabled' | 'none';
}

interface AppRow {
  slug: string;
  target: string;
  icon_path: string | null;
}

/** The slug of an app that may be uninstalled; throws for anything else. */
export function uninstallableSlug(slug: string): string {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) throw new Error(`invalid slug ${slug}`);
  if ((RESERVED_SLUGS as readonly string[]).includes(parsed.data))
    throw new Error(`${slug} is part of the platform and cannot be uninstalled`);
  return parsed.data;
}

/** The PostgREST schema list without `schema`. */
export function withoutSchema(current: string, schema: string): string[] {
  return current
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== schema);
}

/** Local PostgREST: hide the schema before it is dropped, otherwise every request fails. */
async function hideLocally(databaseUrl: string, schema: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      // The same lock the deploy takes for this setting.
      await tx`select pg_advisory_xact_lock(hashtext('mininode:pgrst.db_schemas'))`;
      const [row] = await tx<{ schemas: string | null }[]>`
        select (select split_part(c, '=', 2) from pg_db_role_setting s
                  join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) c
                 where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%') as schemas`;
      if (!row?.schemas) return;
      const next = withoutSchema(row.schemas, schema);
      if (next.length === row.schemas.split(',').length) return;
      const [quoted] = await tx<{ q: string }[]>`select quote_literal(${next.join(',')}) as q`;
      if (!quoted) return;
      await tx.unsafe(`alter role authenticator set pgrst.db_schemas = ${quoted.q}`);
      await tx`notify pgrst, 'reload config'`;
      await tx`notify pgrst, 'reload schema'`;
    });
  } finally {
    await sql.end();
  }
}

async function deleteWorker(
  envName: DeployEnv,
  slug: string,
  request: typeof fetch,
): Promise<'deleted' | 'none'> {
  const env = environmentSettings(envName);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token)
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
  const response = await request(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${env.workerPrefix}${slug}?force=true`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 404) return 'none';
  if (!response.ok) throw new Error(`deleting the Worker failed: ${response.status}`);
  return 'deleted';
}

export async function uninstallApp(
  envName: DeployEnv,
  rawSlug: string,
  options: UninstallOptions = {},
): Promise<UninstallResult> {
  const slug = uninstallableSlug(rawSlug);
  const log = options.log ?? console.log;
  const request = options.fetch ?? fetch;
  const env = environmentSettings(envName);
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is required');
  const db: SupabaseClient = createClient(env.supabaseUrl, secret, {
    auth: { persistSession: false },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  });
  const result: UninstallResult = {
    slug,
    worker: 'none',
    schema: 'kept',
    files: 0,
    registry: 'none',
  };

  const { data, error } = await db
    .schema('platform')
    .from('apps')
    .select('slug, target, icon_path')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`looking up ${slug} failed: ${error.message}`);
  const app = data as AppRow | null;

  // Offline first: from here on nobody can open the app, whatever fails later.
  if (app) {
    const { error: disableError } = await db
      .schema('platform')
      .from('apps')
      .update({ status: 'disabled' })
      .eq('slug', slug);
    if (disableError) throw new Error(`disabling ${slug} failed: ${disableError.message}`);
    result.registry = 'disabled';
    log(`${slug}: disabled`);
  }

  if (app && app.target !== 'cloudflare') result.worker = 'not-cloudflare';
  else if (envName === 'local') result.worker = 'local';
  else {
    result.worker = await deleteWorker(envName, slug, request);
    log(`${slug}: Worker ${result.worker}`);
  }
  if (!options.purge) return result;

  // Data. The schema is hidden from the Data API before it is dropped.
  const schema = appSchemaName(slug);
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (databaseUrl) {
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    let exists = false;
    try {
      const [row] = await sql<{ n: number }[]>`
        select count(*)::int as n from pg_namespace where nspname = ${schema}`;
      exists = (row?.n ?? 0) > 0;
    } finally {
      await sql.end();
    }
    if (exists) {
      if (envName === 'local') await hideLocally(databaseUrl, schema);
      else {
        const projectRef = process.env.SUPABASE_PROJECT_REF;
        const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
        if (!projectRef || !accessToken)
          throw new Error(
            'SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required to hide the schema before it is dropped',
          );
        await unexposeSchemas({ projectRef, accessToken, schemas: [schema], fetcher: request });
      }
      const drop = postgres(databaseUrl, { max: 1, onnotice: () => {} });
      try {
        await drop.unsafe(`drop schema if exists "${schema.replaceAll('"', '""')}" cascade`);
      } finally {
        await drop.end();
      }
      result.schema = 'dropped';
      log(`${slug}: schema ${schema} dropped`);
    } else {
      result.schema = 'none';
    }
  } else {
    throw new Error('SUPABASE_DB_URL is required to delete the data');
  }

  // Files: the app's folder in app-files and its logo.
  const names = (await listObjects(db, 'app-files', slug)).map((o) => o.name);
  await removeObjects(db, 'app-files', names);
  result.files = names.length;
  if (app?.icon_path) {
    await removeObjects(db, 'app-icons', [app.icon_path]);
    result.files++;
  }
  log(`${slug}: ${result.files} files deleted`);

  // The registry row last: a run that stopped before this still finds the app and its logo.
  if (app) {
    const { error: deleteError } = await db
      .schema('platform')
      .from('apps')
      .delete()
      .eq('slug', slug);
    if (deleteError) throw new Error(`deleting ${slug} failed: ${deleteError.message}`);
    result.registry = 'deleted';
    log(`${slug}: registry entry deleted`);
  }
  return result;
}

interface BiomeOverride {
  includes?: string[];
  linter?: { enabled?: boolean };
}

/** biome.json without the exemptions an integration added for this app. */
export function dropExemptions(biomeJson: string, slug: string): string {
  const config = JSON.parse(biomeJson) as {
    files?: { includes?: string[] };
    overrides?: BiomeOverride[];
  };
  const glob = `hosted/${slug}/**`;
  if (config.overrides)
    config.overrides = config.overrides
      .map((override) => ({
        ...override,
        ...(override.includes ? { includes: override.includes.filter((i) => i !== glob) } : {}),
      }))
      // An override that only existed for this app goes with it.
      .filter(
        (override) => !(override.includes?.length === 0 && override.linter?.enabled === false),
      );
  if (config.files?.includes)
    config.files.includes = config.files.includes.filter((i) => i !== `!hosted/${slug}`);
  return `${JSON.stringify(config, null, 2)}\n`;
}
