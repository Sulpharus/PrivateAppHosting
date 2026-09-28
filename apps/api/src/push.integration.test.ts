// Push delivery against the local Supabase stack, with the push services stubbed.
import { createECDH, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from 'http_ece';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';
import { toBase64Url } from './lib/webpush.ts';
import { absoluteUrl, deliverPushes } from './routes/push.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
const enabled = Boolean(url && publishableKey && secretKey && dbUrl);

describe('absoluteUrl', () => {
  it('opens app paths on the app subdomain and portal paths on the portal', () => {
    expect(absoluteUrl('https://mininode.app', 'todo', '/heute')).toBe(
      'https://todo.mininode.app/heute',
    );
    expect(absoluteUrl('https://mininode.app', 'todo', null)).toBe('https://todo.mininode.app/');
    expect(absoluteUrl('https://mininode.app', null, '/account')).toBe(
      'https://mininode.app/account',
    );
  });
});

describe.skipIf(!enabled)('push delivery', () => {
  const run = Date.now().toString(36);
  const slug = `push${run}`;
  const password = 'correct horse battery staple';
  const sql = postgres(dbUrl ?? '', { max: 1 });
  const admin = createClient(url ?? 'http://127.0.0.1', secretKey ?? 'unused', {
    auth: { persistSession: false },
  });
  let userId = '';
  let token = '';
  let env: ApiEnv;
  const device = createECDH('prime256v1');
  device.generateKeys();
  const auth = randomBytes(16);
  const received: { endpoint: string; body: Uint8Array; headers: Headers }[] = [];

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target.startsWith('https://push.example/')) {
      received.push({
        endpoint: target,
        body: new Uint8Array(init?.body as Uint8Array),
        headers: new Headers(init?.headers),
      });
      return new Response(null, { status: target.endsWith('/gone') ? 410 : 201 });
    }
    return realFetch(input, init);
  });

  const open = (body: Uint8Array) =>
    JSON.parse(
      decrypt(Buffer.from(body), {
        version: 'aes128gcm',
        privateKey: device,
        authSecret: toBase64Url(new Uint8Array(auth)),
        dh: toBase64Url(body.slice(21, 86)),
      }).toString('utf8'),
    ) as { title: string; body?: string; url: string };

  beforeAll(async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ])) as CryptoKeyPair;
    env = {
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SECRET_KEY: secretKey,
      PORTAL_URL: 'https://mininode.app',
      MAIL_FROM: 'hallo@mininode.app',
      VAPID_PUBLIC_KEY: toBase64Url(
        new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
      ),
      VAPID_PRIVATE_KEY: ((await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey).d,
    } as unknown as ApiEnv;

    const email = `push-${run}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    await sql`insert into platform.apps (slug, name, description, kind, target, manifest, status)
      values (${slug}, 'Push', 'Test', 'static', 'cloudflare', '{}', 'online')`;
    await sql`insert into platform.app_grants (user_id, app_slug) values (${userId}, ${slug})`;
    const p256dh = toBase64Url(new Uint8Array(device.getPublicKey()));
    const authSecret = toBase64Url(new Uint8Array(auth));
    await sql`insert into platform.push_subscriptions (user_id, endpoint, p256dh, auth) values
      (${userId}, ${`https://push.example/${run}/phone`}, ${p256dh}, ${authSecret}),
      (${userId}, ${`https://push.example/${run}/gone`}, ${p256dh}, ${authSecret})`;
    const client = createClient(url ?? '', publishableKey ?? '', {
      auth: { persistSession: false },
    });
    token =
      (await client.auth.signInWithPassword({ email, password })).data.session?.access_token ?? '';
  });

  afterAll(async () => {
    await sql`delete from platform.apps where slug = ${slug}`;
    await admin.auth.admin.deleteUser(userId);
    await sql.end();
    vi.restoreAllMocks();
  });

  it('pushes due reminders to every device and drops dead ones', async () => {
    await sql`insert into platform.scheduled_pushes (user_id, app_slug, key, due_at, title, body, url)
      values (${userId}, ${slug}, 'task:1', now() - interval '1 minute', 'Müll rausbringen', 'Heute', '/heute')`;
    await deliverPushes(env);
    const mine = received.filter((r) => r.endpoint.includes(run));
    expect(mine).toHaveLength(2);
    const phone = mine.find((r) => r.endpoint.endsWith('/phone'));
    expect(phone?.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(phone?.headers.get('Authorization')).toMatch(/^vapid t=.+, k=/);
    expect(open(phone?.body ?? new Uint8Array())).toEqual({
      title: 'Müll rausbringen',
      body: 'Heute',
      url: `https://${slug}.mininode.app/heute`,
      tag: expect.any(String),
    });
    const devices =
      await sql`select endpoint from platform.push_subscriptions where user_id = ${userId}`;
    expect(devices.map((d) => d.endpoint)).toEqual([`https://push.example/${run}/phone`]);
    const [bell] =
      await sql`select push_pending from platform.notifications where user_id = ${userId}`;
    expect(bell?.push_pending).toBe(false);
  });

  it('does not push the same notification twice', async () => {
    const before = received.length;
    await deliverPushes(env);
    expect(received.length).toBe(before);
  });

  it('sends a test message on request', async () => {
    const res = await app.request(
      '/push/test',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ devices: 1, sent: 1 });
    expect(open(received.at(-1)?.body ?? new Uint8Array()).url).toBe(
      'https://mininode.app/account',
    );
  });

  it('publishes the VAPID public key for the portal', async () => {
    const res = await app.request('/push/config', {}, env);
    expect(await res.json()).toEqual({ publicKey: env.VAPID_PUBLIC_KEY });
  });
});
