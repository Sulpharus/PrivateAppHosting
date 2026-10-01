// Verwaltung → Apps → als GitHub-Projekt through the API, with the GitHub API stubbed.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishableKey && secretKey);

describe.skipIf(!enabled)('app export', () => {
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
  const own = `exp-own-${run}`;
  const link = `exp-link-${run}`;
  const program = `exp-lib-${run}`;
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
      const email = `export-${role}-${run}@example.com`;
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
    const { error } = await admin
      .schema('platform')
      .from('apps')
      .insert([
        {
          slug: own,
          name: 'Eigen',
          description: 'Eigen',
          kind: 'static',
          target: 'cloudflare',
          manifest: {},
        },
        {
          slug: link,
          name: 'Link',
          description: 'Link',
          kind: 'link',
          target: 'external',
          manifest: {},
          link_url: 'https://example.com',
        },
        {
          slug: program,
          name: 'Jellyfin',
          description: 'Jellyfin',
          kind: 'container',
          target: 'nucbox',
          manifest: { library: 'jellyfin' },
        },
      ]);
    if (error) throw error;
  });

  afterAll(async () => {
    await admin.schema('platform').from('apps').delete().in('slug', [own, link, program]);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    vi.restoreAllMocks();
  });

  const post = (token: string, slug: string, body: unknown, e: ApiEnv = env) =>
    app.request(
      `/admin/apps/${slug}/export`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      e,
    );
  const ok = { repo: 'eigen-app', visibility: 'private' };

  it('is for admins only and needs the dispatch token', async () => {
    expect((await post(tokens.user, own, ok)).status).toBe(403);
    expect((await post(tokens.admin, own, ok, base as unknown as ApiEnv)).status).toBe(503);
  });

  it('refuses unknown apps, link tiles, library programs and bad repository names', async () => {
    expect((await post(tokens.admin, `nope-${run}`, ok)).status).toBe(404);
    expect((await post(tokens.admin, link, ok)).status).toBe(400);
    expect((await post(tokens.admin, program, ok)).status).toBe(400);
    expect((await post(tokens.admin, own, { ...ok, repo: '../x' })).status).toBe(400);
    expect((await post(tokens.admin, own, { ...ok, visibility: 'internal' })).status).toBe(400);
    expect(dispatches).toHaveLength(0);
  });

  it('starts the export workflow on main and audits it', async () => {
    const res = await post(tokens.admin, own, ok);
    expect(res.status).toBe(202);
    expect(dispatches[0]?.url).toBe(
      'https://api.github.com/repos/Sulpharus/PrivateAppHosting/actions/workflows/export-app.yml/dispatches',
    );
    expect(dispatches[0]?.body).toEqual({
      ref: 'main',
      inputs: { slug: own, repo: 'eigen-app', visibility: 'private' },
    });
    const { data } = await admin
      .schema('platform')
      .from('audit_log')
      .select('detail')
      .eq('action', 'app.exported')
      .eq('app_slug', own);
    expect(data?.[0]?.detail).toEqual({ repo: 'eigen-app', visibility: 'private' });
  });
});
