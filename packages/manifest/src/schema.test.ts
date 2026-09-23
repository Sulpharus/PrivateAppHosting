import { describe, expect, it } from 'vitest';
import { appSchemaName, parseManifest } from './index.ts';

const spa = {
  specVersion: 1,
  slug: 'rezepte',
  name: 'Rezepte',
  description: 'Rezepte und Wochenplan',
  kind: 'spa',
  target: 'cloudflare',
  data: { mode: 'private' },
  build: { command: 'pnpm build', output: 'dist' },
};

describe('parseManifest', () => {
  it('accepts a minimal SPA and applies defaults', () => {
    const result = parseManifest(spa);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.access).toEqual({ default: false, roles: ['user', 'trusted', 'admin'] });
  });

  it.each([
    ['uppercase', 'Rezepte'],
    ['reserved', 'admin'],
    ['double dash', 'a--b'],
    ['trailing dash', 'abc-'],
    ['too short', 'a'],
  ])('rejects a %s slug', (_, slug) => {
    expect(parseManifest({ ...spa, slug }).ok).toBe(false);
  });

  it('rejects a kind that cannot run on the target', () => {
    const result = parseManifest({ ...spa, target: 'nucbox' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join()).toContain('cannot run on target');
  });

  it('requires a container block for container apps', () => {
    const result = parseManifest({ ...spa, kind: 'container', target: 'nucbox', build: undefined });
    expect(result.ok).toBe(false);
  });

  it('requires an installer or winget id for Windows remote apps', () => {
    const base = { ...spa, kind: 'remote', target: 'remote', build: undefined };
    expect(parseManifest({ ...base, remote: { runtime: 'windows', program: 'foo.exe' } }).ok).toBe(
      false,
    );
    expect(
      parseManifest({
        ...base,
        remote: { runtime: 'windows', program: 'foo.exe', wingetId: 'Foo.Foo' },
      }).ok,
    ).toBe(true);
  });

  it('rejects unknown keys so typos surface early', () => {
    expect(parseManifest({ ...spa, dta: {} }).ok).toBe(false);
  });

  it('rejects build outputs escaping the app folder', () => {
    expect(parseManifest({ ...spa, build: { output: '../x' } }).ok).toBe(false);
  });

  it('requires the trusted role for shared-account apps', () => {
    const result = parseManifest({
      ...spa,
      data: { mode: 'shared-account' },
      access: { roles: ['user'] },
    });
    expect(result.ok).toBe(false);
  });
});

describe('appSchemaName', () => {
  it('maps dashes to underscores', () => {
    expect(appSchemaName('habit-tracker')).toBe('app_habit_tracker');
  });
});
