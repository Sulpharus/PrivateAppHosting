// Planning: fixed costs (standing orders) and the month's money. Pure functions over bookings
// ({ date, cents, kind, rec?, source? }) and fixed costs (data.js cleanRecurring); amounts in
// integer cents.
import { amountFor, monthsBetween } from './data.js';

const words = (match) =>
  String(match ?? '')
    .split('|')
    .map((w) => w.trim().toUpperCase())
    .filter((w) => w.length >= 3);

/** Whether a fixed cost books in a month (started, not ended, on its rhythm). */
export function dueIn(rec, month) {
  if (month < rec.start || (rec.end && month > rec.end)) return false;
  return (monthsBetween(rec.start, month).length - 1) % rec.every === 0;
}

/** Monthly equivalent (a yearly insurance of 120 € counts 10 € per month). */
export const monthly = (rec, month) => Math.round(amountFor(rec, month) / rec.every);

/** The fixed cost an imported booking pays: same direction, one of its words in the text. */
export function matchFixed(recs, booking) {
  const hay = `${booking.party ?? ''} ${booking.text ?? ''}`.toUpperCase();
  for (const rec of recs) {
    if (rec.kind !== booking.kind) continue;
    const list = words(rec.match || rec.text);
    if (list.length && list.some((w) => hay.includes(w))) return rec.id;
  }
  return null;
}

/** Status of a fixed cost in a month: running, ending in its last month, ended, not started. */
export function status(rec, month) {
  if (month < rec.start) return 'upcoming';
  if (rec.end && month > rec.end) return 'ended';
  if (rec.end && month === rec.end) return 'ending';
  return 'running';
}

/**
 * Payments of a fixed cost that differ from what was expected: bank bookings linked to it whose
 * amount is not the planned one. Newest first.
 */
export function deviations(rec, bookings) {
  return bookings
    .filter((b) => b.rec === rec.id && b.source !== 'rec')
    .map((b) => ({ booking: b, expected: amountFor(rec, b.date.slice(0, 7)) }))
    .filter((d) => d.expected !== d.booking.cents)
    .sort((a, b) => b.booking.date.localeCompare(a.booking.date));
}

/** The next booking date of a fixed cost from `today` on, or null when it has ended. */
export function nextDue(rec, today) {
  let month = today.slice(0, 7);
  for (let i = 0; i < 24; i++) {
    const date = `${month}-${String(rec.day).padStart(2, '0')}`;
    if (dueIn(rec, month) && date >= today) return date;
    if (rec.end && month >= rec.end) return null;
    const [y, m] = month.split('-').map(Number);
    month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return null;
}

/**
 * The month's money: planned income (booked, or at least the regular income), fixed outflows
 * (fixed costs and savings due this month), what is left for everything else, how much of it is
 * spent, where it should be by today, and what is still free per remaining day.
 * `day` is today's day of the month (for past months the last day, for future ones 0).
 */
export function monthMoney({ month, bookings, recs, day, days, budgets = 0 }) {
  const list = bookings.filter((b) => b.date.startsWith(month));
  const due = recs.filter((r) => dueIn(r, month));
  const bookedIncome = list.filter((b) => b.kind === 'income').reduce((s, b) => s + b.cents, 0);
  const regularIncome = due
    .filter((r) => r.kind === 'income')
    .reduce((s, r) => s + amountFor(r, month), 0);
  const income = Math.max(bookedIncome, regularIncome);
  const fixed = due.filter((r) => r.kind !== 'income').reduce((s, r) => s + amountFor(r, month), 0);
  // variable: expenses that are not fixed costs (a fixed cost paid differently still counts
  // as fixed, its difference shows as a deviation)
  const spent = list.filter((b) => b.kind === 'expense' && !b.rec).reduce((s, b) => s + b.cents, 0);
  const available = income > 0 ? income - fixed : budgets;
  const pace = Math.round((available * Math.min(day, days)) / days);
  const left = available - spent;
  const daysLeft = Math.max(1, days - day + 1);
  return {
    income,
    fixed,
    available,
    spent,
    pace,
    left,
    perDay: day >= 1 && day <= days ? Math.floor(Math.max(0, left) / daysLeft) : null,
    ahead: pace - spent,
    basis: income > 0 ? 'income' : budgets > 0 ? 'budgets' : 'none',
  };
}

const CONTRACT_KIND = {
  wohnen: 'rent',
  abo: 'subscription',
  versicherung: 'insurance',
  kredit: 'loan',
  einnahme: 'salary',
};
const INTERVAL = { 1: 'month', 3: 'quarter', 6: 'half_year', 12: 'year' };

/**
 * The payments of fixed costs from last month until `months` ahead, as shared `contract`
 * records for the Kalender (ADR 0002): source key `<fixed cost id>#<YYYY-MM>` → fields. The due
 * date is local midnight, so the Kalender shows it as an all-day date. `fallbackTitle` names a
 * fixed cost without a description or category (the page's language).
 */
export function calendarPayments(
  recs,
  today,
  categoryName,
  months = 12,
  fallbackTitle = 'Fixkosten',
) {
  const out = new Map();
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  for (let i = -1; i <= months; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    for (const rec of recs) {
      if (!dueIn(rec, month)) continue;
      const due = new Date(d.getFullYear(), d.getMonth(), rec.day);
      out.set(`${rec.id}#${month}`, {
        title: rec.text || categoryName(rec.cat) || fallbackTitle,
        due_at: due.toISOString(),
        amount_cents: amountFor(rec, month),
        currency: 'EUR',
        data: {
          kind: CONTRACT_KIND[rec.type] ?? 'other',
          interval: INTERVAL[rec.every] ?? 'month',
          category: (categoryName(rec.cat) || '').slice(0, 100) || null,
          direction:
            rec.kind === 'income' ? 'income' : rec.kind === 'transfer' ? 'transfer' : 'expense',
        },
      });
    }
  }
  return out;
}
