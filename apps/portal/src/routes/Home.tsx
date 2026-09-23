import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import { AppsIcon, PinIcon, ScreenIcon, SharedIcon, UserIcon } from '../components/icons.tsx';
import { RemoteCard } from '../components/RemoteCard.tsx';
import { TopBar } from '../components/TopBar.tsx';
import {
  type AppRow,
  appUrl,
  listApps,
  monogram,
  pinnedApps,
  type RemoteStatus,
  remoteStatus,
  savePinned,
  tintFor,
} from '../lib/apps.ts';

type Filter = 'all' | 'pinned' | 'shared';

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Hallo';
  return 'Guten Abend';
}

export function Home() {
  const { profile } = useAuth();
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [remote, setRemote] = useState<RemoteStatus[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [pins, setPins] = useState(pinnedApps);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [appRows, statuses] = await Promise.all([listApps(), remoteStatus()]);
      setApps(appRows);
      setRemote(statuses);
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

  const visible = webApps.filter((app) => {
    if (filter === 'pinned' && !pins.has(app.slug)) return false;
    if (filter === 'shared' && app.data_mode !== 'shared-account') return false;
    const q = query.trim().toLowerCase();
    return (
      !q ||
      app.name.toLowerCase().includes(q) ||
      app.slug.includes(q) ||
      app.description.toLowerCase().includes(q)
    );
  });

  const togglePin = (slug: string) => {
    const next = new Set(pins);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    savePinned(next);
    setPins(next);
  };

  const down = webApps.filter((app) => app.status === 'down' || app.status === 'degraded');
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const chips: [Filter, string, number][] = [
    ['all', 'Alle', webApps.length],
    ['pinned', 'Angeheftet', webApps.filter((app) => pins.has(app.slug)).length],
    ['shared', 'Geteilt', webApps.filter((app) => app.data_mode === 'shared-account').length],
  ];

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
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {chips.map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <span className="count">{count}</span>
                </button>
              ))}
            </div>

            {apps && visible.length === 0 && (
              <p className="empty">
                {webApps.length === 0
                  ? 'Für dich sind noch keine Apps freigegeben.'
                  : filter === 'pinned'
                    ? 'Hefte Apps mit der Nadel an, um sie hier zu sammeln.'
                    : 'Keine App passt zur Suche.'}
              </p>
            )}

            <div className="tiles">
              {visible.map((app) => (
                <div key={app.slug} style={{ position: 'relative' }}>
                  <a className="tile" href={appUrl(app.slug)}>
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
                        <span className="mono">{app.slug}.mininode.app</span>
                      </div>
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
                    className="pin"
                    style={{ position: 'absolute', right: 8, bottom: 8 }}
                    aria-pressed={pins.has(app.slug)}
                    aria-label={pins.has(app.slug) ? `${app.name} lösen` : `${app.name} anheften`}
                    onClick={() => togglePin(app.slug)}
                  >
                    <PinIcon />
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
        <a href="/" aria-current="page">
          <AppsIcon />
          Apps
        </a>
        <a href="#remote">
          <ScreenIcon />
          Remote
        </a>
        <a href="/account">
          <UserIcon />
          Profil
        </a>
      </nav>
    </>
  );
}
