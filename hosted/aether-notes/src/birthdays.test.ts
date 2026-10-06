import { describe, expect, it } from 'vitest';
import { birthdayFields, parseBirthday, planBirthdays, UNKNOWN_YEAR } from './birthdays';

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
    // 1900 to 1904 cannot be told from "no year"
    expect(parseBirthday('1903-05-05')).toEqual({ month: 5, day: 5, year: null });
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

describe('planBirthdays', () => {
  const base = {
    contacts: {},
    people: {},
    off: false,
    label: 'Geburtstag',
    existing: [],
    listsRead: true,
  };
  const record = (key: string, name: string, birthday: string, id = key) => {
    const fields = birthdayFields(name, birthday, 'Geburtstag');
    return {
      id,
      source_key: key,
      title: fields?.title ?? null,
      starts_at: fields?.starts_at ?? null,
      data: fields?.data ?? null,
    };
  };

  it('writes the valid, shared birthdays of contacts and people', () => {
    const plan = planBirthdays({
      ...base,
      contacts: {
        a: { name: 'Erika', birthday: '1990-03-14' },
        b: { name: 'Nur privat', birthday: '03-15', birthdayShared: false },
        c: { name: 'Kaputt', birthday: '02-30' },
      },
      people: { x: { name: 'Max', birthday: '02-29' } },
    });
    expect(plan.upserts.map((u) => u.key)).toEqual(['birthday:c:a', 'birthday:p:x']);
    expect(plan.deletes).toEqual([]);
  });

  it('leaves unchanged records alone and rewrites changed ones', () => {
    const existing = [record('birthday:c:a', 'Erika', '1990-03-14')];
    expect(
      planBirthdays({
        ...base,
        contacts: { a: { name: 'Erika', birthday: '1990-03-14' } },
        existing,
      }).upserts,
    ).toEqual([]);
    expect(
      planBirthdays({
        ...base,
        contacts: { a: { name: 'Erika', birthday: '1990-03-15' } },
        existing,
      }).upserts,
    ).toHaveLength(1);
  });

  it('deletes records of removed or no longer shared birthdays, but never from an unread list', () => {
    const existing = [record('birthday:c:a', 'Erika', '1990-03-14', 'r1')];
    expect(planBirthdays({ ...base, existing }).deletes).toEqual(['r1']);
    expect(
      planBirthdays({
        ...base,
        contacts: { a: { name: 'Erika', birthday: '1990-03-14', birthdayShared: false } },
        existing,
      }).deletes,
    ).toEqual(['r1']);
    expect(planBirthdays({ ...base, existing, listsRead: false }).deletes).toEqual([]);
  });

  it('removes everything when birthdays are switched off, even offline', () => {
    const existing = [record('birthday:c:a', 'Erika', '1990-03-14', 'r1')];
    const plan = planBirthdays({
      ...base,
      off: true,
      listsRead: false,
      contacts: { a: { name: 'Erika', birthday: '1990-03-14' } },
      existing,
    });
    expect(plan).toEqual({ upserts: [], deletes: ['r1'] });
  });

  it('does not touch records of other kinds', () => {
    const other = { id: 'm', source_key: 'meetup:1', title: 'Kaffee', starts_at: null, data: null };
    expect(planBirthdays({ ...base, existing: [other] }).deletes).toEqual([]);
  });
});
