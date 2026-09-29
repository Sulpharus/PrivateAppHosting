// Verwaltung → NucBox resources through the API, with nucbox-control stubbed.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishableKey && secretKey);

describe.skipIf(!enabled)('nucbox resources', () => {
  const run = Date.now().toString(36);
  const password = 'correct horse battery staple';
  const env = {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    PORTAL_URL: 'https://mininode.app',
    NUCBOX_CONTROL_URL: 'https://control.test',
    NUCBOX_CONTROL_TOKEN: 'control-token',
  } as unknown as ApiEnv;
  const admin = createClient(url ?? 'http://127.0.0.1', secretKey ?? 'unused', {
    auth: { persistSession: false },
  });
  const users: string[] = [];
  const tokens: Record<'admin' | 'user', string> = { admin: '', user: '' };
  const controlCalls: Headers[] = [];

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target === 'https://control.test/resources') {
      controlCalls.push(new Headers(init?.headers));
      return Response.json({
        at: 'now',
        host: null,
        storage: [],
        vms: [],
        containers: [],
        errors: [],
      });
    }
    return realFetch(input, init);
  });

  beforeAll(async () => {
    for (const role of ['admin', 'user'] as const) {
      const email = `nucbox-${role}-${run}@example.com`;
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
  });

  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id);
    vi.restoreAllMocks();
  });

  const call = (token: string) =>
    app.request('/admin/nucbox/resources', { headers: { Authorization: `Bearer ${token}` } }, env);

  it('is for admins only and passes the control token', async () => {
    expect((await call(tokens.user)).status).toBe(403);
    const res = await call(tokens.admin);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { errors: string[] }).errors).toEqual([]);
    expect(controlCalls[0]?.get('Authorization')).toBe('Bearer control-token');
  });
});
