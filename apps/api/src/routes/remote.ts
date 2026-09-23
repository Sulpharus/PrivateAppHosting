import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiEnv } from '../env.ts';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import {
  clientIdentifier,
  encryptAuthPayload,
  type GuacConnection,
  lockDownParameters,
} from '../lib/guacamole.ts';
import { adminClient } from '../lib/supabase.ts';

const requestSchema = z.object({ app: z.string().regex(/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/) });

interface RemoteSessionRow {
  id: string;
  app_slug: string;
  user_id: string;
  status: 'queued' | 'active' | 'ended';
}

/** Headers for control.mininode.app (behind Cloudflare Access + a bearer token). */
export function controlHeaders(env: ApiEnv): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.NUCBOX_CONTROL_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = env.ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = env.ACCESS_CLIENT_SECRET;
  }
  return headers;
}

type PrepareResult =
  | { ready: false; etaSeconds: number }
  | { ready: true; connection: GuacConnection };

async function prepareRuntime(env: ApiEnv, body: object): Promise<PrepareResult> {
  const response = await fetch(`${env.NUCBOX_CONTROL_URL}/sessions/prepare`, {
    method: 'POST',
    headers: controlHeaders(env),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`nucbox-control prepare failed: ${response.status}`);
  return (await response.json()) as PrepareResult;
}

async function guacamoleToken(env: ApiEnv, data: string): Promise<string> {
  const response = await fetch(`${env.GUACAMOLE_URL}/api/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data }),
  });
  if (!response.ok) throw new Error(`guacamole token exchange failed: ${response.status}`);
  return ((await response.json()) as { authToken: string }).authToken;
}

export const remote = new Hono<AppContext>();

remote.post('/sessions', requireUser(), async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'invalid_request', 'Unbekannte App.');
  const slug = parsed.data.app;
  const claims = c.get('claims');
  const db = adminClient(c.env);

  // Grant check with the caller's own token so RLS/has_grant decide, not the service role.
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
    .select('slug, name, kind, data_mode, manifest')
    .eq('slug', slug)
    .single();
  if (app?.kind !== 'remote') return problem(404, 'not_found', 'Keine Remote-App.');

  const shared = app.data_mode === 'shared-account';
  if (shared) {
    const role = claims.mn_role ?? 'user';
    if (role === 'user') return problem(403, 'forbidden', 'Nur für vertrauenswürdige Nutzer.');
    const recent = (claims.amr ?? []).some((entry) => entry.timestamp >= Date.now() / 1000 - 600);
    if (!recent) return problem(403, 'reauth_required', 'Bitte bestätige kurz deine Identität.');
  }

  const { data: session, error } = await db
    .schema('platform')
    .rpc('remote_request', { p_app_slug: slug, p_user_id: claims.sub })
    .single<RemoteSessionRow>();
  if (error || !session)
    return problem(500, 'db_error', error?.message ?? 'Sitzung fehlgeschlagen.');

  if (session.status === 'queued') {
    return c.json({ status: 'queued', sessionId: session.id });
  }

  const remoteConfig = (app.manifest as { remote?: { runtime: string; program: string } }).remote;
  if (!remoteConfig)
    return problem(500, 'misconfigured', 'Remote-App ohne Laufzeit-Konfiguration.');

  let prepared: PrepareResult;
  try {
    prepared = await prepareRuntime(c.env, {
      app: slug,
      runtime: remoteConfig.runtime,
      program: remoteConfig.program,
      sessionId: session.id,
      userId: claims.sub,
    });
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'remote_prepare_failed', app: slug, error: String(err) }),
    );
    return problem(502, 'host_unavailable', 'Die NucBox ist gerade nicht erreichbar.');
  }
  if (!prepared.ready) {
    return c.json({ status: 'starting', sessionId: session.id, etaSeconds: prepared.etaSeconds });
  }

  const connectionName = `${app.name}`;
  const blob = await encryptAuthPayload(c.env.GUACAMOLE_JSON_SECRET, {
    username: claims.email ?? claims.sub,
    expires: Date.now() + 60_000,
    connections: {
      [connectionName]: {
        protocol: prepared.connection.protocol,
        parameters: lockDownParameters(
          prepared.connection.parameters,
          shared && claims.mn_role !== 'admin',
        ),
      },
    },
  });
  const authToken = await guacamoleToken(c.env, blob);
  const connectUrl = `${c.env.GUACAMOLE_URL}/?token=${encodeURIComponent(authToken)}#/client/${clientIdentifier(connectionName)}`;
  return c.json({ status: 'active', sessionId: session.id, connectUrl });
});

remote.post('/sessions/:id/heartbeat', requireUser(), async (c) => {
  const { data, error } = await adminClient(c.env)
    .schema('platform')
    .from('remote_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', c.req.param('id'))
    .eq('user_id', c.get('claims').sub)
    .in('status', ['queued', 'active'])
    .select('status')
    .maybeSingle();
  if (error) return problem(500, 'db_error', error.message);
  if (!data) return problem(404, 'not_found', 'Sitzung beendet.');
  return c.json({ status: data.status });
});

remote.delete('/sessions/:id', requireUser(), async (c) => {
  const db = adminClient(c.env);
  const claims = c.get('claims');
  const { data: session } = await db
    .schema('platform')
    .from('remote_sessions')
    .select('id, user_id')
    .eq('id', c.req.param('id'))
    .maybeSingle();
  if (!session || (session.user_id !== claims.sub && claims.mn_role !== 'admin')) {
    return problem(404, 'not_found', 'Sitzung nicht gefunden.');
  }
  const { error } = await db
    .schema('platform')
    .rpc('remote_end', { p_session_id: session.id, p_reason: 'user' });
  if (error) return problem(500, 'db_error', error.message);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------------------------
// Installs (admin): nucbox-control snapshots the VM, verifies the installer hash and installs.

interface RemoteManifest {
  runtime: 'windows' | 'wine' | 'android';
  program: string;
  installer?: { r2Key: string; sha256: string; silentArgs?: string };
  wingetId?: string;
}

remote.post('/installs', requireUser({ role: 'admin', recentAuth: 600 }), async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'invalid_request', 'Unbekannte App.');
  const db = adminClient(c.env);
  const { data: app } = await db
    .schema('platform')
    .from('apps')
    .select('slug, kind, manifest')
    .eq('slug', parsed.data.app)
    .single();
  const config = (app?.manifest as { remote?: RemoteManifest } | undefined)?.remote;
  if (app?.kind !== 'remote' || !config) return problem(404, 'not_found', 'Keine Remote-App.');
  if (config.runtime === 'android')
    return problem(501, 'runtime_unavailable', 'Android-Apps werden noch nicht unterstützt.');
  if (!config.installer && !config.wingetId)
    return problem(400, 'no_installer', 'Das Manifest nennt weder Installer noch winget-ID.');

  const response = await fetch(`${c.env.NUCBOX_CONTROL_URL}/installers`, {
    method: 'POST',
    headers: controlHeaders(c.env),
    body: JSON.stringify({
      app: app.slug,
      runtime: config.runtime,
      program: config.program,
      installer: config.installer,
      wingetId: config.wingetId,
    }),
  }).catch(() => null);
  if (!response) return problem(502, 'host_unavailable', 'Die NucBox ist gerade nicht erreichbar.');
  if (response.status === 409)
    return problem(409, 'busy', 'Für diese App läuft schon eine Installation.');
  if (!response.ok)
    return problem(502, 'host_error', `Installation abgelehnt (${response.status}).`);

  const job = (await response.json()) as { id: string };
  await db
    .schema('platform')
    .from('audit_log')
    .insert({
      actor_id: c.get('claims').sub,
      app_slug: app.slug,
      action: 'remote.install',
      detail: {
        job: job.id,
        runtime: config.runtime,
        installer: config.installer?.r2Key ?? config.wingetId,
      },
    });
  return c.json(job, 202);
});

remote.get('/installs/:id', requireUser({ role: 'admin' }), async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/.test(id)) return problem(400, 'invalid_request', 'Ungültige ID.');
  const response = await fetch(`${c.env.NUCBOX_CONTROL_URL}/installers/${id}`, {
    headers: controlHeaders(c.env),
  }).catch(() => null);
  if (!response) return problem(502, 'host_unavailable', 'Die NucBox ist gerade nicht erreichbar.');
  if (response.status === 404)
    return problem(404, 'not_found', 'Installation unbekannt (Neustart?).');
  return c.json(await response.json());
});
