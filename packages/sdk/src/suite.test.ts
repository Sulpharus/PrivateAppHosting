import { describe, expect, it } from 'vitest';
import { rangeFilter } from './suite.ts';

describe('rangeFilter', () => {
  it('matches spans that overlap, starts and due dates inside, and recurring records', () => {
    expect(rangeFilter('2026-10-01T00:00:00+02:00', '2026-11-01T00:00:00+01:00')).toBe(
      [
        'and(starts_at.lt.2026-10-31T23:00:00.000Z,ends_at.gt.2026-09-30T22:00:00.000Z)',
        'and(starts_at.gte.2026-09-30T22:00:00.000Z,starts_at.lt.2026-10-31T23:00:00.000Z)',
        'and(due_at.gte.2026-09-30T22:00:00.000Z,due_at.lt.2026-10-31T23:00:00.000Z)',
        'data->recurrence.not.is.null',
      ].join(','),
    );
  });

  it('rejects invalid or empty ranges', () => {
    expect(() => rangeFilter('gestern', '2026-10-01')).toThrow(RangeError);
    expect(() => rangeFilter('2026-10-02', '2026-10-01')).toThrow(RangeError);
  });
});
