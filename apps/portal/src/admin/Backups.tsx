import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { ApiError, api } from '../lib/api.ts';
import {
  type BackupList,
  type BackupRow,
  FAILED_HINT,
  isRunning,
  STATE_LABEL,
  STATE_TONE,
} from '../lib/backups.ts';
import { formatSize } from '../lib/submissions.ts';
import { dateTime } from './AdminLayout.tsx';

// Verwaltung → Sicherung (ADR 0019). The backup is made by a GitHub workflow (database snapshot,
// stored files, settings; one password-protected archive); this page starts it, shows the runs and
// hands out the download. Restoring is a command on the owner's computer (runbook backups.md).

const RUNBOOK = 'https://github.com/Sulpharus/PrivateAppHosting/blob/main/docs/runbooks/backups.md';

export function Backups() {
  const { run } = useStepUp();
  const [list, setList] = useState<BackupList | null>(null);
  const [files, setFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api<BackupList>('/admin/backups'));
      setError((current) => (current?.startsWith('Die Liste') ? null : current));
    } catch (err) {
      setError(
        `Die Liste ließ sich nicht laden: ${err instanceof ApiError ? err.message : 'Verbindungsfehler.'}`,
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const moving = list ? isRunning(list.runs) : false;
  useEffect(() => {
    const timer = setInterval(() => void load(), moving ? 5000 : 30000);
    return () => clearInterval(timer);
  }, [load, moving]);

  const start = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await run(() => api('/admin/backups', { method: 'POST', body: { files } }));
      setNotice('Die Sicherung läuft. Das dauert wenige Minuten, bei vielen Dateien länger.');
      // GitHub needs a moment before the run shows up in the list.
      setTimeout(() => void load(), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (row: BackupRow) => {
    if (!row.artifact) return;
    setError(null);
    try {
      const { url } = await run(() =>
        api<{ url: string }>(`/admin/backups/${row.artifact?.id}/download`, { method: 'POST' }),
      );
      // The address is valid for about a minute and sends the file straight from GitHub.
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Der Download hat nicht geklappt.');
    }
  };

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Sicherung</h1>
        <p className="muted">
          Eine Sicherung enthält alle Konten (mit Passwort-Prüfsummen und zweiten Faktoren), die
          Daten der Plattform und aller Apps, die gespeicherten Dateien und die Einstellungen des
          Hostings. Sie entsteht bei GitHub, wird mit einem Passwort (AES-256) verschlüsselt und 30
          Tage zum Download bereitgehalten. Lade sie herunter und bewahre sie außerhalb von GitHub
          und Supabase auf.
        </p>
      </div>

      <section className="card" aria-labelledby="backup-new">
        <h2 id="backup-new" style={{ fontSize: 18 }}>
          Neue Sicherung
        </h2>
        <label className="row" style={{ gap: 10, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={files}
            onChange={(event) => setFiles(event.target.checked)}
          />
          <span>Gespeicherte Dateien einschließen (Fotos, Belege, Logos)</span>
        </label>
        {list && !list.configured && (
          <p className="error">
            Noch nicht eingerichtet: der GitHub-Startschlüssel fehlt (LIBRARY_DISPATCH_TOKEN, siehe
            Runbook).
          </p>
        )}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button primary"
            disabled={busy || (list !== null && !list.configured) || moving}
            onClick={() => void start()}
          >
            Sicherung erstellen
          </button>
          {moving && <span className="muted">Eine Sicherung läuft gerade.</span>}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="muted" role="status">
            {notice}
          </p>
        )}
      </section>

      <div className="stack" style={{ gap: 12 }}>
        <h2 className="section-title">Sicherungen</h2>
        {list?.runs.length === 0 && <p className="empty">Noch keine Sicherung.</p>}
        {list?.runs.map((row) => (
          <section
            key={row.runId}
            className="card"
            aria-label={`Sicherung ${dateTime(row.startedAt)}`}
          >
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ flex: '1 1 200px', fontSize: 17 }}>{dateTime(row.startedAt)}</h3>
              {row.withFiles !== null && (
                <span className="pill">{row.withFiles ? 'mit Dateien' : 'ohne Dateien'}</span>
              )}
              <span className={`pill ${STATE_TONE[row.state]}`}>
                <span className="dot" />
                {STATE_LABEL[row.state]}
              </span>
            </div>
            {row.artifact && (
              <p className="muted" style={{ fontSize: 14 }}>
                {formatSize(row.artifact.sizeBytes)}
                {row.artifact.expiresAt && (
                  <> · zum Download bis {dateTime(row.artifact.expiresAt)}</>
                )}
              </p>
            )}
            {row.state === 'failed' && <p>{FAILED_HINT}</p>}
            {row.state === 'expired' && (
              <p className="muted">Der Download ist abgelaufen. Erstelle eine neue Sicherung.</p>
            )}
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {row.artifact && (
                <button
                  type="button"
                  className="button small primary"
                  onClick={() => void download(row)}
                >
                  Herunterladen
                </button>
              )}
              <a
                className="button small"
                href={row.runUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Protokoll
              </a>
            </div>
          </section>
        ))}
      </div>

      <section className="card" aria-labelledby="backup-notes">
        <h2 id="backup-notes" style={{ fontSize: 18 }}>
          Gut zu wissen
        </h2>
        <ul className="stack" style={{ gap: 6, paddingLeft: 18 }}>
          <li>
            Die Datei ist ein ZIP mit einer verschlüsselten <span className="mono">.7z</span>-Datei
            darin. Öffne sie mit 7-Zip und dem Passwort{' '}
            <span className="mono">BACKUP_PASSPHRASE</span> aus deinem Passwortmanager. Ohne das
            Passwort ist die Sicherung nicht lesbar, auch nicht für uns.
          </li>
          <li>
            Nicht enthalten: die Geheimnisse der Worker und von GitHub (hinterlege sie im
            Passwortmanager) und der Code der Apps (er liegt in Git).
          </li>
          <li>
            Nach einer Wiederherstellung melden sich alle Personen neu an; Passwörter und Passkeys
            bleiben erhalten.
          </li>
          <li>
            Wiederherstellen geht auf deinem Rechner mit{' '}
            <span className="mono">pnpm mininode backup restore</span>:{' '}
            <a href={RUNBOOK} target="_blank" rel="noopener noreferrer">
              Anleitung
            </a>
            .
          </li>
        </ul>
      </section>
    </>
  );
}
