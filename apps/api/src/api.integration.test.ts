// End-to-end API tests against the local Supabase stack (`pnpm test:integration`).
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishableKey && secretKey);

describe.skipIf(!enabled)('api against local Supabase', () => {
  const run = Date.now().toString(36);
  const sent: { to: unknown; subject: string }[] = [];
  const env = {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    PORTAL_URL: 'https://mininode.app',
    MAIL_FROM: 'hallo@mininode.app',
    GUACAMOLE_URL: 'http://127.0.0.1:9',
    NUCBOX_CONTROL_URL: 'http://127.0.0.1:9',
    SEND_EMAIL_HOOK_SECRET: 'v1,whsec_c2VjcmV0',
    GUACAMOLE_JSON_SECRET: '4c0b569e4c96df157eee1b65dd0e4d41',
    NUCBOX_CONTROL_TOKEN: 'x',
    EMAIL: {
      async send(message: { to: unknown; subject: string }) {
        sent.push(message);
        return { messageId: `m${sent.length}` };
      },
    },
  } as unknown as ApiEnv;

  const admin = createClient(url ?? 'http://127.0.0.1', secretKey ?? 'unused', {
    auth: { persistSession: false },
  });
  const password = 'correct horse battery staple';
  const users: string[] = [];
  let adminToken = '';
  let userToken = '';

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
    return session.data.session.access_token;
  }

  beforeAll(async () => {
    adminToken = await tokenFor(`admin-${run}@example.com`, 'admin');
    userToken = await tokenFor(`user-${run}@example.com`, 'user');
  });

  afterAll(async () => {
    const { data } = await admin
      .schema('platform')
      .from('invites')
      .select('accepted_by')
      .like('email', `%${run}%`);
    for (const row of data ?? []) if (row.accepted_by) users.push(row.accepted_by);
    await admin.schema('platform').from('invites').delete().like('email', `%${run}%`);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  const call = (path: string, init: RequestInit & { token?: string } = {}) =>
    app.request(
      path,
      {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        },
      },
      env,
    );

  it('rejects anonymous and non-admin invite requests', async () => {
    expect((await call('/invites', { method: 'POST', body: '{}' })).status).toBe(401);
    const res = await call('/invites', { method: 'POST', token: userToken, body: '{}' });
    expect(res.status).toBe(403);
  });

  it('creates an invite, pre-creates the user with the invited role and sends the mail', async () => {
    const email = `guest-${run}@example.com`;
    const res = await call('/invites', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ email, role: 'trusted', expiresInDays: 7 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; link: string; emailSent: boolean };
    expect(body.emailSent).toBe(true);
    expect(body.link).toMatch(/^https:\/\/mininode\.app\/auth\/confirm\?token_hash=.+&type=invite/);
    expect(sent.at(-1)).toMatchObject({ to: email });

    const { data: invite } = await admin
      .schema('platform')
      .from('invites')
      .select('accepted_by')
      .eq('id', body.id)
      .single();
    const { data: profile } = await admin
      .schema('platform')
      .from('profiles')
      .select('role')
      .eq('user_id', invite?.accepted_by)
      .single();
    expect(profile?.role).toBe('trusted');

    const duplicate = await call('/invites', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ email }),
    });
    expect(duplicate.status).toBe(409);
  });

  it('revoking an unused invite removes the pre-created account', async () => {
    const email = `revoke-${run}@example.com`;
    const created = await call('/invites', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ email }),
    });
    const { id } = (await created.json()) as { id: string };
    const { data: before } = await admin
      .schema('platform')
      .from('invites')
      .select('accepted_by')
      .eq('id', id)
      .single();
    expect((await call(`/invites/${id}`, { method: 'DELETE', token: adminToken })).status).toBe(
      204,
    );
    const { data } = await admin.auth.admin.getUserById(before?.accepted_by ?? '');
    expect(data.user).toBeNull();
  });

  it('without Email Sending the invite link is returned for sharing', async () => {
    const { EMAIL: _unused, ...withoutEmail } = env;
    const res = await app.request(
      '/invites',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ email: `nomail-${run}@example.com` }),
      },
      withoutEmail as ApiEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { link: string; emailSent: boolean };
    expect(body.emailSent).toBe(false);
    expect(body.link).toMatch(/type=invite/);
  });

  it('lets only the admin create a password reset link', async () => {
    const { data: target } = await admin.auth.admin.createUser({
      email: `reset-${run}@example.com`,
      password,
      email_confirm: true,
    });
    const id = target.user?.id ?? '';
    users.push(id);
    const denied = await call(`/admin/users/${id}/recovery-link`, {
      method: 'POST',
      token: userToken,
    });
    expect(denied.status).toBe(403);
    const res = await call(`/admin/users/${id}/recovery-link`, {
      method: 'POST',
      token: adminToken,
    });
    expect(res.status).toBe(200);
    const { link } = (await res.json()) as { link: string };
    const { data: audit } = await admin
      .schema('platform')
      .from('audit_log')
      .select('detail')
      .eq('action', 'user.recovery_link')
      .contains('detail', { user_id: id });
    expect(audit).toHaveLength(1);
    const adminId = (await admin.auth.getUser(adminToken)).data.user?.id ?? '';
    const self = await call(`/admin/users/${adminId}/recovery-link`, {
      method: 'POST',
      token: adminToken,
    });
    expect(self.status).toBe(400);
    expect(link).toMatch(/^https:\/\/mininode\.app\/auth\/confirm\?token_hash=.+&type=recovery/);
  });

  it('refuses remote sessions for apps the user may not use', async () => {
    const res = await call('/remote/sessions', {
      method: 'POST',
      token: userToken,
      body: JSON.stringify({ app: 'nope' }),
    });
    expect(res.status).toBe(403);
  });
});
