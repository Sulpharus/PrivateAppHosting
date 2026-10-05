// Removes the Workers of hosted apps that no longer deploy to Cloudflare. Apps that are gone
// from the repository entirely also get their registry row disabled. App data (kv, files,
// tables) is kept; Verwaltung → Apps → Löschen (`mininode uninstall --purge`) deletes it.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { type DeployEnv, environmentSettings } from './environment.ts';

/** Worker names with the environment prefix whose app is not in `keep`. */
export function workersToPrune(names: string[], prefix: string, keep: Set<string>): string[] {
  return names
    .filter((name) => name.startsWith(prefix))
    .filter((name) => !keep.has(name.slice(prefix.length)))
    .sort();
}

/** Deploy target per slug of every hosted app in the repository. */
export function hostedTargets(root: string, dirs: string[]): Map<string, string> {
  const targets = new Map<string, string>();
  for (const dir of dirs) {
    const file = join(root, 'hosted', dir, 'mininode.json');
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as { slug?: string; target?: string };
    if (manifest.slug) targets.set(manifest.slug, manifest.target ?? '');
  }
  return targets;
}

interface CloudflareList {
  success: boolean;
  result?: { id: string }[];
  errors?: { message: string }[];
}

export interface PruneOptions {
  dryRun?: boolean;
  /** Prune even when the repository has no hosted apps at all. */
  force?: boolean;
  log?: (line: string) => void;
  fetch?: typeof fetch;
}

export async function pruneApps(
  envName: DeployEnv,
  hosted: Map<string, string>,
  options: PruneOptions = {},
): Promise<string[]> {
  const log = options.log ?? console.log;
  const request = options.fetch ?? fetch;
  // An empty hosted/ usually means a broken checkout or the wrong directory, not "delete all".
  if (hosted.size === 0 && !options.force)
    throw new Error('no hosted apps found; refusing to prune every app (use --force)');
  const env = environmentSettings(envName);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token)
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
  const api = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`;
  const headers = { Authorization: `Bearer ${token}` };
  const list = (await (await request(api, { headers })).json()) as CloudflareList;
  if (!list.success) throw new Error(`listing Workers failed: ${list.errors?.[0]?.message ?? ''}`);
  const onCloudflare = new Set([...hosted].filter(([, t]) => t === 'cloudflare').map(([s]) => s));
  const stale = workersToPrune(
    (list.result ?? []).map((script) => script.id),
    env.workerPrefix,
    onCloudflare,
  );
  if (stale.length === 0) {
    log('no removed apps to prune');
    return [];
  }
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret && !options.dryRun) throw new Error('SUPABASE_SECRET_KEY is required to prune');
  const db = secret
    ? createClient(env.supabaseUrl, secret, {
        auth: { persistSession: false },
        global: { fetch: request },
      })
    : null;
  for (const name of stale) {
    const slug = name.slice(env.workerPrefix.length);
    // An app that moved to another target stays online; only its old Worker goes.
    const removed = !hosted.has(slug);
    log(
      `  pruning ${name}${removed ? ' and disabling the app' : ''}${options.dryRun ? ' (dry run)' : ''}`,
    );
    if (options.dryRun || !db) continue;
    // Disable first: if the delete then fails, the next run still finds the Worker and retries.
    if (removed) {
      const { error } = await db
        .schema('platform')
        .from('apps')
        .update({ status: 'disabled' })
        .eq('slug', slug);
      if (error) throw new Error(`disabling ${slug} failed: ${error.message}`);
    }
    const response = await request(`${api}/${name}?force=true`, { method: 'DELETE', headers });
    if (!response.ok) throw new Error(`deleting ${name} failed: ${response.status}`);
  }
  return stale;
}
