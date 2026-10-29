import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.ts';
import { app } from '../index.ts';

const env = {
  SUPABASE_URL: 'http://supabase.test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  PORTAL_URL: 'https://example.org',
} as unknown as ApiEnv;

const good = { email: 'Owner@Example.org', password: 'a long enough password' };
const post = (body: unknown) =>
  app.request(
    '/setup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
let open = true;
let role = 'admin';
let profileFails = false;
let deleteFails = false;

beforeEach(() => {
  calls = [];
  open = true;
  role = 'admin';
  profileFails = false;
  deleteFails = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (url.includes('/rpc/needs_setup')) return Response.json(open);
    if (url.includes('/auth/v1/admin/users') && method === 'POST')
      return Response.json({
        id: '6f1d1f0e-8c53-4a53-9c1e-3f0d2a7b9c11',
        email: 'owner@example.org',
      });
    if (method === 'DELETE')
      return deleteFails ? new Response('{}', { status: 500 }) : Response.json({});
    if (url.includes('/rest/v1/profiles') && profileFails)
      return new Response('{}', { status: 500 });
    if (url.includes('/rest/v1/profiles')) return Response.json({ role });
    return new Response(null, { status: 201 });
  });
});

afterEach(() => vi.restoreAllMocks());

const creations = () =>
  calls.filter((c) => c.url.includes('/auth/v1/admin/users') && c.method === 'POST');
const deletions = () => calls.filter((c) => c.method === 'DELETE');

describe('first-run setup', () => {
  it('reports whether the installation still has no account', async () => {
    expect(await (await app.request('/setup', {}, env)).json()).toEqual({ open: true });
    open = false;
    expect(await (await app.request('/setup', {}, env)).json()).toEqual({ open: false });
  });

  it('creates a confirmed account with the address lowercased', async () => {
    const response = await post(good);
    expect(response.status).toBe(201);
    expect(creations()[0]?.body).toMatchObject({
      email: 'owner@example.org',
      email_confirm: true,
    });
  });

  it('is closed as soon as an account exists', async () => {
    open = false;
    const response = await post(good);
    expect(response.status).toBe(409);
    expect(creations()).toEqual([]);
  });

  it('rejects a short password and a bad address before touching the database', async () => {
    expect((await post({ ...good, password: 'short' })).status).toBe(400);
    expect((await post({ ...good, email: 'not-an-address' })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('removes the account that lost a race for the admin role', async () => {
    role = 'user';
    const response = await post(good);
    expect(response.status).toBe(409);
    expect(deletions()).toHaveLength(1);
  });

  it('keeps the account when its role cannot be read', async () => {
    profileFails = true;
    expect((await post(good)).status).toBe(500);
    expect(deletions()).toEqual([]);
  });

  it('reports a failed clean-up of the losing account', async () => {
    role = 'user';
    deleteFails = true;
    expect((await post(good)).status).toBe(500);
  });
});
