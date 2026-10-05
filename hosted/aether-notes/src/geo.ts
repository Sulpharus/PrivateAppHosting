import { MiniNode, type Place } from './mininode';

// Places of addresses: looked up once (OpenStreetMap Nominatim) and kept in the account under
// `aether_geo`, keyed by the address text. 0 means "looked up, not found".

export type Point = { lat: number; lon: number; city?: string; postcode?: string };
type Cache = Record<string, Point | 0>;

const KEY = 'aether_geo';
const EARTH_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export const placeKey = (text: string | undefined | null) =>
  String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** Distance in metres between two points (great circle). */
export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(x)));
}

let cache: Cache | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadGeo(): Promise<Cache> {
  if (cache) return cache;
  const stored = (await MiniNode.db.getItem(KEY)) as Cache | undefined;
  cache = stored && typeof stored === 'object' ? stored : {};
  return cache;
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (cache) void MiniNode.db.setItem(KEY, cache).catch(() => undefined);
  }, 1500);
}

/** The known point of an address text, or null (unknown or not found). */
export function pointOf(text: string | undefined | null): Point | null {
  const hit = cache?.[placeKey(text)];
  return hit ? hit : null;
}

/** Texts that were never looked up. */
export function unknownTexts(texts: (string | undefined | null)[]): string[] {
  const out = new Map<string, string>();
  for (const text of texts) {
    const key = placeKey(text);
    if (key && !(cache && key in cache) && !out.has(key)) out.set(key, String(text).trim());
  }
  return [...out.values()];
}

/**
 * Looks the texts up one after the other (one request per second). `onStep` is called after each
 * one, so a view can draw what is known so far. Stops quietly when the service is unreachable.
 */
export async function lookUp(
  texts: string[],
  onStep: (done: number, total: number) => void,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  await loadGeo();
  const todo = unknownTexts(texts);
  for (const [i, text] of todo.entries()) {
    if (shouldStop()) return;
    try {
      const [hit]: Place[] = await MiniNode.geocode(text);
      (cache as Cache)[placeKey(text)] = hit
        ? { lat: hit.lat, lon: hit.lon, city: hit.city, postcode: hit.postcode }
        : 0;
    } catch {
      return;
    }
    saveSoon();
    onStep(i + 1, todo.length);
  }
}

/** Remembers a place the person chose for an address text. */
export function remember(text: string, point: Point) {
  (cache ??= {})[placeKey(text)] = point;
  saveSoon();
}

/** Kilometres with one decimal below 10. */
export const kilometres = (m: number) => {
  const km = m / 1000;
  return km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
};

/** A link that opens the way in OpenStreetMap (from `from`, or from where the person is). */
export const directionsUrl = (from: Point | null, to: Point, mode: 'car' | 'bike' | 'foot') =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_${mode}&route=${
    from ? `${from.lat}%2C${from.lon}` : ''
  }%3B${to.lat}%2C${to.lon}`;
