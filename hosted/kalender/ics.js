// iCalendar (RFC 5545) import and export of events: VEVENT with SUMMARY, DTSTART/DTEND (date,
// local, UTC or TZID taken as local time), DESCRIPTION, LOCATION, URL, RRULE, EXDATE, UID.

const icsUnescape = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const icsEscape = (s) =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

function parseDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', z] = m;
  if (h === undefined || params.VALUE === 'DATE')
    return { date: new Date(+y, +mo - 1, +d), allDay: true };
  const date = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return { date, allDay: false };
}

/** Events of an .ics file: { uid, title, start, end, allDay, description, location, url, rrule, exdates[] }. */
export function parseIcs(text) {
  const lines = String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = { exdates: [] };
    else if (line === 'END:VEVENT') {
      if (cur?.start) {
        if (!cur.end)
          cur.end = cur.allDay
            ? new Date(cur.start.getFullYear(), cur.start.getMonth(), cur.start.getDate() + 1)
            : new Date(cur.start.getTime() + 3600_000);
        events.push({ title: '(ohne Titel)', ...cur });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const [name, ...rawParams] = line.slice(0, i).split(';');
      const params = Object.fromEntries(rawParams.map((p) => p.split('=')));
      const value = line.slice(i + 1);
      switch (name.toUpperCase()) {
        case 'UID':
          cur.uid = value.trim();
          break;
        case 'SUMMARY':
          cur.title = icsUnescape(value).slice(0, 500);
          break;
        case 'DESCRIPTION':
          cur.description = icsUnescape(value).slice(0, 10000);
          break;
        case 'LOCATION':
          cur.location = icsUnescape(value).slice(0, 300);
          break;
        case 'URL':
          cur.url = value.trim();
          break;
        case 'RRULE':
          cur.rrule = value.trim();
          break;
        case 'DTSTART': {
          const p = parseDate(value, params);
          if (p) {
            cur.start = p.date;
            cur.allDay = p.allDay;
          }
          break;
        }
        case 'DTEND': {
          const p = parseDate(value, params);
          if (p) cur.end = p.date;
          break;
        }
        case 'EXDATE':
          for (const v of value.split(',')) {
            const p = parseDate(v, params);
            if (p) cur.exdates.push(p.date);
          }
          break;
      }
    }
  }
  return events;
}

const two = (n) => String(n).padStart(2, '0');
const utc = (d) =>
  `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`;
const day = (d) => `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
/** Folds lines longer than 75 octets (approximated by characters). */
const fold = (line) => line.match(/.{1,74}/gu).join('\r\n ');

/** An .ics file of events: { uid, title, start, end, allDay, description, location, url, rrule, exdates }. */
export function toIcs(events, name = 'MiniNode Kalender') {
  const out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MiniNode//Kalender//DE',
    `X-WR-CALNAME:${icsEscape(name)}`,
  ];
  const stamp = utc(new Date());
  for (const e of events) {
    out.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.allDay) {
      out.push(`DTSTART;VALUE=DATE:${day(e.start)}`, `DTEND;VALUE=DATE:${day(e.end)}`);
    } else out.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`);
    out.push(`SUMMARY:${icsEscape(e.title || '')}`);
    if (e.description) out.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) out.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.url) out.push(`URL:${e.url}`);
    if (e.rrule) out.push(`RRULE:${e.rrule}`);
    // exdates are local occurrence keys (2026-10-05T18:00), written as floating local times
    if (e.rrule && e.exdates?.length)
      out.push(
        e.allDay
          ? `EXDATE;VALUE=DATE:${e.exdates.map((k) => k.slice(0, 10).replace(/-/g, '')).join(',')}`
          : `EXDATE:${e.exdates.map((k) => `${k.replace(/[-:]/g, '')}00`).join(',')}`,
      );
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return `${out.map(fold).join('\r\n')}\r\n`;
}
