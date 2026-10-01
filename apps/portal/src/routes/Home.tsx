import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { AppDrawersDialog, DrawerContentDialog, NameDialog } from '../components/DrawerDialogs.tsx';
import {
  AppsIcon,
  DrawerIcon,
  ExternalIcon,
  GamepadIcon,
  ScreenIcon,
  ServerIcon,
  SharedIcon,
  StarIcon,
  UserIcon,
} from '../components/icons.tsx';
import { RemoteCard } from '../components/RemoteCard.tsx';
import { ReorderGrid } from '../components/ReorderGrid.tsx';
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
import { applyOrder, scopeOf } from '../lib/arrange.ts';
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
import { useArrangement } from '../lib/useArrangement.ts';

/** `all`, `favorites`, `shared`, `cat:<category id>` or `drawer:<drawer id>`. */
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
  const arrange = useArrangement('apps');
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: 'new' }
    | { kind: 'rename'; id: string }
    | { kind: 'fill'; id: string }
    | { kind: 'app'; slug: string }
    | null
  >(null);

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

  const onlineApps = useMemo(
    () => (apps ?? []).filter((app) => app.kind !== 'remote' && app.status !== 'disabled'),
    [apps],
  );
  // Games live in the Gaming Hub only, never among the apps on the start page.
  const webApps = useMemo(() => onlineApps.filter((app) => !app.game_genre), [onlineApps]);
  const remoteApps = useMemo(
    () => (apps ?? []).filter((app) => app.kind === 'remote' && app.status !== 'disabled'),
    [apps],
  );
  const bySlug = useMemo(() => new Map(webApps.map((app) => [app.slug, app])), [webApps]);
  const gameCount = onlineApps.length - webApps.length;

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
    if (id.startsWith('drawer:'))
      return arrange.drawers.find((d) => d.id === id.slice(7))?.apps.includes(app.slug) ?? false;
    return true;
  };
  const filtered = webApps.filter((app) => inFilter(app, filter) && matchesQuery(app));
  // "Eigene Reihenfolge": what the person arranged for this screen, the rest by name behind it.
  const visible =
    sort === 'custom'
      ? applyOrder(sortApps(filtered, 'name', usage), arrange.orders.get(scopeOf.view(filter)))
      : sortApps(filtered, sort, usage);
  const drawer = filter.startsWith('drawer:')
    ? (arrange.drawers.find((d) => d.id === filter.slice(7)) ?? null)
    : null;

  const changeSort = (next: Sort) => {
    setSort(next);
    if (next !== 'custom') setEditing(false);
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

  const down = onlineApps.filter((app) => app.status === 'down' || app.status === 'degraded');
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
    ...arrange.drawers.map((d): [Filter, string, number] => [
      `drawer:${d.id}`,
      d.name,
      count(`drawer:${d.id}`),
    ]),
  ];
  // A category that vanished after a reload (deleted, or no apps left) falls back to "Alle".
  useEffect(() => {
    if (
      (filter.startsWith('cat:') || filter.startsWith('drawer:')) &&
      apps &&
      !chips.some(([id]) => id === filter)
    )
      setFilter('all');
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
          <Link to="/games" className="button hub-link">
            <GamepadIcon />
            Gaming Hub
            {gameCount > 0 && (
              <span className="count">
                {gameCount}
                <span className="sr-only"> {gameCount === 1 ? 'Spiel' : 'Spiele'}</span>
              </span>
            )}
          </Link>
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
                <button
                  type="button"
                  className="chip add"
                  onClick={() => setDialog({ kind: 'new' })}
                >
                  + Schublade
                </button>
              </fieldset>
              {sort === 'custom' && visible.length > 1 && (
                <button
                  type="button"
                  className="button small"
                  aria-pressed={editing}
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? 'Fertig' : 'Anordnen'}
                </button>
              )}
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

            {drawer && (
              <div className="drawer-bar">
                <DrawerIcon />
                <strong>{drawer.name}</strong>
                <span className="spacer" />
                <button
                  type="button"
                  className="button small"
                  onClick={() => setDialog({ kind: 'fill', id: drawer.id })}
                >
                  Apps wählen
                </button>
                <button
                  type="button"
                  className="button small"
                  onClick={() => setDialog({ kind: 'rename', id: drawer.id })}
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  className="button small danger"
                  onClick={() => {
                    if (confirm(`Schublade „${drawer.name}“ löschen? Die Apps bleiben erhalten.`))
                      void arrange.remove(drawer.id);
                  }}
                >
                  Löschen
                </button>
              </div>
            )}
            {arrange.error && (
              <p className="error" role="alert">
                {arrange.error}
              </p>
            )}

            {apps && visible.length === 0 && (
              <p className="empty">
                {webApps.length === 0
                  ? gameCount > 0
                    ? 'Für dich sind noch keine Apps freigegeben. Deine Spiele findest du im Gaming Hub.'
                    : 'Für dich sind noch keine Apps freigegeben.'
                  : filter === 'favorites'
                    ? 'Markiere Apps mit dem Stern, um sie hier zu sammeln.'
                    : drawer
                      ? 'Diese Schublade ist noch leer. Wähle oben „Apps wählen“.'
                      : 'Keine App passt zur Suche.'}
              </p>
            )}

            <ReorderGrid
              items={visible}
              editing={editing}
              label={(app) => app.name}
              onReorder={(slugs) => void arrange.reorder(scopeOf.view(filter), slugs)}
              render={(app) => (
                <div style={{ position: 'relative' }}>
                  <a
                    className="tile"
                    href={tileUrl(app)}
                    target={target(app)}
                    rel={rel(app)}
                    onClick={(event) => {
                      if (editing) event.preventDefault();
                      else recordOpen(app.slug);
                    }}
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
                  <button
                    type="button"
                    className="pin"
                    style={{ position: 'absolute', right: 48, bottom: 4 }}
                    aria-label={`${app.name} in Schubladen`}
                    onClick={() => setDialog({ kind: 'app', slug: app.slug })}
                  >
                    <DrawerIcon />
                  </button>
                </div>
              )}
            />
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

      <NameDialog
        open={dialog?.kind === 'new'}
        title="Neue Schublade"
        confirm="Anlegen"
        onClose={() => setDialog(null)}
        onSubmit={(name) => {
          setDialog(null);
          void arrange.create(name).then((created) => {
            if (created) setFilter(`drawer:${created.id}`);
          });
        }}
      />
      <NameDialog
        open={dialog?.kind === 'rename'}
        title="Schublade umbenennen"
        confirm="Speichern"
        initial={arrange.drawers.find((d) => dialog?.kind === 'rename' && d.id === dialog.id)?.name}
        onClose={() => setDialog(null)}
        onSubmit={(name) => {
          if (dialog?.kind === 'rename') void arrange.rename(dialog.id, name);
          setDialog(null);
        }}
      />
      <DrawerContentDialog
        open={dialog?.kind === 'fill'}
        drawer={arrange.drawers.find((d) => dialog?.kind === 'fill' && d.id === dialog.id) ?? null}
        options={webApps.map((a) => ({ slug: a.slug, name: a.name }))}
        onClose={() => setDialog(null)}
        onSave={(slugs) => {
          const target = arrange.drawers.find((d) => dialog?.kind === 'fill' && d.id === dialog.id);
          if (target) void arrange.setApps(target, slugs);
          setDialog(null);
        }}
      />
      <AppDrawersDialog
        open={dialog?.kind === 'app'}
        slug={dialog?.kind === 'app' ? dialog.slug : ''}
        appName={(dialog?.kind === 'app' && bySlug.get(dialog.slug)?.name) || 'App'}
        drawers={arrange.drawers}
        onClose={() => setDialog(null)}
        onToggle={(target, member) =>
          dialog?.kind === 'app' &&
          void arrange.setApps(
            target,
            member
              ? [...target.apps, dialog.slug]
              : target.apps.filter((slug) => slug !== dialog.slug),
          )
        }
        onCreate={(name) => {
          if (dialog?.kind !== 'app') return;
          const slug = dialog.slug;
          void arrange.create(name).then((created) => {
            if (created) void arrange.setApps(created, [slug]);
          });
        }}
      />

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
        <Link to="/games">
          <GamepadIcon />
          Spiele
        </Link>
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
