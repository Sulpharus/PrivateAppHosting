// Removes the Workers of hosted apps that no longer exist in the repository and disables their
// registry rows. App data (kv, files, tables) is kept; the admin deletes it in the Host Manager.

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

/** Slugs of hosted apps that deploy to Cloudflare. */
export function cloudflareApps(root: string, dirs: string[]): Set<string> {
  const slugs = new Set<string>();
  for (const dir of dirs) {
    const file = join(root, 'hosted', dir, 'mininode.json');
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as { slug?: string; target?: string };
    if (manifest.slug && manifest.target === 'cloudflare') slugs.add(manifest.slug);
  }
  return slugs;
}

interface CloudflareList {
  success: boolean;
  result?: { id: string }[];
  errors?: { message: string }[];
}

export async function pruneApps(
  envName: DeployEnv,
  keep: Set<string>,
  options: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<string[]> {
  const log = options.log ?? console.log;
  const env = environmentSettings(envName);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token)
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
  const api = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`;
  const headers = { Authorization: `Bearer ${token}` };
  const list = (await (await fetch(api, { headers })).json()) as CloudflareList;
  if (!list.success) throw new Error(`listing Workers failed: ${list.errors?.[0]?.message ?? ''}`);
  const stale = workersToPrune(
    (list.result ?? []).map((script) => script.id),
    env.workerPrefix,
    keep,
  );
  if (stale.length === 0) {
    log('no removed apps to prune');
    return [];
  }
  const secret = process.env.SUPABASE_SECRET_KEY;
  const db = secret
    ? createClient(env.supabaseUrl, secret, { auth: { persistSession: false } })
    : null;
  for (const name of stale) {
    const slug = name.slice(env.workerPrefix.length);
    log(`  pruning ${name}${options.dryRun ? ' (dry run)' : ''}`);
    if (options.dryRun) continue;
    const response = await fetch(`${api}/${name}?force=true`, { method: 'DELETE', headers });
    if (!response.ok) throw new Error(`deleting ${name} failed: ${response.status}`);
    if (db) {
      const { error } = await db
        .schema('platform')
        .from('apps')
        .update({ status: 'disabled' })
        .eq('slug', slug);
      if (error) throw new Error(`disabling ${slug} failed: ${error.message}`);
    }
  }
  return stale;
}
