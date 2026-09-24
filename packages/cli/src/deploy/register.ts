// Keeps platform.apps (what the portal shows and RLS checks) in sync with the manifest.

import type { Manifest } from '@mininode/manifest';
import type { SupabaseClient } from '@supabase/supabase-js';

export function appRow(manifest: Manifest, meta: { version: string; ownerId: string | null }) {
  return {
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    kind: manifest.kind,
    target: manifest.target,
    data_mode: manifest.data.mode,
    allowed_roles: manifest.access.roles,
    owner_id: manifest.data.mode === 'shared-account' ? meta.ownerId : null,
    manifest,
    status: 'online',
    deployed_version: meta.version,
    deployed_at: new Date().toISOString(),
  };
}

export async function registerApp(
  db: SupabaseClient,
  manifest: Manifest,
  version: string,
): Promise<void> {
  const platform = db.schema('platform');
  const { data: admin } = await platform
    .from('profiles')
    .select('user_id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  const ownerId = (admin?.user_id as string | undefined) ?? null;
  if (manifest.data.mode === 'shared-account' && !ownerId) {
    throw new Error('shared-account apps need an admin account (sign in once before deploying)');
  }

  const { data: existing } = await platform
    .from('apps')
    .select('slug, status')
    .eq('slug', manifest.slug)
    .maybeSingle();
  const row = appRow(manifest, { version, ownerId });
  const { error } = await platform.from('apps').upsert({
    ...row,
    // The admin decides visibility and defaults in the Host Manager after the first deploy.
    ...(existing
      ? { status: existing.status === 'disabled' ? 'disabled' : 'online' }
      : { is_default: manifest.access.default }),
  });
  if (error) throw new Error(`registering ${manifest.slug} failed: ${error.message}`);

  if (manifest.ai) {
    const { error: budgetError } = await platform.from('ai_budgets').upsert({
      scope: 'app',
      scope_key: manifest.slug,
      monthly_limit_micro: Math.round(manifest.ai.monthlyBudgetEur * 1_000_000),
    });
    if (budgetError)
      throw new Error(`AI budget for ${manifest.slug} failed: ${budgetError.message}`);
  }
}
