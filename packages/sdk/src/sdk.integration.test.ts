// Runs against the local Supabase stack (`pnpm db:start`). Skipped when it is not configured,
// e.g. `SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SECRET_KEY=… pnpm test`.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMininode, type Mininode } from './index.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishableKey && secretKey);

describe.skipIf(!enabled)('sdk against local Supabase', () => {
  const slug = `sdk-test-${Date.now().toString(36)}`;
  const email = `${slug}@example.com`;
  const password = 'correct horse battery staple';
  const admin = createClient(url ?? '', secretKey ?? '', { auth: { persistSession: false } });
  let userId = '';
  let mn: Mininode;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    const insert = await admin.schema('platform').from('apps').insert({
      slug,
      name: 'SDK Test',
      description: 'integration test',
      kind: 'spa',
      target: 'cloudflare',
      manifest: {},
      status: 'online',
    });
    if (insert.error) throw insert.error;
    const grant = await admin
      .schema('platform')
      .from('app_grants')
      .insert({ user_id: userId, app_slug: slug });
    if (grant.error) throw grant.error;

    mn = createMininode({
      appSlug: slug,
      appName: 'SDK Test',
      supabaseUrl: url ?? '',
      supabasePublishableKey: publishableKey ?? '',
      portalUrl: 'http://localhost:5173',
      apiUrl: 'http://localhost:8787',
      aiUrl: 'http://localhost:8788',
    });
    const signIn = await mn.supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
  });

  afterAll(async () => {
    if (!enabled) return;
    await admin.schema('platform').from('apps').delete().eq('slug', slug);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('knows the signed-in user and role', async () => {
    expect((await mn.auth.user())?.email).toBe(email);
    expect(await mn.auth.role()).toMatch(/^(admin|user)$/);
  });

  it('stores private and shared key-value data', async () => {
    await mn.kv.set('settings', { theme: 'dark' });
    await mn.kv.set('motd', 'Hallo', 'shared');
    expect(await mn.kv.get('settings')).toEqual({ theme: 'dark' });
    expect(await mn.kv.get('motd', 'shared')).toBe('Hallo');
    await mn.kv.set('settings', { theme: 'light' });
    expect(await mn.kv.list('sett')).toEqual([{ key: 'settings', value: { theme: 'light' } }]);
    await mn.kv.delete('settings');
    expect(await mn.kv.get('settings')).toBeNull();
  });

  it('uploads, lists and signs files in the app folder', async () => {
    const path = await mn.files.upload('notes/hello.txt', new Blob(['hi']), {
      contentType: 'text/plain',
    });
    expect(path).toBe(`${slug}/${userId}/notes/hello.txt`);
    expect(await mn.files.list('notes')).toContain('hello.txt');
    expect(await mn.files.url('notes/hello.txt')).toContain('token=');
    await mn.files.remove('notes/hello.txt');
  });

  it('rejects file paths that try to escape the app folder', async () => {
    await expect(mn.files.upload('../other/x.txt', new Blob(['x']))).rejects.toThrow(
      'invalid file path',
    );
  });

  it('creates notifications for the signed-in user', async () => {
    await mn.notify('Erinnerung', 'Einkaufen', '/liste');
    const { data } = await admin
      .schema('platform')
      .from('notifications')
      .select('title')
      .eq('user_id', userId);
    expect(data).toEqual([{ title: 'Erinnerung' }]);
  });
});
