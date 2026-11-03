import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useStepUp } from '../auth/StepUp.tsx';
import { ApiError, api } from '../lib/api.ts';
import { repoUrl } from '../lib/instance.ts';
import { type UpdatesView, updateLabel } from '../lib/updates.ts';

// Verwaltung → Updates (ADR 0028). The platform and every app with a GitHub repository can be
// brought up to date with one click. The click starts a GitHub workflow that opens a pull
// request; the checks run on it and merging it deploys. Data stays in Supabase, and a database
// migration that was already applied is never changed.

const PULLS = repoUrl() ? `${repoUrl()}/pulls` : '';

export function Updates() {
  const { run } = useStepUp();
  const [view, setView] = useState<UpdatesView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api<UpdatesView>('/admin/updates'));
    } catch (err) {
      setError(
        `Die Versionen ließen sich nicht laden: ${err instanceof ApiError ? err.message : 'Verbindungsfehler.'}`,
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async (key: string, path: string, body: unknown, label: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await run(() => api(path, { method: 'POST', body }));
      setNotice(
        `${label}: Das Update läuft. In ein bis zwei Minuten liegt bei GitHub ein Pull Request bereit. Sind die Prüfungen grün, mergen (oder es merged sich selbst) und es wird deployt.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };

  const platform = view?.platform;
  const platformState = platform ? updateLabel(platform.upToDate) : null;

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Updates</h1>
        <p className="muted">
          Ein Klick holt die neue Version und legt sie als Pull Request bei GitHub bereit. Erst nach
          dem Mergen wird deployt. Deine Daten liegen in Supabase und bleiben unberührt; eine
          Datenbank-Migration, die schon gelaufen ist, wird nie verändert. Mach vorher eine{' '}
          <Link to="/admin/backups">Sicherung</Link>, wenn dir die Daten wichtig sind.
        </p>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="card">
          {notice} {PULLS && <a href={PULLS}>Pull Requests öffnen</a>}
        </p>
      )}

      <section className="card" aria-labelledby="upd-platform">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 id="upd-platform" style={{ flex: '1 1 200px', fontSize: 20 }}>
            MiniNode
          </h2>
          {platformState && (
            <span className={`pill ${platformState.tone}`}>{platformState.text}</span>
          )}
        </div>
        {!view && !error && <p className="muted">Lädt …</p>}
        {platform && (
          <>
            <p className="muted">
              Installiert: <span className="mono">{platform.installed ?? 'unbekannt'}</span>
              {' · '}
              Neueste Version:{' '}
              <span className="mono">{platform.latest?.tag ?? 'nicht abrufbar'}</span>
              {platform.latest?.prerelease && ' (Vorabversion)'}
              {platform.source && <> · Quelle: {platform.source}</>}
            </p>
            {!platform.source && (
              <p className="error">
                Noch nicht eingerichtet: <span className="mono">updates.source</span> fehlt in
                mininode.config.json.
              </p>
            )}
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="button primary"
                disabled={busy !== null || !platform.source || platform.upToDate === true}
                onClick={() =>
                  void start(
                    'platform',
                    '/admin/updates/platform',
                    platform.latest ? { version: platform.latest.tag } : {},
                    'MiniNode',
                  )
                }
              >
                {busy === 'platform' ? 'Startet …' : 'MiniNode aktualisieren'}
              </button>
              {platform.latest && (
                <a
                  className="button"
                  href={platform.latest.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Was ist neu?
                </a>
              )}
            </div>
          </>
        )}
      </section>

      <div className="stack" style={{ gap: 12 }}>
        <h2 className="section-title">Apps mit GitHub-Repository</h2>
        {view?.apps.length === 0 && (
          <p className="empty">
            Keine App hat ein Repository. Trage{' '}
            <span className="mono">"repository": "name/projekt"</span> in die{' '}
            <span className="mono">mininode.json</span> einer App ein (zum Beispiel nach „Als
            GitHub-Projekt“ exportiert), dann erscheint sie hier.
          </p>
        )}
        {view?.apps.map((row) => {
          const state = updateLabel(row.upToDate);
          return (
            <section key={row.slug} className="card" aria-label={`Update ${row.name}`}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ flex: '1 1 200px', fontSize: 17 }}>{row.name}</h3>
                <span className={`pill ${state.tone}`}>{state.text}</span>
              </div>
              <p className="muted" style={{ fontSize: 14 }}>
                <a
                  href={`https://github.com/${row.repository}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {row.repository}
                </a>
                {' · '}installiert{' '}
                <span className="mono">{row.installedCommit?.slice(0, 7) ?? 'unbekannt'}</span>
                {' · '}neueste <span className="mono">{row.latestCommit?.slice(0, 7) ?? '–'}</span>
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="button small primary"
                  disabled={busy !== null || row.upToDate === true}
                  onClick={() =>
                    void start(row.slug, `/admin/updates/apps/${row.slug}`, undefined, row.name)
                  }
                >
                  {busy === row.slug ? 'Startet …' : 'Aktualisieren'}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
