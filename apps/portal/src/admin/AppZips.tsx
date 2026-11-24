// ZIP exports of hosted apps (Verwaltung → Apps): the export-app.yml workflow packs an app without
// data or keys, GitHub keeps the file for 7 days, and the API hands out a short-lived download
// address. Someone else who hosts MiniNode installs the file under Verwaltung → Hochladen.

import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { ApiError, api } from '../lib/api.ts';
import { dateTime } from './AdminLayout.tsx';

interface ZipRow {
  runId: number;
  slug: string;
  startedAt: string;
  state: 'running' | 'ready' | 'failed' | 'cancelled' | 'expired';
  runUrl: string;
  artifact: { id: number; name: string; sizeBytes: number; expiresAt: string | null } | null;
}

const STATE: Record<ZipRow['state'], string> = {
  running: 'Wird gepackt …',
  ready: 'Bereit',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
  expired: 'Abgelaufen',
};

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;

/** The list of ZIP exports; `version` changes when a new export was started. */
export function AppZips({ version, names }: { version: number; names: Map<string, string> }) {
  const { run } = useStepUp();
  const [zips, setZips] = useState<ZipRow[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ configured: boolean; zips: ZipRow[] }>('/admin/app-zips');
      setConfigured(result.configured);
      setZips(result.zips);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Die ZIP-Exporte konnten nicht geladen werden.',
      );
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version only triggers a reload
  useEffect(() => {
    void load();
  }, [load, version]);

  // While a ZIP is being packed, look again every few seconds.
  useEffect(() => {
    if (!zips.some((zip) => zip.state === 'running')) return;
    const timer = setTimeout(() => void load(), 5000);
    return () => clearTimeout(timer);
  }, [zips, load]);

  const download = async (zip: ZipRow) => {
    if (!zip.artifact || downloading !== null) return;
    setError(null);
    setDownloading(zip.runId);
    try {
      const { url } = await run(() =>
        api<{ url: string }>(`/admin/app-zips/${zip.artifact?.id}/download`, { method: 'POST' }),
      );
      // The address is valid for about a minute and sends the file straight from GitHub.
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Der Download hat nicht geklappt.');
    } finally {
      setDownloading(null);
    }
  };

  if (!configured || (zips.length === 0 && !error)) return null;
  return (
    <section className="card" aria-labelledby="app-zips">
      <h2 id="app-zips" style={{ fontSize: 18 }}>
        ZIP-Exporte
      </h2>
      <p className="muted">
        Eine ZIP-Datei enthält den Code einer App ohne Nutzerdaten und Schlüssel. Wer selbst
        MiniNode betreibt, installiert sie unter Verwaltung → Hochladen. Jede Datei bleibt 7 Tage
        abrufbar.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">App</th>
              <th scope="col">Erstellt</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {zips.map((zip) => (
              <tr key={zip.runId}>
                <td>{names.get(zip.slug) ?? zip.slug}</td>
                <td>{dateTime(zip.startedAt)}</td>
                <td>
                  {STATE[zip.state]}
                  {zip.artifact ? ` · ${size(zip.artifact.sizeBytes)}` : ''}
                  {zip.state === 'failed' && (
                    <>
                      {' · '}
                      <a href={zip.runUrl} target="_blank" rel="noopener noreferrer">
                        Protokoll
                      </a>
                    </>
                  )}
                </td>
                <td className="table-actions">
                  {zip.artifact && (
                    <button
                      type="button"
                      className="button small"
                      aria-label={`ZIP von ${names.get(zip.slug) ?? zip.slug} herunterladen`}
                      disabled={downloading !== null}
                      onClick={() => void download(zip)}
                    >
                      {downloading === zip.runId ? 'Wird geladen …' : 'Herunterladen'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
