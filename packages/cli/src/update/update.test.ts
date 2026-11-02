import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_SOURCE,
  applyAppUpdate,
  applyPlatformUpdate,
  describePlan,
  PLATFORM_FILES,
  planAppUpdate,
  planPlatformUpdate,
} from './index.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mn-update-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function put(root: string, files: Record<string, string>): string {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');

const migration = (name: string, body: string) => ({ [`supabase/migrations/${name}.sql`]: body });

describe('platform update', () => {
  it('adds, changes and removes platform files, and leaves the installation alone', () => {
    const root = put(join(dir, 'repo'), {
      'apps/api/index.ts': 'old',
      'apps/api/gone.ts': 'gone',
      'hosted/notes/index.html': 'mine',
      'mininode.config.json': '{"mine":true}',
      'docs/STATUS.md': 'my status',
      'biome.json': 'mine',
      ...migration('001', 'create table a();'),
    });
    // The previous file list: what the platform put there.
    put(root, {
      [PLATFORM_FILES]: JSON.stringify({
        files: {
          'apps/api/index.ts': 'x',
          'apps/api/gone.ts': 'x',
          'supabase/migrations/001.sql': 'x',
        },
      }),
    });
    const from = put(join(dir, 'new'), {
      VERSION: '0.2.0\nedition: starter\n',
      'apps/api/index.ts': 'new',
      'apps/api/extra.ts': 'extra',
      'hosted/README.md': 'starter readme',
      'mininode.config.json': '{"theirs":true}',
      'docs/STATUS.md': 'their status',
      'biome.json': 'theirs',
      ...migration('001', 'create table a();'),
      ...migration('002', 'create table b();'),
    });
    const result = planPlatformUpdate({ root, from });
    expect(result.version).toBe('0.2.0');
    expect(result.add).toEqual(['apps/api/extra.ts', 'supabase/migrations/002.sql']);
    expect(result.change).toEqual(['apps/api/index.ts']);
    expect(result.remove).toEqual(['apps/api/gone.ts']);
    expect(result.conflicts).toEqual([]);

    applyPlatformUpdate({ root, from }, result, 'owner/source');
    expect(read(root, 'apps/api/index.ts')).toBe('new');
    expect(existsSync(join(root, 'apps/api/gone.ts'))).toBe(false);
    expect(read(root, 'hosted/notes/index.html')).toBe('mine');
    expect(read(root, 'mininode.config.json')).toBe('{"mine":true}');
    expect(read(root, 'docs/STATUS.md')).toBe('my status');
    expect(read(root, 'biome.json')).toBe('mine');
    expect(existsSync(join(root, 'hosted/README.md'))).toBe(false);
    const list = JSON.parse(read(root, PLATFORM_FILES)) as { version: string; source: string };
    expect(list).toMatchObject({ version: '0.2.0', source: 'owner/source' });
  });

  it('refuses a new copy that rewrites an applied migration, and writes nothing', () => {
    const root = put(join(dir, 'repo'), {
      'apps/a.ts': 'old',
      ...migration('001', 'create table a(id int);'),
    });
    const from = put(join(dir, 'new'), {
      VERSION: '0.2.0\n',
      'apps/a.ts': 'new',
      ...migration('001', 'create table a(id bigint);'),
    });
    const result = planPlatformUpdate({ root, from });
    expect(result.conflicts).toEqual(['supabase/migrations/001.sql']);
    expect(describePlan(result)).toContain('CONFLICT');
    expect(() => applyPlatformUpdate({ root, from }, result, 'o/s')).toThrow('refused');
    expect(read(root, 'apps/a.ts')).toBe('old');
  });

  it('never deletes a migration, even one the new copy no longer has', () => {
    const root = put(join(dir, 'repo'), {
      ...migration('001', 'select 1;'),
      [PLATFORM_FILES]: JSON.stringify({ files: { 'supabase/migrations/001.sql': 'x' } }),
    });
    const from = put(join(dir, 'new'), { VERSION: '0.3.0\n', 'apps/a.ts': 'a' });
    const result = planPlatformUpdate({ root, from });
    expect(result.remove).toEqual([]);
  });

  it('does not delete anything without a previous file list', () => {
    const root = put(join(dir, 'repo'), { 'apps/old.ts': 'mine' });
    const from = put(join(dir, 'new'), { VERSION: '0.2.0\n', 'apps/new.ts': 'n' });
    expect(planPlatformUpdate({ root, from }).remove).toEqual([]);
  });

  it('can leave the workflow files alone', () => {
    const root = put(join(dir, 'repo'), { '.github/workflows/ci.yml': 'old' });
    const from = put(join(dir, 'new'), {
      VERSION: '0.2.0\n',
      '.github/workflows/ci.yml': 'new',
      'apps/a.ts': 'a',
    });
    expect(planPlatformUpdate({ root, from }).change).toEqual(['.github/workflows/ci.yml']);
    const skipped = planPlatformUpdate({ root, from, skipWorkflows: true });
    expect(skipped.change).toEqual([]);
    expect(skipped.add).toEqual(['apps/a.ts']);
  });
});

const manifest = (slug: string) =>
  JSON.stringify({
    specVersion: 1,
    slug,
    name: 'Notes',
    description: 'Notes app',
    kind: 'static',
    target: 'cloudflare',
  });

describe('app update', () => {
  it('syncs the app from its repository and records the commit', () => {
    const appDir = put(join(dir, 'hosted/notes'), {
      'mininode.json': manifest('notes'),
      'index.html': 'v1',
      'old.js': 'old',
      'db/001_init.sql': 'create table a();',
      [APP_SOURCE]: '{}',
    });
    const from = put(join(dir, 'clone'), {
      'mininode.json': manifest('notes'),
      'index.html': 'v2',
      'new.js': 'new',
      'db/001_init.sql': 'create table a();',
      'db/002_more.sql': 'create table b();',
      '.git/HEAD': 'ref',
    });
    const options = { appDir, slug: 'notes', from, repository: 'me/notes', commit: 'abc1234' };
    const result = planAppUpdate(options);
    expect(result.add).toEqual(['db/002_more.sql', 'new.js']);
    expect(result.change).toEqual(['index.html']);
    expect(result.remove).toEqual(['old.js']);
    applyAppUpdate(options, result);
    expect(read(appDir, 'index.html')).toBe('v2');
    expect(existsSync(join(appDir, 'old.js'))).toBe(false);
    expect(existsSync(join(appDir, '.git'))).toBe(false);
    expect(JSON.parse(read(appDir, APP_SOURCE))).toEqual({
      repository: 'me/notes',
      commit: 'abc1234',
    });
  });

  it('refuses an edited migration and a repository of another app', () => {
    const appDir = put(join(dir, 'hosted/notes'), {
      'mininode.json': manifest('notes'),
      'db/001_init.sql': 'create table a(id int);',
    });
    const edited = put(join(dir, 'clone'), {
      'mininode.json': manifest('notes'),
      'db/001_init.sql': 'create table a(id bigint);',
    });
    const options = { appDir, slug: 'notes', from: edited, repository: 'me/notes', commit: 'c' };
    const result = planAppUpdate(options);
    expect(result.conflicts).toEqual(['db/001_init.sql']);
    expect(() => applyAppUpdate(options, result)).toThrow('refused');

    const other = put(join(dir, 'other'), { 'mininode.json': manifest('tasks') });
    expect(() => planAppUpdate({ ...options, from: other })).toThrow('not "notes"');
  });

  it('does not delete a migration the repository no longer has', () => {
    const appDir = put(join(dir, 'hosted/notes'), {
      'mininode.json': manifest('notes'),
      'db/001_init.sql': 'select 1;',
    });
    const from = put(join(dir, 'clone'), { 'mininode.json': manifest('notes') });
    const result = planAppUpdate({ appDir, slug: 'notes', from, repository: 'me/n', commit: 'c' });
    expect(result.remove).toEqual([]);
  });
});
