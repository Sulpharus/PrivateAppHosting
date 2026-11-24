import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appsFromPaths, appsToDeploy, builtFromSource, changedApps } from './changed.ts';

let dir = '';
const git = (...args: string[]) => {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
const write = (path: string, text: string) => {
  mkdirSync(join(dir, path, '..'), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const commit = (message: string) => {
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mn-changed-'));
  git('init', '-q');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('appsFromPaths', () => {
  it('names the hosted apps behind the paths', () => {
    expect(appsFromPaths(['hosted/aa/x.js', 'hosted/b-c/y/z.js', 'docs/x.md'])).toEqual([
      'aa',
      'b-c',
    ]);
  });
});

describe('appsToDeploy', () => {
  it('ships what changed since each app was last deployed, also after a failed run in between', () => {
    write('hosted/a/app.js', '1');
    write('hosted/b/app.js', '1');
    const first = commit('first');
    write('hosted/a/app.js', '2'); // a change whose deploy failed
    commit('a changes');
    write('docs/x.md', 'only docs');
    commit('docs');
    const deployed = new Map([
      ['a', first],
      ['b', first],
    ]);
    expect(appsToDeploy(['a', 'b'], deployed, dir)).toEqual(['a']);
  });

  it('does not ship an app that was deployed from the latest commit', () => {
    write('hosted/a/app.js', '1');
    const head = commit('first');
    expect(appsToDeploy(['a'], new Map([['a', head]]), dir)).toEqual([]);
  });

  it('ships every app when a shared package changed since its version', () => {
    write('hosted/a/app.js', '1');
    write('hosted/b/app.js', '1');
    const first = commit('first');
    write('packages/sdk/src/index.ts', 'export {};');
    commit('sdk');
    const deployed = new Map([
      ['a', first],
      ['b', first],
    ]);
    expect(appsToDeploy(['a', 'b'], deployed, dir)).toEqual(['a', 'b']);
  });

  it('ships an app without a usable version', () => {
    write('hosted/a/app.js', '1');
    write('hosted/b/app.js', '1');
    write('hosted/c/app.js', '1');
    const head = commit('first');
    const deployed = new Map<string, string | null>([
      ['a', null],
      ['b', 'upload'],
      ['c', head],
    ]);
    expect(appsToDeploy(['a', 'b', 'c'], deployed, dir)).toEqual(['a', 'b']);
    expect(appsToDeploy(['a'], new Map(), dir)).toEqual(['a']);
  });

  it('ships an app with a version that is no commit of this repository', () => {
    write('hosted/a/app.js', '1');
    commit('first');
    expect(appsToDeploy(['a'], new Map([['a', 'not-a-commit']]), dir)).toEqual(['a']);
  });

  it('does not ship an app again for a shared change it was deployed after', () => {
    write('hosted/a/app.js', '1');
    write('hosted/b/app.js', '1');
    const first = commit('first');
    write('packages/sdk/src/index.ts', 'export {};');
    const afterSdk = commit('sdk');
    const deployed = new Map([
      ['a', afterSdk],
      ['b', first],
    ]);
    expect(appsToDeploy(['a', 'b'], deployed, dir)).toEqual(['b']);
  });

  it('ships apps built from source only for changes in their own folder', () => {
    write('hosted/score/source.json', '{}');
    write('hosted/craft/release.json', JSON.stringify({ patches: ['patches/a.patch'] }));
    write('hosted/plain/app.js', '1');
    const first = commit('first');
    write('packages/ui/kit/ui.js', 'kit');
    write('pnpm-lock.yaml', 'lock');
    const shared = commit('shared');
    const deployed = new Map([
      ['score', first],
      ['craft', first],
      ['plain', first],
    ]);
    expect(appsToDeploy(['score', 'craft', 'plain'], deployed, dir)).toEqual(['plain']);
    write('hosted/score/README.md', 'docs');
    write('hosted/score/test/a.test.js', 'test');
    commit('docs and tests');
    expect(appsToDeploy(['score', 'craft', 'plain'], deployed, dir)).toEqual(['plain']);
    write('hosted/craft/patches/a.patch', 'changed');
    commit('craft');
    expect(appsToDeploy(['score', 'craft', 'plain'], deployed, dir)).toEqual(['craft', 'plain']);
    // The gate is every app's Worker: its fixes reach apps built from source too.
    write('packages/gate/src/worker.ts', 'fix');
    commit('gate');
    const sinceShared = new Map([
      ['score', shared],
      ['craft', shared],
    ]);
    expect(appsToDeploy(['score', 'craft'], sinceShared, dir)).toEqual(['score', 'craft']);
  });

  it('leaves docs and tests of apps built from source out of the changed apps', () => {
    write('hosted/score/source.json', '{}');
    write('hosted/plain/app.js', '1');
    const base = commit('base');
    write('hosted/score/README.md', 'docs');
    write('hosted/score/test/a.test.js', 'test');
    write('hosted/plain/README.md', 'docs');
    commit('docs');
    expect(changedApps(base, dir)).toEqual(['plain']);
    write('hosted/score/build.mjs', 'code');
    commit('code');
    expect(changedApps(base, dir)).toEqual(['plain', 'score']);
  });
});

describe('builtFromSource', () => {
  it('knows MuseScore-like apps and Craft apps with patches', () => {
    write('hosted/score/source.json', '{}');
    write('hosted/craft/release.json', JSON.stringify({ patches: ['x'] }));
    write('hosted/upstream/release.json', JSON.stringify({ patches: [] }));
    write('hosted/odd/release.json', JSON.stringify({ patches: 'not a list' }));
    write('hosted/broken/release.json', '{nope');
    expect(builtFromSource('score', dir)).toBe(true);
    expect(builtFromSource('craft', dir)).toBe(true);
    expect(builtFromSource('upstream', dir)).toBe(false);
    expect(builtFromSource('odd', dir)).toBe(false);
    expect(builtFromSource('broken', dir)).toBe(false);
    expect(builtFromSource('missing', dir)).toBe(false);
  });
});
