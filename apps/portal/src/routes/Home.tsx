import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  AppsIcon,
  ExternalIcon,
  ScreenIcon,
  ServerIcon,
  SharedIcon,
  StarIcon,
  UserIcon,
} from '../components/icons.tsx';
import { RemoteCard } from '../components/RemoteCard.tsx';
import { TopBar } from '../components/TopBar.tsx';
import {
  type AppRow,
  listApps,
  monogram,
  type RemoteStatus,
  remoteStatus,
  tileUrl,
  tintFor,
} from '../lib/apps.ts';
import {
  type AppSet,
  type Category,
  listCategories,
  listFavorites,
  listSets,
  listUsage,
  recordOpen,
  SORT_LABEL,
  type Sort,
  setFavorite,
  sortApps,
} from '../lib/catalog.ts';

/** `all`, `favorites`, `shared` or `cat:<category id>`. */
type Filter = string;

const SORT_KEY = 'mn-sort';
function storedSort(): Sort {
  try {
    const value = localStorage.getItem(SORT_KEY);
    return value && value in SORT_LABEL ? (value as Sort) : 'name';
  } catch {
    return 'name';
  }
}

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Hallo';
  return 'Guten Abend';
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function Home() {
  const { profile } = useAuth();
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [remote, setRemote] = useState<RemoteStatus[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sets, setSets] = useState<AppSet[]>([]);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>(storedSort);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Remote status needs the network; the app list falls back to the last one offline.
      const [appRows, statuses] = await Promise.all([listApps(), remoteStatus().catch(() => [])]);
      setApps(appRows);
      setRemote(statuses);
      // The catalog is a convenience: without it the start page still lists every app.
      const [cats, curated, used, favs] = await Promise.all([
        listCategories().catch(() => []),
        listSets().catch(() => []),
        listUsage().catch(() => []),
        listFavorites(new Set(appRows.map((app) => app.slug))).catch(() => new Set<string>()),
      ]);
      setCategories(cats);
      setSets(curated);
      setUsage(new Map(used.map((row) => [row.app_slug, row.opens])));
      setFavorites(favs);
    } catch {
      setError('Die Apps konnten nicht geladen werden.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const webApps = useMemo(
    () => (apps ?? []).filter((app) => app.kind !== 'remote' && app.status !== 'disabled'),
    [apps],
  );
  const remoteApps = useMemo(
    () => (apps ?? []).filter((app) => app.kind === 'remote' && app.status !== 'disabled'),
    [apps],
  );
  const bySlug = useMemo(() => new Map(webApps.map((app) => [app.slug, app])), [webApps]);

  const matchesQuery = (app: AppRow) => {
    const q = query.trim().toLowerCase();
    return (
      !q ||
      app.name.toLowerCase().includes(q) ||
      app.slug.includes(q) ||
      app.description.toLowerCase().includes(q)
    );
  };
  const inFilter = (app: AppRow, id: Filter) => {
    if (id === 'favorites') return favorites.has(app.slug);
    if (id === 'shared') return app.data_mode === 'shared-account';
    if (id.startsWith('cat:')) return app.category_id === id.slice(4);
    return true;
  };
  const visible = sortApps(
    webApps.filter((app) => inFilter(app, filter) && matchesQuery(app)),
    sort,
    usage,
  );

  const changeSort = (next: Sort) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // Remembering the order is a convenience.
    }
  };

  const toggleFavorite = async (slug: string) => {
    const next = !favorites.has(slug);
    const updated = new Set(favorites);
    if (next) updated.add(slug);
    else updated.delete(slug);
    setFavorites(updated);
    try {
      await setFavorite(slug, next);
    } catch {
      // Undo only this app: another toggle may have happened meanwhile.
      setFavorites((current) => {
        const undone = new Set(current);
        if (next) undone.delete(slug);
        else undone.add(slug);
        return undone;
      });
      setError('Favorit konnte nicht gespeichert werden.');
    }
  };

  const down = webApps.filter((app) => app.status === 'down' || app.status === 'degraded');
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const count = (id: Filter) => webApps.filter((app) => inFilter(app, id)).length;
  const chips: [Filter, string, number][] = [
    ['all', 'Alle', webApps.length],
    ['favorites', 'Favoriten', count('favorites')],
    ...(count('shared') > 0
      ? [['shared', 'Geteilt', count('shared')] as [Filter, string, number]]
      : []),
    ...categories
      .map((cat): [Filter, string, number] => [`cat:${cat.id}`, cat.name, count(`cat:${cat.id}`)])
      .filter(([, , n]) => n > 0),
  ];
  // A category that vanished after a reload (deleted, or no apps left) falls back to "Alle".
  useEffect(() => {
    if (filter.startsWith('cat:') && apps && !chips.some(([id]) => id === filter)) setFilter('all');
  });
  const curated = sets
    .map((set) => ({ ...set, members: set.apps.flatMap((slug) => bySlug.get(slug) ?? []) }))
    .filter((set) => set.members.length > 0);
  const showSets = filter === 'all' && !query.trim() && curated.length > 0;

  // Link tiles open the external website in a new tab.
  const target = (app: AppRow) => (app.link_url ? '_blank' : undefined);
  const rel = (app: AppRow) => (app.link_url ? 'noopener noreferrer' : undefined);

  return (
    <>
      <TopBar search={query} onSearch={setQuery} />
      <main className="page">
        <div className="hero">
          <div className="stack" style={{ gap: 10 }}>
            <span className="muted">{today}</span>
            <h1>
              {greeting()}, {profile?.displayName ?? ''}.
            </h1>
          </div>
          {apps && (
            <div className="status-pill" role="status">
              <span className="dot" style={{ color: down.length ? 'var(--warn)' : 'var(--ok)' }} />
              {down.length
                ? `${down.length} App${down.length > 1 ? 's' : ''} gestört`
                : 'Alle Apps erreichbar'}
            </div>
          )}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="home-grid">
          <section aria-label="Apps" className="stack" style={{ gap: 20 }}>
            {showSets && (
              <section aria-labelledby="sets-title" className="stack" style={{ gap: 12 }}>
                <h2 id="sets-title" className="section-title">
                  Pakete
                </h2>
                <div className="sets">
                  {curated.map((set) => (
                    <section key={set.id} className="set-card" aria-label={set.name}>
                      <h3>{set.name}</h3>
                      {set.description && <p className="muted">{set.description}</p>}
                      <ul className="set-apps">
                        {set.members.map((app) => (
                          <li key={app.slug}>
                            <a
                              href={tileUrl(app)}
                              target={target(app)}
                              rel={rel(app)}
                              onClick={() => recordOpen(app.slug)}
                            >
                              <span
                                className="monogram small"
                                style={{ background: tintFor(app.slug) }}
                                aria-hidden="true"
                              >
                                {monogram(app.name)}
                              </span>
                              {app.name}
                              {app.link_url && (
                                <>
                                  <ExternalIcon />
                                  <span className="sr-only"> (öffnet in neuem Tab)</span>
                                </>
                              )}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </section>
            )}

            <div className="filter-bar">
              <fieldset className="chip-scroll">
                <legend className="sr-only">Filter</legend>
                {chips.map(([id, label, n]) => (
                  <button
                    key={id}
                    type="button"
                    className="chip"
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                    <span className="count">{n}</span>
                  </button>
                ))}
              </fieldset>
              <label className="sort-select">
                <span className="sr-only">Sortieren</span>
                <select value={sort} onChange={(event) => changeSort(event.target.value as Sort)}>
                  {(Object.keys(SORT_LABEL) as Sort[]).map((key) => (
                    <option key={key} value={key}>
                      {SORT_LABEL[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {apps && visible.length === 0 && (
              <p className="empty">
                {webApps.length === 0
                  ? 'Für dich sind noch keine Apps freigegeben.'
                  : filter === 'favorites'
                    ? 'Markiere Apps mit dem Stern, um sie hier zu sammeln.'
                    : 'Keine App passt zur Suche.'}
              </p>
            )}

            <div className="tiles">
              {visible.map((app) => (
                <div key={app.slug} style={{ position: 'relative' }}>
                  <a
                    className="tile"
                    href={tileUrl(app)}
                    target={target(app)}
                    rel={rel(app)}
                    onClick={() => recordOpen(app.slug)}
                  >
                    <div className="tile-head">
                      <div
                        className="monogram"
                        style={{ background: tintFor(app.slug) }}
                        aria-hidden="true"
                      >
                        {monogram(app.name)}
                      </div>
                      <div className="tile-title">
                        <strong>{app.name}</strong>
                        <span className="mono">
                          {app.link_url ? hostOf(app.link_url) : `${app.slug}.mininode.app`}
                        </span>
                      </div>
                      {app.link_url && (
                        <span className="pill" title="Externe Website, öffnet in neuem Tab">
                          <ExternalIcon size={12} />
                          <span className="pill-label">Link</span>
                          <span className="sr-only"> (öffnet in neuem Tab)</span>
                        </span>
                      )}
                      {app.data_mode === 'shared-account' && (
                        <span className="pill accent" title="Läuft mit geteiltem Account">
                          <SharedIcon />
                          <span className="pill-label">Geteilt</span>
                        </span>
                      )}
                    </div>
                    <p>{app.description}</p>
                  </a>
                  <button
                    type="button"
                    className="pin fav"
                    style={{ position: 'absolute', right: 4, bottom: 4 }}
                    aria-pressed={favorites.has(app.slug)}
                    aria-label={`${app.name} als Favorit`}
                    onClick={() => void toggleFavorite(app.slug)}
                  >
                    <StarIcon />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {remoteApps.length > 0 && (
            <aside id="remote" aria-label="Remote-Apps" className="stack">
              <div className="row" style={{ minHeight: 40 }}>
                <h2 className="section-title">Remote-Apps</h2>
                <span className="spacer" />
                <span className="muted" style={{ fontSize: 13 }}>
                  auf der NucBox
                </span>
              </div>
              {remoteApps.map((app) => (
                <RemoteCard
                  key={app.slug}
                  app={app}
                  runtime={app.remote_runtime ?? 'windows'}
                  status={remote.find((entry) => entry.app_slug === app.slug)}
                  onChange={load}
                />
              ))}
              <p className="muted" style={{ fontSize: 13 }}>
                Programme starten, wenn du dich verbindest, und schlafen danach wieder. Der erste
                Start dauert etwa 30 Sekunden.
              </p>
            </aside>
          )}
        </div>
      </main>

      <nav className="tabbar" aria-label="Hauptnavigation">
        <Link to="/" aria-current="page">
          <AppsIcon />
          Apps
        </Link>
        {remoteApps.length > 0 && (
          <a href="#remote">
            <ScreenIcon />
            Remote
          </a>
        )}
        {profile?.role === 'admin' && (
          <Link to="/admin">
            <ServerIcon />
            Verwaltung
          </Link>
        )}
        <Link to="/account">
          <UserIcon />
          Profil
        </Link>
      </nav>
    </>
  );
}
