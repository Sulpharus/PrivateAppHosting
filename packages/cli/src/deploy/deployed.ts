// What each app was last deployed from, per environment (platform.apps.deployed_version), so a
// deploy can ship every app that changed since then, even after an earlier run failed.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type DeployEnv, environmentSettings } from './environment.ts';

export async function readDeployedVersions(
  envName: DeployEnv,
  client?: SupabaseClient,
): Promise<Map<string, string | null>> {
  const env = environmentSettings(envName);
  let db = client;
  if (!db) {
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!secret) throw new Error('SUPABASE_SECRET_KEY is required to read the deployed versions');
    db = createClient(env.supabaseUrl, secret, { auth: { persistSession: false } });
  }
  const { data, error } = await db.schema('platform').from('apps').select('slug, deployed_version');
  if (error) throw new Error(`reading the deployed versions failed: ${error.message}`);
  return new Map(
    (data ?? []).map((row) => [
      row.slug as string,
      (row.deployed_version as string | null) ?? null,
    ]),
  );
}

/**
 * The apps to ship: those changed since their own deployed version. When the registry cannot be
 * read, everything is deployed (a slower run beats skipping a change).
 */
export async function appsSinceDeployed(
  slugs: string[],
  read: () => Promise<Map<string, string | null>>,
  select: (slugs: string[], deployed: Map<string, string | null>) => string[],
  log: (line: string) => void = console.log,
): Promise<string[]> {
  try {
    return select(slugs, await read());
  } catch (error) {
    log(
      `::warning::${error instanceof Error ? error.message : error}; deploying every app instead`,
    );
    return slugs;
  }
}
