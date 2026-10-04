/**
 * The inventory's rules, free of React and of the SDK: warranty states, maintenance
 * suggestions, statistics and filters. Every function takes `today` so tests are exact.
 */
import type { CategoryId, Filters, Item } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' as a local date at midnight; null when it is not a real date. */
export function parseIso(iso: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.getFullYear() === Number(y) &&
    date.getMonth() === Number(m) - 1 &&
    date.getDate() === Number(d)
    ? date
    : null;
}

/** A local date as 'YYYY-MM-DD'. */
export function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today at local midnight. */
export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whole days from today until the date (negative when it has passed); null for no date. */
export function daysUntil(iso: string | undefined, today: Date): number | null {
  const date = parseIso(iso);
  if (!date) return null;
  return Math.round((date.getTime() - startOfDay(today).getTime()) / DAY_MS);
}

/** Adds months and keeps the day inside the month: 31 January plus one month is 28 February. */
export function addMonths(iso: string, months: number): string {
  const date = parseIso(iso);
  if (!date) return '';
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), last));
  return toIso(target);
}

export function warrantyExpiryFor(purchaseDate: string, months: number | undefined): string {
  if (!purchaseDate || !months || months <= 0) return '';
  return addMonths(purchaseDate, months);
}

export type WarrantyState = 'none' | 'expired' | 'critical' | 'soon' | 'active';

/** A warranty ends within 30 days (critical), within 90 days (soon), or later (active). */
export function warrantyState(item: Pick<Item, 'warrantyExpiry'>, today: Date): WarrantyState {
  const days = daysUntil(item.warrantyExpiry, today);
  if (days === null) return 'none';
  if (days <= 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'soon';
  return 'active';
}

/** Share of the warranty period that is left, 0 to 100. */
export function warrantyRemaining(
  item: Pick<Item, 'purchaseDate' | 'warrantyExpiry'>,
  today: Date,
): number {
  const start = parseIso(item.purchaseDate);
  const end = parseIso(item.warrantyExpiry);
  if (!start || !end) return 0;
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  const left = end.getTime() - startOfDay(today).getTime();
  return Math.max(0, Math.min(100, Math.round((left / total) * 100)));
}

/** When the reminder for an ending warranty goes out: 30 days before, at 09:00. */
export function warrantyReminderAt(expiry: string, now: Date): Date | null {
  const end = parseIso(expiry);
  if (!end) return null;
  const at = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 30, 9, 0);
  return at.getTime() > now.getTime() ? at : null;
}

/** When the reminder for a maintenance date goes out: 7 days before, at 09:00. */
export function maintenanceReminderAt(date: string, now: Date): Date | null {
  const day = parseIso(date);
  if (!day) return null;
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 7, 9, 0);
  return at.getTime() > now.getTime() ? at : null;
}

// --- Maintenance suggestions ---------------------------------------------------------------

interface MaintenanceRule {
  /** Part of the language key `maintenance.<id>`. */
  id: string;
  keywords: string[];
  intervalMonths: number;
}

const RULES: MaintenanceRule[] = [
  {
    id: 'fridge',
    keywords: ['refrigerator', 'kühlschrank', 'fridge', 'gefrierschrank', 'freezer'],
    intervalMonths: 6,
  },
  {
    id: 'climate',
    keywords: ['air conditioner', 'ac', 'klimaanlage', 'hvac', 'heat pump', 'wärmepumpe'],
    intervalMonths: 6,
  },
  {
    id: 'heating',
    keywords: ['furnace', 'heater', 'heizung', 'boiler', 'therme'],
    intervalMonths: 12,
  },
  { id: 'washer', keywords: ['washing machine', 'waschmaschine', 'washer'], intervalMonths: 3 },
  { id: 'dryer', keywords: ['dryer', 'trockner'], intervalMonths: 6 },
  {
    id: 'dishwasher',
    keywords: ['dishwasher', 'geschirrspüler', 'spülmaschine'],
    intervalMonths: 3,
  },
  { id: 'coffee', keywords: ['coffee', 'kaffee', 'espresso'], intervalMonths: 2 },
  { id: 'car', keywords: ['car', 'auto', 'pkw', 'motorcycle', 'motorrad'], intervalMonths: 12 },
  { id: 'mower', keywords: ['lawn mower', 'rasenmäher'], intervalMonths: 12 },
  { id: 'computer', keywords: ['computer', 'laptop', 'pc', 'desktop'], intervalMonths: 3 },
  { id: 'vacuum', keywords: ['vacuum', 'staubsauger'], intervalMonths: 3 },
  { id: 'bicycle', keywords: ['bicycle', 'fahrrad', 'bike'], intervalMonths: 6 },
  { id: 'waterFilter', keywords: ['water filter', 'wasserfilter', 'brita'], intervalMonths: 2 },
  {
    id: 'oven',
    keywords: ['oven', 'stove', 'herd', 'backofen', 'microwave', 'mikrowelle'],
    intervalMonths: 6,
  },
  { id: 'generator', keywords: ['generator', 'notstrom'], intervalMonths: 6 },
  {
    id: 'tools',
    keywords: ['tools', 'werkzeug', 'drill', 'bohrmaschine', 'saw', 'säge'],
    intervalMonths: 12,
  },
];

const CATEGORY_FALLBACK: Record<CategoryId, MaintenanceRule> = {
  appliances: { id: 'general.appliances', keywords: [], intervalMonths: 6 },
  electronics: { id: 'general.electronics', keywords: [], intervalMonths: 6 },
  tools: { id: 'general.tools', keywords: [], intervalMonths: 12 },
  furniture: { id: 'general.other', keywords: [], intervalMonths: 12 },
  others: { id: 'general.other', keywords: [], intervalMonths: 12 },
};

/** Short keywords ("ac", "pc") must be a whole word, long ones may be part of a word. */
function matches(name: string, keyword: string): boolean {
  if (keyword.length > 3) return name.includes(keyword);
  return name.split(/[^\p{L}\p{N}]+/u).includes(keyword);
}

export function maintenanceRule(name: string, category: CategoryId): MaintenanceRule {
  const lower = name.toLocaleLowerCase();
  return (
    RULES.find((rule) => rule.keywords.some((keyword) => matches(lower, keyword))) ??
    CATEGORY_FALLBACK[category]
  );
}

/**
 * The next service date: the purchase date (or today) plus the interval, moved forward by whole
 * intervals until it lies in the future.
 */
export function suggestMaintenance(
  name: string,
  category: CategoryId,
  purchaseDate: string,
  today: Date,
): { rule: string; nextDate: string; intervalMonths: number } {
  const rule = maintenanceRule(name, category);
  const base = parseIso(purchaseDate) ? purchaseDate : toIso(today);
  const now = toIso(startOfDay(today));
  let next = addMonths(base, rule.intervalMonths);
  for (let guard = 0; next && next < now && guard < 600; guard += 1) {
    next = addMonths(next, rule.intervalMonths);
  }
  return { rule: rule.id, nextDate: next, intervalMonths: rule.intervalMonths };
}

export interface MaintenanceDue {
  item: Item;
  date: string;
  days: number;
  overdue: boolean;
  soon: boolean;
}

/** Items with a service date, the nearest first. */
export function maintenanceDue(items: Item[], today: Date): MaintenanceDue[] {
  const out: MaintenanceDue[] = [];
  for (const item of items) {
    const days = daysUntil(item.nextMaintenanceDate, today);
    if (days === null || !item.nextMaintenanceDate) continue;
    out.push({
      item,
      date: item.nextMaintenanceDate,
      days,
      overdue: days < 0,
      soon: days >= 0 && days <= 45,
    });
  }
  return out.sort((a, b) => a.days - b.days);
}

// --- Statistics and filters ----------------------------------------------------------------

export interface CategoryStat {
  category: CategoryId;
  count: number;
  value: number;
  /** Share of the total value, 0 to 100. */
  share: number;
}

export function categoryStats(items: Item[]): { list: CategoryStat[]; total: number } {
  const map = new Map<CategoryId, { count: number; value: number }>();
  let total = 0;
  for (const item of items) {
    const entry = map.get(item.category) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += item.purchasePrice || 0;
    total += item.purchasePrice || 0;
    map.set(item.category, entry);
  }
  const list = [...map.entries()]
    .map(([category, entry]) => ({
      category,
      count: entry.count,
      value: entry.value,
      share: total > 0 ? (entry.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
  return { list, total };
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  room: 'all',
  category: 'all',
  warranty: 'all',
  owner: 'all',
  householdId: '',
};

export function filtersActive(filters: Filters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.room !== 'all' ||
    filters.category !== 'all' ||
    filters.warranty !== 'all' ||
    filters.owner !== 'all'
  );
}

/** Accent- and case-insensitive text for searching. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

export function filterItems(items: Item[], filters: Filters, today: Date): Item[] {
  const query = fold(filters.query.trim());
  return items.filter((item) => {
    if (query) {
      const haystack = fold(
        [item.name, item.notes, item.serialNumber, item.store, item.owner]
          .filter(Boolean)
          .join(' '),
      );
      if (!haystack.includes(query)) return false;
    }
    if (filters.room !== 'all' && item.location !== filters.room) return false;
    if (filters.category !== 'all' && item.category !== filters.category) return false;
    if (filters.owner !== 'all' && item.owner !== filters.owner) return false;
    if (filters.householdId && item.householdId && item.householdId !== filters.householdId) {
      return false;
    }
    if (filters.warranty !== 'all') {
      const state = warrantyState(item, today);
      if (
        filters.warranty === 'active' &&
        !(state === 'active' || state === 'soon' || state === 'critical')
      )
        return false;
      if (filters.warranty === 'soon' && !(state === 'soon' || state === 'critical')) return false;
      if (filters.warranty === 'expired' && state !== 'expired') return false;
    }
    return true;
  });
}

/** Items whose warranty ends within the given days, nearest first. */
export function warrantiesEnding(items: Item[], today: Date, withinDays: number) {
  const out: { item: Item; days: number }[] = [];
  for (const item of items) {
    const days = daysUntil(item.warrantyExpiry, today);
    if (days !== null && days > 0 && days <= withinDays) out.push({ item, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

/**
 * A typed amount as a number. Accepts "1.299,99", "1299,99", "1,299.99" and "249.00"; a lone
 * separator followed by exactly three digits counts as a thousands separator when it is a dot.
 */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(clean)) return null;
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  let normal = clean;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    normal = clean.replace(thousands, '').replace(decimal, '.');
  } else if (lastComma >= 0) {
    normal = clean.replace(',', '.');
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
    normal = clean.replace(/\./g, '');
  }
  const value = Number(normal);
  return Number.isFinite(value) ? value : null;
}
