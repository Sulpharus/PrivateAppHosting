import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installedApps } from './apps.ts';
import { loadConfig } from './config.ts';
import { miniflareOptions } from './options.ts';
import { CRONS, due } from './scheduler.ts';

const env = {
  MININODE_DOMAIN: 'mininode.localhost',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  SUPABASE_SECRET_KEY: 'sb_secret_x',
  VAULT_KEY: 'v',
  GUACAMOLE_JSON_SECRET: 'g',
  NUCBOX_CONTROL_TOKEN: 'n',
} as NodeJS.ProcessEnv;

describe('config', () => {
  it('names every address after the domain, with the port only when it is not the default', () => {
    const config = loadConfig({ ...env, MININODE_PORT: '8787' });
    expect(config.portalUrl).toBe('http://mininode.localhost:8787');
    expect(config.apiUrl).toBe('http://api.mininode.localhost:8787');
    expect(config.supabaseUrl).toBe('http://supabase.mininode.localhost:8787');
    const tunnel = loadConfig({
      ...env,
      MININODE_DOMAIN: 'apps.example.org',
      MININODE_SCHEME: 'https',
      MININODE_PORT: '443',
    });
    expect(tunnel.portalUrl).toBe('https://apps.example.org');
    expect(tunnel.aiUrl).toBe('https://ai.apps.example.org');
  });

  it('refuses to start without its secrets or with a malformed domain', () => {
    expect(() => loadConfig({ ...env, SUPABASE_SECRET_KEY: undefined })).toThrow(
      /SUPABASE_SECRET_KEY/,
    );
    expect(() => loadConfig({ ...env, MININODE_DOMAIN: 'https://x.test/' })).toThrow(
      /MININODE_DOMAIN/,
    );
  });
});

describe('scheduler', () => {
  it('runs the push cron every minute and the calendar sync every fifth', () => {
    expect(CRONS).toHaveLength(2);
    expect([0, 1, 59].every((minute) => due('* * * * *', minute))).toBe(true);
    const sync = [...Array(60).keys()].filter((minute) => due('2-59/5 * * * *', minute));
    expect(sync).toEqual([2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57]);
  });
});

describe('the host', () => {
  let dir: string;
  let mf: Miniflare;
  const config = () =>
    loadConfig({
      ...env,
      DATA_DIR: join(dir, 'data'),
      WORKERS_DIR: join(dir, 'workers'),
      PORTAL_DIST: join(dir, 'portal'),
      MININODE_PORT: '80',
    });

  const app = (slug: string, files: Record<string, string>, kind = 'spa') => {
    mkdirSync(join(dir, 'data/apps', slug), { recursive: true });
    writeFileSync(
      join(dir, 'data/apps', slug, 'app.json'),
      JSON.stringify({ slug, name: slug, kind }),
    );
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(dir, 'data/served', slug, name, '..'), { recursive: true });
      writeFileSync(join(dir, 'data/served', slug, name), content);
    }
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mininode-host-'));
    // Stand-ins for the bundled Workers: they only hand the request to their ASSETS binding.
    mkdirSync(join(dir, 'workers'));
    const passthrough =
      'export default { fetch: (request, env) => env.ASSETS ? env.ASSETS.fetch(request) : new Response(env.APP_SLUG ?? "stub") };';
    for (const name of ['portal', 'api', 'ai', 'gate'])
      writeFileSync(join(dir, 'workers', `${name}.mjs`), passthrough);
    mkdirSync(join(dir, 'portal'));
    writeFileSync(join(dir, 'portal/index.html'), '<h1>portal</h1>');
    mkdirSync(join(dir, 'data/served/_portal'), { recursive: true });
    writeFileSync(join(dir, 'data/served/_portal/index.html'), '<h1>portal</h1>');
    app('alpha', {
      'index.html': '<h1>alpha</h1>',
      'app.js': 'alpha-js',
      'sub/index.html': 'alpha sub',
    });
    app('beta', { 'index.html': '<h1>beta</h1>', '404.html': 'beta missing' }, 'static');
    mf = new Miniflare({
      ...miniflareOptions(config(), installedApps(join(dir, 'data'))),
      port: 0,
      host: '127.0.0.1',
    });
    await mf.ready;
  });

  afterAll(async () => {
    await mf?.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  // Plain HTTP, so the test decides every header (fetch adds its own Sec-Fetch-Mode).
  const get = (host: string, path = '/', headers: Record<string, string> = {}) =>
    new Promise<{
      status: number;
      text: () => Promise<string>;
      headers: { get: (name: string) => string | null };
    }>((resolve, reject) => {
      void mf.ready.then((url) => {
        const request = http.request(
          { host: url.hostname, port: url.port, path, headers: { host, ...headers } },
          (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => {
              const body = Buffer.concat(chunks).toString('utf8');
              resolve({
                status: response.statusCode ?? 0,
                text: async () => body,
                headers: {
                  get: (name) => String(response.headers[name.toLowerCase()] ?? '') || null,
                },
              });
            });
          },
        );
        request.on('error', reject);
        request.end();
      });
    });

  it('routes the portal and each app to its own files', async () => {
    expect(await (await get('mininode.localhost')).text()).toContain('portal');
    expect(await (await get('alpha.mininode.localhost')).text()).toContain('alpha');
    expect(await (await get('beta.mininode.localhost')).text()).toContain('beta');
    expect(await (await get('alpha.mininode.localhost', '/app.js')).text()).toBe('alpha-js');
  });

  it('keeps one app from reading another', async () => {
    expect((await get('beta.mininode.localhost', '/app.js')).status).toBe(404);
    expect((await get('beta.mininode.localhost', '/..%2Falpha/app.js')).status).toBe(404);
    expect((await get('beta.mininode.localhost', '/../alpha/app.js')).status).toBe(404);
    expect((await get('alpha.mininode.localhost', '/_portal/index.html')).status).toBe(404);
  });

  it('opens an app page for any address a browser navigates to, but only for pages', async () => {
    const page = await get('alpha.mininode.localhost', '/some/deep/link', {
      'Sec-Fetch-Mode': 'navigate',
    });
    expect(await page.text()).toContain('alpha');
    expect(
      (await get('alpha.mininode.localhost', '/missing.js', { 'Sec-Fetch-Mode': 'no-cors' }))
        .status,
    ).toBe(404);
  });

  it('answers a missing address of a static app with its own 404 page', async () => {
    const missing = await get('beta.mininode.localhost', '/nothing', {
      'Sec-Fetch-Mode': 'navigate',
    });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('beta missing');
  });

  it('does not leak the store folder in redirects', async () => {
    const response = await get('alpha.mininode.localhost', '/sub');
    const location = response.headers.get('Location');
    if (location) expect(location).not.toMatch(/alpha/);
  });

  it('answers unknown hosts and apps with 404', async () => {
    expect((await get('nope.mininode.localhost')).status).toBe(404);
    expect((await get('elsewhere.example')).status).toBe(404);
  });
});

describe('installed apps', () => {
  it('ignores folders whose description does not match, and broken files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mininode-apps-'));
    for (const [folder, json] of [
      ['good', { slug: 'good', name: 'Good' }],
      ['liar', { slug: 'other', name: 'Liar' }],
    ] as const) {
      mkdirSync(join(dir, 'apps', folder), { recursive: true });
      mkdirSync(join(dir, 'served', folder), { recursive: true });
      writeFileSync(join(dir, 'apps', folder, 'app.json'), JSON.stringify(json));
    }
    mkdirSync(join(dir, 'apps/broken'), { recursive: true });
    mkdirSync(join(dir, 'served/broken'), { recursive: true });
    writeFileSync(join(dir, 'apps/broken/app.json'), '{nope');
    expect(installedApps(dir).map((a) => a.slug)).toEqual(['good']);
    rmSync(dir, { recursive: true, force: true });
  });
});
