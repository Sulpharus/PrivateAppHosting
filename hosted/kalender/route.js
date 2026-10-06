// Pure helpers of the map view: which items have a place on the map, the legs between the
// appointments of a day, and whether the time between two appointments is enough to get there.

const EARTH_M = 6_371_000;
const rad = (deg) => (deg * Math.PI) / 180;

export const validPoint = (p) =>
  Boolean(p) &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lon) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lon) <= 180;

/** Distance between two points in metres (great circle). */
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Key of a place text in the cache of looked-up places. */
export const placeKey = (text) =>
  String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** The coordinates of an item: stored on its record, else from the cache of looked-up places. */
export function pointOf(item, cache = {}) {
  const r = item.record;
  if (validPoint({ lat: r.lat, lon: r.lon })) return { lat: r.lat, lon: r.lon };
  const hit = cache[placeKey(r.place_name)];
  return validPoint(hit) ? { lat: hit.lat, lon: hit.lon } : null;
}

/** Places that have a text but no coordinates yet (and are not known to be unfindable). */
export function placesToLookUp(items, cache = {}) {
  const out = new Map();
  for (const item of items) {
    const text = (item.record.place_name ?? '').trim();
    if (!text || validPoint({ lat: item.record.lat, lon: item.record.lon })) continue;
    const key = placeKey(text);
    if (key in cache) continue;
    if (!out.has(key)) out.set(key, text);
  }
  return [...out.entries()].map(([key, text]) => ({ key, text }));
}

const DAY_MS = 86_400_000;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Items with a point, grouped by the day they start, in time order. All-day items are left out. */
export function dayGroups(items, cache = {}) {
  const groups = new Map();
  for (const item of items) {
    if (item.allDay || item.cancelled) continue;
    const point = pointOf(item, cache);
    if (!point) continue;
    const key = dayKey(item.start);
    if (!groups.has(key)) groups.set(key, { day: new Date(item.start), items: [] });
    groups.get(key).items.push({ item, point });
  }
  for (const g of groups.values()) g.items.sort((a, b) => a.item.start - b.item.start);
  return [...groups.values()].sort((a, b) => a.day - b.day);
}

/**
 * The legs of one day: from the start point (when given) to the first appointment, between
 * neighbours, and back home after the last one. Neighbours at the same spot need no leg.
 */
export function legsOf(entries, home, { backHome = true, sameSpotM = 150 } = {}) {
  const legs = [];
  const seq = entries.map((e) => ({
    item: e.item,
    point: e.point,
    label: e.item.record.place_name || e.item.title,
  }));
  const at = (e) => ({ lat: e.point.lat, lon: e.point.lon, label: e.label });
  if (home && seq.length)
    legs.push({
      kind: 'out',
      from: { lat: home.lat, lon: home.lon, label: home.label },
      to: at(seq[0]),
      fromItem: null,
      toItem: seq[0].item,
    });
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1];
    const b = seq[i];
    legs.push({
      kind: 'between',
      from: at(a),
      to: at(b),
      fromItem: a.item,
      toItem: b.item,
      same: haversine(a.point, b.point) < sameSpotM,
    });
  }
  if (home && backHome && seq.length) {
    const last = seq[seq.length - 1];
    legs.push({
      kind: 'home',
      from: at(last),
      to: { lat: home.lat, lon: home.lon, label: home.label },
      fromItem: last.item,
      toItem: null,
    });
  }
  return legs;
}

/**
 * Judges a leg once its travel time is known.
 *   same:  both appointments are at the same place
 *   ok:    enough time with the buffer
 *   tight: arrival before the next appointment, but without the buffer
 *   late:  the travel takes longer than the time between the appointments
 * `leaveAt` is when to set off to arrive `bufferMin` minutes early (for a leg back home: the
 * arrival time `arriveAt`).
 */
export function assessLeg(leg, travelSec, bufferMin = 10) {
  const travelMin = Math.ceil(travelSec / 60);
  if (leg.kind === 'out') {
    const leaveAt = new Date(leg.toItem.start.getTime() - (travelMin + bufferMin) * 60_000);
    return { status: 'ok', travelMin, leaveAt, gapMin: null };
  }
  if (leg.kind === 'home') {
    const arriveAt = new Date(leg.fromItem.end.getTime() + travelMin * 60_000);
    return { status: 'ok', travelMin, arriveAt, gapMin: null };
  }
  const gapMin = Math.round((leg.toItem.start - leg.fromItem.end) / 60_000);
  const leaveAt = new Date(leg.toItem.start.getTime() - (travelMin + bufferMin) * 60_000);
  if (leg.same) return { status: 'same', travelMin: 0, leaveAt, gapMin };
  const status = gapMin >= travelMin + bufferMin ? 'ok' : gapMin >= travelMin ? 'tight' : 'late';
  return { status, travelMin, leaveAt, gapMin };
}

/** Whole minutes as "1 h 05 min" parts. */
export function hoursMinutes(min) {
  const m = Math.max(0, Math.round(min));
  return { h: Math.floor(m / 60), m: m % 60 };
}

/** Distance as kilometres with one decimal below 10 km. */
export function kilometres(meters) {
  const km = meters / 1000;
  return km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
}

export const TRAVEL_MODES = ['car', 'bike', 'foot'];
/** The OpenStreetMap routing service has one engine per way of travelling. */
export const ROUTE_ENGINE = { car: 'routed-car', bike: 'routed-bike', foot: 'routed-foot' };
const DIRECTIONS_ENGINE = {
  car: 'fossgis_osrm_car',
  bike: 'fossgis_osrm_bike',
  foot: 'fossgis_osrm_foot',
};

/** The path (relative to the declared API) of a route request from `a` to `b`. */
export function routePath(a, b, mode) {
  const engine = ROUTE_ENGINE[mode] ?? ROUTE_ENGINE.car;
  return `/${engine}/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
}

/** A link that opens the route in OpenStreetMap (for navigating on the phone). */
export function directionsUrl(a, b, mode) {
  const engine = DIRECTIONS_ENGINE[mode] ?? DIRECTIONS_ENGINE.car;
  const from = a ? `${a.lat}%2C${a.lon}` : '';
  return `https://www.openstreetmap.org/directions?engine=${engine}&route=${from}%3B${b.lat}%2C${b.lon}`;
}

// ---------- the keyed provider (Geoapify): one key for the address search and the routes ----------
// The free OpenStreetMap services stay as the fallback while no key is entered.

/** The way of travelling in Geoapify's words. */
const KEYED_MODE = { car: 'drive', bike: 'bicycle', foot: 'walk' };

export const keyedGeocodePath = (text, lang) =>
  `/v1/geocode/search?text=${encodeURIComponent(String(text).trim())}&format=json&limit=5&lang=${encodeURIComponent(lang)}`;

/** Matches of an address search answer, best first. */
export function parseKeyedGeocode(res) {
  return (Array.isArray(res?.results) ? res.results : [])
    .map((r) => ({
      lat: Number(r.lat),
      lon: Number(r.lon),
      label: String(r.formatted ?? '').slice(0, 200),
    }))
    .filter(validPoint);
}

export const keyedRoutePath = (a, b, mode) =>
  `/v1/routing?waypoints=${a.lat},${a.lon}|${b.lat},${b.lon}&mode=${KEYED_MODE[mode] ?? KEYED_MODE.car}`;

/** { duration (s), distance (m), line [[lat, lon], …] } of a route answer, or null. */
export function parseKeyedRoute(res) {
  const feature = res?.features?.[0];
  const time = Number(feature?.properties?.time);
  if (!Number.isFinite(time)) return null;
  const geometry = feature.geometry ?? {};
  const parts =
    geometry.type === 'MultiLineString'
      ? geometry.coordinates
      : geometry.type === 'LineString'
        ? [geometry.coordinates]
        : [];
  return {
    duration: time,
    distance: Number(feature.properties.distance) || 0,
    line: parts.flat().map(([lon, lat]) => [lat, lon]),
  };
}

/** Whether an error of the platform's API proxy means "this API is not set up (yet)". */
export const notSetUp = (err) =>
  ['api_key_missing', 'api_key_unreadable', 'api_not_declared', 'vault_not_configured'].includes(
    err?.code,
  );

/**
 * Groups points that lie within `radius` pixels of each other (same address, or very close at the
 * current zoom). Takes `{x, y}` points, returns lists of their indices; each point is in exactly
 * one list, and the order of the points is kept inside a list.
 */
export function clusterPixels(points, radius) {
  const clusters = [];
  points.forEach((p, i) => {
    let best = null;
    let bestDistance = radius;
    for (const c of clusters) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
    if (best) {
      const n = best.members.length;
      best.x = (best.x * n + p.x) / (n + 1);
      best.y = (best.y * n + p.y) / (n + 1);
      best.members.push(i);
    } else clusters.push({ x: p.x, y: p.y, members: [i] });
  });
  return clusters.map((c) => c.members);
}

export { DAY_MS };
