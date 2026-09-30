// Recurring events: a small RFC 5545 RRULE subset (FREQ, INTERVAL, COUNT, UNTIL, BYDAY with
// ordinals, BYMONTHDAY, BYMONTH) plus EXDATE. Occurrences keep the local wall-clock time of the
// first one, so an 18:00 class stays at 18:00 across daylight saving time.

const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/** Parses `FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10` (a leading `RRULE:` is allowed). Null if unusable. */
export function parseRule(text) {
  const rule = {
    freq: null,
    interval: 1,
    count: null,
    until: null,
    byday: [],
    bymonthday: [],
    bymonth: [],
  };
  for (const part of String(text || '')
    .replace(/^RRULE:/i, '')
    .split(';')) {
    const [key, value = ''] = part.split('=');
    const k = key.trim().toUpperCase();
    const v = value.trim().toUpperCase();
    if (k === 'FREQ') rule.freq = FREQS.includes(v) ? v : null;
    else if (k === 'INTERVAL') rule.interval = Math.max(1, Number.parseInt(v, 10) || 1);
    else if (k === 'COUNT') rule.count = Math.max(1, Number.parseInt(v, 10) || 1);
    else if (k === 'UNTIL') rule.until = parseUntil(v);
    else if (k === 'BYDAY')
      rule.byday = v
        .split(',')
        .map((d) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d))
        .filter(Boolean)
        .map((m) => ({ n: m[1] ? Number(m[1]) : 0, wd: CODES.indexOf(m[2]) }));
    else if (k === 'BYMONTHDAY')
      rule.bymonthday = v
        .split(',')
        .map(Number)
        .filter((n) => n && Math.abs(n) <= 31);
    else if (k === 'BYMONTH')
      rule.bymonth = v
        .split(',')
        .map(Number)
        .filter((n) => n >= 1 && n <= 12);
  }
  return rule.freq ? rule : null;
}

function parseUntil(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h = '23', mi = '59', s = '59', z] = m;
  return z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

/** Builds a rule string from the editor's choices. */
export function buildRule({ freq, interval = 1, byday = [], count = null, until = null }) {
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (byday.length)
    parts.push(`BYDAY=${byday.map((d) => (d.n ? d.n : '') + CODES[d.wd]).join(',')}`);
  if (count) parts.push(`COUNT=${count}`);
  else if (until) {
    const u = until instanceof Date ? until : new Date(until);
    parts.push(
      `UNTIL=${u.getFullYear()}${String(u.getMonth() + 1).padStart(2, '0')}${String(u.getDate()).padStart(2, '0')}T235959`,
    );
  }
  return parts.join(';');
}

const pad = (n) => String(n).padStart(2, '0');
/** Local key of an occurrence, used for EXDATE and overrides: `2026-10-05T18:00`. */
export const occurrenceKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
function at(y, m, d, t) {
  return new Date(y, m, d, t.getHours(), t.getMinutes(), t.getSeconds());
}
/** The n-th (or, negative, n-th last) weekday `wd` of a month, or null. */
function nthWeekday(y, m, wd, n, t) {
  const days = [];
  for (let d = 1; d <= daysIn(y, m); d++) if (new Date(y, m, d).getDay() === wd) days.push(d);
  const pick = n > 0 ? days[n - 1] : days[days.length + n];
  return pick ? at(y, m, pick, t) : null;
}
function monthDays(y, m, rule, start) {
  const out = [];
  if (rule.bymonthday.length) {
    for (const md of rule.bymonthday) {
      const d = md > 0 ? md : daysIn(y, m) + md + 1;
      if (d >= 1 && d <= daysIn(y, m)) out.push(at(y, m, d, start));
    }
  } else if (rule.byday.length) {
    for (const { wd, n } of rule.byday) {
      if (n) {
        const d = nthWeekday(y, m, wd, n, start);
        if (d) out.push(d);
      } else
        for (let d = 1; d <= daysIn(y, m); d++)
          if (new Date(y, m, d).getDay() === wd) out.push(at(y, m, d, start));
    }
  } else if (start.getDate() <= daysIn(y, m)) out.push(at(y, m, start.getDate(), start));
  return out.sort((a, b) => a - b);
}

/**
 * Start times of the occurrences that begin in [from, to), without excluded ones. `exdates`
 * holds occurrence keys (see `occurrenceKey`). COUNT counts from the first occurrence.
 */
export function occurrences(start, rule, { from, to, exdates = new Set(), max = 2000 }) {
  const out = [];
  if (!rule) return start >= from && start < to ? [start] : [];
  let n = 0;
  const push = (d) => {
    if (d < start) return true;
    if (rule.until && d > rule.until) return false;
    if (rule.count && n >= rule.count) return false;
    n++;
    if (d >= to) return false;
    if (d >= from && !exdates.has(occurrenceKey(d))) out.push(d);
    return out.length < max;
  };
  const limit = 20000;
  if (rule.freq === 'DAILY') {
    for (let i = 0; i < limit; i++) {
      const d = at(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + i * rule.interval,
        start,
      );
      if (!push(d)) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byday.length ? rule.byday.map((b) => b.wd) : [start.getDay()];
    // weeks start on Monday
    const monday = at(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() - ((start.getDay() + 6) % 7),
      start,
    );
    const order = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    outer: for (let w = 0; w < limit; w++) {
      for (const wd of order) {
        const d = at(
          monday.getFullYear(),
          monday.getMonth(),
          monday.getDate() + w * 7 * rule.interval + ((wd + 6) % 7),
          start,
        );
        if (!push(d)) break outer;
      }
    }
  } else if (rule.freq === 'MONTHLY') {
    outer: for (let i = 0; i < limit; i++) {
      const y = start.getFullYear();
      const m = start.getMonth() + i * rule.interval;
      for (const d of monthDays(
        new Date(y, m, 1).getFullYear(),
        new Date(y, m, 1).getMonth(),
        rule,
        start,
      ))
        if (!push(d)) break outer;
    }
  } else {
    outer: for (let i = 0; i < limit; i++) {
      const y = start.getFullYear() + i * rule.interval;
      const months = rule.bymonth.length ? rule.bymonth.map((m) => m - 1) : [start.getMonth()];
      for (const m of months.sort((a, b) => a - b))
        for (const d of monthDays(y, m, rule, start)) if (!push(d)) break outer;
    }
  }
  return out;
}

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const ORDINAL = { 1: 'ersten', 2: 'zweiten', 3: 'dritten', 4: 'vierten', '-1': 'letzten' };
/** A German summary for the detail view, e.g. "Jede 2. Woche am Montag, Mittwoch, 10-mal". */
export function describeRule(rule) {
  if (!rule) return '';
  const every =
    rule.interval > 1
      ? {
          DAILY: `Alle ${rule.interval} Tage`,
          WEEKLY: `Jede ${rule.interval}. Woche`,
          MONTHLY: `Alle ${rule.interval} Monate`,
          YEARLY: `Alle ${rule.interval} Jahre`,
        }[rule.freq]
      : { DAILY: 'Täglich', WEEKLY: 'Wöchentlich', MONTHLY: 'Monatlich', YEARLY: 'Jährlich' }[
          rule.freq
        ];
  let text = every;
  if (rule.byday.length) {
    const names = rule.byday.map(
      (b) => (b.n ? `${ORDINAL[b.n] ?? `${b.n}.`} ` : '') + DAY_NAMES[b.wd],
    );
    text += rule.freq === 'WEEKLY' ? ` am ${names.join(', ')}` : ` am ${names.join(', ')}`;
  }
  if (rule.count) text += `, ${rule.count}-mal`;
  else if (rule.until)
    text += `, bis ${rule.until.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return text;
}
