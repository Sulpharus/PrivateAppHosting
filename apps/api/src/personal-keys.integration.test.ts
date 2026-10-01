// Site-wide or personal API keys (ADR 0014) against the local Supabase stack, with the external
// API stubbed.
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
const enabled = Boolean(url && publishableKey && secretKey && dbUrl);

describe.skipIf(!enabled)('personal api keys', () => {
  const run = Date.now().toString(36);
  const slug = `pers${run}`;
  const origin = `https://${slug}.test`;
  const service = `pers-${run}`;
  const keyless = `pfree-${run}`;
  const password = 'correct horse battery staple';
  const env = {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    PORTAL_URL: 'https://mininode.app',
    VAULT_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
  } as unknown as ApiEnv;
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} };
  const sql = postgres(dbUrl ?? '', { max: 1 });
  const admin = createClient(url ?? 'http://127.0.0.1', secretKey ?? 'unused', {
    auth: { persistSession: false },
  });
  const users: string[] = [];
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const upstream: string[] = [];

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target.startsWith('https://pers.example/')) {
      upstream.push(target);
      return Response.json({ ok: true });
    }
    return realFetch(input, init);
  });

  async function signUp(name: string, role: 'admin' | 'user') {
    const email = `pers-${name}-${run}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    users.push(data.user.id);
    ids[name] = data.user.id;
    await admin.schema('platform').from('profiles').update({ role }).eq('user_id', data.user.id);
    const client = createClient(url ?? '', publishableKey ?? '', {
      auth: { persistSession: false },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    tokens[name] = session.data.session.access_token;
  }

  const call = (
    name: string,
    path: string,
    init: { method?: string; body?: unknown; origin?: string } = {},
  ) =>
    app.request(
      path,
      {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${tokens[name]}`,
          'Content-Type': 'application/json',
          ...(init.origin ? { Origin: init.origin } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      },
      env,
      ctx,
    );

  beforeAll(async () => {
    await signUp('admin', 'admin');
    await signUp('anna', 'user');
    await signUp('ben', 'user');
    await signUp('fremd', 'user');
    const manifest = {
      specVersion: 1,
      slug,
      name: slug,
      description: 'Test',
      kind: 'static',
      target: 'cloudflare',
    };
    await sql`insert into platform.apps (slug, name, description, kind, target, manifest, status)
      values (${slug}, 'Wetter', 'Test', 'static', 'cloudflare', ${sql.json(manifest)}, 'online')`;
    await sql`insert into platform.app_origins (origin, app_slug) values (${origin}, ${slug})`;
    await sql`insert into platform.app_grants (user_id, app_slug)
      values (${ids.anna ?? ''}, ${slug}), (${ids.ben ?? ''}, ${slug})`;
    const api = {
      id: service,
      name: 'Wetterdienst',
      baseUrl: 'https://pers.example/v1',
      auth: { type: 'query', param: 'appid' },
      docs: 'https://pers.example/keys',
      reason: 'Vorhersage',
    };
    const { error } = await admin.schema('platform').rpc('register_app_apis', {
      p_app_slug: slug,
      p_apis: [api, { ...api, id: keyless, name: 'Frei', auth: { type: 'none' } }],
    });
    if (error) throw error;
  });

  afterAll(async () => {
    await sql`delete from platform.apps where slug = ${slug}`;
    await sql`delete from platform.app_api_services where service_id in (${service}, ${keyless})`;
    await sql`delete from platform.api_services where id in (${service}, ${keyless})`;
    await sql`delete from platform.audit_log where detail ->> 'service' = ${service}`;
    for (const id of users) await admin.auth.admin.deleteUser(id);
    await sql.end();
    vi.restoreAllMocks();
  });

  const proxy = (name: string) => call(name, `/proxy/${service}/forecast`, { origin });
  const sentKey = () => new URL(upstream.at(-1) ?? 'https://x.invalid').searchParams.get('appid');

  it('only the admin switches the mode, and keyless APIs stay keyless', async () => {
    const body = { mode: 'personal' };
    const path = `/admin/api-services/${service}/mode`;
    expect((await call('anna', path, { method: 'PUT', body })).status).toBe(403);
    expect((await call('admin', path, { method: 'PUT', body })).status).toBe(204);
    expect(
      (await call('admin', `/admin/api-services/${keyless}/mode`, { method: 'PUT', body })).status,
    ).toBe(409);
    const [row] = await sql`select key_mode from platform.api_services where id = ${service}`;
    expect(row?.key_mode).toBe('personal');
  });

  it('asks for the personal key and names the API', async () => {
    const res = await proxy('anna');
    expect(res.status).toBe(503);
    expect(res.headers.get('X-MiniNode-Error')).toBe('1');
    expect(await res.json()).toMatchObject({
      error: 'api_key_missing',
      personal: true,
      service,
      serviceName: 'Wetterdienst',
    });
  });

  it("stores each user's key encrypted and uses it only for that user", async () => {
    const put = (name: string, key: string) =>
      call(name, `/me/api-keys/${service}`, { method: 'PUT', body: { key } });
    expect((await put('anna', 'anna-secret-key-1234')).status).toBe(204);
    expect((await put('ben', 'ben-secret-key-5678')).status).toBe(204);
    const rows = await sql`select user_id, key_enc, key_hint from platform.user_api_keys
      where service_id = ${service}`;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(String(row.key_enc)).not.toContain('secret-key');

    await proxy('anna');
    expect(sentKey()).toBe('anna-secret-key-1234');
    await proxy('ben');
    expect(sentKey()).toBe('ben-secret-key-5678');
  });

  it('refuses keys for people who have no app that needs the API', async () => {
    const res = await call('fremd', `/me/api-keys/${service}`, {
      method: 'PUT',
      body: { key: 'fremd-secret-key-0000' },
    });
    expect(res.status).toBe(404);
    expect(
      (await call('anna', `/me/api-keys/${service}`, { method: 'PUT', body: { key: 'short' } }))
        .status,
    ).toBe(400);
  });

  it('does not move a stored key to another account', async () => {
    // Ben's ciphertext copied into Anna's row cannot be read for her (bound to the user id).
    const [ben] = await sql`select key_enc from platform.user_api_keys
      where service_id = ${service} and user_id = ${ids.ben ?? ''}`;
    await sql`update platform.user_api_keys set key_enc = ${String(ben?.key_enc)}
      where service_id = ${service} and user_id = ${ids.anna ?? ''}`;
    upstream.length = 0;
    const res = await proxy('anna');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('api_key_unreadable');
    expect(upstream).toHaveLength(0);
  });

  it('ignores the admin key in personal mode and uses it again for sitewide', async () => {
    await call('anna', `/me/api-keys/${service}`, {
      method: 'PUT',
      body: { key: 'anna-secret-key-1234' },
    });
    await call('admin', `/admin/api-keys/${service}`, {
      method: 'PUT',
      body: { key: 'admin-secret-key-9999' },
    });
    await proxy('anna');
    expect(sentKey()).toBe('anna-secret-key-1234');
    await call('admin', `/admin/api-services/${service}/mode`, {
      method: 'PUT',
      body: { mode: 'sitewide' },
    });
    await proxy('anna');
    expect(sentKey()).toBe('admin-secret-key-9999');
  });

  it('lets a user remove their own key', async () => {
    expect((await call('ben', `/me/api-keys/${service}`, { method: 'DELETE' })).status).toBe(204);
    const [row] = await sql`select count(*)::int as n from platform.user_api_keys
      where service_id = ${service} and user_id = ${ids.ben ?? ''}`;
    expect(row?.n).toBe(0);
  });
});
