import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseManifest } from '@mininode/manifest';
import { describe, expect, it } from 'vitest';
import { appsFromPaths } from '../changed.ts';
import { environmentSettings } from './environment.ts';
import { schemaList, stageAssets } from './index.ts';
import { plan } from './migrate.ts';
import { workersToPrune } from './prune.ts';
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

describe('schemaList', () => {
  it('adds the app schema once and drops blanks and missing schemas', () => {
    expect(schemaList('public, platform,,app_a', 'app_b', null)).toEqual([
      'public',
      'platform',
      'app_a',
      'app_b',
    ]);
    expect(schemaList('public,platform,app_a', 'app_a', null)).toEqual([
      'public',
      'platform',
      'app_a',
    ]);
    expect(schemaList('public,app_gone', 'app_static', new Set(['public']))).toEqual(['public']);
  });
});

describe('workersToPrune', () => {
  it('only removes prefixed Workers of apps that are gone', () => {
    const names = ['mn-app-haushalt', 'mn-app-notizen', 'mininode-portal', 'mn-stg-notizen'];
    expect(workersToPrune(names, 'mn-app-', new Set(['haushalt']))).toEqual(['mn-app-notizen']);
    expect(workersToPrune(names, 'mn-app-', new Set(['haushalt', 'notizen']))).toEqual([]);
  });
});

describe('stageAssets', () => {
  it('serves the SDK and the app kit next to the app files', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'mininode-app-'));
    writeFileSync(join(appDir, 'index.html'), '<!doctype html>');
    writeFileSync(join(appDir, 'README.md'), 'not served');
    const staticApp = parseManifest({
      specVersion: 1,
      slug: 'regal',
      name: 'Regal',
      description: 'Bücher',
      kind: 'static',
      target: 'cloudflare',
    });
    if (!staticApp.ok) throw new Error(staticApp.errors.join());
    const stage = stageAssets(appDir, staticApp.manifest);
    try {
      const root = join(stage, 'assets-root');
      for (const file of [
        'index.html',
        '_mininode/sdk.js',
        '_mininode/ui.css',
        '_mininode/ui.js',
        '_mininode/fonts/bricolage-grotesque-latin-wght-normal.woff2',
        '_mininode/fonts/instrument-sans-latin-wght-normal.woff2',
        '_mininode/fonts/jetbrains-mono-latin-wght-normal.woff2',
      ])
        expect(existsSync(join(root, file)), file).toBe(true);
      expect(existsSync(join(root, 'README.md'))).toBe(false);
      // Every font ui.css asks for must be there: a missing file would come back as index.html.
      const css = readFileSync(join(root, '_mininode/ui.css'), 'utf8');
      const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1] ?? '');
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) expect(existsSync(join(root, '_mininode', url)), url).toBe(true);
    } finally {
      rmSync(stage, { recursive: true, force: true });
      rmSync(appDir, { recursive: true, force: true });
    }
  });
});
