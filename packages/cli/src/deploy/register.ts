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
  origins: string[] = [],
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

  const { data: existing, error: lookupError } = await platform
    .from('apps')
    .select('slug, status, kind')
    .eq('slug', manifest.slug)
    .maybeSingle();
  // A failed lookup must not look like a first deploy (which grants the app to everyone).
  if (lookupError) throw new Error(`looking up ${manifest.slug} failed: ${lookupError.message}`);
  if (existing?.kind === 'link')
    throw new Error(
      `${manifest.slug} is a link tile in Verwaltung → Apps; remove it there or pick another slug`,
    );
  const row = appRow(manifest, { version, ownerId });
  const { error } = await platform.from('apps').upsert({
    ...row,
    // The admin decides visibility and defaults in the Host Manager after the first deploy.
    ...(existing
      ? { status: existing.status === 'disabled' ? 'disabled' : 'online' }
      : { is_default: manifest.access.default }),
  });
  if (error) throw new Error(`registering ${manifest.slug} failed: ${error.message}`);

  // `access.default` means every user gets the app: new users at sign-up (is_default), existing
  // users once, on the first registration. Later changes are the admin's (Host Manager).
  // If this step fails, the next deploy does not repeat it: grant the app by hand under
  // Verwaltung → Nutzer & Rollen (the error says so).
  if (!existing && manifest.access.default) {
    const failed = (message: string) =>
      new Error(
        `granting ${manifest.slug} to existing users failed (${message}); grant it under Verwaltung → Nutzer & Rollen`,
      );
    // Same rule as sign-up: only roles the app allows. An invite-only platform stays far below
    // PostgREST's 1000-row page.
    const { data: users, error: usersError } = await platform
      .from('profiles')
      .select('user_id')
      .in('role', manifest.access.roles);
    if (usersError) throw failed(usersError.message);
    if (users && users.length > 0) {
      const { error: grantError } = await platform.from('app_grants').upsert(
        users.map((u) => ({ user_id: u.user_id as string, app_slug: manifest.slug })),
        { onConflict: 'user_id,app_slug', ignoreDuplicates: true },
      );
      if (grantError) throw failed(grantError.message);
    }
  }

  // The origins the app's pages are served from: RLS uses them to tell apps apart (ADR 0002).
  if (origins.length > 0) {
    const { error: originError } = await platform
      .from('app_origins')
      .upsert(origins.map((origin) => ({ origin: origin.toLowerCase(), app_slug: manifest.slug })));
    if (originError)
      throw new Error(`registering origins of ${manifest.slug} failed: ${originError.message}`);
  }

  // External APIs with host-level keys (ADR 0006): one entry per API id, shared between apps.
  const { error: apiError } = await platform.rpc('register_app_apis', {
    p_app_slug: manifest.slug,
    p_apis: manifest.apis ?? [],
  });
  if (apiError) throw new Error(`APIs of ${manifest.slug}: ${apiError.message}`);

  // Shared record types (ADR 0002): requests only; the admin approves them.
  const { error: suiteError } = await platform.rpc('register_app_suite', {
    p_slug: manifest.slug,
    p_uses: manifest.suite?.uses ?? [],
  });
  if (suiteError) throw new Error(`suite requests of ${manifest.slug}: ${suiteError.message}`);

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
