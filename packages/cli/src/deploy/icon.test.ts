import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findIcon, isDeployIcon } from './icon.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'icon-'));

describe('findIcon', () => {
  it('finds icon.svg, names it by content and prefers the app folder over public/', () => {
    const app = dir();
    mkdirSync(join(app, 'public'));
    writeFileSync(join(app, 'public', 'icon.png'), 'png');
    writeFileSync(join(app, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const found = findIcon(app, 'rezepte');
    expect(found?.ext).toBe('svg');
    expect(found?.path).toMatch(/^rezepte-app\.[0-9a-f]{8}\.svg$/);
    expect(findIcon(app, 'rezepte')?.path).toBe(found?.path);
  });

  it('finds a logo in public/ and returns null without one', () => {
    const app = dir();
    expect(findIcon(app, 'x')).toBeNull();
    mkdirSync(join(app, 'public'));
    writeFileSync(join(app, 'public', 'icon.webp'), 'w');
    expect(findIcon(app, 'x')?.ext).toBe('webp');
  });

  it('refuses a logo that is too large', () => {
    const app = dir();
    writeFileSync(join(app, 'icon.svg'), 'x'.repeat(130 * 1024));
    expect(() => findIcon(app, 'x')).toThrow(/too large/);
  });
});

describe('isDeployIcon', () => {
  it('replaces only logos that a deploy put there', () => {
    expect(isDeployIcon(null, 'a')).toBe(true);
    expect(isDeployIcon('a-app.12345678.svg', 'a')).toBe(true);
    expect(isDeployIcon('a-mh3k.webp', 'a')).toBe(false);
  });
});
