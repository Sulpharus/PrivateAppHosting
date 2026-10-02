import { describe, expect, it } from 'vitest';
import { applyOrder, moveItem } from './arrange.ts';

const apps = ['a', 'b', 'c', 'd'].map((slug) => ({ slug }));

describe('applyOrder', () => {
  it('puts the saved order first and keeps the rest in place', () => {
    expect(applyOrder(apps, ['c', 'a']).map((app) => app.slug)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignores addresses that are no longer there and works without an order', () => {
    expect(applyOrder(apps, ['x', 'd']).map((app) => app.slug)).toEqual(['d', 'a', 'b', 'c']);
    expect(applyOrder(apps, undefined)).toBe(apps);
    expect(applyOrder(apps, [])).toBe(apps);
  });
});

describe('moveItem', () => {
  it('moves one entry and clamps the target', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moveItem([1, 2, 3], 1, 99)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });

  it('does not change its input', () => {
    const list = [1, 2, 3];
    moveItem(list, 0, 2);
    expect(list).toEqual([1, 2, 3]);
  });
});
