import { describe, expect, it } from 'vitest';
import {
  endBefore,
  fromInputs,
  moveToDay,
  nextReminder,
  parseOffset,
  shiftSeries,
  withExdate,
} from '../edit.js';
import { occurrences, parseRule } from '../rrule.js';

describe('edit helpers', () => {
  it('reads reminder offsets', () => {
    expect(parseOffset('-PT1H')).toBe(-3_600_000);
    expect(parseOffset('-P1D')).toBe(-86_400_000);
    expect(parseOffset('PT9H')).toBe(32_400_000);
    expect(parseOffset('-PT10M')).toBe(-600_000);
    expect(parseOffset('1 Stunde')).toBeNull();
  });

  it('finds the next reminder of a series, skipping excluded and past ones', () => {
    const start = new Date(2026, 9, 5, 18, 0); // Mondays 18:00
    const now = new Date(2026, 9, 12, 17, 30);
    const hit = nextReminder(start, 'FREQ=WEEKLY', ['2026-10-19T18:00'], -3_600_000, now);
    // 12 Oct 17:00 has passed; 19 Oct is excluded; so 26 Oct 17:00
    expect(hit?.at).toEqual(new Date(2026, 9, 26, 17, 0));
    expect(nextReminder(start, null, [], -3_600_000, now)).toBeNull();
  });

  it('shifts a series by the change of one occurrence', () => {
    const { start, end } = shiftSeries(
      new Date(2026, 9, 5, 18, 0),
      new Date(2026, 9, 19, 18, 0),
      new Date(2026, 9, 19, 19, 30),
      new Date(2026, 9, 19, 21, 0),
    );
    expect(start).toEqual(new Date(2026, 9, 5, 19, 30));
    expect(end).toEqual(new Date(2026, 9, 5, 21, 0));
  });

  it('ends a series the day before an occurrence', () => {
    const rule = endBefore('FREQ=WEEKLY;BYDAY=MO;COUNT=20', new Date(2026, 9, 19, 18, 0));
    expect(rule).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261018T235959');
    const left = occurrences(new Date(2026, 9, 5, 18, 0), parseRule(rule), {
      from: new Date(2026, 9, 1),
      to: new Date(2026, 11, 1),
    });
    expect(left).toHaveLength(2);
  });

  it('adds exclusions once and moves spans between days', () => {
    const rec = withExdate(
      { rrule: 'FREQ=DAILY', exdates: ['2026-10-06T08:00'] },
      new Date(2026, 9, 6, 8, 0),
    );
    expect(rec.exdates).toEqual(['2026-10-06T08:00']);
    const moved = moveToDay(
      new Date(2026, 9, 5, 22, 0),
      new Date(2026, 9, 6, 1, 0),
      new Date(2026, 9, 9),
    );
    expect(moved.start).toEqual(new Date(2026, 9, 9, 22, 0));
    expect(moved.end).toEqual(new Date(2026, 9, 10, 1, 0));
    expect(fromInputs('2026-10-05', '18:30')).toEqual(new Date(2026, 9, 5, 18, 30));
    expect(fromInputs('05.10.2026', '18:30')).toBeNull();
  });
});
