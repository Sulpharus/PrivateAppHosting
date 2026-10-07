import { describe, expect, it } from 'vitest';
import {
  allocate,
  balancesInCents,
  expenseShares,
  formatMoney,
  parseAmount,
  suggestTransfers,
} from './splits';
import type { Expense } from './types';

const expense = (extra: Partial<Expense>): Expense => ({
  id: 'e',
  groupId: 'g',
  description: 'x',
  amount: 100,
  paidById: 'a',
  date: '2026-10-06',
  category: 'Other',
  splitType: 'equal',
  splitDetails: {},
  ...extra,
});

describe('allocate', () => {
  it('always adds up, the leftover cents go to the biggest remainders', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocate(1000, [50, 30, 20])).toEqual([500, 300, 200]);
    expect(allocate(999, [1, 2]).reduce((a, b) => a + b, 0)).toBe(999);
  });

  it('spreads equally when every weight is zero', () => {
    expect(allocate(100, [0, 0])).toEqual([50, 50]);
  });
});

describe('expenseShares', () => {
  const members = ['a', 'b', 'c'];

  it('splits equally among everyone when nobody is named (old expenses)', () => {
    expect(expenseShares(expense({ amount: 10 }), members)).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('splits only among the people who take part', () => {
    expect(expenseShares(expense({ amount: 90, participantIds: ['a', 'b'] }), members)).toEqual({
      a: 4500,
      b: 4500,
    });
  });

  it('knows percentages, exact amounts and shares', () => {
    expect(
      expenseShares(
        expense({ amount: 100, splitType: 'percentage', splitDetails: { a: 50, b: 30, c: 20 } }),
        members,
      ),
    ).toEqual({ a: 5000, b: 3000, c: 2000 });
    expect(
      expenseShares(
        expense({ amount: 100, splitType: 'exact', splitDetails: { a: 70, b: 30, c: 0 } }),
        members,
      ),
    ).toEqual({ a: 7000, b: 3000, c: 0 });
    expect(
      expenseShares(
        expense({ amount: 90, splitType: 'shares', splitDetails: { a: 1, b: 2, c: 0 } }),
        members,
      ),
    ).toEqual({ a: 3000, b: 6000, c: 0 });
  });
});

describe('balances and transfers', () => {
  it('credits the payer, debits the people who take part, settles with payments', () => {
    const list = [expense({ amount: 90, paidById: 'a', participantIds: ['a', 'b', 'c'] })];
    const balances = balancesInCents(list, [], ['a', 'b', 'c']);
    expect(balances).toEqual({ a: 6000, b: -3000, c: -3000 });
    const after = balancesInCents(list, [{ fromMemberId: 'b', toMemberId: 'a', amount: 30 }], [
      'a',
      'b',
      'c',
    ]);
    expect(after).toEqual({ a: 3000, b: 0, c: -3000 });
  });

  it('suggests the fewest payments and they zero everything', () => {
    const balances = { a: 7000, b: -2000, c: -3000, d: -2000 };
    const transfers = suggestTransfers(balances);
    expect(transfers).toHaveLength(3);
    const net: Record<string, number> = { ...balances };
    for (const t of transfers) {
      net[t.from] = (net[t.from] ?? 0) + t.amount;
      net[t.to] = (net[t.to] ?? 0) - t.amount;
    }
    expect(Object.values(net).every((v) => v === 0)).toBe(true);
    expect(suggestTransfers({ a: 0, b: 0 })).toEqual([]);
  });

  it('a payer who takes no part is only credited', () => {
    const balances = balancesInCents(
      [expense({ amount: 20, paidById: 'a', participantIds: ['b', 'c'] })],
      [],
      ['a', 'b', 'c'],
    );
    expect(balances).toEqual({ a: 2000, b: -1000, c: -1000 });
  });
});

describe('parseAmount', () => {
  it.each([
    ['12', 12],
    ['12,5', 12.5],
    ['12.50', 12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234', 1234],
    ['€ 7,99', 7.99],
  ])('%s → %s', (text, value) => expect(parseAmount(text)).toBe(value));

  it('refuses what is no amount', () => {
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
  });
});

describe('formatMoney', () => {
  it('uses the comma in German and the point in English', () => {
    expect(formatMoney(1234.5, 'de').replace(/\s/g, ' ')).toBe('1.234,50 €');
    expect(formatMoney(1234.5, 'en')).toBe('€1,234.50');
  });
});

describe('legacy records', () => {
  it('splits an old expense without participants among all members', () => {
    const old = { id: 'e', groupId: 'g', description: 'x', amount: 30, paidById: 'a', date: 'Today', category: 'Food', splitType: 'equal' as const, splitDetails: {}, };
    expect(expenseShares(old, ['a', 'b', 'c'])).toEqual({ a: 1000, b: 1000, c: 1000 });
  });
});
