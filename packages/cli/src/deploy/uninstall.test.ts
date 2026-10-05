import { afterEach, describe, expect, it, vi } from 'vitest';
import { unexposeSchemas } from './migrate.ts';
import { deleteWorker, dropExemptions, uninstallableSlug, withoutSchema } from './uninstall.ts';

describe('uninstallableSlug', () => {
  it('accepts an app address and refuses reserved names and nonsense', () => {
    expect(uninstallableSlug('haushalts-inventar')).toBe('haushalts-inventar');
    for (const bad of ['', 'Admin', 'a', 'x_y', '../x', 'admin', 'api', 'kalender'])
      expect(() => uninstallableSlug(bad), bad).toThrow();
  });
});

describe('withoutSchema', () => {
  it('removes only that schema from the Data API list', () => {
    expect(withoutSchema('public,platform,app_a,app_b', 'app_a')).toEqual([
      'public',
      'platform',
      'app_b',
    ]);
    expect(withoutSchema('public,platform', 'app_a')).toEqual(['public', 'platform']);
  });
});

describe('dropExemptions', () => {
  const biome = JSON.stringify({
    files: { includes: ['**', '!hosted/x', '!hosted/y'] },
    overrides: [
      { includes: ['hosted/**'], linter: { rules: {} } },
      { includes: ['hosted/x/**', 'hosted/y/**'], linter: { enabled: false } },
    ],
  });

  it('forgets the app and keeps the others', () => {
    const next = JSON.parse(dropExemptions(biome, 'x'));
    expect(next.files.includes).toEqual(['**', '!hosted/y']);
    expect(next.overrides[1].includes).toEqual(['hosted/y/**']);
  });

  it('drops an exemption block that only existed for this app', () => {
    const only = JSON.stringify({
      overrides: [{ includes: ['hosted/x/**'], linter: { enabled: false } }],
    });
    expect(JSON.parse(dropExemptions(only, 'x')).overrides).toEqual([]);
  });
});

describe('unexposeSchemas', () => {
  const options = { projectRef: 'ref', accessToken: 'tok', schemas: ['app_a'], settleMs: 0 };

  function fake(initial: string, patch = true) {
    let current = initial;
    const calls: string[] = [];
    const fetcher = (async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push(method);
      if (method === 'PATCH') {
        if (patch) current = (JSON.parse(String(init?.body)) as { db_schema: string }).db_schema;
        return new Response('{}', { status: 200 });
      }
      return Response.json({ db_schema: current });
    }) as unknown as typeof fetch;
    return { fetcher, calls, schema: () => current };
  }

  it('hides a listed schema and keeps the others', async () => {
    const f = fake('public,platform,app_a,app_b');
    await unexposeSchemas({ ...options, fetcher: f.fetcher });
    expect(f.schema()).toBe('public,platform,app_b');
  });

  it('does nothing for a schema that is not listed', async () => {
    const f = fake('public,platform');
    await unexposeSchemas({ ...options, fetcher: f.fetcher });
    expect(f.calls).toEqual(['GET']);
  });

  it('stops when the setting cannot be read, instead of guessing', async () => {
    const failing = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    await expect(unexposeSchemas({ ...options, fetcher: failing })).rejects.toThrow(/500/);
    const empty = (async () => Response.json({})) as unknown as typeof fetch;
    await expect(unexposeSchemas({ ...options, fetcher: empty })).rejects.toThrow(/no db_schema/);
  });

  it('stops when the schema is still listed after the change', async () => {
    const f = fake('public,app_a', false);
    await expect(unexposeSchemas({ ...options, fetcher: f.fetcher })).rejects.toThrow(
      /still exposed/,
    );
  });
});

describe('deleteWorker', () => {
  afterEach(() => vi.unstubAllEnvs());
  const env = () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'pk');
    vi.stubEnv('STAGING_DOMAIN', 'stg.example.com');
  };

  it('detaches the custom domain before it deletes the Worker', async () => {
    env();
    const seen: string[] = [];
    const request = (async (url: string, init?: RequestInit) => {
      seen.push(
        `${init?.method ?? 'GET'} ${url.replace('https://api.cloudflare.com/client/v4/accounts/acc', '')}`,
      );
      if (url.includes('/workers/domains?')) return Response.json({ result: [{ id: 'd1' }] });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await deleteWorker('staging', 'rezepte', request)).toBe('deleted');
    expect(seen).toEqual([
      'GET /workers/domains?service=mn-stg-rezepte',
      'DELETE /workers/domains/d1',
      'DELETE /workers/scripts/mn-stg-rezepte?force=true',
    ]);
  });

  it('counts a missing Worker as done', async () => {
    env();
    const request = (async (url: string) =>
      url.includes('/workers/domains?')
        ? Response.json({ result: [] })
        : new Response('{}', { status: 404 })) as unknown as typeof fetch;
    expect(await deleteWorker('staging', 'rezepte', request)).toBe('none');
  });
});
