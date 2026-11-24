import { describe, expect, it } from 'vitest';
import { categoriesOf, cleanCategory, shopOf, sortWishes } from '../sort.js';

const w = (title, extra = {}) => ({ title, priority: 2, created_at: '2026-01-01', ...extra });
const titles = (list) => list.map((x) => x.title);

const list = [
  w('banane', { price_cents: 300, url: 'https://www.zalando.de/x', category: 'Kleidung' }),
  w('Apfel', { price_cents: 1200, url: 'https://amazon.de/dp/1', category: 'Küche' }),
  w('Zelt', { price_cents: null, priority: 1, category: 'kleidung ' }),
  w('Äpfelchen', { price_cents: 50, url: 'https://ikea.com/a', created_at: '2026-02-01' }),
];

describe('sortWishes', () => {
  it('keeps priority, then newest first, by default', () => {
    expect(titles(sortWishes(list))).toEqual(['Zelt', 'Äpfelchen', 'Apfel', 'banane']);
  });

  it('sorts by name in the language order, up and down', () => {
    expect(titles(sortWishes(list, { key: 'name' }))).toEqual([
      'Apfel',
      'Äpfelchen',
      'banane',
      'Zelt',
    ]);
    expect(titles(sortWishes(list, { key: 'name', dir: 'desc' }))).toEqual([
      'Zelt',
      'banane',
      'Äpfelchen',
      'Apfel',
    ]);
  });

  it('sorts by price and puts wishes without one last in both directions', () => {
    expect(titles(sortWishes(list, { key: 'price' }))).toEqual([
      'Äpfelchen',
      'banane',
      'Apfel',
      'Zelt',
    ]);
    expect(titles(sortWishes(list, { key: 'price', dir: 'desc' }))).toEqual([
      'Apfel',
      'banane',
      'Äpfelchen',
      'Zelt',
    ]);
  });

  it('sorts by website and by category, empty ones last', () => {
    expect(titles(sortWishes(list, { key: 'shop' }))).toEqual([
      'Apfel',
      'Äpfelchen',
      'banane',
      'Zelt',
    ]);
    // Kleidung (two, priority decides), Küche, then none.
    expect(titles(sortWishes(list, { key: 'category' }))).toEqual([
      'Zelt',
      'banane',
      'Apfel',
      'Äpfelchen',
    ]);
  });

  it('filters one category (case-insensitive) or the ones without', () => {
    expect(titles(sortWishes(list, { category: 'KLEIDUNG' }))).toEqual(['Zelt', 'banane']);
    expect(titles(sortWishes(list, { category: null }))).toEqual(['Äpfelchen']);
  });

  it('does not change the list it gets', () => {
    const copy = [...list];
    sortWishes(list, { key: 'name' });
    expect(list).toEqual(copy);
  });
});

describe('helpers', () => {
  it('cleans categories and lists each once', () => {
    expect(cleanCategory('  Haus   und Garten ')).toBe('Haus und Garten');
    expect(cleanCategory('   ')).toBeNull();
    expect(cleanCategory('x'.repeat(50))).toHaveLength(40);
    expect(categoriesOf(list)).toEqual(['Kleidung', 'Küche']);
  });

  it('names the shop by its host', () => {
    expect(shopOf('https://www.zalando.de/x')).toBe('zalando.de');
    expect(shopOf('kaputt')).toBe('');
    expect(shopOf(null)).toBe('');
  });
});
