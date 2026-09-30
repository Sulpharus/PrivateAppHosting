import { describe, expect, it } from 'vitest';
import { itemsFor, onDay, sourceOf, sourcesFrom, spanOf } from '../items.js';

const rec = (over) => ({
  id: 'r1',
  type: 'event',
  collection_id: 'c1',
  title: 'Termin',
  starts_at: '2026-10-05T16:00:00Z',
  ends_at: '2026-10-05T17:00:00Z',
  due_at: null,
  data: {},
  created_by_app: 'kalender',
  source_app: 'kalender',
  ...over,
});
const projections = { event: 'span', activity: 'span', contract: 'due', transaction: 'span' };
const types = [
  { type: 'event', label: 'Termin' },
  { type: 'activity', label: 'Sporteinheit' },
  { type: 'transaction', label: 'Buchung' },
];

describe('source colours', () => {
  it('stay the same when another source gets a saved colour', () => {
    const records = [rec(), rec({ id: 'r2', created_by_app: 'sportplaner', type: 'activity' })];
    const cols = [{ id: 'c1', name: 'Meine Termine', family: 'kalender' }];
    const first = sourcesFrom(records, cols, types, {});
    const saved = { 'app:sportplaner:activity': { color: first[1].color, visible: false } };
    const second = sourcesFrom(records, cols, types, saved);
    expect(second.map((s) => s.color)).toEqual(first.map((s) => s.color));
    expect(new Set(first.map((s) => s.color)).size).toBe(2);
  });
});

describe('items', () => {
  it('groups own events by collection and other apps by app and type', () => {
    expect(sourceOf(rec())).toBe('col:c1');
    expect(sourceOf(rec({ created_by_app: 'sportplaner', type: 'activity' }))).toBe(
      'app:sportplaner:activity',
    );
    const sources = sourcesFrom(
      [
        rec(),
        rec({ id: 'r2', created_by_app: 'sportplaner', type: 'activity' }),
        rec({ id: 'r3', created_by_app: 'haushalt', type: 'transaction' }),
      ],
      [{ id: 'c1', name: 'Meine Termine', family: 'kalender' }],
      types,
      { 'col:c1': { color: 'rose', visible: true } },
    );
    expect(sources.map((s) => [s.name, s.visible])).toEqual([
      ['Meine Termine', true],
      ['Sportplaner · Sporteinheit', true],
      ['Haushalt · Buchung', false],
    ]);
    expect(sources[0].color).toBe('rose');
  });

  it('turns due dates at midnight into all-day items', () => {
    const span = spanOf(
      rec({ type: 'contract', starts_at: null, due_at: '2026-10-01T00:00:00+02:00' }),
      'due',
    );
    expect(span.allDay).toBe(true);
    expect(span.start.getDate()).toBe(1);
  });

  it('expands recurring events and marks what the calendar may edit', () => {
    const series = rec({
      data: { recurrence: { rrule: 'FREQ=WEEKLY;COUNT=3', exdates: ['2026-10-12T18:00'] } },
    });
    const items = itemsFor(
      [series, rec({ id: 'r2', created_by_app: 'sportplaner', type: 'activity' })],
      {
        from: new Date(2026, 9, 1),
        to: new Date(2026, 10, 1),
        projections,
        sources: [],
        roles: { c1: 'owner' },
      },
    );
    const own = items.filter((i) => i.record.id === 'r1');
    expect(own.map((i) => i.occurrence)).toEqual(['2026-10-05T18:00', '2026-10-19T18:00']);
    expect(own[0].editable).toBe(true);
    expect(items.find((i) => i.record.id === 'r2').editable).toBe(false);
    expect(onDay(items, new Date(2026, 9, 5))).toHaveLength(2);
  });

  it('keeps multi-day events on every day they touch', () => {
    const trip = rec({
      data: { all_day: true },
      starts_at: '2026-10-12T00:00:00+02:00',
      ends_at: '2026-10-15T00:00:00+02:00',
    });
    const items = itemsFor([trip], {
      from: new Date(2026, 9, 1),
      to: new Date(2026, 10, 1),
      projections,
      sources: [],
      roles: {},
    });
    expect(onDay(items, new Date(2026, 9, 14))).toHaveLength(1);
    expect(onDay(items, new Date(2026, 9, 15))).toHaveLength(0);
  });
});
