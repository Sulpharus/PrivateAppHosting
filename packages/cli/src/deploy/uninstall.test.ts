import { describe, expect, it } from 'vitest';
import { dropExemptions, uninstallableSlug, withoutSchema } from './uninstall.ts';

describe('uninstallableSlug', () => {
  it('accepts an app address and refuses reserved names and nonsense', () => {
    expect(uninstallableSlug('haushalts-inventar')).toBe('haushalts-inventar');
    for (const bad of ['', 'Admin', 'a', 'x_y', '../x', 'admin', 'api'])
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
