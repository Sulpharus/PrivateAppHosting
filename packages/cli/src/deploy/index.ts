import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { appSchemaName, type Manifest } from '@mininode/manifest';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { doctor } from '../doctor.ts';
import { type DeployEnv, environmentSettings } from './environment.ts';
import { exposeSchemas, migrateApp } from './migrate.ts';
import { registerApp } from './register.ts';
import { appWranglerConfig } from './wrangler-config.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SDK_BUNDLE = join(REPO_ROOT, 'packages/sdk/dist/mininode.iife.js');
/** Files that belong to the integration, never to the served site. */
const NOT_SERVED = new Set([
  'mininode.json',
  'db',
  'README.md',
  'package.json',
  'node_modules',
  'src',
  'test',
]);

export interface DeployOptions {
  env: DeployEnv;
  version: string;
  dryRun?: boolean;
  log?: (line: string) => void;
  /** Origins the app is served from; defaults to https://<slug>.<domain> outside local. */
  origins?: string[];
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`);
}

function ensureSdkBundle(): void {
  if (!existsSync(SDK_BUNDLE)) run('pnpm', ['--filter', '@mininode/sdk', 'build'], REPO_ROOT);
}

/** Builds the app and returns a staging folder that contains exactly what gets served. */
export function stageAssets(appDir: string, manifest: Manifest): string {
  if (manifest.build?.command) run('sh', ['-c', manifest.build.command], appDir);
  const source = manifest.build ? join(appDir, manifest.build.output) : appDir;
  if (!existsSync(source)) throw new Error(`build output ${source} does not exist`);

  const stage = mkdtempSync(join(tmpdir(), `mininode-${manifest.slug}-`));
  const assets = join(stage, 'assets-root');
  cpSync(source, assets, {
    recursive: true,
    filter: (path) => {
      if (manifest.build) return true;
      const top = path.slice(source.length + 1).split(/[\\/]/)[0] ?? '';
      return !NOT_SERVED.has(top) && !top.startsWith('.');
    },
  });
  ensureSdkBundle();
  mkdirSync(join(assets, '_mininode'), { recursive: true });
  cpSync(SDK_BUNDLE, join(assets, '_mininode', 'sdk.js'));
  return stage;
}

/**
 * Exposes the app schema through the local PostgREST. Only schemas that exist are listed: one
 * missing schema (a static app without db/, or a reset database) makes PostgREST fail for every
 * request, so stale entries are pruned on each run.
 */
async function exposeLocally(databaseUrl: string, schema: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ schemas: string | null }[]>`
      select coalesce(
        (select split_part(c, '=', 2) from pg_db_role_setting s
           join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) c
          where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%'),
        'public,graphql_public,platform') as schemas`;
    const current = row?.schemas ?? '';
    const candidates = schemaList(current, schema, null);
    const existing = new Set(
      (
        await sql<{ nspname: string }[]>`
          select nspname from pg_namespace where nspname = any(${candidates})`
      ).map((r) => r.nspname),
    );
    const next = schemaList(current, schema, existing);
    if (next.join(',') === schemaList(current, '', null).join(',')) return;
    // ALTER ROLE takes no bind parameters; let Postgres quote the value.
    const [quoted] = await sql<{ q: string }[]>`select quote_literal(${next.join(',')}) as q`;
    if (!quoted) return;
    await sql.unsafe(`alter role authenticator set pgrst.db_schemas = ${quoted.q}`);
    await sql`notify pgrst, 'reload config'`;
  } finally {
    await sql.end();
  }
}

/**
 * The PostgREST schema list with `schema` added, without duplicates or blanks, keeping only
 * schemas that exist (when `existing` is given).
 */
export function schemaList(current: string, schema: string, existing: Set<string> | null) {
  const all = [...new Set([...current.split(','), schema].map((s) => s.trim()).filter(Boolean))];
  return existing ? all.filter((s) => existing.has(s)) : all;
}

/** After a schema change the local PostgREST reloads (and backs off if it was broken): wait. */
async function waitForRest(supabaseUrl: string, key: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, { headers: { apikey: key } }).catch(
      () => null,
    );
    if (response && response.status < 500) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`local PostgREST at ${supabaseUrl} did not become ready within 60 s`);
}

export async function deployApp(appDir: string, options: DeployOptions): Promise<void> {
  const log = options.log ?? console.log;
  const report = doctor(appDir);
  const errors = report.findings.filter((finding) => finding.severity === 'error');
  if (!report.manifest || errors.length > 0) {
    throw new Error(
      `doctor failed for ${appDir}:\n${errors.map((e) => `  [${e.rule}] ${e.message}`).join('\n')}`,
    );
  }
  const manifest = report.manifest;
  const env = environmentSettings(options.env);
  log(`→ ${manifest.slug} (${manifest.target}) to ${env.name}`);

  if (manifest.target === 'cloudflare' && env.name !== 'local') {
    const stage = stageAssets(appDir, manifest);
    const config = appWranglerConfig({ manifest, env, assetsDir: join(stage, 'assets-root') });
    const configPath = join(stage, 'wrangler.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    if (options.dryRun) {
      log(`  dry run: ${configPath}`);
    } else {
      run('pnpm', ['exec', 'wrangler', 'deploy', '--config', configPath], REPO_ROOT);
      rmSync(stage, { recursive: true, force: true });
    }
  } else if (manifest.target !== 'cloudflare') {
    log(
      `  ${manifest.target} apps are rolled out by the ${manifest.target} workflow; registering only`,
    );
  }

  if (options.dryRun) return;

  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (databaseUrl) {
    const applied = await migrateApp(databaseUrl, manifest.slug, appDir);
    if (applied.length > 0) log(`  migrations: ${applied.join(', ')}`);
    if (env.name === 'local') await exposeLocally(databaseUrl, appSchemaName(manifest.slug));
  }
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (env.name !== 'local' && projectRef && accessToken && existsSync(join(appDir, 'db'))) {
    await exposeSchemas({ projectRef, accessToken, schemas: [appSchemaName(manifest.slug)] });
  }

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is required to register the app');
  if (env.name === 'local') await waitForRest(env.supabaseUrl, secret);
  const db = createClient(env.supabaseUrl, secret, { auth: { persistSession: false } });
  const origins =
    options.origins ?? (env.name === 'local' ? [] : [`https://${manifest.slug}.${env.domain}`]);
  await registerApp(db, manifest, options.version, origins);
  log(`  registered ${manifest.slug} (${options.version})`);
}

/** Local preview: registers the app in the local database and serves it through the gate. */
export async function devApp(appDir: string, port = 8790): Promise<void> {
  await deployApp(appDir, {
    env: 'local',
    version: 'dev',
    origins: [`http://localhost:${port}`, `http://127.0.0.1:${port}`],
  });
  const report = doctor(appDir);
  const manifest = report.manifest;
  if (manifest?.target !== 'cloudflare') return;
  const env = environmentSettings('local');
  const stage = stageAssets(appDir, manifest);
  const configPath = join(stage, 'wrangler.json');
  writeFileSync(
    configPath,
    JSON.stringify(
      appWranglerConfig({ manifest, env, assetsDir: join(stage, 'assets-root') }),
      null,
      2,
    ),
  );
  console.log(`\n  ${manifest.name}: http://localhost:${port}  (sign in at ${env.portalUrl})\n`);
  run(
    'pnpm',
    ['exec', 'wrangler', 'dev', '--config', configPath, '--port', String(port)],
    REPO_ROOT,
  );
}

export function readVersion(): string {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}
