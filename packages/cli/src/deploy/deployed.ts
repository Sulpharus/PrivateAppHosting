// What each app was last deployed from, per environment (platform.apps.deployed_version), so a
// deploy can ship every app that changed since then, even after an earlier run failed.

import { createClient } from '@supabase/supabase-js';
import { type DeployEnv, environmentSettings } from './environment.ts';

export async function readDeployedVersions(
  envName: DeployEnv,
): Promise<Map<string, string | null>> {
  const env = environmentSettings(envName);
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is required to read the deployed versions');
  const db = createClient(env.supabaseUrl, secret, { auth: { persistSession: false } });
  const { data, error } = await db.schema('platform').from('apps').select('slug, deployed_version');
  if (error) throw new Error(`reading the deployed versions failed: ${error.message}`);
  return new Map(
    (data ?? []).map((row) => [
      row.slug as string,
      (row.deployed_version as string | null) ?? null,
    ]),
  );
}
