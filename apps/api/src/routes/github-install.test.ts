import type { SessionClaims, Verifier } from '@mininode/gate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.ts';
import { app } from '../index.ts';
import { setVerifierForTests } from '../lib/auth.ts';

const SUPABASE_URL = 'http://supabase.test';
const env = {
  SUPABASE_URL,
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  PORTAL_URL: 'https://example.org',
  GITHUB_DISPATCH_TOKEN: 'gh-token',
  GITHUB_REPO: 'me/platform',
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

const post = (path: string, body: unknown) =>
  app.request(
    path,
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
let artifact: { id: number; name: string; expired: boolean };

beforeEach(() => {
  calls = [];
  artifact = { id: 7, name: 'mininode-app-notes-2026-11-24', expired: false };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (url.includes('/rest/v1/submissions') && method === 'POST')
      return Response.json({ id: 's1', kind: 'webapp', status: 'queued', summary: {} });
    if (url.includes('/rest/v1/submissions') && method === 'PATCH')
      return Response.json({ id: 's1', kind: 'webapp', status: 'queued', summary: {} });
    if (url.includes('/dispatches')) return new Response(null, { status: 204 });
    if (url.endsWith('/actions/artifacts/7/zip'))
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://results.blob.core.windows.net/x' },
      });
    if (url.endsWith('/actions/artifacts/7')) return Response.json(artifact);
    return new Response(null, { status: 201 });
  });
});
afterEach(() => vi.restoreAllMocks());

const of = (part: string, method?: string) =>
  calls.filter((c) => c.url.includes(part) && (!method || c.method === method));

describe('POST /admin/submissions/github', () => {
  it('stores the repository as an upload without a file and starts the integration', async () => {
    signedIn('admin');
    const response = await post('/admin/submissions/github', {
      url: 'https://github.com/me/notes.git',
      autoUpdate: true,
    });
    expect(response.status).toBe(202);
    expect(of('/rest/v1/submissions', 'POST')[0]?.body).toMatchObject({
      kind: 'webapp',
      repository: 'me/notes',
      storage_path: 'github:me/notes',
      auto_update: true,
      size_bytes: 0,
    });
    expect(of('/dispatches')[0]?.url).toContain('integrate.yml');
  });

  it('refuses other hosts, other users and a stale sign-in, before storing anything', async () => {
    signedIn('admin');
    expect(
      (await post('/admin/submissions/github', { url: 'https://gitlab.com/me/x' })).status,
    ).toBe(400);
    signedIn('user');
    expect((await post('/admin/submissions/github', { url: 'me/notes' })).status).toBe(403);
    signedIn('admin', false);
    expect((await post('/admin/submissions/github', { url: 'me/notes' })).status).toBe(403);
    expect(of('/rest/v1/submissions')).toHaveLength(0);
    expect(of('/dispatches')).toHaveLength(0);
  });
});

describe('ZIP exports', () => {
  it('starts a ZIP export for a hosted app', async () => {
    signedIn('admin');
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      });
      if (url.includes('/rest/v1/apps'))
        return Response.json({ slug: 'notes', kind: 'static', manifest: {} });
      if (url.includes('/dispatches')) return new Response(null, { status: 204 });
      return new Response(null, { status: 201 });
    });
    const response = await post('/admin/apps/notes/export', { target: 'zip' });
    expect(response.status).toBe(202);
    expect(of('/dispatches')[0]?.body).toMatchObject({
      inputs: { slug: 'notes', target: 'zip' },
    });
  });

  it('hands out a download only for ZIP artifacts, after the audit row', async () => {
    signedIn('admin');
    const ok = await post('/admin/app-zips/7/download', {});
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      url: 'https://results.blob.core.windows.net/x',
      name: 'mininode-app-notes-2026-11-24.zip',
    });
    const order = calls.map((c) =>
      c.url.includes('/audit_log') ? 'audit' : c.url.endsWith('/zip') ? 'url' : 'other',
    );
    expect(order.indexOf('audit')).toBeLessThan(order.indexOf('url'));

    calls = [];
    artifact = { id: 7, name: 'mininode-backup-2026-11-24', expired: false };
    expect((await post('/admin/app-zips/7/download', {})).status).toBe(404);
    artifact = { id: 7, name: 'mininode-app-notes-2026-11-24', expired: true };
    expect((await post('/admin/app-zips/7/download', {})).status).toBe(410);
    expect(of('/zip')).toHaveLength(0);

    signedIn('admin', false);
    expect((await post('/admin/app-zips/7/download', {})).status).toBe(403);
  });
});
