// Own order for apps and games (ADR 0013): pure helpers. The saved order is a list of addresses
// per screen; whatever it does not mention follows in the screen's usual order.

/** Items in the saved order first; the rest keep their relative order behind them. */
export function applyOrder<T extends { slug: string }>(
  items: T[],
  order: readonly string[] | undefined,
): T[] {
  if (!order || order.length === 0) return items;
  const rank = new Map(order.map((slug, index) => [slug, index]));
  const known = items
    .filter((item) => rank.has(item.slug))
    .sort((a, b) => (rank.get(a.slug) ?? 0) - (rank.get(b.slug) ?? 0));
  return [...known, ...items.filter((item) => !rank.has(item.slug))];
}

/** Moves the entry at `from` to `to` (both clamped); returns a new list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.min(Math.max(to, 0), next.length - 1);
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(target, 0, item);
  return next;
}

/** Order scopes the database accepts: `all`, `favorites`, `cat:<id>`, `drawer:<id>`, `games:<genre>`. */
export const scopeOf = {
  view: (filter: string) => filter,
  genre: (genre: string) => `games:${genre}`,
  drawer: (id: string) => `drawer:${id}`,
};
