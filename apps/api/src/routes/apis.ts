// Host-level API keys (ADR 0006).
//   ALL    /proxy/:service/*            an app calls an external API; the key is added here
//   PUT    /admin/api-keys/:service     admin enters or replaces the key
//   DELETE /admin/api-keys/:service     admin removes the key (the entry stays)
//   DELETE /admin/api-services/:service admin removes an entry no app uses any more

import { isAllowedApiBase } from '@mininode/manifest';
import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { seal, unseal } from '../lib/google.ts';
import { adminClient } from '../lib/supabase.ts';

type Auth =
  | { type: 'header'; name: string; prefix?: string }
  | { type: 'bearer' }
  | { type: 'query'; param: string }
  | { type: 'none' };

interface ServiceRow {
  id: string;
  name: string;
  base_url: string;
  auth: Auth;
  key_enc: string | null;
}

const serviceId = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);
const log = (event: string, detail: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...detail }));

/** Request headers an app may pass on; everything else (cookies, the user's token) stays here. */
const FORWARD_REQUEST = ['accept', 'accept-language', 'content-type'];
const FORWARD_RESPONSE = ['content-type', 'content-language', 'etag', 'last-modified'];
const MAX_BODY = 1_000_000;

/** Calls per user and API per minute (per isolate; a guard against runaway loops). */
const RATE = 60;
let rateWindow = { minute: 0, calls: new Map<string, number>() };
function allowed(key: string): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  if (rateWindow.minute !== minute) rateWindow = { minute, calls: new Map() };
  const count = (rateWindow.calls.get(key) ?? 0) + 1;
  rateWindow.calls.set(key, count);
  return count <= RATE;
}

/**
 * Additional data for the key's encryption: the API id and where the key goes. A stored key
 * cannot be decrypted once the entry points elsewhere (defence in depth; the deploy also drops
 * the key when the target changes).
 */
export function keyBinding(service: Pick<ServiceRow, 'id' | 'base_url' | 'auth'>): string {
  const auth = Object.fromEntries(
    Object.entries(service.auth).sort(([a], [b]) => a.localeCompare(b)),
  );
  return `${service.id}\n${service.base_url}\n${JSON.stringify(auth)}`;
}

/** Reads at most `max` bytes; null when the body is larger (whatever Content-Length says). */
async function readCapped(body: ReadableStream<Uint8Array> | null, max: number) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * The target URL below the service's base URL. `path` comes from the app, so it must not leave
 * the base (no `..`, no other host); the result is checked after URL resolution.
 */
export function targetUrl(baseUrl: string, path: string, search: string): URL | null {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  if (path.includes('..') || path.includes('\\') || /%2e|%2f|%5c/i.test(path)) return null;
  const url = new URL(`${base.origin}${basePath}${path.startsWith('/') ? '' : '/'}${path}`);
  if (url.origin !== base.origin) return null;
  if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return null;
  url.search = search;
  return url;
}

/** Puts the key where the API expects it; overrides anything the app sent in its place. */
export function withKey(url: URL, headers: Headers, auth: Auth, key: string): void {
  if (auth.type === 'none') return;
  if (auth.type === 'query') url.searchParams.set(auth.param, key);
  else if (auth.type === 'bearer') headers.set('Authorization', `Bearer ${key}`);
  else headers.set(auth.name, `${auth.prefix ?? ''}${key}`);
}

type ProxyContext = AppContext & { Variables: { relayed?: true } };
export const apis = new Hono<ProxyContext>();

// Every proxy response that is not the external API's answer is MiniNode's own refusal.
apis.use('/proxy/*', async (c, next) => {
  await next();
  if (!c.get('relayed')) c.res.headers.set('X-MiniNode-Error', '1');
});

apis.all('/proxy/:service/*', requireUser(), async (c) => {
  const id = serviceId.safeParse(c.req.param('service'));
  if (!id.success) return problem(404, 'not_found', 'Unbekannte API.');
  const userId = c.get('claims').sub;
  const db = adminClient(c.env);

  // The calling app, from the Origin its page sent (browsers set it; pages cannot change it).
  const origin = (c.req.header('Origin') ?? '').toLowerCase();
  const { data: owner } = await db
    .schema('platform')
    .from('app_origins')
    .select('app_slug')
    .eq('origin', origin)
    .maybeSingle<{ app_slug: string }>();
  if (!owner) return problem(403, 'forbidden', 'API-Aufrufe nur aus einer App.');
  const slug = owner.app_slug;

  const asUser = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${c.get('token')}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: granted } = await asUser.schema('platform').rpc('has_grant', { p_slug: slug });
  if (granted !== true)
    return problem(403, 'forbidden', 'Diese App ist für dich nicht freigegeben.');

  const [{ data: requested }, { data: service }] = await Promise.all([
    db
      .schema('platform')
      .from('app_api_services')
      .select('service_id')
      .eq('app_slug', slug)
      .eq('service_id', id.data)
      .maybeSingle(),
    db
      .schema('platform')
      .from('api_services')
      .select('id, name, base_url, auth, key_enc')
      .eq('id', id.data)
      .maybeSingle<ServiceRow>(),
  ]);
  if (!requested || !service)
    return problem(
      403,
      'api_not_declared',
      'Diese App hat die API nicht in mininode.json angemeldet.',
    );
  if (!isAllowedApiBase(service.base_url))
    return problem(503, 'api_blocked', `${service.name} hat eine unzulässige Adresse.`);
  // Keyless APIs are only proxied (the browser cannot reach them); everything else needs its key.
  const keyless = service.auth.type === 'none';
  const vaultKey = c.env.VAULT_KEY;
  if (!keyless && !vaultKey)
    return problem(503, 'vault_not_configured', 'API-Schlüssel sind nicht eingerichtet.');
  if (!keyless && !service.key_enc)
    return problem(
      503,
      'api_key_missing',
      `Für ${service.name} ist noch kein Schlüssel hinterlegt. Der Admin trägt ihn unter Verwaltung → API-Schlüssel ein.`,
    );
  if (!allowed(`${userId}:${service.id}`))
    return problem(429, 'rate_limited', 'Zu viele Anfragen. Bitte kurz warten.');

  const prefix = `/proxy/${service.id}`;
  const requestUrl = new URL(c.req.url);
  const url = targetUrl(
    service.base_url,
    requestUrl.pathname.slice(prefix.length),
    requestUrl.search,
  );
  if (!url) return problem(400, 'invalid_path', 'Ungültiger Pfad.');

  const method = c.req.method;
  const tooLarge = () => problem(413, 'too_large', 'Die Anfrage ist zu groß.');
  if (Number(c.req.header('Content-Length') ?? 0) > MAX_BODY) return tooLarge();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await readCapped(c.req.raw.body, MAX_BODY);
  if (body === null) return tooLarge();
  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = c.req.header(name);
    if (value) headers.set(name, value);
  }
  // Some public APIs refuse requests without a User-Agent (Workers send none by default).
  headers.set('User-Agent', 'MiniNode/1.0 (+https://mininode.app)');
  try {
    if (!keyless && vaultKey && service.key_enc)
      withKey(
        url,
        headers,
        service.auth,
        await unseal(vaultKey, service.key_enc, keyBinding(service)),
      );
  } catch (err) {
    log('api_key_unreadable', { service: service.id, error: String(err) });
    return problem(
      503,
      'api_key_unreadable',
      `Der Schlüssel für ${service.name} muss unter Verwaltung → API-Schlüssel neu eingetragen werden.`,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      ...(body ? { body } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    log('api_proxy_failed', { app: slug, service: service.id, error: String(err) });
    return problem(502, 'api_unavailable', `${service.name} ist gerade nicht erreichbar.`);
  }
  log('api_proxy', { app: slug, service: service.id, method, status: upstream.status });

  const out = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  // Redirects would expose where the key went (query keys sit in the URL): never pass them on.
  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel();
    return problem(
      502,
      'api_redirect',
      `${service.name} hat umgeleitet; das wird nicht weitergegeben.`,
    );
  }
  c.set('relayed', true);
  return new Response(upstream.body, { status: upstream.status, headers: out });
});

/** Real API keys are long; a short value is a typo, and its hint would reveal it entirely. */
const keySchema = z.object({ key: z.string().trim().min(12).max(4000) });

async function audit(
  c: { env: AppContext['Bindings'] },
  actor: string,
  action: string,
  id: string,
) {
  const { error } = await adminClient(c.env)
    .schema('platform')
    .from('audit_log')
    .insert({ actor_id: actor, action, detail: { service: id } });
  if (error) log('audit_failed', { action, service: id, error: error.message });
}

apis.put('/admin/api-keys/:service', requireUser({ role: 'admin', recentAuth: 600 }), async (c) => {
  const id = serviceId.safeParse(c.req.param('service'));
  const body = keySchema.safeParse(await c.req.json().catch(() => null));
  if (!id.success || !body.success) return problem(400, 'invalid_request', 'Ungültiger Schlüssel.');
  if (!c.env.VAULT_KEY)
    return problem(503, 'vault_not_configured', 'VAULT_KEY fehlt im API-Worker.');
  const db = adminClient(c.env);
  const actor = c.get('claims').sub;
  const { data: service } = await db
    .schema('platform')
    .from('api_services')
    .select('id, base_url, auth')
    .eq('id', id.data)
    .maybeSingle<Pick<ServiceRow, 'id' | 'base_url' | 'auth'>>();
  if (!service) return problem(404, 'not_found', 'Unbekannte API.');
  if (service.auth.type === 'none')
    return problem(409, 'keyless', 'Diese API braucht keinen Schlüssel.');
  // Only if the target is still the one shown to the admin (a deploy may have changed it).
  const { data, error } = await db
    .schema('platform')
    .from('api_services')
    .update({
      key_enc: await seal(c.env.VAULT_KEY, body.data.key, keyBinding(service)),
      key_hint: body.data.key.slice(-4),
      key_updated_at: new Date().toISOString(),
      key_updated_by: actor,
    })
    .eq('id', service.id)
    .eq('base_url', service.base_url)
    .eq('auth', JSON.stringify(service.auth))
    .select('id')
    .maybeSingle();
  if (error) return problem(500, 'db_error', 'Speichern fehlgeschlagen.');
  if (!data) return problem(409, 'changed', 'Die API wurde gerade geändert. Bitte neu laden.');
  await audit(c, actor, 'api_key.set', id.data);
  log('api_key_set', { service: id.data, by: actor });
  return c.body(null, 204);
});

apis.delete(
  '/admin/api-keys/:service',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const id = serviceId.safeParse(c.req.param('service'));
    if (!id.success) return problem(400, 'invalid_request', 'Unbekannte API.');
    const db = adminClient(c.env);
    const actor = c.get('claims').sub;
    const { data, error } = await db
      .schema('platform')
      .from('api_services')
      .update({
        key_enc: null,
        key_hint: null,
        key_updated_at: new Date().toISOString(),
        key_updated_by: actor,
      })
      .eq('id', id.data)
      .select('id')
      .maybeSingle();
    if (error) return problem(500, 'db_error', 'Entfernen fehlgeschlagen.');
    if (!data) return problem(404, 'not_found', 'Unbekannte API.');
    await audit(c, actor, 'api_key.removed', id.data);
    return c.body(null, 204);
  },
);

apis.delete(
  '/admin/api-services/:service',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const id = serviceId.safeParse(c.req.param('service'));
    if (!id.success) return problem(400, 'invalid_request', 'Unbekannte API.');
    // The foreign key refuses the delete while an app requests the API (no count-then-delete race).
    const { data, error } = await adminClient(c.env)
      .schema('platform')
      .from('api_services')
      .delete()
      .eq('id', id.data)
      .select('id')
      .maybeSingle();
    if (error?.code === '23503')
      return problem(409, 'in_use', 'Diese API wird noch von einer App genutzt.');
    if (error) return problem(500, 'db_error', 'Entfernen fehlgeschlagen.');
    if (!data) return problem(404, 'not_found', 'Unbekannte API.');
    await audit(c, c.get('claims').sub, 'api_service.removed', id.data);
    return c.body(null, 204);
  },
);
