// Editing recurring events and reminders: pure helpers, so the tricky date maths is tested.
import { occurrenceKey, occurrences, parseRule } from './rrule.js';

const DAY = 86_400_000;

/** Milliseconds of an ISO 8601 duration like `-PT1H`, `-P1D`, `PT9H` or `-PT10M`. */
export function parseOffset(text) {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(String(text ?? ''));
  if (!m) return null;
  const [, minus, w = 0, d = 0, h = 0, mi = 0] = m;
  const ms = (((+w * 7 + +d) * 24 + +h) * 60 + +mi) * 60_000;
  return minus ? -ms : ms;
}

/** The next time a reminder fires after `now`, within `horizon` ms, or null. */
export function nextReminder(start, rrule, exdates, offset, now, horizon = 60 * DAY) {
  const rule = parseRule(rrule);
  const from = new Date(now.getTime() - offset);
  const to = new Date(now.getTime() + horizon - offset);
  const starts = rule
    ? occurrences(start, rule, { from, to, exdates: new Set(exdates ?? []), max: 2 })
    : start >= from && start < to
      ? [start]
      : [];
  const hit = starts.find((s) => s.getTime() + offset > now.getTime());
  return hit ? { occurrence: hit, at: new Date(hit.getTime() + offset) } : null;
}

/**
 * Moving one occurrence with "Alle Termine": the series start moves by the same amount, and
 * the length becomes the edited one.
 */
export function shiftSeries(seriesStart, occurrenceStart, newStart, newEnd) {
  const start = new Date(seriesStart.getTime() + (newStart - occurrenceStart));
  return { start, end: new Date(start.getTime() + (newEnd - newStart)) };
}

/** The rule of a series that ends before `occurrence` ("Dieser und alle folgenden"). */
export function endBefore(rrule, occurrence) {
  const last = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate() - 1);
  const two = (n) => String(n).padStart(2, '0');
  const until = `${last.getFullYear()}${two(last.getMonth() + 1)}${two(last.getDate())}T235959`;
  return [
    ...String(rrule)
      .replace(/^RRULE:/i, '')
      .split(';')
      .filter((p) => p && !/^(COUNT|UNTIL)=/i.test(p)),
    `UNTIL=${until}`,
  ].join(';');
}

/** The recurrence with one more excluded occurrence. */
export function withExdate(recurrence, occurrence) {
  const key = occurrence instanceof Date ? occurrenceKey(occurrence) : occurrence;
  const exdates = [...new Set([...(recurrence.exdates ?? []), key])].slice(-500);
  return { ...recurrence, exdates };
}

/** Moves a span to another day, keeping the time of day and the length. */
export function moveToDay(start, end, day) {
  const s = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    start.getHours(),
    start.getMinutes(),
  );
  return { start: s, end: new Date(s.getTime() + (end - start)) };
}

/** A local date and time from `<input type="date">` and `<input type="time">` values. */
export function fromInputs(date, time = '00:00') {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  const t = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!d || !t) return null;
  return new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
}

const pad = (n) => String(n).padStart(2, '0');
export const dateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Shifts occurrence keys (`2026-10-05T18:00`) by a number of milliseconds (local time). */
export function shiftKeys(keys, delta) {
  if (!delta) return [...keys];
  return keys.map((k) => {
    const d = fromInputs(k.slice(0, 10), k.slice(11, 16));
    return d ? occurrenceKey(new Date(d.getTime() + delta)) : k;
  });
}

/**
 * The rule of the part of a series from `occurrence` on ("Dieser und alle folgenden"): a COUNT
 * keeps counting where the first part stopped.
 */
export function ruleFrom(rrule, seriesStart, occurrence) {
  const rule = parseRule(rrule);
  if (!rule?.count) return rrule;
  const before = occurrences(
    seriesStart,
    { ...rule, count: null, until: null },
    {
      from: seriesStart,
      to: occurrence,
      max: 100_000,
    },
  ).length;
  const left = Math.max(1, rule.count - before);
  return String(rrule)
    .replace(/^RRULE:/i, '')
    .replace(/COUNT=\d+/i, `COUNT=${left}`);
}
