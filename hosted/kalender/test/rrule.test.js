import { describe, expect, it } from 'vitest';
import { buildRule, describeRule, occurrenceKey, occurrences, parseRule } from '../rrule.js';

const keys = (list) => list.map(occurrenceKey);
const range = (a, b) => ({ from: new Date(a), to: new Date(b) });

describe('rrule', () => {
  it('parses and builds rules', () => {
    const r = parseRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5');
    expect(r).toMatchObject({ freq: 'WEEKLY', interval: 2, count: 5 });
    expect(r.byday).toEqual([
      { n: 0, wd: 1 },
      { n: 0, wd: 3 },
    ]);
    expect(parseRule('FREQ=HOURLY')).toBeNull();
    expect(buildRule({ freq: 'MONTHLY', byday: [{ n: -1, wd: 5 }], count: 3 })).toBe(
      'FREQ=MONTHLY;BYDAY=-1FR;COUNT=3',
    );
  });

  it('expands weekly rules on several days, counting from the start', () => {
    const start = new Date(2026, 9, 5, 18, 0); // Monday 5 Oct 2026, 18:00
    const rule = parseRule('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4');
    expect(keys(occurrences(start, rule, range('2026-10-01', '2026-12-01')))).toEqual([
      '2026-10-05T18:00',
      '2026-10-07T18:00',
      '2026-10-12T18:00',
      '2026-10-14T18:00',
    ]);
    // A window after the start still respects COUNT.
    expect(keys(occurrences(start, rule, range('2026-10-10', '2026-12-01')))).toEqual([
      '2026-10-12T18:00',
      '2026-10-14T18:00',
    ]);
  });

  it('keeps the wall-clock time across daylight saving time and skips exdates', () => {
    const start = new Date(2026, 9, 20, 18, 0);
    const rule = parseRule('FREQ=WEEKLY');
    const found = occurrences(start, rule, {
      ...range('2026-10-20', '2026-11-11'),
      exdates: new Set(['2026-11-03T18:00']),
    });
    expect(keys(found)).toEqual(['2026-10-20T18:00', '2026-10-27T18:00', '2026-11-10T18:00']);
    expect(found.every((d) => d.getHours() === 18)).toBe(true);
  });

  it('handles monthly ordinals, month days and yearly rules', () => {
    const lastFriday = parseRule('FREQ=MONTHLY;BYDAY=-1FR');
    expect(
      keys(occurrences(new Date(2026, 0, 30, 9), lastFriday, range('2026-01-01', '2026-04-01'))),
    ).toEqual(['2026-01-30T09:00', '2026-02-27T09:00', '2026-03-27T09:00']);
    const on31 = parseRule('FREQ=MONTHLY');
    expect(
      keys(occurrences(new Date(2026, 0, 31, 8), on31, range('2026-01-01', '2026-05-01'))),
    ).toEqual(['2026-01-31T08:00', '2026-03-31T08:00']);
    const birthday = parseRule('FREQ=YEARLY;UNTIL=20281231');
    expect(
      keys(occurrences(new Date(2024, 2, 12, 0), birthday, range('2025-01-01', '2035-01-01'))),
    ).toEqual(['2025-03-12T00:00', '2026-03-12T00:00', '2027-03-12T00:00', '2028-03-12T00:00']);
  });

  it('returns a single event once when there is no rule', () => {
    const d = new Date(2026, 9, 1, 10);
    expect(occurrences(d, null, range('2026-10-01', '2026-10-02'))).toEqual([d]);
    expect(occurrences(d, null, range('2026-10-02', '2026-10-03'))).toEqual([]);
  });

  it('describes rules in German', () => {
    expect(describeRule(parseRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=10'))).toBe(
      'Jede 2. Woche am Montag, 10-mal',
    );
    expect(describeRule(parseRule('FREQ=MONTHLY;BYDAY=-1FR'))).toBe('Monatlich am letzten Freitag');
  });
});
