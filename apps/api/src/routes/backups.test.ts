import type { SessionClaims, Verifier } from '@mininode/gate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.ts';
import { app } from '../index.ts';
import { setVerifierForTests } from '../lib/auth.ts';
import { joinRuns } from './backups.ts';

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

const call = (path: string, init: RequestInit = {}, withEnv: ApiEnv = env) =>
  app.request(
    path,
    { ...init, headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' } },
    withEnv,
  );

interface Seen {
  url: string;
  method: string;
  body: unknown;
  redirect?: string;
}
let seen: Seen[] = [];
let github: (url: string) => Response;

beforeEach(() => {
  seen = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      ...(init?.redirect ? { redirect: init.redirect } : {}),
    });
    if (url.startsWith('https://api.github.com/')) return github(url);
    return new Response(null, { status: 201 }); // the audit insert
  });
});

afterEach(() => vi.restoreAllMocks());

describe('joinRuns', () => {
  const run = (id: number, status: string, conclusion: string | null, at: string) => ({
    id,
    status,
    conclusion,
    html_url: `https://github.com/o/r/actions/runs/${id}`,
    created_at: at,
  });
  const artifact = (id: number, run_id: number, name: string, expired = false) => ({
    id,
    name,
    size_in_bytes: 1000,
    expired,
    expires_at: '2026-11-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    workflow_run: { id: run_id },
  });

  it('shows each run with its archive and the right state', () => {
    const rows = joinRuns(
      [
        run(1, 'completed', 'success', '2026-10-01T10:00:00Z'),
        run(2, 'in_progress', null, '2026-10-03T10:00:00Z'),
        run(3, 'completed', 'failure', '2026-10-02T10:00:00Z'),
        run(4, 'completed', 'success', '2026-09-01T10:00:00Z'),
        run(5, 'completed', 'cancelled', '2026-08-01T10:00:00Z'),
      ],
      [
        artifact(10, 1, 'mininode-backup-20261001-100000-nofiles'),
        artifact(11, 4, 'mininode-backup-20260901-100000', true),
        // not a backup: never offered
        artifact(12, 3, 'export-aether-notes'),
      ],
    );
    expect(rows.map((r) => [r.runId, r.state])).toEqual([
      [2, 'running'],
      [3, 'failed'],
      [1, 'ready'],
      [4, 'expired'],
      [5, 'cancelled'],
    ]);
    const ready = rows.find((r) => r.runId === 1);
    expect(ready?.artifact).toMatchObject({ id: 10, sizeBytes: 1000 });
    expect(ready?.withFiles).toBe(false);
    expect(rows.find((r) => r.runId === 3)?.artifact).toBeNull();
  });
});

describe('GET /admin/backups', () => {
  it('is for admins only', async () => {
    signedIn('user');
    expect((await call('/admin/backups')).status).toBe(403);
  });

  it('says so while the start key is missing', async () => {
    signedIn('admin');
    const response = await call('/admin/backups', {}, {
      ...env,
      GITHUB_DISPATCH_TOKEN: undefined,
    } as unknown as ApiEnv);
    expect(await response.json()).toEqual({ configured: false, runs: [] });
  });

  it('lists runs and archives', async () => {
    signedIn('admin');
    github = (url) =>
      url.includes('/workflows/backup.yml/runs')
        ? Response.json({
            workflow_runs: [
              {
                id: 7,
                status: 'completed',
                conclusion: 'success',
                html_url: 'https://github.com/o/r/actions/runs/7',
                created_at: '2026-10-05T08:00:00Z',
              },
            ],
          })
        : Response.json({
            artifacts: [
              {
                id: 70,
                name: 'mininode-backup-20261005-080000',
                size_in_bytes: 5000,
                expired: false,
                expires_at: '2026-11-04T08:00:00Z',
                created_at: '2026-10-05T08:05:00Z',
                workflow_run: { id: 7 },
              },
            ],
          });
    const body = (await (await call('/admin/backups')).json()) as {
      configured: boolean;
      runs: { state: string; artifact: { id: number } | null }[];
    };
    expect(body.configured).toBe(true);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({ state: 'ready', artifact: { id: 70 } });
  });
});

describe('POST /admin/backups', () => {
  const post = (body: unknown) =>
    call('/admin/backups', { method: 'POST', body: JSON.stringify(body) });

  it('needs a recent sign-in', async () => {
    signedIn('admin', false);
    const response = await post({ files: true });
    expect(response.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it('starts the workflow and writes the audit log', async () => {
    signedIn('admin');
    github = () => new Response(null, { status: 204 });
    const response = await post({ files: false });
    expect(response.status).toBe(202);
    const dispatch = seen.find((s) => s.url.includes('/workflows/backup.yml/dispatches'));
    expect(dispatch?.body).toEqual({ ref: 'main', inputs: { files: 'false' } });
    expect(seen.some((s) => s.url.includes('/rest/v1/audit_log'))).toBe(true);
  });

  it('rejects anything but { files: boolean }', async () => {
    signedIn('admin');
    expect((await post({ files: 'yes' })).status).toBe(400);
    expect((await post({ files: true, ref: 'evil' })).status).toBe(400);
  });
});

describe('POST /admin/backups/:id/download', () => {
  const download = (id: string) => call(`/admin/backups/${id}/download`, { method: 'POST' });
  const artifact = (name: string, expired = false) =>
    Response.json({ id: 70, name, expired, size_in_bytes: 1, expires_at: null });

  it('hands out the short-lived address of a backup archive', async () => {
    signedIn('admin');
    github = (url) =>
      url.endsWith('/artifacts/70')
        ? artifact('mininode-backup-20261005-080000')
        : new Response(null, {
            status: 302,
            headers: { Location: 'https://blob.example/zip?sig=1' },
          });
    const response = await download('70');
    expect(await response.json()).toEqual({
      url: 'https://blob.example/zip?sig=1',
      name: 'mininode-backup-20261005-080000.zip',
    });
    // The redirect is read, not followed: the ZIP never passes through the Worker.
    expect(seen.find((s) => s.url.endsWith('/zip'))?.redirect).toBe('manual');
  });

  it('refuses artifacts that are not backups, expired ones and bad ids', async () => {
    signedIn('admin');
    github = () => artifact('export-aether-notes');
    expect((await download('70')).status).toBe(404);
    github = () => artifact('mininode-backup-x', true);
    expect((await download('70')).status).toBe(410);
    expect((await download('abc')).status).toBe(404);
    github = () => new Response(null, { status: 404 });
    expect((await download('71')).status).toBe(404);
  });

  it('needs a recent sign-in and an admin', async () => {
    signedIn('admin', false);
    expect((await download('70')).status).toBe(403);
    signedIn('user');
    expect((await download('70')).status).toBe(403);
  });
});
