// Host-level API keys (ADR 0006) against the local Supabase stack, with the external APIs stubbed.
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

describe.skipIf(!enabled)('host-level api keys', () => {
  const run = Date.now().toString(36);
  const slug = `wetter${run}`;
  const other = `garten${run}`;
  const origin = `https://${slug}.test`;
  const weather = `weather-${run}`;
  const maps = `maps-${run}`;
  const free = `free-${run}`;
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
  let userToken = '';
  let adminToken = '';
  const upstream: { url: string; headers: Headers; body: string }[] = [];

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target.startsWith('https://weather.example/')) {
      upstream.push({
        url: target,
        headers: new Headers(init?.headers),
        body: init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : '',
      });
      if (target.includes('/moved'))
        return new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } });
      return Response.json(
        { temp: 21 },
        { headers: { 'Set-Cookie': 'tracking=1', 'X-Secret': 'internal' } },
      );
    }
    return realFetch(input, init);
  });

  async function tokenFor(email: string, role: 'admin' | 'user') {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    users.push(data.user.id);
    await admin.schema('platform').from('profiles').update({ role }).eq('user_id', data.user.id);
    const client = createClient(url ?? '', publishableKey ?? '', {
      auth: { persistSession: false },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    return { id: data.user.id, token: session.data.session.access_token };
  }

  const call = (
    path: string,
    init: { method?: string; body?: string; origin?: string; token?: string } = {},
  ) =>
    app.request(
      path,
      {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${init.token ?? userToken}`,
          'Content-Type': 'application/json',
          Cookie: 'sb-session=private',
          ...(init.origin ? { Origin: init.origin } : {}),
        },
        ...(init.body ? { body: init.body } : {}),
      },
      env,
      ctx,
    );

  beforeAll(async () => {
    const user = await tokenFor(`apis-user-${run}@example.com`, 'user');
    userToken = user.token;
    adminToken = (await tokenFor(`apis-admin-${run}@example.com`, 'admin')).token;
    const manifest = (s: string) => ({
      specVersion: 1,
      slug: s,
      name: s,
      description: 'Test',
      kind: 'static',
      target: 'cloudflare',
    });
    await sql`insert into platform.apps (slug, name, description, kind, target, manifest, status)
      values (${slug}, 'Wetter', 'Test', 'static', 'cloudflare', ${sql.json(manifest(slug))}, 'online'),
             (${other}, 'Garten', 'Test', 'static', 'cloudflare', ${sql.json(manifest(other))}, 'online')`;
    await sql`insert into platform.app_origins (origin, app_slug) values (${origin}, ${slug}), (${`https://${other}.test`}, ${other})`;
    await sql`insert into platform.app_grants (user_id, app_slug) values (${user.id}, ${slug})`;
    const weatherApi = {
      id: weather,
      name: 'Wetterdienst',
      baseUrl: 'https://weather.example/v1',
      auth: { type: 'query', param: 'appid' },
      reason: 'Vorhersage',
    };
    for (const [s, apis] of [
      [
        slug,
        [
          weatherApi,
          { ...weatherApi, id: maps, name: 'Karten', reason: 'Karte' },
          {
            ...weatherApi,
            id: free,
            name: 'Frei',
            auth: { type: 'none' },
            reason: 'Ohne Schlüssel',
          },
        ],
      ],
      [other, [{ ...weatherApi, reason: 'Frostwarnung' }]],
    ] as const) {
      const { error } = await admin
        .schema('platform')
        .rpc('register_app_apis', { p_app_slug: s, p_apis: apis });
      if (error) throw error;
    }
  });

  afterAll(async () => {
    await sql`delete from platform.apps where slug in (${slug}, ${other})`;
    await sql`delete from platform.app_api_services where service_id in (${weather}, ${maps}, ${free})`;
    await sql`delete from platform.api_services where id in (${weather}, ${maps}, ${free})`;
    await sql`delete from platform.audit_log where detail ->> 'service' in (${weather}, ${maps})`;
    for (const id of users) await admin.auth.admin.deleteUser(id);
    await sql.end();
    vi.restoreAllMocks();
  });

  it('shares one entry between apps that use the same API', async () => {
    const rows = await sql`select app_slug from platform.app_api_services
      where service_id = ${weather} order by app_slug`;
    expect(rows.map((r) => r.app_slug)).toEqual([other, slug].sort());
  });

  it('asks for the key while none is stored', async () => {
    const res = await call(`/proxy/${weather}/forecast`, { origin });
    expect(res.status).toBe(503);
    expect(res.headers.get('X-MiniNode-Error')).toBe('1');
    expect(((await res.json()) as { error: string }).error).toBe('api_key_missing');
  });

  it('proxies keyless APIs without a key, with a User-Agent', async () => {
    upstream.length = 0;
    const res = await call(`/proxy/${free}/forecast?q=1`, { origin });
    expect(res.status).toBe(200);
    expect(upstream[0]?.url).toBe('https://weather.example/v1/forecast?q=1');
    expect(upstream[0]?.headers.get('User-Agent')).toMatch(/^MiniNode/);

    // Keyless calls work even where no VAULT_KEY is configured.
    upstream.length = 0;
    const { VAULT_KEY: _vault, ...noVault } = env;
    const bare = await app.request(
      `/proxy/${free}/forecast?q=2`,
      { headers: { Authorization: `Bearer ${userToken}`, Origin: origin } },
      noVault as ApiEnv,
      ctx,
    );
    expect(bare.status).toBe(200);
    expect(upstream[0]?.url).toBe('https://weather.example/v1/forecast?q=2');

    // …and nobody can store a key for them.
    const stored = await call(`/admin/api-keys/${free}`, {
      method: 'PUT',
      body: JSON.stringify({ key: 'sk-unused-1234' }),
      token: adminToken,
    });
    expect(stored.status).toBe(409);
  });

  it('lets only an admin store the key, encrypted', async () => {
    const body = JSON.stringify({ key: 'sk-weather-1234' });
    const denied = await call(`/admin/api-keys/${weather}`, { method: 'PUT', body });
    expect(denied.status).toBe(403);
    const res = await call(`/admin/api-keys/${weather}`, {
      method: 'PUT',
      body,
      token: adminToken,
    });
    expect(res.status).toBe(204);
    const [row] =
      await sql`select key_enc, key_hint from platform.api_services where id = ${weather}`;
    expect(row?.key_hint).toBe('1234');
    expect(row?.key_enc).toBeTruthy();
    expect(String(row?.key_enc)).not.toContain('sk-weather');
    const [audit] = await sql`select count(*)::int as n from platform.audit_log
      where action = 'api_key.set' and detail ->> 'service' = ${weather}`;
    expect(audit?.n).toBe(1);
    const unknown = await call(`/admin/api-keys/nothing-${run}`, {
      method: 'PUT',
      body,
      token: adminToken,
    });
    expect(unknown.status).toBe(404);
  });

  it('adds the key server-side and passes on only safe headers', async () => {
    upstream.length = 0;
    const res = await call(`/proxy/${weather}/forecast?city=M%C3%BCnchen&appid=mine`, {
      method: 'POST',
      body: '{"days":3}',
      origin,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ temp: 21 });
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(res.headers.get('X-Secret')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-MiniNode-Error')).toBeNull();
    const sent = upstream[0];
    const target = new URL(sent?.url ?? '');
    expect(target.pathname).toBe('/v1/forecast');
    expect(target.searchParams.get('city')).toBe('München');
    expect(target.searchParams.getAll('appid')).toEqual(['sk-weather-1234']);
    expect(sent?.headers.get('Authorization')).toBeNull();
    expect(sent?.headers.get('Cookie')).toBeNull();
    expect(sent?.body).toBe('{"days":3}');
  });

  it('refuses calls from elsewhere, without access or for undeclared APIs', async () => {
    expect((await call(`/proxy/${weather}/forecast`)).status).toBe(403);
    expect((await call(`/proxy/${weather}/forecast`, { origin: 'https://evil.test' })).status).toBe(
      403,
    );
    // Declared by the other app, but this user has no grant for it.
    expect((await call(`/proxy/${weather}/x`, { origin: `https://${other}.test` })).status).toBe(
      403,
    );
    await sql`delete from platform.app_api_services where app_slug = ${slug} and service_id = ${maps}`;
    const undeclared = await call(`/proxy/${maps}/tiles`, { origin });
    expect(undeclared.status).toBe(403);
    expect(((await undeclared.json()) as { error: string }).error).toBe('api_not_declared');
  });

  it('keeps requests below the base URL and never passes on redirects', async () => {
    for (const path of ['/..%2Fadmin', '/%2e%2e%2fadmin'])
      expect((await call(`/proxy/${weather}${path}`, { origin })).status).toBe(400);
    upstream.length = 0;
    const moved = await call(`/proxy/${weather}/moved`, { origin });
    expect(moved.status).toBe(502);
    expect(moved.headers.get('Location')).toBeNull();
  });

  it('limits the body also without Content-Length', async () => {
    const big = new Uint8Array(1_000_001);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(big);
        controller.close();
      },
    });
    const res = await app.request(
      `/proxy/${weather}/upload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, Origin: origin },
        body: stream,
        duplex: 'half',
      } as RequestInit,
      env,
      ctx,
    );
    expect(res.status).toBe(413);
  });

  it('refuses a key that no longer fits its target or the vault key', async () => {
    const other = { ...env, VAULT_KEY: btoa('x'.repeat(32)) } as ApiEnv;
    const wrongVault = await app.request(
      `/proxy/${weather}/forecast`,
      { headers: { Authorization: `Bearer ${userToken}`, Origin: origin } },
      other,
      ctx,
    );
    expect(wrongVault.status).toBe(503);
    expect(((await wrongVault.json()) as { error: string }).error).toBe('api_key_unreadable');
    // Moved behind the deploy's back: the ciphertext is bound to the old target.
    await sql`update platform.api_services set base_url = 'https://moved.example/v1' where id = ${weather}`;
    upstream.length = 0;
    const moved = await call(`/proxy/${weather}/forecast`, { origin });
    expect(moved.status).toBe(503);
    expect(upstream).toHaveLength(0);
    await sql`update platform.api_services set base_url = 'https://weather.example/v1' where id = ${weather}`;
  });

  it('rate-limits runaway loops', async () => {
    // Up to two windows' worth, in case a new minute starts during the loop.
    let last = 200;
    for (let i = 0; i < 125 && last !== 429; i++)
      last = (await call(`/proxy/${weather}/forecast`, { origin })).status;
    expect(last).toBe(429);
  });

  it('removes the key and unused entries', async () => {
    expect(
      (await call(`/admin/api-keys/${weather}`, { method: 'DELETE', token: adminToken })).status,
    ).toBe(204);
    const [row] = await sql`select key_enc from platform.api_services where id = ${weather}`;
    expect(row?.key_enc).toBeNull();
    const inUse = await call(`/admin/api-services/${weather}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(inUse.status).toBe(409);
    const unused = await call(`/admin/api-services/${maps}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(unused.status).toBe(204);
    const left = await sql`select id from platform.api_services where id = ${maps}`;
    expect(left).toHaveLength(0);
  });
});
