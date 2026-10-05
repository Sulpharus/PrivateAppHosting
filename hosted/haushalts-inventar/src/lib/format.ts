import { locale, t } from '../i18n';
import { CATEGORIES, type CategoryId } from '../types';
import { parseIso } from './domain';

/** "1.234,50 €" or "€1,234.50": money is always euros, shaped by the language. */
export function formatMoney(value: number, decimals = 2): string {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale()).format(value);
}

/** "01. Okt. 2026" / "01 Oct 2026"; '' for no date. */
export function formatDate(iso: string | undefined): string {
  const date = parseIso(iso);
  if (!date) return '';
  const kit = (globalThis as { mnui?: { date?: { format(iso: string): string } } }).mnui;
  if (kit?.date && iso) return kit.date.format(iso);
  return new Intl.DateTimeFormat(locale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function isCategory(value: string): value is CategoryId {
  return (CATEGORIES as readonly string[]).includes(value);
}

export const categoryLabel = (category: CategoryId): string => t(`category.${category}`);

/** A room name: the default tokens are translated, a typed name is shown as it is. */
export function roomLabel(room: string): string {
  return room.startsWith('@') ? t(`room.${room.slice(1)}`) : room;
}

/** Bytes as "1,2 MB". */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(mb)} MB`;
}

/** A short random id. */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}${random}`;
}
