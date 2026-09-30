import { describe, expect, it } from 'vitest';
import { amountFor, cleanRecurring, dueRecurring } from '../data.js';
import { deviations, dueIn, matchFixed, monthly, monthMoney, nextDue, status } from '../plan.js';

const rec = (over) =>
  cleanRecurring({
    id: 'r1',
    text: 'Netflix',
    cents: 1299,
    kind: 'expense',
    start: '2026-01',
    ...over,
  });

describe('fixed costs', () => {
  it('know their price changes and book the right amount', () => {
    const r = rec({ changes: [{ from: '2026-07', cents: 1399 }] });
    expect(amountFor(r, '2026-06')).toBe(1299);
    expect(amountFor(r, '2026-08')).toBe(1399);
    const booked = dueRecurring(r, '2026-08-15').map((d) => [
      d.month,
      d.booking.cents,
      d.booking.rec,
    ]);
    expect(booked.at(-1)).toEqual(['2026-08', 1399, 'r1']);
  });

  it('follow their rhythm and end', () => {
    const yearly = rec({ every: 12, start: '2026-03', cents: 12000, end: '2027-03' });
    expect(dueIn(yearly, '2026-03')).toBe(true);
    expect(dueIn(yearly, '2026-04')).toBe(false);
    expect(dueIn(yearly, '2028-03')).toBe(false);
    expect(monthly(yearly, '2026-03')).toBe(1000);
    expect(nextDue(yearly, '2026-04-02')).toBe('2027-03-01');
    expect(nextDue(yearly, '2027-04-01')).toBeNull();
    expect(status(yearly, '2027-03')).toBe('ending');
    expect(status(yearly, '2027-04')).toBe('ended');
  });

  it('are recognised in imports and show different amounts', () => {
    const r = rec({ match: 'NETFLIX' });
    expect(matchFixed([r], { kind: 'expense', party: 'Netflix International', text: '' })).toBe(
      'r1',
    );
    expect(matchFixed([r], { kind: 'income', party: 'Netflix', text: '' })).toBeNull();
    const found = deviations(r, [
      { date: '2026-09-03', cents: 1599, rec: 'r1', source: 'import' },
      { date: '2026-08-03', cents: 1299, rec: 'r1', source: 'import' },
      { date: '2026-07-03', cents: 1299, rec: 'r1', source: 'rec' },
    ]);
    expect(found.map((d) => [d.booking.cents, d.expected])).toEqual([[1599, 1299]]);
  });
});

describe('month money', () => {
  const recs = [
    rec({ id: 'rent', text: 'Miete', cents: 90000 }),
    rec({ id: 'save', text: 'Sparen', cents: 20000, kind: 'transfer' }),
    rec({ id: 'pay', text: 'Gehalt', cents: 250000, kind: 'income' }),
  ];
  it('splits income into fixed and free money and tracks the pace', () => {
    const m = monthMoney({
      month: '2026-09',
      recs,
      day: 10,
      days: 30,
      bookings: [
        { date: '2026-09-01', cents: 90000, kind: 'expense', rec: 'rent' },
        { date: '2026-09-05', cents: 30000, kind: 'expense' },
        { date: '2026-09-08', cents: 12000, kind: 'expense' },
      ],
    });
    expect(m).toMatchObject({ income: 250000, fixed: 110000, available: 140000, spent: 42000 });
    expect(m.pace).toBe(46667);
    expect(m.ahead).toBe(4667);
    expect(m.perDay).toBe(Math.floor(98000 / 21));
  });

  it('falls back to budgets without income', () => {
    const m = monthMoney({
      month: '2026-09',
      recs: [],
      bookings: [],
      day: 1,
      days: 30,
      budgets: 60000,
    });
    expect(m).toMatchObject({ basis: 'budgets', available: 60000 });
  });
});
