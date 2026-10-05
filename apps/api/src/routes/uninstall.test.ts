import type { SessionClaims, Verifier } from '@mininode/gate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.ts';
import { app } from '../index.ts';
import { setVerifierForTests } from '../lib/auth.ts';

const SUPABASE_URL = 'http://supabase.test';
const env = {
  SUPABASE_URL,
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  PORTAL_URL: 'https://mininode.app',
  GITHUB_DISPATCH_TOKEN: 'gh-token',
} as unknown as ApiEnv;

function signedIn(role: 'admin' | 'user', recent = true): void {
  const claims: SessionClaims = {
    sub: 'u1',
    mn_role: role,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - (recent ? 5 : 3600) }],
  };
  const verifier: Verifier = { verify: async () => ({ status: 'valid', claims }) };
  setVerifierForTests(SUPABASE_URL, verifier);
}

const post = (slug: string, body: unknown) =>
  app.request(
    `/admin/apps/${slug}/uninstall`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );

interface Call {
  url: string;
  method: string;
  body: unknown;
}
let calls: Call[] = [];
let row: { slug: string; kind: string; manifest: object } | null;

beforeEach(() => {
  calls = [];
  row = { slug: 'rezepte', kind: 'spa', manifest: {} };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (url.startsWith('https://api.github.com/')) return new Response(null, { status: 204 });
    if (url.includes('/rest/v1/apps') && (init?.method ?? 'GET') === 'GET')
      return Response.json(row ? [row] : []);
    return new Response(null, { status: 201 });
  });
});

afterEach(() => vi.restoreAllMocks());

const dispatches = () => calls.filter((c) => c.url.includes('/dispatches'));

describe('POST /admin/apps/:slug/uninstall', () => {
  it('is for admins with a recent sign-in', async () => {
    signedIn('user');
    expect((await post('rezepte', { purge: true, confirm: 'rezepte' })).status).toBe(403);
    signedIn('admin', false);
    expect((await post('rezepte', { purge: true, confirm: 'rezepte' })).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('wants the address typed again', async () => {
    signedIn('admin');
    const response = await post('rezepte', { purge: true, confirm: 'Rezepte' });
    expect(response.status).toBe(400);
    expect(dispatches()).toEqual([]);
  });

  it('refuses the platform, unknown apps and link tiles', async () => {
    signedIn('admin');
    expect((await post('admin', { purge: true, confirm: 'admin' })).status).toBe(404);
    row = null;
    expect((await post('rezepte', { purge: true, confirm: 'rezepte' })).status).toBe(404);
    row = { slug: 'werkzeug', kind: 'link', manifest: {} };
    expect((await post('werkzeug', { purge: true, confirm: 'werkzeug' })).status).toBe(400);
    expect(dispatches()).toEqual([]);
  });

  it('starts the workflow, takes the app offline and logs it', async () => {
    signedIn('admin');
    const response = await post('rezepte', { purge: false, confirm: 'rezepte' });
    expect(response.status).toBe(202);
    expect(dispatches()).toHaveLength(1);
    expect(dispatches()[0]?.url).toContain('/workflows/uninstall-app.yml/dispatches');
    expect(dispatches()[0]?.body).toEqual({
      ref: 'main',
      inputs: { slug: 'rezepte', purge: 'false', environment: 'production' },
    });
    expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/apps'))).toBe(true);
    expect(calls.some((c) => c.url.includes('/rest/v1/audit_log'))).toBe(true);
  });

  it('also stops a library program on the NucBox', async () => {
    signedIn('admin');
    row = { slug: 'kino', kind: 'container', manifest: { library: 'jellyfin' } };
    const response = await post('kino', { purge: true, confirm: 'kino' });
    expect(response.status).toBe(202);
    expect(dispatches().map((d) => d.url.split('/workflows/')[1]?.split('/')[0])).toEqual([
      'library.yml',
      'uninstall-app.yml',
    ]);
    expect(((await response.json()) as { manual: string }).manual).toMatch(/NucBox/);
  });

  it('does not take the app offline when GitHub refuses the start', async () => {
    signedIn('admin');
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://api.github.com/')) return new Response(null, { status: 404 });
      return Response.json([row]);
    });
    expect((await post('rezepte', { purge: true, confirm: 'rezepte' })).status).toBe(502);
  });
});
