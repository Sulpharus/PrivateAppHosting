import { describe, expect, it } from 'vitest';
import {
  applyItem,
  eventBody,
  eventFields,
  exdatesOf,
  localKey,
  paletteColor,
  plainText,
  sourceId,
  utcUntil,
  zoned,
} from './gcal.ts';

const TZ = 'Europe/Berlin';

describe('time zones', () => {
  it('converts local wall-clock times across daylight saving time', () => {
    expect(zoned('2026-10-01', '18:00:00', TZ).toISOString()).toBe('2026-10-01T16:00:00.000Z');
    expect(zoned('2026-11-05', '18:00:00', TZ).toISOString()).toBe('2026-11-05T17:00:00.000Z');
    expect(localKey(new Date('2026-11-05T17:00:00Z'), TZ)).toBe('2026-11-05T18:00');
  });

  it('reads EXDATE lines in any form as local occurrence keys', () => {
    expect(
      exdatesOf(
        [
          'RRULE:FREQ=WEEKLY',
          'EXDATE;TZID=Europe/Berlin:20261008T190000,20261015T190000',
          'EXDATE:20261022T170000Z',
          'EXDATE;VALUE=DATE:20261029',
        ],
        TZ,
      ),
    ).toEqual(['2026-10-08T19:00', '2026-10-15T19:00', '2026-10-22T19:00', '2026-10-29T00:00']);
  });
});

describe('Google → record', () => {
  it('maps a timed series with reminders and an HTML description', () => {
    const fields = eventFields(
      {
        id: 'g1',
        summary: 'Chor',
        description: 'Probe<br>Saal &amp; Bühne',
        location: 'Gasteig',
        start: { dateTime: '2026-10-01T19:00:00+02:00', timeZone: TZ },
        end: { dateTime: '2026-10-01T21:00:00+02:00', timeZone: TZ },
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TH', 'EXDATE;TZID=Europe/Berlin:20261008T190000'],
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
      },
      TZ,
    );
    expect(fields).toEqual({
      title: 'Chor',
      starts_at: '2026-10-01T17:00:00.000Z',
      ends_at: '2026-10-01T19:00:00.000Z',
      place_name: 'Gasteig',
      data: {
        description: 'Probe\nSaal & Bühne',
        recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=TH', exdates: ['2026-10-08T19:00'] },
        reminders: [{ offset: '-PT30M', channel: 'push' }],
      },
    });
  });

  it('maps all-day events to local midnight', () => {
    const fields = eventFields(
      { id: 'g2', summary: 'Urlaub', start: { date: '2026-10-10' }, end: { date: '2026-10-13' } },
      TZ,
    );
    expect(fields?.starts_at).toBe('2026-10-09T22:00:00.000Z');
    expect(fields?.ends_at).toBe('2026-10-12T22:00:00.000Z');
    expect(fields?.data).toEqual({ all_day: true });
  });

  it('turns cancelled and moved occurrences into exclusions of their series', () => {
    expect(
      applyItem(
        {
          id: 'g1_20261008',
          status: 'cancelled',
          recurringEventId: 'g1',
          originalStartTime: { dateTime: '2026-10-08T19:00:00+02:00' },
        },
        TZ,
      ),
    ).toEqual({
      event_id: 'g1_20261008',
      master_event_id: 'g1',
      exdate_key: '2026-10-08T19:00',
      deleted: true,
    });
    const old = applyItem(
      {
        id: 'x',
        summary: 'Alt',
        start: { dateTime: '2020-01-01T10:00:00Z' },
        end: { dateTime: '2020-01-01T11:00:00Z' },
      },
      TZ,
      new Date('2026-10-01T00:00:00Z'),
    );
    expect(old).toEqual({ event_id: 'x', skip: true });
  });

  it('keeps the MiniNode id of mirrored events', () => {
    const item = applyItem(
      {
        id: 'p1',
        summary: 'Bouldern',
        start: { dateTime: '2030-01-01T10:00:00Z' },
        end: { dateTime: '2030-01-01T11:00:00Z' },
        extendedProperties: { private: { mn: 'rec-1' } },
      },
      TZ,
    );
    expect(item?.record_id).toBe('rec-1');
  });
});

describe('record → Google', () => {
  const base = {
    id: 'rec-1',
    type: 'event',
    title: 'Zahnarzt',
    starts_at: '2026-10-05T08:00:00Z',
    ends_at: '2026-10-05T09:00:00Z',
    due_at: null,
    place_name: 'Praxis',
    data: {
      reminders: [{ offset: '-PT1H' }],
      recurrence: { rrule: 'FREQ=MONTHLY', exdates: ['2026-11-05T10:00'] },
    },
    created_by_app: 'kalender',
    source_app: 'kalender',
    collection_id: 'c1',
    version: 3,
    projection: 'span' as const,
  };

  it('writes own events with reminders, recurrence and the MiniNode id', () => {
    const body = eventBody(base, { color: 'rose', own: true, mirrored: true });
    expect(body).toMatchObject({
      start: { dateTime: '2026-10-05T08:00:00.000Z', timeZone: TZ },
      summary: 'Zahnarzt',
      location: 'Praxis',
      recurrence: ['RRULE:FREQ=MONTHLY', 'EXDATE;TZID=Europe/Berlin:20261105T100000'],
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
      colorId: '4',
      extendedProperties: { private: { mn: 'rec-1' } },
    });
  });

  it('marks other apps’ records and maps due dates to all-day events', () => {
    const body = eventBody(
      {
        ...base,
        type: 'contract',
        title: 'Kfz-Versicherung',
        starts_at: null,
        ends_at: null,
        due_at: '2026-10-31T23:00:00Z',
        data: {},
        created_by_app: 'haushalt',
        app_name: 'Haushalt',
        projection: 'due',
      },
      { own: false, mirrored: true },
    );
    expect(body.start).toEqual({ date: '2026-11-01' });
    expect(body.end).toEqual({ date: '2026-11-02' });
    expect(body.description).toContain('Aus Haushalt');
    expect(body.reminders).toEqual({ useDefault: false, overrides: [] });
  });

  it('writes UNTIL the way Google wants it', () => {
    expect(utcUntil('FREQ=WEEKLY;UNTIL=20261018T235959', false, TZ)).toBe(
      'FREQ=WEEKLY;UNTIL=20261018T215959Z',
    );
    expect(utcUntil('FREQ=DAILY;UNTIL=20261018T235959', true, TZ)).toBe(
      'FREQ=DAILY;UNTIL=20261018',
    );
    expect(utcUntil('FREQ=DAILY;COUNT=3', false, TZ)).toBe('FREQ=DAILY;COUNT=3');
  });

  it('turns the cancelled prefix back into a status', () => {
    const fields = eventFields(
      {
        id: 'c',
        summary: 'Abgesagt: Chor',
        start: { dateTime: '2030-01-01T10:00:00Z' },
        end: { dateTime: '2030-01-01T11:00:00Z' },
      },
      TZ,
    );
    expect(fields).toMatchObject({ title: 'Chor', data: { status: 'cancelled' } });
  });

  it('knows sources and colours', () => {
    expect(sourceId(base)).toBe('col:c1');
    expect(sourceId({ ...base, created_by_app: 'sportplaner', type: 'activity' })).toBe(
      'app:sportplaner:activity',
    );
    expect(paletteColor('#a4bdfc')).toBe('blue');
    expect(paletteColor('#7bd148')).toBe('green');
    expect(paletteColor('#e1e1e1')).toBe('gray');
    expect(plainText('<b>a</b>&nbsp;b')).toBe('a b');
  });
});
