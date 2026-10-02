import { describe, expect, it } from 'vitest';
import { openRank, sortRows } from './Suite.tsx';

const row = (app: string, type: string, requested: string, granted: string | null) => ({
  app_slug: app.toLowerCase(),
  app_name: app,
  type,
  type_label: type.toUpperCase(),
  requested: requested as 'read' | 'create' | 'write' | 'delete',
  why: '',
  granted: granted as 'read' | 'create' | 'write' | 'delete' | null,
  priority: null,
});

const full = row('Kalender', 'event', 'delete', 'delete');
const none = row('Sportplaner', 'activity', 'write', null);
const less = row('Haushalt', 'contract', 'write', 'read');
const rows = [full, none, less, row('Kalender', 'activity', 'read', null)];

describe('Gemeinsame Daten sorting', () => {
  it('ranks a missing grant before a smaller one before a full one', () => {
    expect(openRank(none)).toBe(0);
    expect(openRank(less)).toBe(1);
    expect(openRank(full)).toBe(2);
  });

  it('puts open requests first, then by type and app', () => {
    const order = sortRows(rows, 'open').map((r) => `${r.app_name}:${r.type}`);
    expect(order).toEqual([
      'Kalender:activity',
      'Sportplaner:activity',
      'Haushalt:contract',
      'Kalender:event',
    ]);
  });

  it('sorts by type or by app on request and leaves the input alone', () => {
    expect(sortRows(rows, 'app').map((r) => r.app_name)).toEqual([
      'Haushalt',
      'Kalender',
      'Kalender',
      'Sportplaner',
    ]);
    expect(sortRows(rows, 'type')[0]?.type).toBe('activity');
    expect(rows[0]?.app_name).toBe('Kalender');
  });
});
