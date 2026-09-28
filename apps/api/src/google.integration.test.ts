// Google services for apps against the local Supabase stack, with Google's endpoints stubbed.
import { ALL_GOOGLE_SCOPES, GOOGLE_SCOPES } from '@mininode/manifest';
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

describe.skipIf(!enabled)('google services for apps', () => {
  const run = Date.now().toString(36);
  const slug = `mail${run}`;
  const plainSlug = `plain${run}`;
  const origin = `https://${slug}.test`;
  const sub = `g-${run}`;
  const password = 'correct horse battery staple';
  const env = {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    PORTAL_URL: 'https://mininode.app',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_TOKEN_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
  } as unknown as ApiEnv;
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} };
  const sql = postgres(dbUrl ?? '', { max: 1 });
  const admin = createClient(url ?? 'http://127.0.0.1', secretKey ?? 'unused', {
    auth: { persistSession: false },
  });
  let userId = '';
  let token = '';
  const refreshCalls: URLSearchParams[] = [];
  const revoked: string[] = [];
  let ignoreScope = false;

  // Google: refresh token "good" works, "stranger" belongs to another account, "revoked" is dead.
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(String(init?.body));
      refreshCalls.push(body);
      const refresh = body.get('refresh_token');
      if (refresh === 'revoked-refresh')
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const all = ['openid', ...ALL_GOOGLE_SCOPES].join(' ');
      const scope = ignoreScope ? all : (body.get('scope') ?? all);
      return Response.json({ access_token: `at:${refresh}`, expires_in: 3599, scope });
    }
    if (target === 'https://openidconnect.googleapis.com/v1/userinfo') {
      const auth = new Headers(init?.headers).get('Authorization');
      return Response.json({
        sub: auth === 'Bearer at:stranger-refresh' ? 'someone-else' : sub,
        email: 'me@gmail.com',
      });
    }
    if (target === 'https://oauth2.googleapis.com/revoke') {
      revoked.push(new URLSearchParams(String(init?.body)).get('token') ?? '');
      return new Response(null, { status: 200 });
    }
    return realFetch(input, init);
  });

  const call = (path: string, init: { method?: string; body?: unknown; origin?: string } = {}) =>
    app.request(
      path,
      {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init.origin ? { Origin: init.origin } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      },
      env,
      ctx,
    );

  beforeAll(async () => {
    const email = `google-${run}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    await sql`insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
      values (${sub}, ${userId}, ${sql.json({ sub, email: 'me@gmail.com' })}, 'google', now(), now())`;
    const manifest = (google?: Record<string, string>) => ({
      specVersion: 1,
      slug,
      name: 'Mail',
      description: 'Test',
      kind: 'static',
      target: 'cloudflare',
      ...(google ? { google } : {}),
    });
    await sql`insert into platform.apps (slug, name, description, kind, target, manifest, status)
      values (${slug}, 'Mail', 'Test', 'static', 'cloudflare', ${sql.json(manifest({ calendar: 'write' }))}, 'online'),
             (${plainSlug}, 'Plain', 'Test', 'static', 'cloudflare', ${sql.json({ ...manifest(), slug: plainSlug })}, 'online')`;
    await sql`insert into platform.app_origins (origin, app_slug) values (${origin}, ${slug}), (${`https://${plainSlug}.test`}, ${plainSlug})`;
    await sql`insert into platform.app_grants (user_id, app_slug) values (${userId}, ${slug}), (${userId}, ${plainSlug})`;
    const client = createClient(url ?? '', publishableKey ?? '', {
      auth: { persistSession: false },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    token = session.data.session?.access_token ?? '';
  });

  afterAll(async () => {
    await sql`delete from platform.apps where slug in (${slug}, ${plainSlug})`;
    await admin.auth.admin.deleteUser(userId);
    await sql.end();
    vi.restoreAllMocks();
  });

  it('refuses a Google token of an account that is not linked', async () => {
    const bad = await call('/google/connect', {
      method: 'POST',
      body: { refreshToken: 'revoked-refresh' },
    });
    expect(bad.status).toBe(400);
    const stranger = await call('/google/connect', {
      method: 'POST',
      body: { refreshToken: 'stranger-refresh' },
    });
    expect(stranger.status).toBe(403);
  });

  it('stores the grant encrypted', async () => {
    const res = await call('/google/connect', {
      method: 'POST',
      body: { refreshToken: 'good-refresh' },
    });
    expect(res.status).toBe(200);
    const [row] = await sql`select * from platform.google_grants where user_id = ${userId}`;
    expect(row?.google_sub).toBe(sub);
    expect(row?.refresh_token_enc).not.toContain('good-refresh');
    const status = (await (await call('/google')).json()) as { connected: boolean; email: string };
    expect(status).toMatchObject({ connected: true, email: 'me@gmail.com' });
  });

  it('issues a token limited to the app manifest, only to the app itself', async () => {
    expect((await call('/google/token', { method: 'POST', body: { app: slug } })).status).toBe(403);
    expect(
      (
        await call('/google/token', {
          method: 'POST',
          body: { app: slug },
          origin: `https://${plainSlug}.test`,
        })
      ).status,
    ).toBe(403);
    const plain = await call('/google/token', {
      method: 'POST',
      body: { app: plainSlug },
      origin: `https://${plainSlug}.test`,
    });
    expect(plain.status).toBe(403);

    const res = await call('/google/token', { method: 'POST', body: { app: slug }, origin });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; scopes: string[]; expiresAt: number };
    expect(body.scopes).toEqual([GOOGLE_SCOPES.calendar.write]);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
    expect(refreshCalls.at(-1)?.get('scope')).toBe(GOOGLE_SCOPES.calendar.write);
  });

  it('refuses without the app origin, and from the portal', async () => {
    for (const from of [undefined, 'https://mininode.app']) {
      const res = await call('/google/token', {
        method: 'POST',
        body: { app: slug },
        ...(from ? { origin: from } : {}),
      });
      expect(res.status).toBe(403);
    }
  });

  it('fails closed when Google ignores the scope limit', async () => {
    ignoreScope = true;
    const res = await call('/google/token', { method: 'POST', body: { app: slug }, origin });
    ignoreScope = false;
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('at:');
  });

  it('stops issuing tokens once Google is unlinked from the account', async () => {
    await sql`delete from auth.identities where user_id = ${userId} and provider = 'google'`;
    const res = await call('/google/token', { method: 'POST', body: { app: slug }, origin });
    expect(res.status).toBe(409);
    await sql`insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
      values (${sub}, ${userId}, ${sql.json({ sub, email: 'me@gmail.com' })}, 'google', now(), now())`;
    const again = await call('/google/connect', {
      method: 'POST',
      body: { refreshToken: 'good-refresh' },
    });
    expect(again.status).toBe(200);
  });

  it('forgets a grant Google revoked', async () => {
    await sql`update platform.google_grants set refresh_token_enc = ${await sealFor('revoked-refresh')} where user_id = ${userId}`;
    const res = await call('/google/token', { method: 'POST', body: { app: slug }, origin });
    expect(res.status).toBe(409);
    const rows = await sql`select 1 from platform.google_grants where user_id = ${userId}`;
    expect(rows).toHaveLength(0);
  });

  it('disconnect revokes at Google and deletes the grant', async () => {
    await call('/google/connect', { method: 'POST', body: { refreshToken: 'good-refresh' } });
    expect((await call('/google', { method: 'DELETE' })).status).toBe(204);
    expect(revoked).toContain('good-refresh');
    const status = (await (await call('/google')).json()) as { connected: boolean };
    expect(status.connected).toBe(false);
  });

  async function sealFor(value: string) {
    const { seal } = await import('./lib/google.ts');
    return seal(env.GOOGLE_TOKEN_KEY ?? '', value, userId);
  }
});
