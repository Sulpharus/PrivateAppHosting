import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import {
  directionsUrl,
  distanceM,
  kilometres,
  loadGeo,
  lookUp,
  type Point,
  pointOf,
  reasonOf,
  remember,
} from '../geo';
import { MiniNode } from '../mininode';
import type { Contact, Meetup, Person } from '../types';

// Where the people live: every address of a contact or person, as pins, as a heat map or grouped
// by town, and who lives near a place (the home, or the place of a meetup).

type Mode = 'pins' | 'heat' | 'towns';
type Layer = 'standard' | 'light' | 'dark' | 'topo';
interface Prefs {
  mode: Mode;
  layer: Layer | 'auto';
  heat: number;
  radiusKm: number;
  center: string; // 'home' or 'meetup:<id>'
  home: (Point & { label: string }) | null;
}
const DEFAULTS: Prefs = {
  mode: 'pins',
  layer: 'auto',
  heat: 25,
  radiusKm: 10,
  center: 'home',
  home: null,
};
const PREFS_KEY = 'aether_map_prefs';

const OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const CARTO = `${OSM} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`;
const TILES: Record<Layer, { url: string; attr: string; max: number }> = {
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
};

interface Entry {
  id: string;
  name: string;
  detail: string;
  address: string;
  group: string;
  point: Point;
}

interface Props {
  contacts: Contact[];
  people: Person[];
  meetups: Meetup[];
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Whether the app is in its dark theme (the class on <html>, which the toggle sets). */
function useDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const watch = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark')),
    );
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => watch.disconnect();
  }, []);
  return dark;
}

export default function MapView({ contacts, people, meetups }: Props) {
  const { t } = useTranslation();
  const dark = useDark();
  const tiles = useRef<L.Layer | null>(null);
  const fitted = useRef('');
  const pointOfId = useRef<Map<string, Point>>(new Map());
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [tick, setTick] = useState(0); // new points arrived
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [group, setGroup] = useState('all');
  const [homeText, setHomeText] = useState('');
  const [homeMessage, setHomeMessage] = useState('');
  const [problem, setProblem] = useState('');
  const mapEl = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.Layer[]>([]);
  const markers = useRef<Map<string, L.Marker>>(new Map());

  const choose = (patch: Partial<Prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      void MiniNode.db.setItem(PREFS_KEY, next).catch(() => undefined);
      return next;
    });

  // preferences and the known places
  useEffect(() => {
    let live = true;
    void Promise.all([MiniNode.db.getItem(PREFS_KEY), loadGeo()]).then(([stored]) => {
      if (!live) return;
      if (stored && typeof stored === 'object')
        setPrefs({ ...DEFAULTS, ...(stored as Partial<Prefs>) });
      setPrefsLoaded(true);
      setTick((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  // everyone with an address
  const sources = useMemo(
    () => [
      ...contacts
        .filter((c) => c.address?.trim())
        .map((c) => ({
          id: `c:${c.id}`,
          name: c.name,
          detail: [c.role, c.company].filter(Boolean).join(', '),
          address: c.address as string,
          group: c.category || c.tags[0] || '',
        })),
      ...people
        .filter((p) => p.address?.trim())
        .map((p) => ({
          id: `p:${p.id}`,
          name: p.name,
          detail: p.role ?? '',
          address: p.address as string,
          group: p.category || '',
        })),
    ],
    [contacts, people],
  );
  const places = useMemo(
    () =>
      [
        ...new Set([...meetups.map((m) => m.location ?? ''), ...sources.map((s) => s.address)]),
      ].filter(Boolean),
    [meetups, sources],
  );

  // look up the addresses that are not known yet, one per second
  useEffect(() => {
    if (!prefsLoaded) return;
    let stop = false;
    setProblem('');
    void lookUp(
      places,
      (done, total) => {
        if (stop) return;
        setProgress(done < total ? { done, total } : null);
        setTick((n) => n + 1);
      },
      () => stop,
    ).then((failure) => {
      if (!stop && failure) setProblem(t('map.lookupFailed', { reason: reasonOf(failure, t) }));
    });
    return () => {
      stop = true;
    };
  }, [places, prefsLoaded]);

  const located = useMemo(() => {
    void tick;
    const out: Entry[] = [];
    for (const s of sources) {
      const point = pointOf(s.address);
      if (point) out.push({ ...s, point });
    }
    return out;
  }, [sources, tick]);
  const groups = useMemo(
    () =>
      [...new Set<string>(located.map((e) => e.group).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [located],
  );
  const shown = useMemo(
    () => located.filter((e) => group === 'all' || e.group === group),
    [located, group],
  );
  const missing = sources.filter((s) => !pointOf(s.address)).length;

  const upcoming = useMemo(() => {
    void tick;
    const today = new Date().toISOString().slice(0, 10);
    return meetups
      .filter((m) => m.location && m.date >= today && pointOf(m.location))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 12);
  }, [meetups, tick]);

  const centerPoint: { point: Point; label: string } | null = useMemo(() => {
    if (prefs.center.startsWith('meetup:')) {
      const m = meetups.find((x) => x.id === prefs.center.slice(7));
      const point = m?.location ? pointOf(m.location) : null;
      if (m && point) return { point, label: m.location ?? '' };
    }
    return prefs.home ? { point: prefs.home, label: prefs.home.label } : null;
  }, [prefs.center, prefs.home, meetups, tick]);

  const near = useMemo(() => {
    if (!centerPoint) return [];
    return shown
      .map((e) => ({ e, d: distanceM(centerPoint.point, e.point) }))
      .filter(({ d }) => d <= prefs.radiusKm * 1000)
      .sort((a, b) => a.d - b.d);
  }, [centerPoint, shown, prefs.radiusKm]);

  const towns = useMemo(() => {
    const byTown = new Map<string, { n: number; lat: number; lon: number }>();
    for (const e of shown) {
      const name = e.point.city || t('map.townUnknown');
      const cur = byTown.get(name) ?? { n: 0, lat: 0, lon: 0 };
      byTown.set(name, { n: cur.n + 1, lat: cur.lat + e.point.lat, lon: cur.lon + e.point.lon });
    }
    return [...byTown.entries()]
      .map(([name, v]) => ({ name, n: v.n, lat: v.lat / v.n, lon: v.lon / v.n }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [shown, t]);

  // the map itself
  useEffect(() => {
    if (!mapEl.current) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const m = L.map(mapEl.current, {
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    }).setView([48.137, 11.575], 6);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layers.current = [];
      markers.current = new Map();
    };
  }, []);

  // the base map: its own effect, so a new point or a slider never reloads the tiles
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    tiles.current?.remove();
    const spec = TILES[prefs.layer === 'auto' ? (dark ? 'dark' : 'light') : prefs.layer];
    tiles.current = L.tileLayer(spec.url, {
      maxZoom: spec.max,
      attribution: spec.attr,
      subdomains: 'abcd',
    }).addTo(m);
    tiles.current.bringToBack?.();
  }, [prefs.layer, dark]);

  // pins or heat, the circle around the centre
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const layer of layers.current) layer.remove();
    layers.current = [];
    markers.current = new Map();
    pointOfId.current = new Map(shown.map((e) => [e.id, e.point]));
    const add = (layer: L.Layer) => {
      layer.addTo(m);
      layers.current.push(layer);
      return layer;
    };
    const bounds: [number, number][] = shown.map((e) => [e.point.lat, e.point.lon]);
    if (prefs.mode === 'heat') {
      add(
        L.heatLayer(
          shown.map((e) => [e.point.lat, e.point.lon, 1]),
          { radius: prefs.heat, blur: Math.round(prefs.heat * 0.7), maxZoom: 13, minOpacity: 0.35 },
        ),
      );
    } else {
      for (const e of shown) {
        const marker = L.marker([e.point.lat, e.point.lon], {
          icon: L.divIcon({
            className: 'aether-pin-wrap',
            html: `<span class="aether-pin" aria-hidden="true"><span>${escapeHtml(initials(e.name))}</span></span>`,
            iconSize: [44, 44],
            iconAnchor: [22, 40],
            popupAnchor: [0, -36],
          }),
          title: e.name,
          alt: e.name,
          keyboard: true,
        });
        marker.bindPopup(
          `<b>${escapeHtml(e.name)}</b>${e.detail ? `<br>${escapeHtml(e.detail)}` : ''}<br>${escapeHtml(e.address)}`,
        );
        add(marker);
        markers.current.set(e.id, marker);
      }
    }
    if (centerPoint) {
      add(
        L.circle([centerPoint.point.lat, centerPoint.point.lon], {
          radius: prefs.radiusKm * 1000,
          className: 'aether-radius',
        }),
      );
      bounds.push([centerPoint.point.lat, centerPoint.point.lon]);
    }
    // fit the view when what is shown changes (filter, mode, centre), not on every new point
    const key = `${prefs.mode}|${group}|${prefs.center}`;
    if (bounds.length && (fitted.current !== key || fitted.current === '')) {
      m.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 13, animate: false });
      fitted.current = key;
    }
    m.invalidateSize({ animate: false });
  }, [shown, prefs.mode, prefs.heat, prefs.radiusKm, prefs.center, group, centerPoint]);

  const focus = (id: string) => {
    if (!map.current) return;
    const marker = markers.current.get(id);
    const point = pointOfId.current.get(id);
    if (!point) return;
    map.current.setView([point.lat, point.lon], Math.max(map.current.getZoom(), 14));
    marker?.openPopup();
  };

  const findHome = async () => {
    const q = homeText.trim();
    if (q.length < 3) return;
    setHomeMessage(t('map.searching'));
    try {
      const [hit] = await MiniNode.geocode(q);
      if (!hit) {
        setHomeMessage(t('map.homeNone'));
        return;
      }
      const label = hit.label.split(',').slice(0, 3).join(',');
      remember(q, { lat: hit.lat, lon: hit.lon, city: hit.city, postcode: hit.postcode });
      choose({ home: { lat: hit.lat, lon: hit.lon, city: hit.city, label }, center: 'home' });
      setHomeMessage(t('map.homeFound', { place: label }));
    } catch (err) {
      setHomeMessage(`${t('map.homeOffline')} ${reasonOf(err, t)}`);
    }
  };

  const field =
    'bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3 py-2.5 text-xs text-on-surface min-h-11 focus-visible:outline-2 focus-visible:outline-primary';
  const seg = (active: boolean) =>
    `px-4 min-h-11 rounded-xl text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
      active
        ? 'bg-primary text-on-primary'
        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
    }`;

  return (
    <div className="animate-fade-in space-y-5">
      <header>
        <h2 className="font-serif text-2xl font-bold text-on-surface">{t('map.title')}</h2>
        <p className="font-serif text-sm text-on-surface-variant mt-1">
          {t('map.subtitle', { n: located.length, total: sources.length })}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1.5" role="group" aria-label={t('map.mode')}>
          {(['pins', 'heat', 'towns'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={prefs.mode === m}
              className={seg(prefs.mode === m)}
              onClick={() => choose({ mode: m })}
            >
              {t(`map.mode.${m}`)}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
          {t('map.layer')}
          <select
            className={field}
            value={prefs.layer}
            onChange={(e) => choose({ layer: e.target.value as Prefs['layer'] })}
          >
            <option value="auto">{t('map.layer.auto')}</option>
            <option value="standard">{t('map.layer.standard')}</option>
            <option value="light">{t('map.layer.light')}</option>
            <option value="dark">{t('map.layer.dark')}</option>
            <option value="topo">{t('map.layer.topo')}</option>
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
          {t('map.group')}
          <select className={field} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">{t('map.groupAll')}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {prefs.mode === 'heat' && (
          <label className="grid gap-1 text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
            {t('map.heatSize')}
            <input
              type="range"
              min={10}
              max={60}
              value={prefs.heat}
              onChange={(e) => choose({ heat: Number(e.target.value) })}
              className="min-h-11"
            />
          </label>
        )}
      </div>

      <p role="status" className="text-xs text-on-surface-variant min-h-5">
        {progress ? t('map.lookingUp', { i: progress.done, n: progress.total }) : ''}
        {!progress && !problem && missing > 0 ? t('map.missing', { n: missing }) : ''}
        {problem}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div
          ref={mapEl}
          role="region"
          aria-label={t('map.region')}
          className="h-[60vh] min-h-80 rounded-2xl border border-outline-variant/30 overflow-hidden bg-surface-container"
        />

        <aside className="space-y-4">
          {prefs.mode === 'towns' && (
            <section aria-label={t('map.townsTitle')} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                {t('map.townsTitle')}
              </h3>
              {towns.length === 0 && (
                <p className="text-xs text-on-surface-variant">{t('map.empty')}</p>
              )}
              <ul className="space-y-1.5">
                {towns.map((town) => (
                  <li key={town.name}>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 min-h-11 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-left text-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={() => map.current?.setView([town.lat, town.lon], 12)}
                    >
                      <span className="font-semibold text-on-surface truncate">{town.name}</span>
                      <span className="text-xs font-bold text-primary">{town.n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            aria-label={t('map.nearTitle')}
            className="space-y-3 rounded-2xl bg-surface-container-low p-4 border border-outline-variant/20"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              {t('map.nearTitle')}
            </h3>
            <label className="grid gap-1 text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
              {t('map.center')}
              <select
                className={`${field} w-full min-w-0`}
                value={prefs.center}
                onChange={(e) => choose({ center: e.target.value })}
              >
                <option value="home">{prefs.home ? prefs.home.label : t('map.centerHome')}</option>
                {upcoming.map((m) => (
                  <option key={m.id} value={`meetup:${m.id}`}>
                    {t('map.centerMeetup', { title: m.title, place: m.location ?? '' })}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className={`${field} flex-1 min-w-0 select-text`}
                value={homeText}
                maxLength={200}
                placeholder={t('map.homePlaceholder')}
                aria-label={t('map.homeLabel')}
                onChange={(e) => setHomeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void findHome();
                }}
              />
              <button type="button" className={seg(false)} onClick={() => void findHome()}>
                {t('map.homeSet')}
              </button>
            </div>
            <p role="status" className="text-xs text-on-surface-variant min-h-4">
              {homeMessage}
            </p>
            <label className="grid gap-1 text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
              {t('map.radius', { km: prefs.radiusKm })}
              <input
                type="range"
                min={1}
                max={100}
                value={prefs.radiusKm}
                onChange={(e) => choose({ radiusKm: Number(e.target.value) })}
                className="min-h-11"
              />
            </label>
            {!centerPoint && (
              <p className="text-xs text-on-surface-variant">{t('map.centerNone')}</p>
            )}
            {centerPoint && (
              <>
                <p className="text-xs font-semibold text-on-surface">
                  {t('map.nearCount', { n: near.length, place: centerPoint.label })}
                </p>
                <ul className="space-y-1.5">
                  {near.map(({ e, d }) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex-1 min-w-0 min-h-11 px-3 rounded-xl bg-surface-container-lowest hover:bg-surface-container-high text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                        onClick={() => focus(e.id)}
                      >
                        <span className="block text-sm font-semibold text-on-surface truncate">
                          {e.name}
                        </span>
                        <span className="block text-[11px] text-on-surface-variant truncate">
                          {t('map.away', { km: kilometres(d) })} · {e.address}
                        </span>
                      </button>
                      <a
                        className="text-xs font-semibold text-primary min-h-11 inline-flex items-center px-2 focus-visible:outline-2 focus-visible:outline-primary"
                        href={directionsUrl(centerPoint.point, e.point, 'car')}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('map.route')}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {located.length === 0 && (
            <p className="text-xs text-on-surface-variant">{t('map.emptyHint')}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
