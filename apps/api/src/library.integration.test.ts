// Verwaltung → App-Bibliothek through the API, with the GitHub API stubbed.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishableKey && secretKey);

describe.skipIf(!enabled)('app library', () => {
  const run = Date.now().toString(36);
  const password = 'correct horse battery staple';
  const base = {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    PORTAL_URL: 'https://mininode.app',
  };
  const env = { ...base, GITHUB_DISPATCH_TOKEN: 'gh-token' } as unknown as ApiEnv;
  const admin = createClient(url ?? 'http://127.0.0.1', secretKey ?? 'unused', {
    auth: { persistSession: false },
  });
  const users: string[] = [];
  const tokens: Record<'admin' | 'user', string> = { admin: '', user: '' };
  const taken = `lib-taken-${run}`;
  const dispatches: { headers: Headers; body: unknown; url: string }[] = [];

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target.startsWith('https://api.github.com/')) {
      dispatches.push({
        url: target,
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(null, { status: 204 });
    }
    return realFetch(input, init);
  });

  beforeAll(async () => {
    for (const role of ['admin', 'user'] as const) {
      const email = `library-${role}-${run}@example.com`;
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
      tokens[role] = session.data.session?.access_token ?? '';
    }
    const { error } = await admin.schema('platform').from('apps').insert({
      slug: taken,
      name: 'Belegt',
      description: 'Belegt',
      kind: 'static',
      target: 'cloudflare',
      manifest: {},
    });
    if (error) throw error;
  });

  afterAll(async () => {
    await admin.schema('platform').from('apps').delete().eq('slug', taken);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    vi.restoreAllMocks();
  });

  const post = (token: string, body: unknown, e: ApiEnv = env) =>
    app.request(
      '/admin/library',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      e,
    );

  it('is for admins only', async () => {
    expect(
      (await post(tokens.user, { action: 'install', entry: 'jellyfin', slug: 'kino' })).status,
    ).toBe(403);
    const res = await app.request(
      '/admin/library',
      { headers: { Authorization: `Bearer ${tokens.admin}` } },
      env,
    );
    expect(await res.json()).toEqual({ configured: true });
  });

  it('says when installs are not set up', async () => {
    const res = await post(
      tokens.admin,
      { action: 'install', entry: 'jellyfin', slug: 'kino' },
      base as unknown as ApiEnv,
    );
    expect(res.status).toBe(503);
  });

  it('refuses unknown entries, bad and taken addresses, and removing what is not installed', async () => {
    expect(
      (await post(tokens.admin, { action: 'install', entry: 'nope', slug: 'kino' })).status,
    ).toBe(404);
    expect(
      (await post(tokens.admin, { action: 'install', entry: 'jellyfin', slug: 'Kino!' })).status,
    ).toBe(400);
    expect(
      (await post(tokens.admin, { action: 'install', entry: 'jellyfin', slug: 'api' })).status,
    ).toBe(400);
    expect(
      (await post(tokens.admin, { action: 'install', entry: 'jellyfin', slug: taken })).status,
    ).toBe(409);
    expect(
      (await post(tokens.admin, { action: 'remove', entry: 'jellyfin', slug: taken })).status,
    ).toBe(404);
    expect(dispatches).toHaveLength(0);
  });

  it('starts the workflow on main', async () => {
    const res = await post(tokens.admin, {
      action: 'install',
      entry: 'jellyfin',
      slug: `kino-${run}`,
    });
    expect(res.status).toBe(202);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]?.url).toBe(
      'https://api.github.com/repos/Sulpharus/PrivateAppHosting/actions/workflows/library.yml/dispatches',
    );
    expect(dispatches[0]?.headers.get('Authorization')).toBe('Bearer gh-token');
    expect(dispatches[0]?.body).toEqual({
      ref: 'main',
      inputs: {
        action: 'install',
        entry: 'jellyfin',
        slug: `kino-${run}`,
        environment: 'production',
      },
    });
    const { data } = await admin
      .schema('platform')
      .from('audit_log')
      .select('action, detail')
      .eq('actor_id', users[0] ?? '')
      .eq('action', 'library.install');
    expect(data?.[0]?.detail).toMatchObject({ entry: 'jellyfin', slug: `kino-${run}` });
  });
});
