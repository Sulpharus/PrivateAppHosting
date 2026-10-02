import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// js/price.js is a classic script (global functions); evaluate it and take its functions.
const source = readFileSync(new URL('../js/price.js', import.meta.url), 'utf8');
const { splitCoursePrice, parseEuro } = new Function(
  `${source}\nreturn { splitCoursePrice, parseEuro };`,
)();

const sum = (per) => [...per.values()].reduce((s, x) => s + x, 0);

describe('splitCoursePrice', () => {
  const dates = [
    '2026-01-26',
    '2026-02-02',
    '2026-02-09',
    '2026-02-16',
    '2026-02-23',
    '2026-03-02',
  ];

  it('shares a whole-course price among the sessions that take place', () => {
    const cp = splitCoursePrice({ price: 100, priceType: 'total' }, dates, new Set(['2026-02-09']));
    expect(cp.sessions).toBe(5);
    expect(cp.cancelled).toBe(1);
    expect(cp.per.has('2026-02-09')).toBe(false);
    expect(cp.per.get('2026-01-26')).toBe(20);
    expect(sum(cp.per)).toBeCloseTo(100);
    expect(cp.avg).toBe(20);
  });

  it('charges a monthly fee for every month with sessions, split within the month', () => {
    const cp = splitCoursePrice({ price: 40, priceType: 'month' }, dates, new Set());
    expect(cp.months).toBe(3);
    expect(cp.total).toBe(120);
    expect(cp.per.get('2026-01-26')).toBe(40);
    expect(cp.per.get('2026-02-02')).toBe(10);
    expect(cp.per.get('2026-03-02')).toBe(40);
    expect(sum(cp.per)).toBeCloseTo(cp.total);
  });

  it('still books the fee of a month whose sessions were all cancelled', () => {
    const cp = splitCoursePrice({ price: 40, priceType: 'month' }, dates, new Set(['2026-01-26']));
    expect(cp.total).toBe(120);
    expect(cp.per.get('2026-01-26')).toBe(40);
    expect(sum(cp.per)).toBeCloseTo(cp.total);
    expect(cp.avg).toBe(24);
  });

  it('crosses the year boundary', () => {
    const cp = splitCoursePrice(
      { price: 30, priceType: 'month' },
      ['2025-12-29', '2026-01-05'],
      new Set(),
    );
    expect(cp.months).toBe(2);
    expect(cp.per.get('2025-12-29')).toBe(30);
  });

  it('returns null without a price, without sessions, or when all are cancelled', () => {
    expect(splitCoursePrice({ price: 0 }, dates, new Set())).toBeNull();
    expect(splitCoursePrice({ price: 10 }, [], new Set())).toBeNull();
    expect(
      splitCoursePrice({ price: 10, priceType: 'total' }, ['2026-01-01'], new Set(['2026-01-01'])),
    ).toBeNull();
  });
});

describe('parseEuro', () => {
  it.each([
    ['120', 120],
    ['120,50', 120.5],
    ['1.200', 1200],
    ['1.200,50', 1200.5],
    ['8.50', 8.5],
    ['12 €', 12],
    ['1,200', 1200],
    ['1,200.50', 1200.5],
    ['12,345,678.9', 12345678.9],
  ])('reads %s', (text, value) => {
    expect(parseEuro(text)).toBe(value);
  });

  it.each(['12abc', '1,2,3', '', '-5', '1.20.0'])('refuses %s', (text) => {
    expect(parseEuro(text)).toBeNaN();
  });
});
