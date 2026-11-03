import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_SOURCE,
  applyAppUpdate,
  applyPlatformUpdate,
  describePlan,
  isSafePath,
  PLATFORM_FILES,
  planAppUpdate,
  planPlatformUpdate,
  writePlatformList,
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

describe('files from outside', () => {
  it('refuses a link in a release package or an app repository', () => {
    const secret = put(join(dir, 'secret'), { 'token.txt': 'do not copy' });
    const from = put(join(dir, 'new'), { VERSION: '0.2.0\n', 'apps/a.ts': 'a' });
    symlinkSync(join(secret, 'token.txt'), join(from, 'apps/leak.txt'));
    const root = put(join(dir, 'repo'), {});
    expect(() => planPlatformUpdate({ root, from })).toThrow('link or special file');

    const clone = put(join(dir, 'clone'), { 'mininode.json': manifest('notes') });
    symlinkSync(secret, join(clone, 'folder'));
    const appDir = put(join(dir, 'hosted/notes'), { 'mininode.json': manifest('notes') });
    expect(() =>
      planAppUpdate({ appDir, slug: 'notes', from: clone, repository: 'a/b', commit: 'c' }),
    ).toThrow('link or special file');
  });

  it('refuses a link that loops', () => {
    const from = put(join(dir, 'new'), { VERSION: '0.2.0\n' });
    symlinkSync(from, join(from, 'again'));
    expect(() => planPlatformUpdate({ root: join(dir, 'repo'), from })).toThrow('link');
  });

  it('does not write through a link that is already in the repository', () => {
    const outside = put(join(dir, 'outside'), { 'target.txt': 'outside' });
    const root = put(join(dir, 'repo'), { 'apps/a.ts': 'old' });
    rmSync(join(root, 'apps/a.ts'));
    symlinkSync(join(outside, 'target.txt'), join(root, 'apps/a.ts'));
    const from = put(join(dir, 'new'), { VERSION: '0.2.0\n', 'apps/a.ts': 'new' });
    const result = planPlatformUpdate({ root, from });
    expect(() => applyPlatformUpdate({ root, from }, result, 'o/s')).toThrow('not a plain file');
    expect(read(outside, 'target.txt')).toBe('outside');
  });

  it('ignores paths of a tampered file list that leave the repository or dodge a protected folder', () => {
    const root = put(join(dir, 'repo'), {
      'hosted/notes/index.html': 'mine',
      'mininode.config.json': '{"mine":true}',
      ...migration('001', 'create table a();'),
      [PLATFORM_FILES]: JSON.stringify({
        files: {
          '../outside.txt': 'x',
          'docs/../mininode.config.json': 'x',
          'docs/../hosted/notes/index.html': 'x',
          'supabase/./migrations/001.sql': 'x',
          'supabase/migrations/../migrations/001.sql': 'x',
          '/etc/passwd': 'x',
        },
      }),
    });
    put(dir, { 'outside.txt': 'keep' });
    const from = put(join(dir, 'new'), { VERSION: '0.2.0\n', 'apps/a.ts': 'a' });
    const result = planPlatformUpdate({ root, from });
    expect(result.remove).toEqual([]);
    applyPlatformUpdate({ root, from }, result, 'o/s');
    expect(read(root, 'hosted/notes/index.html')).toBe('mine');
    expect(read(root, 'mininode.config.json')).toBe('{"mine":true}');
    expect(existsSync(join(root, 'supabase/migrations/001.sql'))).toBe(true);
    expect(read(dir, 'outside.txt')).toBe('keep');
  });
});

describe('isSafePath', () => {
  it('accepts plain relative paths only', () => {
    for (const ok of ['a', 'a/b.ts', '.github/workflows/ci.yml'])
      expect(isSafePath(ok), ok).toBe(true);
    for (const bad of ['', '/a', '../a', 'a/../b', 'a/./b', 'a//b', 'a\\b', 'a/..'])
      expect(isSafePath(bad), bad).toBe(false);
  });
});

describe('workflow files', () => {
  it('keeps their entries in the list while they are skipped, so a later update still owns them', () => {
    const root = put(join(dir, 'repo'), {
      '.github/workflows/old.yml': 'old',
      [PLATFORM_FILES]: JSON.stringify({ files: { '.github/workflows/old.yml': 'h' } }),
    });
    const from = put(join(dir, 'new'), { VERSION: '0.2.0\n', 'apps/a.ts': 'a' });
    const options = { root, from, skipWorkflows: true };
    applyPlatformUpdate(options, planPlatformUpdate(options), 'o/s');
    const list = JSON.parse(read(root, PLATFORM_FILES)) as { files: Record<string, string> };
    expect(Object.keys(list.files).sort()).toEqual(['.github/workflows/old.yml', 'apps/a.ts']);
    expect(read(root, '.github/workflows/old.yml')).toBe('old');
  });
});

describe('writePlatformList', () => {
  it('lists the platform files with hashes and leaves the installation out', () => {
    const pkg = put(join(dir, 'pkg'), {
      VERSION: '0.9.0\nedition: starter\n',
      'apps/a.ts': 'a',
      'hosted/README.md': 'x',
      'biome.json': '{}',
      'README-EDITION.md': 'x',
    });
    writePlatformList(pkg, 'o/s');
    const list = JSON.parse(read(pkg, PLATFORM_FILES)) as {
      version: string;
      source: string;
      files: Record<string, string>;
    };
    expect(list).toMatchObject({ version: '0.9.0', source: 'o/s' });
    expect(Object.keys(list.files)).toEqual(['apps/a.ts']);
    expect(list.files['apps/a.ts']).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('app address', () => {
  it('is checked before any path is built from it', () => {
    const clone = put(join(dir, 'clone'), { 'mininode.json': manifest('notes') });
    expect(() =>
      planAppUpdate({
        appDir: join(dir, 'x'),
        slug: '../..',
        from: clone,
        repository: 'a/b',
        commit: 'c',
      }),
    ).toThrow('invalid app address');
  });
});
