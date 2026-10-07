// The money maths of Bill the Splitter, in whole cents so nothing drifts: who owes what for one
// expense (equal among the people who take part, by percentage, by exact amount or by shares),
// group balances, and the fewest payments that settle a group.
import type { Expense } from './types';

export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;

/**
 * `total` cents spread by `weights` (all >= 0): proportional, and the cents that are left over go to
 * the largest remainders, so the parts always add up to `total` exactly.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return allocate(total, weights.map(() => 1));
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map((r) => Math.floor(r));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rest: r - Math.floor(r) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    left--;
  }
  return parts;
}

/** Who takes part in an expense: the people named on it, else everyone who is in the group now. */
export function participantsOf(expense: Expense, memberIds: string[]): string[] {
  const named = expense.participantIds?.filter((id) => id.length > 0);
  return named && named.length > 0 ? named : memberIds;
}

/** What each person owes for one expense, in cents (adds up to the amount, except for `exact`). */
export function expenseShares(expense: Expense, memberIds: string[]): Record<string, number> {
  const total = toCents(expense.amount);
  const who = participantsOf(expense, memberIds);
  const out: Record<string, number> = {};
  if (expense.splitType === 'exact') {
    for (const id of who) out[id] = toCents(expense.splitDetails[id] ?? 0);
    return out;
  }
  const weights = who.map((id) =>
    expense.splitType === 'equal' ? 1 : Math.max(0, expense.splitDetails[id] ?? 0),
  );
  const parts = allocate(total, weights);
  who.forEach((id, i) => {
    out[id] = parts[i] ?? 0;
  });
  return out;
}

/** Net balance per member in cents: positive = gets money back, negative = owes. */
export function balancesInCents(
  expenses: Expense[],
  settlements: { fromMemberId: string; toMemberId: string; amount: number }[],
  memberIds: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of memberIds) out[id] = 0;
  for (const expense of expenses) {
    out[expense.paidById] = (out[expense.paidById] ?? 0) + toCents(expense.amount);
    for (const [id, cents] of Object.entries(expenseShares(expense, memberIds)))
      out[id] = (out[id] ?? 0) - cents;
  }
  for (const s of settlements) {
    out[s.fromMemberId] = (out[s.fromMemberId] ?? 0) + toCents(s.amount);
    out[s.toMemberId] = (out[s.toMemberId] ?? 0) - toCents(s.amount);
  }
  return out;
}

export interface Transfer {
  from: string;
  to: string;
  /** Cents. */
  amount: number;
}

/** The fewest payments that bring every balance to zero: the biggest debtor pays the biggest creditor. */
export function suggestTransfers(balances: Record<string, number>): Transfer[] {
  const debtors = Object.entries(balances)
    .filter(([, b]) => b < 0)
    .map(([id, b]) => ({ id, left: -b }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const creditors = Object.entries(balances)
    .filter(([, b]) => b > 0)
    .map(([id, b]) => ({ id, left: b }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const out: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    if (!debtor || !creditor) break;
    const amount = Math.min(debtor.left, creditor.left);
    if (amount > 0) out.push({ from: debtor.id, to: creditor.id, amount });
    debtor.left -= amount;
    creditor.left -= amount;
    if (debtor.left === 0) d++;
    if (creditor.left === 0) c++;
  }
  return out;
}

/** "12,50", "12.50", "1.234,56", "1,234.56" and "12" → 12.5, 1234.56 …; NaN when it is no amount. */
export function parseAmount(text: string): number {
  const raw = text.replace(/[^\d.,-]/g, '').trim();
  if (!/\d/.test(raw)) return Number.NaN;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normal = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normal = raw.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = raw.split(sep);
    // "1.234" / "1,234" with exactly three digits after a single separator is a thousands mark.
    normal =
      parts.length === 2 && (parts[1] ?? '').length !== 3
        ? `${parts[0]}.${parts[1]}`
        : parts.length > 2 || (parts[1] ?? '').length === 3
          ? parts.join('')
          : raw;
  }
  const value = Number(normal);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : Number.NaN;
}

export function formatMoney(amount: number, lang: 'de' | 'en', currency = 'EUR'): string {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency',
    currency,
  }).format(amount);
}
