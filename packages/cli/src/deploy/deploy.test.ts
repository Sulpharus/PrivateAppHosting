import { parseManifest } from '@mininode/manifest';
import { describe, expect, it } from 'vitest';
import { appsFromPaths } from '../changed.ts';
import { environmentSettings } from './environment.ts';
import { plan } from './migrate.ts';
import { appRow } from './register.ts';
import { appWranglerConfig, GATE_ENTRY } from './wrangler-config.ts';

const parsed = parseManifest({
  specVersion: 1,
  slug: 'haushalt',
  name: 'Haushalt',
  description: 'Aufgaben',
  kind: 'spa',
  target: 'cloudflare',
  data: { mode: 'shared-account' },
  build: { command: 'pnpm build', output: 'dist' },
});
if (!parsed.ok) throw new Error(parsed.errors.join());
const manifest = parsed.manifest;

const production = environmentSettings('production', {
  SUPABASE_URL: 'https://p.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'pk',
});

describe('wrangler config', () => {
  it('puts the app behind the gate on its own subdomain', () => {
    const config = appWranglerConfig({ manifest, env: production, assetsDir: '/tmp/a' });
    expect(config.name).toBe('mn-app-haushalt');
    expect(config.main).toBe(GATE_ENTRY);
    expect(config.routes).toEqual([{ pattern: 'haushalt.mininode.app', custom_domain: true }]);
    expect(config.assets.run_worker_first).toEqual(['/*', '!/assets/*']);
    expect(config.vars).toMatchObject({ APP_SLUG: 'haushalt', PORTAL_URL: 'https://mininode.app' });
  });

  it('has no routes locally', () => {
    const local = environmentSettings('local', { SUPABASE_PUBLISHABLE_KEY: 'pk' });
    expect(appWranglerConfig({ manifest, env: local, assetsDir: '/tmp/a' })).not.toHaveProperty(
      'routes',
    );
  });
});

describe('register', () => {
  it('assigns the owner only for shared-account apps', () => {
    expect(appRow(manifest, { version: 'abc', ownerId: 'owner' })).toMatchObject({
      slug: 'haushalt',
      data_mode: 'shared-account',
      owner_id: 'owner',
      deployed_version: 'abc',
    });
    const privateApp = { ...manifest, data: { mode: 'private' as const } };
    expect(appRow(privateApp, { version: 'abc', ownerId: 'owner' }).owner_id).toBeNull();
  });
});

describe('migration plan', () => {
  const files = [
    { filename: '001.sql', sql: 'a', checksum: 'x' },
    { filename: '002.sql', sql: 'b', checksum: 'y' },
  ];
  it('applies only new files', () => {
    expect(plan(files, new Map([['001.sql', 'x']])).apply.map((f) => f.filename)).toEqual([
      '002.sql',
    ]);
  });
  it('detects edited, already-applied files', () => {
    expect(plan(files, new Map([['001.sql', 'changed']])).changed).toEqual(['001.sql']);
  });
});

describe('changed apps', () => {
  it('extracts slugs from paths', () => {
    expect(
      appsFromPaths([
        'hosted/rezepte/src/a.ts',
        'hosted/rezepte/db/1.sql',
        'hosted/budget/x',
        'apps/portal/y',
        '',
      ]),
    ).toEqual(['budget', 'rezepte']);
  });
});
