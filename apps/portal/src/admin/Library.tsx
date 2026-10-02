import { LIBRARY, type LibraryEntry } from '@mininode/manifest/library';
import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { ApiError, api } from '../lib/api.ts';
import { appUrl } from '../lib/apps.ts';
import { platform } from '../lib/supabase.ts';

// App-Bibliothek (ADR 0011): curated self-hostable programs. One click starts the GitHub workflow
// that points the address at the NucBox, starts the pinned image there and registers the app;
// access is then granted like for any other app (Verwaltung → Apps).

interface Installed {
  slug: string;
  status: string;
  library: string;
  deployed_at: string | null;
}

/** `docker.io/jellyfin/jellyfin:12.1@sha256:…` → `12.1`. */
function version(image: string): string {
  const name = image.split('@')[0] ?? '';
  const tag = name.slice(name.lastIndexOf('/') + 1).split(':')[1];
  return tag ?? 'fest';
}

export function Library() {
  const { run } = useStepUp();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; runs: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Until both loads succeed nobody may install: a failed lookup must not look like "free".
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [status, apps] = await Promise.all([
      api<{ configured: boolean }>('/admin/library').catch((err: unknown) =>
        err instanceof ApiError ? err : new ApiError('', 'unreachable', 0),
      ),
      platform()
        .from('apps')
        .select('slug, status, deployed_at, library:manifest->>library')
        .not('manifest->>library', 'is', null)
        .order('slug'),
    ]);
    if (apps.error) {
      setLoadError('Die installierten Programme konnten nicht geladen werden. Lade die Seite neu.');
      return;
    }
    setInstalled(apps.data as Installed[]);
    if (status instanceof ApiError) {
      setLoadError(
        status.status === 0
          ? 'Die API ist gerade nicht erreichbar; installieren geht erst wieder, wenn sie antwortet.'
          : status.message,
      );
      return;
    }
    setLoadError(null);
    setConfigured(status.configured);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async (action: 'install' | 'remove', entry: LibraryEntry, slug: string) => {
    setError(null);
    setNotice(null);
    setBusy(`${entry.id}:${slug}`);
    try {
      const { runs } = await run(() =>
        api<{ runs: string }>('/admin/library', {
          method: 'POST',
          body: { action, entry: entry.id, slug },
        }),
      );
      setNotice({
        runs,
        text:
          action === 'install'
            ? `${entry.name} wird unter ${slug} eingerichtet. Das dauert ein paar Minuten; danach steht die App unter Verwaltung → Apps und du gibst sie frei.`
            : `${entry.name} unter ${slug} wird entfernt. Die Daten bleiben auf der NucBox.`,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };

  const remove = (entry: LibraryEntry, slug: string) => {
    if (
      !confirm(`${entry.name} unter ${slug} entfernen? Die Daten bleiben auf der NucBox erhalten.`)
    )
      return;
    void start('remove', entry, slug);
  };

  const card = (entry: LibraryEntry) => {
    const mine = installed.filter((app) => app.library === entry.id);
    const headingId = `library-${entry.id}`;
    return (
      <section key={entry.id} className="card" aria-labelledby={headingId}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 id={headingId} style={{ flex: '1 1 200px', fontSize: 18 }}>
            {entry.name}
          </h2>
          <span className="pill">{entry.category}</span>
          {mine.some((app) => app.status === 'online') && (
            <span className="pill ok">
              <span className="dot" />
              Installiert
            </span>
          )}
        </div>
        <p>{entry.description}</p>
        <div className="muted" style={{ fontSize: 14 }}>
          Version <span className="mono">{version(entry.image)}</span> · bis{' '}
          {entry.memoryMb.toLocaleString('de-DE')} MB Arbeitsspeicher ·{' '}
          <a href={entry.website} target="_blank" rel="noopener noreferrer">
            Website
          </a>
          {entry.docs && (
            <>
              {' · '}
              <a href={entry.docs} target="_blank" rel="noopener noreferrer">
                Anleitung
              </a>
            </>
          )}
        </div>
        {entry.note && (
          <p className="muted" style={{ fontSize: 14 }}>
            {entry.note}
          </p>
        )}
        {mine.map((app) => (
          <div key={app.slug} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span style={{ flex: '1 1 200px' }}>
              <a href={appUrl(app.slug)} target="_blank" rel="noopener noreferrer" className="mono">
                {new URL(appUrl(app.slug)).host}
              </a>
              {app.status !== 'online' && <span className="muted"> · entfernt</span>}
            </span>
            <button
              type="button"
              className="button small"
              disabled={!configured || busy !== null}
              onClick={() => void start('install', entry, app.slug)}
            >
              {app.status === 'online' ? 'Aktualisieren' : 'Wieder installieren'}
            </button>
            {app.status === 'online' && (
              <button
                type="button"
                className="button small danger"
                disabled={!configured || busy !== null}
                onClick={() => remove(entry, app.slug)}
              >
                Entfernen
              </button>
            )}
          </div>
        ))}
        {mine.length === 0 && (
          <form
            className="budget-row"
            onSubmit={(event) => {
              event.preventDefault();
              const slug = String(new FormData(event.currentTarget).get('slug') ?? '').trim();
              if (slug) void start('install', entry, slug);
            }}
          >
            <label className="field" style={{ flex: '1 1 220px' }}>
              <span>Adresse</span>
              <input
                name="slug"
                defaultValue={entry.id}
                required
                minLength={2}
                maxLength={32}
                pattern="[a-z][a-z0-9\-]*[a-z0-9]"
                spellCheck={false}
                autoCapitalize="off"
                aria-describedby={`${headingId}-host`}
              />
            </label>
            <span id={`${headingId}-host`} className="muted mono" style={{ alignSelf: 'end' }}>
              .{new URL(appUrl('x')).host.slice(2)}
            </span>
            <button
              type="submit"
              className="button small primary"
              style={{ alignSelf: 'end' }}
              disabled={!configured || busy !== null}
            >
              {busy?.startsWith(`${entry.id}:`) ? 'Wird gestartet …' : 'Installieren'}
            </button>
          </form>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h2 style={{ fontSize: 24 }}>App-Bibliothek</h2>
        <p className="muted">
          Bekannte Programme zum Selbsthosten, mit einem Klick auf der NucBox. Sie laufen hinter dem
          MiniNode-Login und sind von jedem Gerät im Browser erreichbar. Nach der Installation gibst
          du sie unter Verwaltung → Apps frei. Die Versionen sind fest eingetragen; neue kommen über
          eine Änderung am Katalog (<code>infra/nucbox/library.json</code>).
        </p>
      </div>
      {configured === false && (
        <p className="error" role="alert">
          Installationen sind noch nicht eingerichtet: der Schlüssel{' '}
          <code>LIBRARY_DISPATCH_TOKEN</code> fehlt, und die NucBox muss laufen
          (docs/runbooks/app-library.md). Die Links funktionieren trotzdem.
        </p>
      )}
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="muted" role="status">
          {notice.text}{' '}
          <a href={notice.runs} target="_blank" rel="noopener noreferrer">
            Fortschritt auf GitHub
          </a>
        </p>
      )}
      <div className="stack" style={{ gap: 12 }}>
        {LIBRARY.map(card)}
      </div>
    </>
  );
}
