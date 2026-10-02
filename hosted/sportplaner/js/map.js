// Karte: every activity with a checked address as a pin (Leaflet from /vendor, OpenStreetMap
// tiles), and the address check (OpenStreetMap Nominatim through the platform proxy).
// Loaded in order by index.html; all files share one global scope.

/* ---------- address check ---------- */
const validGeo = (g) =>
  !!g &&
  Number.isFinite(g.lat) &&
  Number.isFinite(g.lon) &&
  Math.abs(g.lat) <= 90 &&
  Math.abs(g.lon) <= 180;
/* the checked point belongs to exactly this address text */
const geoFits = (a) => validGeo(a.geo) && a.geo.q === (a.address || '').trim();

/* Nominatim allows one request per second: calls queue up, and answers are kept per query. */
let geoQueue = Promise.resolve();
let geoLast = 0;
const geoCache = new Map();
/** Up to five matches for an address, best first. Throws when the service is unreachable. */
function geocode(q) {
  const key = `${window.mnI18n.lang}:${q.trim().toLowerCase()}`;
  if (geoCache.has(key)) return Promise.resolve(geoCache.get(key));
  const run = geoQueue.then(async () => {
    const wait = geoLast + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    geoLast = Date.now();
    const found = await geocodeNow(q);
    geoCache.set(key, found);
    return found;
  });
  geoQueue = run.catch(() => undefined);
  return run;
}
async function geocodeNow(q) {
  const mn = await ready;
  const rows = await mn
    .api('nominatim')
    .json(
      `/search?format=jsonv2&limit=5&accept-language=${window.mnI18n.lang}&q=${encodeURIComponent(q.trim())}`,
    );
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ lat: +r.lat, lon: +r.lon, label: String(r.display_name || '').slice(0, 200) }))
    .filter(validGeo);
}

/* the editor's status line under "Adresse" */
function renderGeo(matches) {
  const el = $('#geobox');
  if (!el || !draft) return;
  const addr = String($('[name=address]')?.value || '').trim();
  if (!addr) {
    el.innerHTML = `<p class="hint flat">${esc(tr('geo.withAddress'))}</p>`;
    return;
  }
  if (matches && matches.length > 1) {
    el.innerHTML = `<p class="hint flat">${esc(tr('geo.several'))}</p><div class="geo-picks">${matches
      .map(
        (m, i) =>
          `<button type="button" class="btn geo-pick" data-action="geo-pick" data-i="${i}">${esc(m.label)}</button>`,
      )
      .join('')}</div>`;
    return;
  }
  el.innerHTML =
    draft.geo && draft.geo.q === addr
      ? `<p class="geo-ok">${ICON.check}<span>${esc(tr('geo.found', { label: draft.geo.label }))}</span></p>`
      : `<p class="hint flat">${esc(tr('geo.checkOnSave'))}</p><button type="button" class="btn" data-action="geo-check">${esc(tr('geo.checkNow'))}</button>`;
}
let geoMatches = [];
/** Checks the address in the editor. Returns null when it fits, otherwise the problem. */
async function checkDraftAddress() {
  const addr = String($('[name=address]')?.value || '').trim();
  if (!addr) {
    draft.geo = null;
    return null;
  }
  if (draft.geo && draft.geo.q === addr) return null;
  let found;
  try {
    found = await geocode(addr);
  } catch {
    return 'offline';
  }
  geoMatches = found;
  if (!found.length) {
    renderGeo();
    return tr('geo.notFound');
  }
  if (found.length > 1 && !sameSpot(found)) {
    renderGeo(found);
    return tr('geo.ambiguous');
  }
  draft.geo = { ...found[0], q: addr };
  renderGeo();
  return null;
}
/* several hits within ~150 m are one place (e.g. the street and the building) */
const sameSpot = (list) =>
  list.every(
    (m) => Math.abs(m.lat - list[0].lat) < 0.0015 && Math.abs(m.lon - list[0].lon) < 0.002,
  );

document.addEventListener('input', (e) => {
  if (draft && e.target.name === 'address') renderGeo();
});
Object.assign(H, {
  'geo-check': async (t) => {
    t.disabled = true;
    t.textContent = tr('geo.checking');
    const problem = await checkDraftAddress();
    if (problem === 'offline') {
      toast(tr('geo.offlineNow'));
      renderGeo();
    } else if (problem) {
      const err = $('#err');
      err.textContent = problem;
      err.hidden = false;
    } else $('#err').hidden = true;
  },
  'geo-pick': (t) => {
    const m = geoMatches[+t.dataset.i];
    if (!m) return;
    draft.geo = { ...m, q: String($('[name=address]').value).trim() };
    $('#err').hidden = true;
    renderGeo();
  },
});

/* ---------- map view ---------- */
S.mapFilter = 'all';
let leafletLoad = null,
  lmap = null,
  lmapEl = null,
  lmarkers = new Map(),
  lfitted = false;
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

SKELETON_EXTRA.push(() => ({
  map: `<div class="map-layout"><div class="card map-card"><div id="map" class="map" role="region" aria-label="${esc(tr('map.region'))}"></div></div><div><div class="seg map-seg" id="mapseg" role="group" aria-label="${esc(tr('map.filterLabel'))}"></div><div id="maplist"></div><div id="mapmissing"></div></div></div>`,
}));

const mapFilters = () => [
  ['all', tr('map.filterAll')],
  ['today', tr('map.filterToday')],
  ['planned', tr('map.filterPlanned')],
];
function mapActs() {
  const td = todayStr(),
    today = new Set(onDate(td).map((e) => e.a.id));
  return S.acts
    .filter(geoFits)
    .filter((a) =>
      S.mapFilter === 'today' ? today.has(a.id) : S.mapFilter === 'planned' ? hasPlan(a) : true,
    )
    .sort((x, y) => x.name.localeCompare(y.name, loc()));
}
function nextLabel(a) {
  const n = nextMap().get(a.id);
  if (!n) return tr('map.noDates');
  const when =
    n.i === 0
      ? tr('agenda.today')
      : n.i === 1
        ? tr('agenda.tomorrow')
        : fmt(parse(n.ds), { weekday: 'short', day: 'numeric', month: 'short' });
  return `${when}${n.s?.start ? `, ${timeLabel(n.s)}` : ''}`;
}
function popupHTML(a) {
  return `<div class="map-pop"><b>${esc(a.name)}</b>${a.category ? `<span>${esc(a.category)}</span>` : ''}<span>${esc(a.address)}</span><span>${esc(nextLabel(a))}</span><button type="button" class="btn" data-action="open" data-id="${esc(a.id)}">${esc(tr('map.details'))}</button></div>`;
}
function updMap() {
  const list = mapActs(),
    missing = S.acts.filter((a) => (a.address || '').trim() && !geoFits(a));
  setHeader(tr('map.title'), tr('map.subtitle', { n: list.length }));
  setHTML(
    $('#mapseg'),
    mapFilters()
      .map(
        ([k, l]) =>
          `<button type="button" class="${S.mapFilter === k ? 'on' : ''}" data-action="mapfilter" data-f="${k}" aria-pressed="${S.mapFilter === k}">${esc(l)}</button>`,
      )
      .join(''),
  );
  listOrEmpty(
    $('#maplist'),
    'list-card',
    list.map((a) => ({
      key: a.id,
      html: rowHTML(a, {
        below: `<p>${esc(a.address)}</p>`,
        side: `<span class="next map-go"><b>${esc(tr('map.show'))}</b></span>`,
      }).replace('data-action="open"', 'data-action="map-focus"'),
    })),
    `<p class="note">${esc(tr(S.acts.some(geoFits) ? 'map.emptyFilter' : 'map.emptyNone'))}</p>`,
  );
  setHTML(
    $('#mapmissing'),
    missing.length
      ? `<div class="card pad map-missing"><p>${esc(tr('map.missing', { n: missing.length }))}</p><button type="button" class="btn" data-action="geo-fill">${esc(tr('map.checkAddresses'))}</button></div>`
      : '',
  );
  loadLeaflet().then(
    () => drawMap(list),
    () => setHTML($('#map'), `<p class="note map-fail">${esc(tr('map.loadFailed'))}</p>`),
  );
}
UPD.map = updMap;

function drawMap(list) {
  const el = $('#map');
  if (!el || S.view !== 'map') return;
  const L = window.L;
  if (!lmap || lmapEl !== el) {
    if (lmap) lmap.remove();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lmap = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    }).setView([48.137, 11.575], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(lmap);
    lmapEl = el;
    lmarkers = new Map();
    lfitted = false;
  }
  const keep = new Set(list.map((a) => a.id));
  for (const [id, m] of lmarkers)
    if (!keep.has(id)) {
      m.remove();
      lmarkers.delete(id);
    }
  for (const a of list) {
    const icon = L.divIcon({
      className: 'pin',
      html: `<span class="pin-shape" aria-hidden="true"><span>${esc(initials(a.name))}</span></span><span class="sr-only">${esc(a.name)}</span>`,
      iconSize: [44, 44],
      iconAnchor: [22, 44],
      popupAnchor: [0, -40],
    });
    let m = lmarkers.get(a.id);
    if (!m) {
      m = L.marker([a.geo.lat, a.geo.lon], { icon, title: a.name, alt: a.name, keyboard: true });
      m.addTo(lmap);
      lmarkers.set(a.id, m);
    } else {
      m.setLatLng([a.geo.lat, a.geo.lon]);
      m.setIcon(icon);
    }
    m.bindPopup(popupHTML(a));
  }
  if (!lfitted && list.length) {
    lmap.fitBounds(L.latLngBounds(list.map((a) => [a.geo.lat, a.geo.lon])), {
      padding: [40, 40],
      maxZoom: 15,
    });
    lfitted = true;
  }
  lmap.invalidateSize();
}

Object.assign(H, {
  mapfilter: (t) => {
    S.mapFilter = t.dataset.f;
    lfitted = false;
    render();
  },
  'map-focus': (t) => {
    const m = lmarkers.get(t.dataset.id);
    if (!m || !lmap) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lmap.setView(m.getLatLng(), Math.max(lmap.getZoom(), 15), { animate: !reduce });
    m.openPopup();
    $('#map').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  },
  'map-show': (t) => {
    const id = t.dataset.id;
    closeSheet();
    S.view = 'map';
    S.mapFilter = 'all';
    render();
    loadLeaflet().then(
      () => {
        drawMap(mapActs());
        H['map-focus']({ dataset: { id } });
      },
      () => toast(tr('map.loadFailedToast')),
    );
  },
  /* checks the addresses of older entries, one per second (the service's usage policy) */
  'geo-fill': async (t) => {
    const todo = S.acts.filter((a) => (a.address || '').trim() && !geoFits(a));
    t.disabled = true;
    let ok = 0;
    const failed = [];
    for (const [i, a] of todo.entries()) {
      t.textContent = tr('geo.progress', { i: i + 1, n: todo.length });
      try {
        const found = await geocode(a.address);
        const hit = found.length && sameSpot(found) ? found[0] : null;
        if (!hit) {
          failed.push(a.name);
          continue;
        }
        const cur = S.acts.find((x) => x.id === a.id) || a;
        await persist({ ...cur, geo: { ...hit, q: a.address.trim() } });
        ok++;
      } catch {
        toast(tr('geo.fillOffline'));
        break;
      }
    }
    lfitted = false;
    if (failed.length) toast(tr('geo.fillFailed', { ok, names: failed.join(', ') }));
    else if (ok) toast(tr('geo.fillDone', { n: ok }));
    render();
  },
});
