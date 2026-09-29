import { parseManifest } from '@mininode/manifest';
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruneApps } from './prune.ts';
import { registerApp } from './register.ts';

interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** A fetch double for the Cloudflare API and PostgREST that records every call. */
function fakeFetch(workers: string[], failDelete = false) {
  const calls: Call[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    if (url.includes('api.cloudflare.com')) {
      if (method === 'DELETE') return new Response('{}', { status: failDelete ? 500 : 200 });
      return Response.json({ success: true, result: workers.map((id) => ({ id })) });
    }
    if (url.includes('/profiles')) return Response.json([{ user_id: 'admin-1' }]);
    if (method === 'GET') return Response.json([]);
    return new Response(null, { status: 204 });
  };
  return { fn: fn as typeof fetch, calls };
}

const env = { ...process.env };
beforeEach(() => {
  Object.assign(process.env, {
    CLOUDFLARE_ACCOUNT_ID: 'acc',
    CLOUDFLARE_API_TOKEN: 'token',
    SUPABASE_URL: 'https://db.example.com',
    SUPABASE_PUBLISHABLE_KEY: 'pub',
    SUPABASE_SECRET_KEY: 'secret',
  });
});
afterEach(() => {
  process.env = { ...env };
});

const hosted = new Map([
  ['haushalt', 'cloudflare'],
  ['remote', 'nucbox'],
]);
const summary = (calls: Call[]) =>
  calls
    .filter((c) => c.method !== 'GET')
    .map((c) => `${c.method} ${new URL(c.url).pathname.split('/').at(-1)}`);

describe('pruneApps', () => {
  it('disables removed apps before deleting their Worker, and keeps moved apps online', async () => {
    const { fn, calls } = fakeFetch(['mn-app-haushalt', 'mn-app-notizen', 'mn-app-remote']);
    const pruned = await pruneApps('production', hosted, { fetch: fn, log: () => {} });
    expect(pruned).toEqual(['mn-app-notizen', 'mn-app-remote']);
    expect(summary(calls)).toEqual(['PATCH apps', 'DELETE mn-app-notizen', 'DELETE mn-app-remote']);
    expect(calls.find((c) => c.method === 'PATCH')?.url).toContain('slug=eq.notizen');
  });

  it('changes nothing on a dry run', async () => {
    const { fn, calls } = fakeFetch(['mn-app-notizen']);
    delete process.env.SUPABASE_SECRET_KEY;
    expect(
      await pruneApps('production', hosted, { fetch: fn, dryRun: true, log: () => {} }),
    ).toEqual(['mn-app-notizen']);
    expect(summary(calls)).toEqual([]);
  });

  it('refuses to prune everything when no hosted apps are found', async () => {
    const { fn } = fakeFetch(['mn-app-haushalt']);
    await expect(pruneApps('production', new Map(), { fetch: fn })).rejects.toThrow('--force');
  });

  it('needs the secret key outside a dry run', async () => {
    const { fn } = fakeFetch(['mn-app-notizen']);
    delete process.env.SUPABASE_SECRET_KEY;
    await expect(pruneApps('production', hosted, { fetch: fn, log: () => {} })).rejects.toThrow(
      'SUPABASE_SECRET_KEY',
    );
  });

  it('reports a failed delete after the app is already disabled', async () => {
    const { fn, calls } = fakeFetch(['mn-app-notizen'], true);
    await expect(pruneApps('production', hosted, { fetch: fn, log: () => {} })).rejects.toThrow(
      'deleting mn-app-notizen failed: 500',
    );
    expect(summary(calls)).toEqual(['PATCH apps', 'DELETE mn-app-notizen']);
  });
});

describe('registerApp', () => {
  it('registers the origins lowercased', async () => {
    const { fn, calls } = fakeFetch([]);
    const db = createClient('https://db.example.com', 'secret', {
      auth: { persistSession: false },
      global: { fetch: fn },
    });
    const parsed = parseManifest({
      specVersion: 1,
      slug: 'haushalt',
      name: 'Haushalt',
      description: 'Budget',
      kind: 'static',
      target: 'cloudflare',
    });
    if (!parsed.ok) throw new Error(parsed.errors.join());
    await registerApp(db, parsed.manifest, '1.0.0', ['https://Haushalt.MiniNode.app']);
    const origins = calls.find((c) => c.url.includes('/app_origins'));
    expect(origins?.body).toEqual([
      { origin: 'https://haushalt.mininode.app', app_slug: 'haushalt' },
    ]);
  });

  it('grants a new default app to every existing user once', async () => {
    const { fn, calls } = fakeFetch([]);
    const db = createClient('https://db.example.com', 'secret', {
      auth: { persistSession: false },
      global: { fetch: fn },
    });
    const parsed = parseManifest({
      specVersion: 1,
      slug: 'wunschliste',
      name: 'Wunschliste',
      description: 'Wünsche',
      kind: 'static',
      target: 'cloudflare',
      access: { default: true },
    });
    if (!parsed.ok) throw new Error(parsed.errors.join());
    await registerApp(db, parsed.manifest, '1.0.0');
    const profiles = calls.find((c) => decodeURIComponent(c.url).includes('role=in.'));
    expect(decodeURIComponent(profiles?.url ?? '')).toContain('role=in.(user,trusted,admin)');
    const grants = calls.find((c) => c.url.includes('/app_grants'));
    expect(grants?.url).toContain('on_conflict=user_id%2Capp_slug');
    expect(grants?.body).toEqual([{ user_id: 'admin-1', app_slug: 'wunschliste' }]);
  });
});
