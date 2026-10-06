import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appsFromPaths, appsToDeploy } from './changed.ts';

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
});
