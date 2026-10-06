import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  eventToBirthday,
  mergePeople,
  nextOccurrence,
  normalizeName,
  reminderAt,
  turns,
  withCountdown,
} from '../birthdays.js';

const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

describe('countdown', () => {
  it('counts whole days, today is 0, a passed day is next year', () => {
    expect(daysUntil(10, 6, day(2026, 10, 6))).toBe(0);
    expect(daysUntil(10, 7, day(2026, 10, 6, 23))).toBe(1);
    expect(daysUntil(10, 5, day(2026, 10, 6))).toBe(364);
    expect(daysUntil(1, 1, day(2026, 12, 31))).toBe(1);
  });

  it('moves 29 February to 28 February in other years', () => {
    expect(nextOccurrence(2, 29, day(2026, 1, 10)).getDate()).toBe(28);
    expect(nextOccurrence(2, 29, day(2027, 3, 1)).getDate()).toBe(29); // 2028
  });

  it('gives the age they turn, but only when the year is known', () => {
    expect(turns(1990, 3, 14, day(2026, 10, 6))).toBe(37);
    expect(turns(null, 3, 14, day(2026, 10, 6))).toBeNull();
    expect(turns(1904, 3, 14, day(2026, 10, 6))).toBeNull();
  });

  it('sorts nearest first and groups', () => {
    const list = withCountdown(
      [
        { name: 'B', month: 10, day: 20 },
        { name: 'A', month: 10, day: 6 },
        { name: 'C', month: 10, day: 8 },
        { name: 'D', month: 5, day: 1 },
      ],
      day(2026, 10, 6),
    );
    expect(list.map((p) => [p.name, p.group])).toEqual([
      ['A', 'today'],
      ['C', 'week'],
      ['B', 'month'],
      ['D', 'later'],
    ]);
  });
});

describe('sources', () => {
  const record = (extra) => ({
    source_app: 'aether-notes',
    source_key: 'birthday:c:1',
    title: 'Lena Meier',
    starts_at: day(1990, 3, 14, 0).toISOString(),
    created_by: 'me',
    ...extra,
  });

  it('reads the birthday events of Aether Notes, with and without a year', () => {
    expect(eventToBirthday(record(), 'me')).toMatchObject({
      name: 'Lena Meier',
      month: 3,
      day: 14,
      year: 1990,
    });
    expect(
      eventToBirthday(record({ starts_at: day(1904, 3, 14, 0).toISOString() }), 'me')?.year,
    ).toBeNull();
  });

  it("ignores other events, other apps and other people's records", () => {
    expect(eventToBirthday(record({ source_key: 'meetup:3' }), 'me')).toBeNull();
    expect(eventToBirthday(record({ source_app: 'kalender' }), 'me')).toBeNull();
    expect(eventToBirthday(record({ created_by: 'someone' }), 'me')).toBeNull();
    expect(eventToBirthday(record({ title: '' }), 'me')).toBeNull();
  });

  it('shows a person once, preferring MiniNode, and keeps a year found elsewhere', () => {
    const merged = mergePeople({
      mn: [{ id: 'u1', name: 'Lena Müller', month: 3, day: 14, year: null }],
      aether: [
        {
          key: 'aether:birthday:c:1',
          name: 'lena muller',
          month: 3,
          day: 14,
          year: 1990,
          source: 'aether',
        },
      ],
      own: [{ id: 'o1', name: 'Tom', month: 3, day: 14, year: null }],
    });
    expect(merged.map((p) => [p.name, p.source, p.year])).toEqual([
      ['Lena Müller', 'mn', 1990],
      ['Tom', 'own', null],
    ]);
    expect(merged[0].also).toEqual(['aether']);
  });

  it('keeps two people with the same name on different days', () => {
    const merged = mergePeople({
      own: [
        { id: '1', name: 'Max', month: 1, day: 2 },
        { id: '2', name: 'Max', month: 5, day: 6 },
      ],
    });
    expect(merged).toHaveLength(2);
  });

  it('hides people on request and shows them again', () => {
    const own = [{ id: '1', name: 'Max', month: 1, day: 2 }];
    const hidden = new Set(['own:1']);
    expect(mergePeople({ own, hidden })).toHaveLength(0);
    expect(mergePeople({ own, hidden, showHidden: true })[0].hidden).toBe(true);
  });

  it('normalises names', () => {
    expect(normalizeName('  Lena   Müller ')).toBe('lena muller');
  });
});

describe('reminders', () => {
  it('is N days before at 09:00, or none when that moment has passed', () => {
    const person = { key: 'own:1', month: 10, day: 20 };
    const at = reminderAt(person, 14, day(2026, 10, 1));
    expect([at.getMonth() + 1, at.getDate(), at.getHours()]).toEqual([10, 6, 9]);
    expect(reminderAt(person, 14, day(2026, 10, 10))).toBeNull();
  });
});
