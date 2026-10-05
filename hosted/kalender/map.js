// Karte: the appointments of the chosen days with a place, as pins on a map (Leaflet from
// /vendor, tiles of the chosen provider), with the way between them (OpenStreetMap routing
// through the platform proxy) and a warning when the time between two appointments is too short.
// Places without coordinates are looked up (OpenStreetMap Nominatim, one request per second) and
// remembered in kv `geo`; the person's choices (layer, way of travelling, start point) in `prefs.map`.
import {
  assessLeg,
  dayGroups,
  directionsUrl,
  hoursMinutes,
  kilometres,
  legsOf,
  placeKey,
  placesToLookUp,
  pointOf,
  routePath,
  TRAVEL_MODES,
  validPoint,
} from './route.js';

const OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const CARTO = `${OSM} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`;
export const LAYERS = {
  standard: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: OSM, max: 19 },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attr: CARTO,
    max: 20,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: CARTO,
    max: 20,
  },
  topo: {
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attr: `${OSM}, SRTM | &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>`,
    max: 17,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    max: 18,
  },
};
const DEFAULTS = { layer: 'auto', mode: 'car', scope: 'day', route: true, buffer: 10, home: null };
const BUFFERS = [0, 5, 10, 15, 30];

let ctx;
let leafletLoad = null;
let lmap = null;
let lmapEl = null;
let drawn = [];
let geo = {}; // place text → { lat, lon } | 0 (not found)
let geoLoaded = false;
let geoSave = 0;
let lookingUp = false;
/** Counts the drawn views: work that was started for an older one stops (the map was removed). */
let generation = 0;
const routes = new Map();

export function initMap(context) {
  ctx = context;
}

const prefs = () => {
  ctx.S.prefs.map = { ...DEFAULTS, ...(ctx.S.prefs.map ?? {}) };
  return ctx.S.prefs.map;
};
const choose = (patch) => {
  Object.assign(prefs(), patch);
  ctx.savePrefs();
  ctx.render();
};

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  leafletLoad ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/vendor/leaflet/leaflet.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = '/vendor/leaflet/leaflet.js';
    js.onload = () => resolve();
    js.onerror = () => {
      leafletLoad = null;
      js.remove();
      reject(new Error('leaflet'));
    };
    document.head.append(js);
  });
  return leafletLoad;
}

// ---------- places ----------
let geoQueue = Promise.resolve();
let geoLast = 0;
/** Up to five matches for an address text, best first. One request per second (usage policy). */
export function geocode(q) {
  const run = geoQueue.then(async () => {
    const wait = geoLast + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    geoLast = Date.now();
    const mn = await ctx.ready;
    const rows = await mn
      .api('nominatim')
      .json(
        `/search?format=jsonv2&limit=5&accept-language=${window.mnI18n.lang}&q=${encodeURIComponent(q.trim())}`,
      );
    return (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        lat: +r.lat,
        lon: +r.lon,
        label: String(r.display_name || '').slice(0, 200),
      }))
      .filter(validPoint);
  });
  geoQueue = run.catch(() => undefined);
  return run;
}

async function loadGeo() {
  if (geoLoaded) return;
  geoLoaded = true;
  try {
    const mn = await ctx.ready;
    geo = { ...((await mn.kv.get('geo')) ?? {}), ...geo };
  } catch {
    // The cache is a convenience.
  }
}
function saveGeoSoon() {
  clearTimeout(geoSave);
  geoSave = setTimeout(async () => {
    try {
      const entries = Object.entries(geo).slice(-400);
      await (await ctx.ready).kv.set('geo', Object.fromEntries(entries));
    } catch {
      // try again with the next lookup
    }
  }, 2000);
}

/** Looks up the places the items name but that have no point yet, one after the other. */
async function lookUp(items, onProgress) {
  if (lookingUp) return;
  const todo = placesToLookUp(items, geo);
  if (!todo.length) return;
  lookingUp = true;
  try {
    for (const [i, place] of todo.entries()) {
      onProgress(i + 1, todo.length);
      try {
        const [hit] = await geocode(place.text);
        geo[place.key] = hit ? { lat: hit.lat, lon: hit.lon } : 0;
      } catch {
        break; // offline or not set up: ask again next time
      }
      saveGeoSoon();
      ctx.redrawMap?.();
    }
  } finally {
    lookingUp = false;
    onProgress(0, 0);
  }
}

// ---------- routes ----------
async function routeOf(a, b, mode) {
  const key = `${mode}:${a.lat.toFixed(4)},${a.lon.toFixed(4)}>${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
  if (routes.has(key)) return routes.get(key);
  const job = (async () => {
    try {
      const mn = await ctx.ready;
      const res = await mn.api('routing').json(routePath(a, b, mode));
      const r = res?.routes?.[0];
      if (!r || !Number.isFinite(r.duration)) return null;
      return {
        duration: r.duration,
        distance: r.distance,
        line: (r.geometry?.coordinates ?? []).map(([lon, lat]) => [lat, lon]),
      };
    } catch {
      return null;
    }
  })();
  routes.set(key, job);
  const result = await job;
  if (!result) routes.delete(key); // try again later
  return result;
}

// ---------- the view ----------
const timeOf = (d) => ctx.F.time.format(d);
const minutesText = (min) => {
  const { h, m } = hoursMinutes(min);
  return h ? ctx.t('map.hm', { h, m }) : ctx.t('map.min', { m });
};

/** The items the chosen scope shows. */
function scoped(items) {
  const { S, startOfWeek, addDays } = ctx;
  const p = prefs();
  if (p.scope === 'all') return items;
  const from = p.scope === 'day' ? S.anchor : startOfWeek(S.anchor);
  const to = addDays(from, p.scope === 'day' ? 1 : 7);
  return items.filter((i) => i.start < to && i.end >= from);
}

export function mapView() {
  const { h, t, S } = ctx;
  const p = prefs();
  const items = scoped(S.items.filter((i) => i.record.place_name || validPoint(i.record)));
  const status = h('p', { class: 'mn-note cal-map-status', role: 'status' });
  const list = h('div', { class: 'cal-map-list' });
  const canvas = h('div', {
    class: 'cal-map-canvas',
    role: 'region',
    'aria-label': t('map.region'),
  });
  const select = (label, key, options) =>
    h(
      'label',
      { class: 'cal-map-field' },
      h('span', null, label),
      h(
        'select',
        {
          onchange: (e) => choose({ [key]: e.target.value === 'true' ? true : e.target.value }),
        },
        options.map(([value, text]) =>
          h('option', { value, selected: String(p[key]) === String(value) }, text),
        ),
      ),
    );
  const bar = h(
    'div',
    { class: 'cal-map-bar' },
    h(
      'div',
      { class: 'mn-seg cal-map-scope', role: 'group', 'aria-label': t('map.scope') },
      ['day', 'week', 'all'].map((s) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': p.scope === s ? 'true' : 'false',
            onclick: () => choose({ scope: s }),
          },
          t(`map.scope.${s}`),
        ),
      ),
    ),
    select(t('map.layer'), 'layer', [
      ['auto', t('map.layer.auto')],
      ...Object.keys(LAYERS).map((k) => [k, t(`map.layer.${k}`)]),
    ]),
    select(
      t('map.mode'),
      'mode',
      TRAVEL_MODES.map((m) => [m, t(`map.mode.${m}`)]),
    ),
    select(
      t('map.buffer'),
      'buffer',
      BUFFERS.map((b) => [b, t('map.min', { m: b })]),
    ),
    h(
      'label',
      { class: 'cal-map-check' },
      h('input', {
        type: 'checkbox',
        checked: p.route,
        onchange: (e) => choose({ route: e.target.checked }),
      }),
      t('map.showRoute'),
    ),
    h(
      'button',
      { type: 'button', class: 'mn-btn', onclick: openHome },
      p.home ? t('map.homeSet', { place: p.home.label }) : t('map.homeSetup'),
    ),
  );
  const view = h(
    'div',
    { class: 'cal-map' },
    bar,
    status,
    h('div', { class: 'cal-map-main' }, canvas, list),
  );
  const mine = ++generation;
  ctx.redrawMap = () => paint(items, canvas, list, status, mine);
  // the nodes have to be in the page before Leaflet measures them
  setTimeout(() => paint(items, canvas, list, status, mine), 0);
  void loadGeo().then(() =>
    lookUp(items, (i, n) => {
      status.textContent = n ? t('map.lookingUp', { i, n }) : '';
    }),
  );
  return view;
}

function layerOf() {
  const p = prefs();
  if (p.layer !== 'auto') return LAYERS[p.layer] ?? LAYERS.standard;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? LAYERS.dark : LAYERS.light;
}

async function paint(items, canvas, list, status, mine) {
  const { S, t } = ctx;
  if (S.view !== 'map' || !canvas.isConnected || mine !== generation) return;
  const p = prefs();
  const groups = dayGroups(items, geo);
  const located = groups.reduce((n, g) => n + g.items.length, 0);
  const allDay = items.filter((i) => (i.allDay || i.cancelled) && pointOf(i, geo));
  const unlocated = items.filter((i) => !pointOf(i, geo) && (i.record.place_name ?? '').trim());
  drawList(list, groups, allDay, unlocated);
  if (!items.length) {
    canvas.replaceChildren(h0('p', { class: 'mn-note cal-map-empty' }, t('map.empty')));
    return;
  }
  try {
    await loadLeaflet();
  } catch {
    canvas.replaceChildren(h0('p', { class: 'mn-note cal-map-empty' }, t('map.loadFailed')));
    return;
  }
  if (!canvas.isConnected || mine !== generation) return;
  const L = window.L;
  if (!lmap || lmapEl !== canvas) {
    lmap?.remove();
    lmap = null;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lmap = L.map(canvas, {
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    }).setView([48.137, 11.575], 11);
    lmapEl = canvas;
    drawn = [];
  }
  for (const layer of drawn) layer.remove();
  drawn = [];
  const spec = layerOf();
  const base = L.tileLayer(spec.url, {
    maxZoom: spec.max,
    attribution: spec.attr,
    subdomains: 'abcd',
  });
  base.addTo(lmap);
  drawn.push(base);

  const bounds = [];
  const mark = (entry, label, faded) => {
    const { item, point } = entry;
    const icon = L.divIcon({
      className: 'cal-pin-wrap',
      html: `<span class="cal-pin${faded ? ' is-faded' : ''}" data-cat="${item.color}" aria-hidden="true"><span>${label}</span></span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -14],
    });
    const m = L.marker([point.lat, point.lon], {
      icon,
      title: item.title,
      alt: item.title,
      keyboard: true,
    });
    m.bindPopup(popup(item, point));
    m.addTo(lmap);
    drawn.push(m);
    entry.marker = m;
    bounds.push([point.lat, point.lon]);
  };
  let n = 0;
  for (const g of groups) for (const entry of g.items) mark(entry, String(++n), false);
  for (const item of allDay) mark({ item, point: pointOf(item, geo) }, '•', true);
  if (p.home && validPoint(p.home)) {
    const home = L.marker([p.home.lat, p.home.lon], {
      icon: L.divIcon({
        className: 'cal-pin-wrap',
        html: '<span class="cal-pin cal-pin--home" aria-hidden="true"><span>S</span></span>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
      title: p.home.label,
      alt: p.home.label,
    });
    home.addTo(lmap);
    drawn.push(home);
    bounds.push([p.home.lat, p.home.lon]);
  }
  if (bounds.length)
    lmap.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15, animate: false });
  lmap.invalidateSize({ animate: false });
  list.dataset.located = String(located);
  list.entries = groups;
  if (p.route) await drawRoutes(groups, list, status, mine);
}

// a tiny element builder for the failure notes (the view's own h is not in scope here)
function h0(tag, props, text) {
  return ctx.h(tag, props, text);
}

function popup(item, point) {
  const { h, t } = ctx;
  const p = prefs();
  const box = h(
    'div',
    { class: 'cal-map-pop' },
    h('b', null, item.title),
    h(
      'span',
      null,
      item.allDay
        ? ctx.F.day.format(item.start)
        : `${ctx.F.day.format(item.start)}, ${timeOf(item.start)}`,
    ),
    item.record.place_name ? h('span', null, item.record.place_name) : null,
    h(
      'button',
      { type: 'button', class: 'mn-btn', onclick: () => ctx.openDetail(item) },
      t('map.details'),
    ),
    h(
      'a',
      {
        class: 'mn-btn',
        href: directionsUrl(p.home && validPoint(p.home) ? p.home : null, point, p.mode),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      t('map.navigate'),
    ),
  );
  return box;
}

async function drawRoutes(groups, list, status, mine) {
  const { t } = ctx;
  const p = prefs();
  const L = window.L;
  const home = p.home && validPoint(p.home) ? p.home : null;
  const colours = ['#1f5fbf', '#b3264f', '#1f7a5a', '#8a5a00', '#6b3fa0', '#2a7f8f'];
  const token = Symbol('routes');
  drawRoutes.token = token;
  const slots = list.querySelectorAll('[data-leg]');
  let slot = 0;
  let total = 0;
  for (const [gi, g] of groups.entries()) {
    for (const leg of legsOf(g.items, home)) {
      const el = slots[slot++];
      if (leg.same) {
        if (el) el.replaceChildren(legText(leg, assessLeg(leg, 0, p.buffer), null));
        continue;
      }
      if (el) el.textContent = t('map.routing');
      const route = await routeOf(leg.from, leg.to, p.mode);
      if (drawRoutes.token !== token || !list.isConnected || mine !== generation) return;
      if (!route) {
        if (el) el.textContent = t('map.routeFailed');
        continue;
      }
      total += route.duration;
      const verdict = assessLeg(leg, route.duration, p.buffer);
      const line = L.polyline(route.line, {
        color: verdict.status === 'late' ? '#c0262d' : colours[gi % colours.length],
        weight: 5,
        opacity: 0.8,
        dashArray: verdict.status === 'late' ? '8 8' : null,
      });
      line.addTo(lmap);
      drawn.push(line);
      if (el) el.replaceChildren(legText(leg, verdict, route));
    }
  }
  status.textContent = total
    ? t('map.totalTravel', { time: minutesText(Math.ceil(total / 60)) })
    : '';
}

function legText(leg, verdict, route) {
  const { h, t } = ctx;
  const p = prefs();
  if (verdict.status === 'same')
    return h('span', { class: 'cal-leg cal-leg--same' }, t('map.samePlace'));
  const way = `${minutesText(verdict.travelMin)} · ${kilometres(route.distance)} km`;
  const parts = [h('span', { class: 'cal-leg-way' }, t(`map.mode.${p.mode}`), ': ', way)];
  if (leg.kind === 'out')
    parts.push(h('strong', null, t('map.leaveAt', { time: timeOf(verdict.leaveAt) })));
  else if (leg.kind === 'home')
    parts.push(h('span', null, t('map.homeAt', { time: timeOf(verdict.arriveAt) })));
  else if (verdict.status === 'ok')
    parts.push(h('span', null, t('map.leaveAt', { time: timeOf(verdict.leaveAt) })));
  else
    parts.push(
      h(
        'strong',
        { class: 'cal-leg-warn', role: 'alert' },
        t(verdict.status === 'late' ? 'map.late' : 'map.tight', {
          travel: minutesText(verdict.travelMin),
          gap: minutesText(Math.max(0, verdict.gapMin)),
        }),
      ),
    );
  const go = h(
    'a',
    {
      class: 'cal-leg-go',
      href: directionsUrl(leg.from, leg.to, p.mode),
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    t('map.navigate'),
  );
  return ctx.h('span', { class: `cal-leg cal-leg--${verdict.status}` }, ...parts, go);
}

function drawList(list, groups, allDay, unlocated) {
  const { h, t } = ctx;
  const p = prefs();
  const home = p.home && validPoint(p.home) ? p.home : null;
  const rows = [];
  let n = 0;
  for (const g of groups) {
    rows.push(h('h3', { class: 'cal-map-day' }, ctx.F.dayLong.format(g.day)));
    if (home) rows.push(h('div', { class: 'cal-map-home' }, t('map.start', { place: home.label })));
    const legs = legsOf(g.items, home);
    const firstOut = legs[0]?.kind === 'out';
    if (firstOut) rows.push(h('div', { class: 'cal-map-leg', 'data-leg': '' }));
    g.items.forEach((entry, i) => {
      const { item } = entry;
      n++;
      rows.push(
        h(
          'button',
          {
            type: 'button',
            class: 'cal-map-row',
            onclick: () => {
              if (entry.marker) {
                lmap?.setView(entry.marker.getLatLng(), Math.max(lmap.getZoom(), 15));
                entry.marker.openPopup();
              }
            },
          },
          h(
            'span',
            { class: 'cal-pin cal-pin--inline', 'data-cat': item.color, 'aria-hidden': 'true' },
            String(n),
          ),
          h(
            'span',
            { class: 'cal-map-row-text' },
            h('b', null, item.title),
            h(
              'span',
              null,
              `${timeOf(item.start)}–${timeOf(item.end)} · ${item.record.place_name ?? ''}`,
            ),
          ),
        ),
      );
      const leg = legs.find((l) => l.kind === 'between' && l.fromItem === item);
      if (leg) rows.push(h('div', { class: 'cal-map-leg', 'data-leg': '' }));
      if (i === g.items.length - 1 && home)
        rows.push(h('div', { class: 'cal-map-leg', 'data-leg': '' }));
    });
  }
  if (allDay.length)
    rows.push(
      h('h3', { class: 'cal-map-day' }, t('map.noTime')),
      ...allDay.map((item) =>
        h(
          'button',
          { type: 'button', class: 'cal-map-row', onclick: () => ctx.openDetail(item) },
          h(
            'span',
            {
              class: 'cal-pin cal-pin--inline is-faded',
              'data-cat': item.color,
              'aria-hidden': 'true',
            },
            '•',
          ),
          h(
            'span',
            { class: 'cal-map-row-text' },
            h('b', null, item.title),
            h('span', null, item.record.place_name ?? ''),
          ),
        ),
      ),
    );
  if (unlocated.length)
    rows.push(
      h('p', { class: 'mn-note cal-map-missing' }, t('map.unlocated', { n: unlocated.length })),
    );
  if (!groups.length && !allDay.length && !unlocated.length)
    rows.push(h('p', { class: 'mn-note' }, t('map.noPlaces')));
  list.replaceChildren(...rows);
}

// ---------- the start point ----------
function openHome() {
  const { h, t } = ctx;
  const input = h('input', {
    type: 'text',
    autocomplete: 'street-address',
    maxlength: 200,
    placeholder: t('map.homePlaceholder'),
    value: prefs().home?.label ?? '',
    'aria-label': t('map.homeLabel'),
  });
  const results = h('div', { class: 'cal-results', 'aria-live': 'polite' });
  const find = async () => {
    const q = input.value.trim();
    if (q.length < 3) return;
    results.textContent = t('map.searching');
    try {
      const found = await geocode(q);
      results.replaceChildren(
        found.length
          ? h(
              'div',
              { class: 'mn-list' },
              found.map((m) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'mn-btn mn-btn--block',
                    onclick: () => {
                      window.mnui.sheet.close();
                      choose({
                        home: {
                          lat: m.lat,
                          lon: m.lon,
                          label: m.label.split(',').slice(0, 3).join(','),
                        },
                      });
                    },
                  },
                  m.label,
                ),
              ),
            )
          : h('p', { class: 'mn-note' }, t('map.homeNone')),
      );
    } catch {
      results.textContent = t('map.homeOffline');
    }
  };
  const form = h(
    'form',
    {
      class: 'cal-form',
      onsubmit: (e) => {
        e.preventDefault();
        void find();
      },
    },
    h('p', { class: 'mn-note' }, t('map.homeHint')),
    input,
    h(
      'div',
      { class: 'cal-form-actions' },
      h('button', { type: 'submit', class: 'mn-btn mn-btn--primary' }, t('map.homeSearch')),
      prefs().home
        ? h(
            'button',
            {
              type: 'button',
              class: 'mn-btn',
              onclick: () => {
                window.mnui.sheet.close();
                choose({ home: null });
              },
            },
            t('map.homeRemove'),
          )
        : null,
    ),
    results,
  );
  window.mnui.sheet.open(form, { label: t('map.homeTitle') });
}

export { placeKey };
