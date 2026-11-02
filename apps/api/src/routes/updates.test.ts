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
  UPDATES_SOURCE: 'upstream/mininode',
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

const request = (path: string, init: { method?: string; body?: unknown } = {}, e = env) =>
  app.request(
    path,
    {
      method: init.method ?? 'GET',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    },
    e,
  );

interface Call {
  url: string;
  method: string;
  body: unknown;
}
let calls: Call[] = [];
let rows: { slug: string; name: string; kind: string; manifest: object }[];
let installedVersion: string | null;
let appCommit: string | null;

const file = (data: unknown) =>
  Response.json({ content: btoa(JSON.stringify(data)), encoding: 'base64' });

beforeEach(() => {
  calls = [];
  installedVersion = '0.1.0-test';
  appCommit = 'aaa111';
  rows = [
    { slug: 'notes', name: 'Notes', kind: 'static', manifest: { repository: 'me/notes' } },
    { slug: 'plain', name: 'Plain', kind: 'static', manifest: {} },
  ];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (url.includes('/rest/v1/apps') && method === 'GET') {
      const slug = /slug=eq\.([\w-]+)/.exec(url)?.[1];
      const found = rows.filter((row) => !slug || row.slug === slug);
      return url.includes('select=slug%2C+kind') || slug
        ? Response.json(found[0] ?? null)
        : Response.json(found);
    }
    if (url.includes('/contents/.mininode/platform-files.json'))
      return installedVersion
        ? file({ version: installedVersion })
        : new Response('{}', { status: 404 });
    if (url.includes('/contents/hosted/notes/.mininode-source.json'))
      return appCommit ? file({ commit: appCommit }) : new Response('{}', { status: 404 });
    if (url.includes('/repos/upstream/mininode/releases'))
      return Response.json([
        {
          tag_name: 'v0.2.0',
          name: 'Second',
          prerelease: false,
          html_url: 'https://github.com/upstream/mininode/releases/tag/v0.2.0',
          published_at: '2026-11-01T00:00:00Z',
        },
      ]);
    if (url.includes('/repos/me/notes/commits')) return Response.json([{ sha: 'bbb222' }]);
    if (url.includes('/dispatches')) return new Response(null, { status: 204 });
    return new Response(null, { status: 201 });
  });
});

afterEach(() => vi.restoreAllMocks());

const dispatches = () => calls.filter((c) => c.url.includes('/dispatches'));
const audits = () => calls.filter((c) => c.url.includes('/audit_log'));

describe('GET /admin/updates', () => {
  it('is for admins', async () => {
    signedIn('user');
    expect((await request('/admin/updates')).status).toBe(403);
  });

  it('shows the installed and the newest platform version and the apps with a repository', async () => {
    signedIn('admin');
    const body = (await (await request('/admin/updates')).json()) as {
      platform: { installed: string; upToDate: boolean; latest: { tag: string } };
      apps: { slug: string; upToDate: boolean | null; installedCommit: string | null }[];
    };
    expect(body.platform).toMatchObject({
      source: 'upstream/mininode',
      installed: '0.1.0-test',
      upToDate: false,
      latest: { tag: 'v0.2.0' },
    });
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0]).toMatchObject({
      slug: 'notes',
      installedCommit: 'aaa111',
      latestCommit: 'bbb222',
      upToDate: false,
    });
  });

  it('knows when everything is current, and says unknown instead of guessing', async () => {
    signedIn('admin');
    installedVersion = '0.2.0';
    appCommit = 'bbb222';
    let body = (await (await request('/admin/updates')).json()) as {
      platform: { upToDate: boolean };
      apps: { upToDate: boolean }[];
    };
    expect(body.platform.upToDate).toBe(true);
    expect(body.apps[0]?.upToDate).toBe(true);

    installedVersion = null;
    appCommit = null;
    body = (await (await request('/admin/updates')).json()) as typeof body;
    expect(body.platform.upToDate).toBeNull();
    expect(body.apps[0]?.upToDate).toBeNull();
  });
});

describe('POST /admin/updates/platform', () => {
  it('needs an admin with a recent sign-in', async () => {
    signedIn('admin', false);
    expect((await request('/admin/updates/platform', { method: 'POST', body: {} })).status).toBe(
      403,
    );
    signedIn('user');
    expect((await request('/admin/updates/platform', { method: 'POST', body: {} })).status).toBe(
      403,
    );
    expect(dispatches()).toEqual([]);
  });

  it('starts the workflow, with a version when one is given, and writes the audit row first', async () => {
    signedIn('admin');
    const response = await request('/admin/updates/platform', {
      method: 'POST',
      body: { version: 'v0.2.0' },
    });
    expect(response.status).toBe(202);
    expect(audits()).toHaveLength(1);
    expect(dispatches()[0]?.url).toContain('/workflows/update-platform.yml/dispatches');
    expect(dispatches()[0]?.body).toMatchObject({ ref: 'main', inputs: { version: 'v0.2.0' } });
    expect(calls.indexOf(audits()[0] as Call)).toBeLessThan(calls.indexOf(dispatches()[0] as Call));
  });

  it('refuses a version that is not a tag, and a missing source', async () => {
    signedIn('admin');
    expect(
      (await request('/admin/updates/platform', { method: 'POST', body: { version: '../x' } }))
        .status,
    ).toBe(400);
    const noSource = { ...env, UPDATES_SOURCE: '' } as ApiEnv;
    expect(
      (await request('/admin/updates/platform', { method: 'POST', body: {} }, noSource)).status,
    ).toBe(503);
    expect(dispatches()).toEqual([]);
  });
});

describe('POST /admin/updates/apps/:slug', () => {
  it('starts the app update for an app with a repository', async () => {
    signedIn('admin');
    const response = await request('/admin/updates/apps/notes', { method: 'POST' });
    expect(response.status).toBe(202);
    expect(dispatches()[0]?.url).toContain('/workflows/update-app.yml/dispatches');
    expect(dispatches()[0]?.body).toMatchObject({ inputs: { slug: 'notes' } });
  });

  it('refuses an app without a repository and an unknown app', async () => {
    signedIn('admin');
    const plain = await request('/admin/updates/apps/plain', { method: 'POST' });
    expect(plain.status).toBe(400);
    expect(((await plain.json()) as { error: string }).error).toBe('no_repository');
    rows = [];
    expect((await request('/admin/updates/apps/notes', { method: 'POST' })).status).toBe(404);
    expect(dispatches()).toEqual([]);
  });

  it('needs a recent sign-in', async () => {
    signedIn('admin', false);
    expect((await request('/admin/updates/apps/notes', { method: 'POST' })).status).toBe(403);
  });
});
