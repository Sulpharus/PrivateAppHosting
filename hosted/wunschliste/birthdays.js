// Birthdays for the Wunschliste: from people on MiniNode (mn.birthdays()), from contacts of Aether
// Notes (yearly all-day suite events with the key "birthday:…") and from people typed in here.
// Pure functions, no DOM; the view is in app.js.

/** Aether writes a birthday without a known year as 1904 (a leap year, so 29 February works). */
export const UNKNOWN_YEAR = 1904;
export const GROUPS = ['today', 'week', 'month', 'later'];

const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Lower case, no accents, single spaces: "Lena  Müller" and "lena muller" are the same person. */
export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The next time this day comes round (today counts), at local midnight. 29 February is 28 February in other years. */
export function nextOccurrence(month, day, today) {
  const base = midnight(today);
  const make = (year) =>
    new Date(year, month - 1, month === 2 && day === 29 && !isLeap(year) ? 28 : day);
  const thisYear = make(base.getFullYear());
  return thisYear >= base ? thisYear : make(base.getFullYear() + 1);
}

export function daysUntil(month, day, today) {
  const next = nextOccurrence(month, day, today);
  return Math.round((next - midnight(today)) / 86_400_000);
}

/** The age they turn on the next birthday, or null when the year is unknown. */
export function turns(year, month, day, today) {
  if (!year || year <= UNKNOWN_YEAR) return null;
  return nextOccurrence(month, day, today).getFullYear() - year;
}

export function groupOf(days) {
  if (days === 0) return 'today';
  if (days <= 7) return 'week';
  if (days <= 31) return 'month';
  return 'later';
}

/** A suite event of Aether Notes → a birthday, or null when it is none. `mine`: who may be read. */
export function eventToBirthday(record, me) {
  const key = record?.source_key ?? '';
  if (record?.source_app !== 'aether-notes' || !key.startsWith('birthday:')) return null;
  if (me && record.created_by && record.created_by !== me) return null;
  const start = new Date(record.starts_at);
  if (Number.isNaN(start.getTime()) || !record.title) return null;
  const year = start.getFullYear();
  return {
    key: `aether:${key}`,
    name: String(record.title),
    month: start.getMonth() + 1,
    day: start.getDate(),
    year: year > UNKNOWN_YEAR ? year : null,
    source: 'aether',
  };
}

/**
 * One list from the three sources. A person on MiniNode wins over a contact and a typed-in entry
 * with the same normalised name and the same day and month; everything in `hidden` (person keys)
 * is left out unless `showHidden`.
 */
export function mergePeople({
  mn = [],
  aether = [],
  own = [],
  hidden = new Set(),
  showHidden = false,
}) {
  const all = [
    ...mn.map((p) => ({
      key: `mn:${p.id}`,
      name: p.name,
      month: p.month,
      day: p.day,
      year: p.year ?? null,
      source: 'mn',
      userId: p.id,
    })),
    ...aether,
    ...own.map((p) => ({
      key: `own:${p.id}`,
      name: p.name,
      month: p.month,
      day: p.day,
      year: p.year ?? null,
      source: 'own',
      note: p.note ?? '',
    })),
  ];
  const seen = new Map();
  const out = [];
  for (const person of all) {
    const same = `${normalizeName(person.name)}|${person.month}-${person.day}`;
    const known = seen.get(same);
    if (known) {
      // keep the first (MiniNode, then Aether, then own), remember where else the person is
      known.also = [...(known.also ?? []), person.source];
      if (!known.year && person.year) known.year = person.year;
      continue;
    }
    seen.set(same, person);
    out.push(person);
  }
  return out
    .map((p) => ({ ...p, hidden: hidden.has(p.key) }))
    .filter((p) => showHidden || !p.hidden);
}

/** The list with days, age and group, nearest first (ties by name). */
export function withCountdown(people, today) {
  return people
    .map((p) => {
      const days = daysUntil(p.month, p.day, today);
      return { ...p, days, turns: turns(p.year, p.month, p.day, today), group: groupOf(days) };
    })
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

/** When to remind: `daysBefore` days before the birthday at 09:00 local time (or null if already past). */
export function reminderAt(person, daysBefore, now) {
  const next = nextOccurrence(person.month, person.day, now);
  const at = new Date(next.getFullYear(), next.getMonth(), next.getDate() - daysBefore, 9, 0);
  return at.getTime() > now.getTime() - 60_000 ? at : null;
}

/** One pending reminder per person: scheduling again replaces it, so it moves on to the next year by itself. */
export const reminderKey = (person) => `birthday:${person.key}`;
