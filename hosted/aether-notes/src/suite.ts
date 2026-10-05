import { loadGeo, lookUp, pointOf } from './geo';
import { MiniNode } from './mininode';

// Meetups as shared `event` records (ADR 0002), so the Kalender shows them with their place on its
// map. Each meetup is one record with the source key "meetup:<id>" (or "people:<id>" for the ones of
// the people view); changed ones are written again, deleted ones removed. Without the admin's
// approval of `suite.uses` the database refuses and the app simply goes on without it.

interface Wanted {
  title: string;
  starts_at: string;
  ends_at: string;
  place_name: string | null;
  lat: number | null;
  lon: number | null;
  data: Record<string, unknown>;
}

interface Meetup {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  preparationNotes?: string;
  contactIds?: string[];
  contactId?: string;
  personIds?: string[];
  personId?: string;
}

const PAST_DAYS = 30;
const LOOKUPS_PER_RUN = 12;
let off = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

const instant = (date: string, time: string | undefined): Date | null => {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
};

function wantedOf(
  meetup: Meetup,
  names: string,
): { starts: Date; fields: Omit<Wanted, 'lat' | 'lon'> } | null {
  const starts = instant(meetup.date, meetup.time);
  if (!starts) return null;
  if (starts.getTime() < Date.now() - PAST_DAYS * 86_400_000) return null;
  const timed = Boolean(meetup.time);
  const ends = timed
    ? new Date(starts.getTime() + 3_600_000)
    : new Date(starts.getFullYear(), starts.getMonth(), starts.getDate() + 1);
  const description = [
    names && `${window.mnI18n.t('suite.with')} ${names}`,
    meetup.preparationNotes,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
  return {
    starts,
    fields: {
      title: meetup.title.slice(0, 200),
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      place_name: (meetup.location ?? '').trim().slice(0, 300) || null,
      data: {
        all_day: timed ? null : true,
        description: description || null,
      },
    },
  };
}

async function sync() {
  if (off || running) return;
  running = true;
  try {
    const [crm, contactsMap, peopleMap, peopleMeetups] = await Promise.all([
      MiniNode.db.list('meetups') as Promise<Record<string, Meetup>>,
      MiniNode.db.list('contacts') as Promise<Record<string, { name: string }>>,
      MiniNode.db.list('people') as Promise<Record<string, { name: string }>>,
      MiniNode.db.getItem('aether_people_meetups') as Promise<Meetup[] | undefined>,
    ]);
    const nameOf = (ids: (string | undefined)[], from: Record<string, { name: string }>) =>
      ids
        .map((id) => (id ? from[id]?.name : undefined))
        .filter(Boolean)
        .join(', ');
    const wanted = new Map<string, ReturnType<typeof wantedOf>>();
    for (const m of Object.values(crm))
      wanted.set(
        `meetup:${m.id}`,
        wantedOf(m, nameOf(m.contactIds?.length ? m.contactIds : [m.contactId], contactsMap)),
      );
    for (const m of Array.isArray(peopleMeetups) ? peopleMeetups : [])
      wanted.set(
        `people:${m.id}`,
        wantedOf(m, nameOf(m.personIds?.length ? m.personIds : [m.personId], peopleMap)),
      );

    // places: look up what is unknown (a few per run), then every record carries its point
    await loadGeo();
    const places = [...wanted.values()].map((w) => w?.fields.place_name);
    await lookUp(
      places.filter((p): p is string => Boolean(p)).slice(0, LOOKUPS_PER_RUN),
      () => undefined,
    );

    // the place text each record was last written with (to tell an edit in the Kalender from ours)
    const written = ((await MiniNode.db.getItem('aether_suite_places')) ?? {}) as Record<
      string,
      string | null
    >;
    const events = await MiniNode.events();
    const mine = (await events.list({ limit: 5000 })).filter(
      (r) => r.source_app === 'aether-notes',
    );
    const byKey = new Map(mine.map((r) => [r.source_key, r]));
    const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
    const jobs: (() => Promise<unknown>)[] = [];
    for (const [key, w] of wanted) {
      if (!w) continue;
      const point = pointOf(w.fields.place_name);
      const rec = byKey.get(key);
      let fields: Wanted = { ...w.fields, lat: point?.lat ?? null, lon: point?.lon ?? null };
      if (rec) {
        // The place was changed in the Kalender (Aether's own text is still the one written last):
        // that change stays. A point that is only unknown here does not wipe a known one either.
        if (
          rec.data?.aether_place === w.fields.place_name &&
          rec.place_name !== w.fields.place_name
        )
          fields = { ...fields, place_name: rec.place_name, lat: rec.lat, lon: rec.lon };
        else if (!point && rec.place_name === w.fields.place_name)
          fields = { ...fields, lat: rec.lat, lon: rec.lon };
      }
      const unchanged =
        rec &&
        same(rec.title, fields.title) &&
        new Date(rec.starts_at ?? 0).getTime() === new Date(fields.starts_at).getTime() &&
        same(rec.place_name, fields.place_name) &&
        same(rec.lat, fields.lat) &&
        same(rec.lon, fields.lon) &&
        same(rec.data?.description, fields.data.description);
      if (!unchanged) jobs.push(() => events.upsert(fields, { sourceKey: key }));
      written[key] = w.fields.place_name;
    }
    // Meetups that are gone leave the Kalender (old ones stay as history). Only when the lists were
    // really read: a device that is offline with an empty local copy must not empty the Kalender.
    const listsRead =
      navigator.onLine && Object.keys(crm).length + (peopleMeetups?.length ?? 0) > 0;
    for (const rec of mine)
      if (listsRead && !wanted.has(rec.source_key ?? '')) jobs.push(() => events.delete(rec.id));
    const queue = [...jobs];
    await MiniNode.db.setItem('aether_suite_places', written).catch(() => undefined);
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await job();
    };
    await Promise.all([worker(), worker(), worker()]);
  } catch (err) {
    // not approved (yet) or offline: try again with the next change or start
    if ((err as { code?: string })?.code === '42501') off = true;
  } finally {
    running = false;
  }
}

/** Called after every change of a meetup; changes in a row sync once. */
export function scheduleSuiteSync(delay = 3000) {
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), delay);
}
