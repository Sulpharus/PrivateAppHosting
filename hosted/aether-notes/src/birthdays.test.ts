import { describe, expect, it } from 'vitest';
import { birthdayFields, parseBirthday, UNKNOWN_YEAR } from './birthdays';

describe('parseBirthday', () => {
  it('reads a full date and a day without a year', () => {
    expect(parseBirthday('1990-03-14')).toEqual({ month: 3, day: 14, year: 1990 });
    expect(parseBirthday('03-14')).toEqual({ month: 3, day: 14, year: null });
    expect(parseBirthday('--03-14')).toEqual({ month: 3, day: 14, year: null });
  });

  it('knows leap days', () => {
    expect(parseBirthday('02-29')).toEqual({ month: 2, day: 29, year: null });
    expect(parseBirthday('2000-02-29')?.day).toBe(29);
    expect(parseBirthday('2023-02-29')).toBeNull();
  });

  it('refuses what is no date', () => {
    for (const bad of [
      '',
      undefined,
      'bald',
      '13-01',
      '02-30',
      '04-31',
      '1990-13-01',
      '1850-01-01',
    ])
      expect(parseBirthday(bad), String(bad)).toBeNull();
  });
});

describe('birthdayFields', () => {
  it('makes a yearly all-day record with the birth date', () => {
    const fields = birthdayFields('Lena Meier', '1990-03-14', 'Geburtstag');
    expect(fields).toMatchObject({
      title: 'Lena Meier',
      data: { all_day: true, recurrence: { rrule: 'FREQ=YEARLY' }, description: 'Geburtstag' },
    });
    const start = new Date(fields?.starts_at ?? '');
    expect([start.getFullYear(), start.getMonth() + 1, start.getDate()]).toEqual([1990, 3, 14]);
    const end = new Date(fields?.ends_at ?? '');
    expect(end.getDate()).toBe(15);
  });

  it('writes an unknown year as 1904, also for 29 February', () => {
    const start = new Date(birthdayFields('Tom', '02-29', 'Geburtstag')?.starts_at ?? '');
    expect([start.getFullYear(), start.getMonth() + 1, start.getDate()]).toEqual([
      UNKNOWN_YEAR,
      2,
      29,
    ]);
  });

  it('skips missing names and invalid birthdays', () => {
    expect(birthdayFields('', '03-14', 'Geburtstag')).toBeNull();
    expect(birthdayFields('Mia', '02-30', 'Geburtstag')).toBeNull();
    expect(birthdayFields('Mia', undefined, 'Geburtstag')).toBeNull();
  });
});
