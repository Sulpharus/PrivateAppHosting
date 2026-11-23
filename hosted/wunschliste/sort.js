// Order and filter of a wishlist: by priority (the default), name, price, website or category, up
// or down, and optionally only one category. Pure, so the list on screen and the PDF use the same
// order; tests in test/sort.test.js.

export const SORT_KEYS = ['priority', 'name', 'price', 'shop', 'category'];

/** Host of a link without `www.`; '' for no or a broken link. */
export function shopOf(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A category as stored: trimmed, inner spaces collapsed, at most 40 characters; null when empty. */
export function cleanCategory(value) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
  return text || null;
}

/** The distinct categories of a list, alphabetically (case-insensitive duplicates once). */
export function categoriesOf(wishes, locale = 'de') {
  const seen = new Map();
  for (const wish of wishes) {
    const category = cleanCategory(wish.category);
    if (category && !seen.has(category.toLocaleLowerCase(locale)))
      seen.set(category.toLocaleLowerCase(locale), category);
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, locale, { sensitivity: 'base', numeric: true }),
  );
}

/**
 * The wishes in the chosen order, only the chosen category (`''` all, `null` the ones without).
 * Wishes without a price, website or category come last in either direction; ties keep priority,
 * then newest first.
 * @param {object[]} wishes
 * @param {{ key?: string, dir?: 'asc' | 'desc', category?: string | null, locale?: string }} [view]
 */
export function sortWishes(
  wishes,
  { key = 'priority', dir = 'asc', category = '', locale = 'de' } = {},
) {
  const text = (a, b) => a.localeCompare(b, locale, { sensitivity: 'base', numeric: true });
  const sign = dir === 'desc' ? -1 : 1;
  const value = {
    priority: (w) => w.priority ?? 2,
    name: (w) => String(w.title ?? ''),
    price: (w) => w.price_cents ?? null,
    shop: (w) => shopOf(w.url) || null,
    category: (w) => cleanCategory(w.category),
  }[SORT_KEYS.includes(key) ? key : 'priority'];
  const fallback = (a, b) =>
    (a.priority ?? 2) - (b.priority ?? 2) ||
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) ||
    text(String(a.title ?? ''), String(b.title ?? ''));
  const wanted = category === null ? null : cleanCategory(category)?.toLocaleLowerCase(locale);
  return wishes
    .filter((w) => {
      if (category === '' || category === undefined) return true;
      const own = cleanCategory(w.category);
      return category === null ? own === null : own?.toLocaleLowerCase(locale) === wanted;
    })
    .sort((a, b) => {
      const x = value(a);
      const y = value(b);
      if (x === null || y === null) return x === y ? fallback(a, b) : x === null ? 1 : -1;
      const order = typeof x === 'number' ? x - y : text(x, y);
      return order * sign || fallback(a, b);
    });
}
