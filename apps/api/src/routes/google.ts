// Google services for apps (ADR 0004).
//   POST   /google/connect  portal hands over the refresh token once, right after Google sign-in
//   GET    /google          status for "Dein Konto"
//   DELETE /google          revoke at Google and forget the grant
//   POST   /google/token    an app gets a short-lived access token limited to its manifest scopes

import { googleScopes, parseManifest } from '@mininode/manifest';
import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiEnv } from '../env.ts';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import {
  GoogleError,
  type GoogleSettings,
  googleAccount,
  refreshAccessToken,
  revoke,
  seal,
  unseal,
} from '../lib/google.ts';
import { adminClient } from '../lib/supabase.ts';

interface GrantRow {
  google_sub: string;
  email: string | null;
  scopes: string[];
  refresh_token_enc: string;
  updated_at: string;
}

function settings(env: ApiEnv): GoogleSettings | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_KEY) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    tokenKey: env.GOOGLE_TOKEN_KEY,
  };
}

const notConfigured = () =>
  problem(503, 'google_not_configured', 'Google-Dienste sind auf MiniNode nicht eingerichtet.');
const notConnected = () =>
  problem(
    409,
    'google_not_connected',
    'Verbinde zuerst dein Google-Konto unter „Dein Konto“ auf mininode.app.',
  );

const log = (event: string, detail: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...detail }));

/** Scopes Google may add to any token besides the requested ones (identity only). */
const IDENTITY_SCOPES = new Set([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]);

/** Whether the Google account `sub` is (still) linked to the user; null on lookup failure. */
async function googleLinked(env: ApiEnv, userId: string, sub: string): Promise<boolean | null> {
  const { data, error } = await adminClient(env).auth.admin.getUserById(userId);
  if (error) return null;
  return (data.user?.identities ?? []).some(
    (identity) =>
      identity.provider === 'google' &&
      (identity.id === sub || identity.identity_data?.sub === sub),
  );
}

export const google = new Hono<AppContext>();

const connectSchema = z.object({ refreshToken: z.string().min(10).max(2048) });

google.post('/connect', requireUser(), async (c) => {
  const oauth = settings(c.env);
  if (!oauth) return notConfigured();
  const parsed = connectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'invalid_request', 'Ungültige Anfrage.');
  const userId = c.get('claims').sub;
  const db = adminClient(c.env);

  // The token must belong to the Google account linked to this MiniNode user.
  let account: { sub: string; email?: string };
  let scopes: string[];
  try {
    const token = await refreshAccessToken(oauth, parsed.data.refreshToken);
    account = await googleAccount(token.accessToken);
    scopes = token.scopes;
  } catch (err) {
    log('google_connect_failed', {
      user: userId,
      code: err instanceof GoogleError ? err.code : 'error',
    });
    return problem(400, 'google_token_invalid', 'Google hat den Zugang nicht bestätigt.');
  }
  const linked = await googleLinked(c.env, userId, account.sub);
  if (linked === null) return problem(500, 'auth_error', 'Konto konnte nicht geprüft werden.');
  if (!linked)
    return problem(
      403,
      'google_account_mismatch',
      'Dieses Google-Konto ist nicht mit dir verbunden.',
    );

  const { error } = await db
    .schema('platform')
    .from('google_grants')
    .upsert({
      user_id: userId,
      google_sub: account.sub,
      email: account.email ?? null,
      scopes,
      refresh_token_enc: await seal(oauth.tokenKey, parsed.data.refreshToken, userId),
    });
  if (error) return problem(500, 'db_error', 'Speichern fehlgeschlagen.');
  log('google_connected', { user: userId, scopes });
  return c.json({ connected: true, email: account.email ?? null, scopes });
});

google.get('/', requireUser(), async (c) => {
  if (!settings(c.env)) return c.json({ available: false, connected: false });
  const { data } = await adminClient(c.env)
    .schema('platform')
    .from('google_grants')
    .select('email, scopes, updated_at')
    .eq('user_id', c.get('claims').sub)
    .maybeSingle<Pick<GrantRow, 'email' | 'scopes' | 'updated_at'>>();
  return c.json({
    available: true,
    connected: Boolean(data),
    email: data?.email ?? null,
    scopes: data?.scopes ?? [],
    updatedAt: data?.updated_at ?? null,
  });
});

google.delete('/', requireUser(), async (c) => {
  const oauth = settings(c.env);
  const userId = c.get('claims').sub;
  const db = adminClient(c.env);
  const { data } = await db
    .schema('platform')
    .from('google_grants')
    .select('refresh_token_enc')
    .eq('user_id', userId)
    .maybeSingle<Pick<GrantRow, 'refresh_token_enc'>>();
  if (data && oauth) {
    const token = await unseal(oauth.tokenKey, data.refresh_token_enc, userId).catch(() => null);
    if (token) c.executionCtx.waitUntil(revoke(token));
  }
  const { error } = await db
    .schema('platform')
    .from('google_grants')
    .delete()
    .eq('user_id', userId);
  if (error) return problem(500, 'db_error', 'Zugriff konnte nicht entzogen werden.');
  log('google_disconnected', { user: userId });
  return c.body(null, 204);
});

const tokenSchema = z.object({ app: z.string().regex(/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/) });

google.post('/token', requireUser(), async (c) => {
  const oauth = settings(c.env);
  if (!oauth) return notConfigured();
  const parsed = tokenSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'invalid_request', 'Unbekannte App.');
  const slug = parsed.data.app;
  const userId = c.get('claims').sub;
  const db = adminClient(c.env);

  // Only the app's own page may ask for its token: browsers set Origin and pages cannot change
  // it. Non-browser clients holding the user's session can; see ADR 0004 "Limits".
  const origin = (c.req.header('Origin') ?? '').toLowerCase();
  const { data: owner } = await db
    .schema('platform')
    .from('app_origins')
    .select('app_slug')
    .eq('origin', origin)
    .maybeSingle<{ app_slug: string }>();
  if (owner?.app_slug !== slug)
    return problem(403, 'forbidden', 'Google-Zugriff nur aus der App selbst.');

  // The user may use the app (and has passed the second factor): RLS decides with their token.
  const asUser = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${c.get('token')}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed } = await asUser.schema('platform').rpc('has_grant', { p_slug: slug });
  if (allowed !== true)
    return problem(403, 'forbidden', 'Diese App ist für dich nicht freigegeben.');

  const { data: app } = await db
    .schema('platform')
    .from('apps')
    .select('manifest')
    .eq('slug', slug)
    .maybeSingle<{ manifest: unknown }>();
  const manifest = app ? parseManifest(app.manifest) : null;
  const wanted = manifest?.ok ? googleScopes(manifest.manifest.google) : [];
  if (wanted.length === 0)
    return problem(
      403,
      'google_not_declared',
      'Diese App nutzt keine Google-Dienste (mininode.json).',
    );

  const { data: grant } = await db
    .schema('platform')
    .from('google_grants')
    .select('google_sub, scopes, refresh_token_enc')
    .eq('user_id', userId)
    .maybeSingle<Pick<GrantRow, 'google_sub' | 'scopes' | 'refresh_token_enc'>>();
  if (!grant) return notConnected();
  // Google may have been unlinked elsewhere (admin, dashboard): then the grant is void.
  const linked = await googleLinked(c.env, userId, grant.google_sub);
  if (linked === null) return problem(500, 'auth_error', 'Konto konnte nicht geprüft werden.');
  if (!linked) {
    await db
      .schema('platform')
      .from('google_grants')
      .delete()
      .eq('user_id', userId)
      .eq('refresh_token_enc', grant.refresh_token_enc);
    return notConnected();
  }
  const missing = wanted.filter((scope) => !grant.scopes.includes(scope));
  if (missing.length > 0)
    return problem(
      409,
      'google_scope_missing',
      'Gib MiniNode unter „Dein Konto“ erneut Zugriff auf Google, diese App braucht mehr Rechte.',
    );

  try {
    const refreshToken = await unseal(oauth.tokenKey, grant.refresh_token_enc, userId);
    const token = await refreshAccessToken(oauth, refreshToken, wanted);
    // Fail closed: a token with more than the app declared is never handed out.
    const extra = token.scopes.filter(
      (scope) => !wanted.includes(scope) && !IDENTITY_SCOPES.has(scope),
    );
    if (extra.length > 0) {
      log('google_downscope_failed', { user: userId, app: slug, extra });
      return problem(502, 'google_scope_mismatch', 'Google hat den Zugriff nicht eingeschränkt.');
    }
    log('google_token_issued', { user: userId, app: slug, scopes: token.scopes });
    return c.json({
      accessToken: token.accessToken,
      expiresAt: Date.now() + token.expiresIn * 1000,
      scopes: token.scopes,
    });
  } catch (err) {
    if (err instanceof GoogleError && err.code === 'invalid_grant') {
      // Revoked in the Google account or expired: forget it so "Dein Konto" offers to reconnect.
      // Only this token's row: a concurrent "Freigeben" may just have stored a new one.
      await db
        .schema('platform')
        .from('google_grants')
        .delete()
        .eq('user_id', userId)
        .eq('refresh_token_enc', grant.refresh_token_enc);
      log('google_grant_revoked', { user: userId });
      return notConnected();
    }
    log('google_token_failed', { user: userId, app: slug, error: String(err) });
    return problem(502, 'google_unavailable', 'Google ist gerade nicht erreichbar.');
  }
});
