import { describe, expect, it } from 'vitest';
import { parseIcs, toIcs } from '../ics.js';
import { isoWeek, layoutDay, monthGrid, startOfWeek } from '../layout.js';

describe('ics', () => {
  it('reads events with folding, escapes, all-day dates, UTC times and rules', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:abc@example',
      'SUMMARY:Elternabend\\, Klasse 3a',
      'DESCRIPTION:Bitte Unter',
      ' lagen mitbringen\\nDanke',
      'DTSTART:20261005T170000Z',
      'DTEND:20261005T183000Z',
      'RRULE:FREQ=MONTHLY;COUNT=3',
      'EXDATE:20261105T170000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Urlaub',
      'DTSTART;VALUE=DATE:20261012',
      'DTEND;VALUE=DATE:20261017',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [a, b] = parseIcs(text);
    expect(a.title).toBe('Elternabend, Klasse 3a');
    expect(a.description).toBe('Bitte Unterlagen mitbringen\nDanke');
    expect(a.start.toISOString()).toBe('2026-10-05T17:00:00.000Z');
    expect(a.rrule).toBe('FREQ=MONTHLY;COUNT=3');
    expect(a.exdates).toHaveLength(1);
    expect(b.allDay).toBe(true);
    expect(b.start.getDate()).toBe(12);
    expect(b.end.getDate()).toBe(17);
  });

  it('writes a file that reads back the same', () => {
    const events = [
      {
        uid: 'x1',
        title: 'Zahnarzt; Kontrolle',
        start: new Date('2026-10-01T08:00:00Z'),
        end: new Date('2026-10-01T09:00:00Z'),
        description: 'a\nb',
      },
      {
        uid: 'x2',
        title: 'Feiertag',
        allDay: true,
        start: new Date(2026, 9, 3),
        end: new Date(2026, 9, 4),
      },
    ];
    const back = parseIcs(toIcs(events));
    expect(back.map((e) => e.title)).toEqual(['Zahnarzt; Kontrolle', 'Feiertag']);
    expect(back[0].description).toBe('a\nb');
    expect(back[0].start.toISOString()).toBe('2026-10-01T08:00:00.000Z');
    expect(back[1].allDay).toBe(true);
  });
});

describe('layout', () => {
  const t = (h, m = 0) => new Date(2026, 9, 5, h, m);
  it('puts overlapping events side by side and others full width', () => {
    const out = layoutDay([
      { id: 'a', start: t(9), end: t(11) },
      { id: 'b', start: t(10), end: t(12) },
      { id: 'c', start: t(10, 30), end: t(11) },
      { id: 'd', start: t(13), end: t(14) },
    ]);
    const by = Object.fromEntries(out.map((o) => [o.id, o]));
    expect([by.a.lane, by.b.lane, by.c.lane]).toEqual([0, 1, 2]);
    expect(by.a.lanes).toBe(3);
    expect(by.d).toMatchObject({ lane: 0, lanes: 1 });
  });

  it('knows weeks and month grids', () => {
    expect(startOfWeek(new Date(2026, 9, 4)).getDate()).toBe(28); // Sunday → Monday 28 Sep
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
    const grid = monthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(grid[0].getDate()).toBe(28);
  });
});
