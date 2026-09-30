// Google Calendar ↔ suite records (ADR 0010): pure mapping, no I/O. Times of all-day events,
// recurrence exceptions and occurrence keys are local wall-clock times in the event's time zone
// (Europe/Berlin unless Google says otherwise), matching the Kalender app.

export const DEFAULT_TZ = 'Europe/Berlin';
/** Google has no "cancelled but shown" state: the title carries it, and comes back as status. */
const CANCELLED = 'Abgesagt: ';
const DAY = 86_400_000;

// ---------- time zones ----------
const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, tz: string): Record<string, number> {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}
const pad = (n: number) => String(n).padStart(2, '0');

/** Local `YYYY-MM-DD` of an instant. */
export function localDate(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${pad(p.month ?? 0)}-${pad(p.day ?? 0)}`;
}

/** Local occurrence key `YYYY-MM-DDTHH:MM` of an instant (the Kalender's EXDATE format). */
export function localKey(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${localDate(date, tz)}T${pad(p.hour ?? 0)}:${pad(p.minute ?? 0)}`;
}

/** The instant of a local date and time in a time zone. */
export function zoned(date: string, time: string, tz: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0, s = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi, s);
  const offset = (at: number) => {
    const p = parts(new Date(at), tz);
    return (
      Date.UTC(
        p.year ?? 0,
        (p.month ?? 1) - 1,
        p.day ?? 1,
        p.hour ?? 0,
        p.minute ?? 0,
        p.second ?? 0,
      ) - at
    );
  };
  let t = wall - offset(wall);
  t = wall - offset(t);
  return new Date(t);
}

// ---------- Google → record ----------
export interface GoogleTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
export interface GoogleEvent {
  id: string;
  etag?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleTime;
  reminders?: { useDefault?: boolean; overrides?: { method?: string; minutes?: number }[] };
  extendedProperties?: { private?: Record<string, string> };
}

export interface RecordFields {
  title: string;
  starts_at: string;
  ends_at: string;
  place_name: string | null;
  data: Record<string, unknown>;
}

/** An item for platform.gcal_apply. */
export interface ApplyItem {
  event_id: string;
  etag?: string;
  updated?: string;
  deleted?: boolean;
  /** Old history: not stored, but still part of a full listing. */
  skip?: boolean;
  record_id?: string;
  master_event_id?: string;
  exdate_key?: string;
  fields?: RecordFields;
}

/** Plain text from Google's HTML descriptions. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** An occurrence key from a Google start time (`originalStartTime`). */
export function keyOf(time: GoogleTime | undefined, tz: string): string | null {
  if (!time) return null;
  if (time.date) return `${time.date}T00:00`;
  if (time.dateTime) return localKey(new Date(time.dateTime), tz);
  return null;
}

/** EXDATE values of Google's recurrence lines as occurrence keys. */
export function exdatesOf(lines: string[], tz: string): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const m = /^EXDATE([^:]*):(.+)$/i.exec(line.trim());
    if (!m) continue;
    const params = m[1] ?? '';
    const zone = /TZID=([^;:]+)/i.exec(params)?.[1];
    for (const v of (m[2] ?? '').split(',')) {
      const d = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
      if (!d) continue;
      const date = `${d[1]}-${d[2]}-${d[3]}`;
      if (d[4] === undefined) out.push(`${date}T00:00`);
      else if (d[7]) out.push(localKey(new Date(`${date}T${d[4]}:${d[5]}:${d[6]}Z`), tz));
      else if (!zone || zone === tz) out.push(`${date}T${d[4]}:${d[5]}`);
      else out.push(localKey(zoned(date, `${d[4]}:${d[5]}:${d[6]}`, zone), tz));
    }
  }
  return [...new Set(out)].slice(-500);
}

/** Record fields of a Google event, or null when it has no usable time. */
export function eventFields(ev: GoogleEvent, tz: string): RecordFields | null {
  const zone = ev.start?.timeZone ?? tz;
  let start: Date;
  let end: Date;
  const allDay = Boolean(ev.start?.date);
  if (ev.start?.date) {
    start = zoned(ev.start.date, '00:00:00', zone);
    end = ev.end?.date ? zoned(ev.end.date, '00:00:00', zone) : new Date(start.getTime() + DAY);
  } else if (ev.start?.dateTime) {
    start = new Date(ev.start.dateTime);
    end = ev.end?.dateTime ? new Date(ev.end.dateTime) : new Date(start.getTime() + 3600_000);
  } else return null;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) end = start;

  const data: Record<string, unknown> = {};
  if (allDay) data.all_day = true;
  const description = ev.description ? plainText(ev.description).slice(0, 10_000) : '';
  if (description) data.description = description;
  if (ev.status === 'tentative') data.status = 'tentative';
  let title = (ev.summary ?? '').trim();
  if (title.startsWith(CANCELLED)) {
    title = title.slice(CANCELLED.length).trim();
    data.status = 'cancelled';
  }
  const rrule = ev.recurrence?.find((l) => /^RRULE:/i.test(l));
  if (rrule) {
    const exdates = exdatesOf(ev.recurrence ?? [], tz);
    data.recurrence = {
      rrule: rrule.replace(/^RRULE:/i, '').slice(0, 500),
      ...(exdates.length ? { exdates } : {}),
    };
  }
  if (ev.reminders && !ev.reminders.useDefault && ev.reminders.overrides?.length)
    data.reminders = ev.reminders.overrides
      .filter((o) => typeof o.minutes === 'number' && o.minutes >= 0)
      .slice(0, 3)
      .map((o) => ({ offset: o.minutes === 0 ? 'PT0M' : `-PT${o.minutes}M`, channel: 'push' }));
  return {
    title: title.slice(0, 500) || '(ohne Titel)',
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    place_name: ev.location ? ev.location.slice(0, 300) : null,
    data,
  };
}

/**
 * The gcal_apply item of a Google event. Events that ended over a year ago (and are not a
 * series) are marked `skip`, so old history does not fill the calendar.
 */
export function applyItem(ev: GoogleEvent, tz: string, now = new Date()): ApplyItem | null {
  const base: ApplyItem = {
    event_id: ev.id,
    ...(ev.etag ? { etag: ev.etag } : {}),
    ...(ev.updated ? { updated: ev.updated } : {}),
  };
  const recordId = ev.extendedProperties?.private?.mn;
  if (recordId) base.record_id = recordId;
  if (ev.recurringEventId) {
    base.master_event_id = ev.recurringEventId;
    const key = keyOf(ev.originalStartTime, tz);
    if (key) base.exdate_key = key;
  }
  if (ev.status === 'cancelled') return { ...base, deleted: true };
  const fields = eventFields(ev, tz);
  if (!fields) return null;
  if (!fields.data.recurrence && new Date(fields.ends_at).getTime() < now.getTime() - 365 * DAY)
    return { event_id: ev.id, skip: true };
  return { ...base, fields };
}

// ---------- record → Google ----------
export interface PlanRecord {
  id: string;
  type: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  due_at: string | null;
  place_name: string | null;
  data: Record<string, unknown> | null;
  created_by_app: string | null;
  source_app: string | null;
  collection_id: string;
  version: number;
  projection?: 'span' | 'due' | null;
  app_name?: string | null;
  collection_color?: string | null;
}

/** Google's event colours closest to the Kalender's source colours. */
const COLOR_IDS: Record<string, string> = {
  blue: '9',
  green: '10',
  violet: '3',
  amber: '5',
  rose: '4',
  teal: '7',
  gray: '8',
};

/** The nearest Kalender colour of a Google calendar colour (`#a4bdfc`). */
export function paletteColor(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!m) return 'blue';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Number.parseInt(x ?? '0', 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.12) return 'gray';
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 320) return 'rose';
  if (hue < 65) return 'amber';
  if (hue < 160) return 'green';
  if (hue < 200) return 'teal';
  if (hue < 255) return 'blue';
  return 'violet';
}

/**
 * The Kalender writes UNTIL as local end of day (`UNTIL=20261018T235959`); Google wants UTC for
 * timed series and a date for all-day ones.
 */
export function utcUntil(rrule: string, allDay: boolean, tz: string): string {
  return rrule.replace(/UNTIL=(\d{8})(?:T(\d{6})(Z?))?/i, (whole, date, time, z) => {
    if (allDay) return `UNTIL=${date}`;
    if (z || !time) return whole;
    const at = zoned(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`,
      tz,
    );
    return `UNTIL=${at
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')}`;
  });
}

function parseOffset(text: unknown): number | null {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(String(text ?? ''));
  if (!m) return null;
  const minutes =
    ((Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * 24 + Number(m[4] ?? 0)) * 60 + Number(m[5] ?? 0);
  return m[1] ? -minutes : minutes;
}

/**
 * The Google event body of a record. `own` records carry their reminders; other apps' records
 * say where they come from, since changes there win.
 */
export function eventBody(
  r: PlanRecord,
  options: { tz?: string; color?: string | null; own: boolean; mirrored: boolean },
): Record<string, unknown> {
  const tz = options.tz ?? DEFAULT_TZ;
  const data = r.data ?? {};
  const due = r.projection === 'due';
  const startIso = due ? r.due_at : r.starts_at;
  const start = new Date(startIso ?? Date.now());
  let end = due
    ? new Date(start.getTime() + 30 * 60_000)
    : new Date(r.ends_at ?? start.getTime() + 3600_000);
  if (end < start) end = start;
  const local = localKey(start, tz);
  const allDay = Boolean(data.all_day) || (due && local.endsWith('T00:00'));

  const body: Record<string, unknown> = {};
  if (allDay) {
    const first = localDate(start, tz);
    let last = due ? first : localDate(end, tz);
    // Google's end date is exclusive: at least the day after the start
    if (last <= first) last = localDate(new Date(zoned(first, '12:00:00', tz).getTime() + DAY), tz);
    body.start = { date: first };
    body.end = { date: last };
  } else {
    body.start = { dateTime: start.toISOString(), timeZone: tz };
    body.end = { dateTime: end.toISOString(), timeZone: tz };
  }
  const cancelled = data.status === 'cancelled' || data.plan_status === 'cancelled';
  body.summary = `${cancelled ? CANCELLED : ''}${r.title ?? '(ohne Titel)'}`;
  const description = typeof data.description === 'string' ? data.description : '';
  const note = options.own
    ? ''
    : `Aus ${r.app_name ?? r.created_by_app ?? 'einer App'} auf MiniNode. Änderungen bitte dort, sie gelten hier beim nächsten Abgleich.`;
  body.description = [description, note].filter(Boolean).join('\n\n');
  body.location = r.place_name ?? '';
  body.status = data.status === 'tentative' ? 'tentative' : 'confirmed';
  const recurrence = data.recurrence as { rrule?: string; exdates?: string[] } | undefined;
  if (recurrence?.rrule) {
    const lines = [`RRULE:${utcUntil(recurrence.rrule, allDay, tz)}`];
    if (recurrence.exdates?.length)
      lines.push(
        allDay
          ? `EXDATE;VALUE=DATE:${recurrence.exdates.map((k) => k.slice(0, 10).replace(/-/g, '')).join(',')}`
          : `EXDATE;TZID=${tz}:${recurrence.exdates.map((k) => `${k.replace(/[-:]/g, '')}00`).join(',')}`,
      );
    body.recurrence = lines;
  } else body.recurrence = [];
  const reminders = options.own && Array.isArray(data.reminders) ? data.reminders : [];
  body.reminders = {
    useDefault: false,
    overrides: reminders
      .map((x) => parseOffset((x as { offset?: string }).offset))
      .filter((m): m is number => m !== null && m <= 0 && m >= -40_320)
      .map((m) => ({ method: 'popup', minutes: -m })),
  };
  const color = (typeof data.color === 'string' ? data.color : null) ?? options.color;
  if (color && COLOR_IDS[color]) body.colorId = COLOR_IDS[color];
  if (options.mirrored) body.extendedProperties = { private: { mn: r.id } };
  return body;
}

/** The Kalender source id of a record (as in hosted/kalender/items.js). */
export function sourceId(
  r: Pick<PlanRecord, 'created_by_app' | 'source_app' | 'collection_id' | 'type'>,
): string {
  const app = r.created_by_app ?? r.source_app ?? '';
  return app === 'kalender' || !app ? `col:${r.collection_id}` : `app:${app}:${r.type}`;
}
