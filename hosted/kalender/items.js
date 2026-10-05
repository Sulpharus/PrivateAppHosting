// From shared records to calendar items: which source (collection or app) they belong to, their
// time span, and the occurrences of recurring events in the visible range.
import { occurrenceKey, occurrences, parseRule } from './rrule.js';

export const SELF = 'kalender';
export const COLORS = ['blue', 'green', 'violet', 'amber', 'rose', 'teal', 'gray'];

const APP_NAMES = {
  sportplaner: 'Sportplaner',
  haushalt: 'Haushalt',
  kalender: 'Kalender',
  'aether-notes': 'Aether Notes',
};
export const appName = (slug) => APP_NAMES[slug] ?? slug;

/**
 * The source a record belongs to: events made in this app are grouped by collection
 * (My events, Family calendar, …); records from other apps by app and type
 * (Sportplaner · Training session), so each can be shown, hidden and coloured on its own.
 */
export function sourceOf(record) {
  const app = record.created_by_app ?? record.source_app ?? '';
  return app === SELF || !app ? `col:${record.collection_id}` : `app:${app}:${record.type}`;
}

/** Labels and default colours for every source seen in the records and collections. */
export function sourcesFrom(records, collections, types, known = {}, shared = 'Shared calendar') {
  const label = Object.fromEntries(types.map((t) => [t.type, t.label]));
  const map = new Map();
  // Default colours avoid the ones already chosen, so they stay stable when choices are saved.
  const used = new Set(
    [...Object.values(known).map((k) => k.color), ...collections.map((c) => c.color)].filter(
      Boolean,
    ),
  );
  const pick = () => {
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[used.size % COLORS.length];
    used.add(color);
    return color;
  };
  const add = (id, name, group, extra = {}) => {
    if (map.has(id)) return;
    const saved = known[id] ?? {};
    map.set(id, {
      id,
      name,
      group,
      color: saved.color ?? extra.collection?.color ?? pick(),
      visible: saved.visible ?? !(extra.hiddenByDefault ?? false),
      ...extra,
    });
  };
  for (const c of collections.filter((c) => c.family === 'kalender'))
    add(`col:${c.id}`, c.name, 'calendars', { collection: c });
  for (const r of records) {
    const id = sourceOf(r);
    if (id.startsWith('col:')) {
      const c = collections.find((x) => `col:${x.id}` === id);
      add(id, c?.name ?? shared, 'calendars', c ? { collection: c } : {});
    } else {
      const [, app, type] = id.split(':');
      // Bookings are many; they start hidden.
      add(id, `${appName(app)} · ${label[type] ?? type}`, 'apps', {
        app,
        type,
        hiddenByDefault: type === 'transaction',
      });
    }
  }
  // Sources seen before stay in the list (hidden or not) when the range has none of them.
  for (const [id, saved] of Object.entries(known)) {
    if (!id.startsWith('app:') || !saved.name) continue;
    const [, app, type] = id.split(':');
    add(id, saved.name, 'apps', { app, type });
  }
  return [...map.values()];
}

const DAY = 86_400_000;
const isMidnight = (d) => d.getHours() === 0 && d.getMinutes() === 0;

/** Start, end and all-day flag of a record, from its type's calendar projection. */
export function spanOf(record, projection) {
  const data = record.data ?? {};
  if (projection === 'due') {
    if (!record.due_at) return null;
    const due = new Date(record.due_at);
    const allDay = data.all_day ?? isMidnight(due);
    return allDay
      ? {
          start: new Date(due.getFullYear(), due.getMonth(), due.getDate()),
          end: new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1),
          allDay,
        }
      : { start: due, end: due, allDay };
  }
  if (!record.starts_at) return null;
  const start = new Date(record.starts_at);
  const allDay = Boolean(data.all_day);
  let end = record.ends_at ? new Date(record.ends_at) : null;
  if (allDay) {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : s;
    return { start: s, end: e > s ? e : new Date(s.getTime() + DAY), allDay };
  }
  if (!end || end < start) end = new Date(start.getTime() + 3600_000);
  return { start, end, allDay };
}

/**
 * Items in [from, to): one per occurrence, with `key` (record + occurrence), the source and
 * whether this app may edit it.
 */
export function itemsFor(
  records,
  { from, to, projections, sources, roles, untitled = '(untitled)' },
) {
  const out = [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  for (const r of records) {
    const span = spanOf(r, projections[r.type]);
    if (!span) continue;
    const source = byId.get(sourceOf(r));
    const length = span.end - span.start;
    const rule = r.type === 'event' ? parseRule(r.data?.recurrence?.rrule) : null;
    const exdates = new Set(r.data?.recurrence?.exdates ?? []);
    const starts = rule
      ? occurrences(span.start, rule, { from: new Date(from.getTime() - length), to, exdates })
      : [span.start];
    for (const start of starts) {
      const end = new Date(start.getTime() + length);
      if (end < from || (end.getTime() === from.getTime() && length > 0) || start >= to) continue;
      out.push({
        key: rule ? `${r.id}@${occurrenceKey(start)}` : r.id,
        record: r,
        title: r.title || untitled,
        start,
        end,
        allDay: span.allDay,
        due: projections[r.type] === 'due',
        recurring: Boolean(rule),
        occurrence: rule ? occurrenceKey(start) : null,
        sourceId: source?.id ?? sourceOf(r),
        color: r.data?.color ?? source?.color ?? 'gray',
        cancelled: r.data?.status === 'cancelled' || r.data?.plan_status === 'cancelled',
        editable:
          r.type === 'event' &&
          (r.created_by_app ?? SELF) === SELF &&
          (roles[r.collection_id] ?? 'viewer') !== 'viewer',
      });
    }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end || a.title.localeCompare(b.title));
}

/** Items that touch a day (multi-day and all-day ones included). */
export function onDay(items, day) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(start.getTime() + DAY);
  return items.filter(
    (i) =>
      i.start < end &&
      (i.end > start || (i.end.getTime() === i.start.getTime() && i.start >= start)),
  );
}
