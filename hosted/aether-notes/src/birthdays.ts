// Birthdays of contacts and people as yearly all-day `event` records (ADR 0002, ADR 0025): the
// Kalender shows them and the Wunschliste counts down to them. The record's date is the birth date
// when the year is known; an unknown year is written as 1904 (a leap year, so 29 February works).

/** The year written for a birthday without a known year. Readers treat it as "no year". */
export const UNKNOWN_YEAR = 1904;

export interface BirthdayFields {
  title: string;
  starts_at: string;
  ends_at: string;
  data: { all_day: true; description: string; recurrence: { rrule: string }; color: 'rose' };
}

const daysIn = (month: number, year: number): number =>
  month === 2
    ? (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

/** `YYYY-MM-DD` or `MM-DD` (also `--MM-DD`) → month, day and year (null when unknown); null if invalid. */
export function parseBirthday(
  value: string | undefined | null,
): { month: number; day: number; year: number | null } | null {
  const text = (value ?? '').trim();
  const full = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const short = /^-{0,2}(\d{1,2})-(\d{1,2})$/.exec(text);
  const [year, month, day] = full
    ? [Number(full[1]), Number(full[2]), Number(full[3])]
    : short
      ? [null, Number(short[1]), Number(short[2])]
      : [undefined, 0, 0];
  if (year === undefined || month < 1 || month > 12 || day < 1) return null;
  if (day > daysIn(month, year ?? UNKNOWN_YEAR)) return null;
  if (year !== null && (year < 1900 || year > 2100)) return null;
  return { month, day, year };
}

/** The suite fields of one birthday, or null when the contact has none or it is invalid. */
export function birthdayFields(
  name: string | undefined,
  birthday: string | undefined | null,
  label: string,
): BirthdayFields | null {
  const parsed = parseBirthday(birthday);
  const title = (name ?? '').trim().slice(0, 200);
  if (!parsed || !title) return null;
  const year = parsed.year ?? UNKNOWN_YEAR;
  const starts = new Date(year, parsed.month - 1, parsed.day);
  const ends = new Date(year, parsed.month - 1, parsed.day + 1);
  return {
    title,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    data: {
      all_day: true,
      description: label.slice(0, 200),
      recurrence: { rrule: 'FREQ=YEARLY' },
      color: 'rose',
    },
  };
}
