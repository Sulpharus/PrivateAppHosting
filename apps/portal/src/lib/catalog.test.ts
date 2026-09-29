import { describe, expect, it } from 'vitest';
import { monogram } from './apps.ts';
import { sortApps } from './catalog.ts';

const apps = [
  { slug: 'b', name: 'Beta', created_at: '2026-02-01T00:00:00Z' },
  { slug: 'a', name: 'Alpha', created_at: '2026-03-01T00:00:00Z' },
  { slug: 'c', name: 'Charlie', created_at: '2026-01-01T00:00:00Z' },
];
const names = (list: { name: string }[]) => list.map((app) => app.name);

describe('sortApps', () => {
  it('sorts by name, newest, oldest and use', () => {
    const usage = new Map([
      ['c', 5],
      ['b', 5],
    ]);
    expect(names(sortApps(apps, 'name', usage))).toEqual(['Alpha', 'Beta', 'Charlie']);
    expect(names(sortApps(apps, 'new', usage))).toEqual(['Alpha', 'Beta', 'Charlie']);
    expect(names(sortApps(apps, 'old', usage))).toEqual(['Charlie', 'Beta', 'Alpha']);
    // Equal use falls back to the name; unused apps come last.
    expect(names(sortApps(apps, 'used', usage))).toEqual(['Beta', 'Charlie', 'Alpha']);
  });
});

describe('monogram', () => {
  it('skips words without letters', () => {
    expect(monogram('ATT - Werkzeugkasten')).toBe('AW');
    expect(monogram('Haushalt')).toBe('HA');
  });
});
