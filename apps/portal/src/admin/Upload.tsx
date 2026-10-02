import { uploadKind } from '@mininode/manifest';
import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useStepUp } from '../auth/StepUp.tsx';
import { ApiError, api, apiUpload } from '../lib/api.ts';
import {
  formatSize,
  isRunning,
  reviewPrompt,
  STATUS_LABEL,
  type Submission,
} from '../lib/submissions.ts';
import { platform } from '../lib/supabase.ts';
import { dateTime } from './AdminLayout.tsx';

// Verwaltung → Hochladen (ADR 0013). One box for both kinds: a ZIP is a web app that a script
// integrates (and hands to an AI review when it cannot), .exe/.msi is a program that is installed
// on the PC/server. Both end in this list, with what was done and what is left.

interface UploadConfig {
  webapp: boolean;
  program: boolean;
  webappMaxMb: number;
  programMaxMb: number;
}

const TONE: Record<string, string> = {
  integrated: 'ok',
  installed: 'ok',
  needs_review: 'bad',
  failed: 'bad',
};

export function Upload() {
  const { run } = useStepUp();
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [rows, setRows] = useState<Submission[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [runtime, setRuntime] = useState<'windows' | 'wine'>('windows');
  const [slug, setSlug] = useState('');
  const [programPath, setProgramPath] = useState('');
  const [silentArgs, setSilentArgs] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await platform()
      .from('submissions')
      .select(
        'id, kind, filename, size_bytes, status, slug, name, summary, log, run_url, pr_url, review_url, created_at',
      )
      .neq('status', 'dismissed')
      .order('created_at', { ascending: false })
      .limit(30);
    const list = (data as Submission[] | null) ?? [];
    // A running install only reaches its end when somebody asks the NucBox: the API does that.
    const refreshed = await Promise.all(
      list.map((row) =>
        row.kind === 'program' && row.status === 'installing'
          ? api<Submission>(`/admin/submissions/${row.id}`).catch(() => row)
          : row,
      ),
    );
    setRows(refreshed);
  }, []);

  useEffect(() => {
    api<UploadConfig>('/admin/submissions/config')
      .then(setConfig)
      .catch(() => setConfig({ webapp: false, program: false, webappMaxMb: 40, programMaxMb: 95 }));
    void load();
  }, [load]);

  const moving = rows.some((row) => isRunning(row.status));
  useEffect(() => {
    const timer = setInterval(() => void load(), moving ? 5000 : 30000);
    return () => clearInterval(timer);
  }, [load, moving]);

  const kind = file ? uploadKind(file.name) : null;
  const unavailable =
    kind === 'webapp' && config && !config.webapp
      ? 'Der automatische Einbau ist noch nicht eingerichtet (LIBRARY_DISPATCH_TOKEN, siehe Runbook uploads.md).'
      : kind === 'program' && config && !config.program
        ? 'Programme brauchen die R2-Zugangsdaten der API und die NucBox (siehe Runbook uploads.md).'
        : null;

  const choose = (picked: File | null | undefined) => {
    setError(null);
    setNotice(null);
    if (!picked) return;
    if (!uploadKind(picked.name)) {
      setFile(null);
      setError('Erlaubt sind ZIP-Dateien (Web-Apps) und .exe oder .msi (Programme).');
      return;
    }
    setFile(picked);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  const send = async () => {
    if (!file || !kind) return;
    setError(null);
    setNotice(null);
    setProgress(0);
    const headers: Record<string, string> = {};
    if (kind === 'program') {
      headers['X-Runtime'] = runtime;
      if (slug.trim()) headers['X-Slug'] = slug.trim();
      if (programPath.trim()) headers['X-Program'] = programPath.trim();
      if (silentArgs.trim()) headers['X-Silent-Args'] = silentArgs.trim();
    }
    try {
      await run(() => apiUpload<Submission>('/admin/submissions', file, headers, setProgress));
      setNotice(
        kind === 'webapp'
          ? 'Hochgeladen. Das Skript baut die App jetzt ein; das dauert etwa zwei Minuten.'
          : 'Hochgeladen. Die NucBox installiert das Programm jetzt; das dauert einige Minuten.',
      );
      setFile(null);
      setSlug('');
      setProgramPath('');
      setSilentArgs('');
      if (input.current) input.current.value = '';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Der Upload hat nicht geklappt.');
    } finally {
      setProgress(null);
      await load();
    }
  };

  const act = async (row: Submission, action: 'retry' | 'dismiss', body?: object) => {
    setError(null);
    try {
      await run(() =>
        api(`/admin/submissions/${row.id}/${action}`, { method: 'POST', body: body ?? {} }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
    }
    await load();
  };

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Hochladen</h1>
        <p className="muted">
          Eine ZIP-Datei ist eine Web-App: ein Skript baut sie ein, und nur was es nicht schafft,
          wartet auf eine KI-Prüfung. Eine <span className="mono">.exe</span> oder{' '}
          <span className="mono">.msi</span> ist ein Programm für den PC/Server: es wird in einer
          Sicherung der Windows-VM installiert. Zugriff vergibst du danach unter Apps.
        </p>
      </div>

      <section className="card" aria-labelledby="upload-title">
        <h2 id="upload-title" style={{ fontSize: 18 }}>
          Neue Datei
        </h2>
        <button
          type="button"
          className={`dropzone${dragging ? ' over' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {file ? (
            <>
              <strong>{file.name}</strong>
              <span className="muted">
                {formatSize(file.size)} ·{' '}
                {kind === 'webapp' ? 'Web-App (ZIP)' : 'Programm für den PC/Server'}
              </span>
            </>
          ) : (
            <>
              <strong>Datei hierher ziehen oder auswählen</strong>
              <span className="muted">
                ZIP (bis {config?.webappMaxMb ?? 40} MB) · EXE oder MSI (bis{' '}
                {config?.programMaxMb ?? 95} MB)
              </span>
            </>
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,.exe,.msi"
          className="sr-only"
          tabIndex={-1}
          aria-label="Datei auswählen"
          onChange={(event) => choose(event.target.files?.[0])}
        />

        {kind === 'program' && (
          <details className="upload-options">
            <summary>Einstellungen für das Programm</summary>
            <div className="stack" style={{ gap: 12, marginTop: 12 }}>
              <label className="field">
                Läuft unter
                <select
                  value={runtime}
                  onChange={(event) => setRuntime(event.target.value as 'windows' | 'wine')}
                >
                  <option value="windows">Windows 11 (VM)</option>
                  <option value="wine" disabled={file?.name.toLowerCase().endsWith('.msi')}>
                    Wine (Linux, nur .exe)
                  </option>
                </select>
              </label>
              <label className="field">
                Adresse (leer: aus dem Dateinamen)
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  maxLength={32}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                Programmpfad nach der Installation (leer: wird gesucht)
                <input
                  value={programPath}
                  onChange={(event) => setProgramPath(event.target.value)}
                  placeholder="C:\Program Files\Name\name.exe"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                Argumente für die stille Installation (leer: /S für EXE, /qn für MSI)
                <input
                  value={silentArgs}
                  onChange={(event) => setSilentArgs(event.target.value)}
                  placeholder="/VERYSILENT /NORESTART"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            </div>
          </details>
        )}

        {unavailable && <p className="error">{unavailable}</p>}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button primary"
            disabled={!file || progress !== null || Boolean(unavailable)}
            onClick={() => void send()}
          >
            Hochladen
          </button>
          {progress !== null && (
            <progress value={progress} max={1} aria-label="Fortschritt" className="upload-bar" />
          )}
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
        <h2 className="section-title">Uploads</h2>
        {rows.length === 0 && <p className="empty">Noch nichts hochgeladen.</p>}
        {rows.map((row) => (
          <SubmissionCard key={row.id} row={row} onAct={act} />
        ))}
      </div>
    </>
  );
}

function SubmissionCard({
  row,
  onAct,
}: {
  row: Submission;
  onAct: (row: Submission, action: 'retry' | 'dismiss', body?: object) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [program, setProgram] = useState(row.summary.program ?? '');
  const [args, setArgs] = useState('');
  const reasons = row.summary.reasons ?? [];
  const warnings = row.summary.warnings ?? [];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reviewPrompt(row));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the text is also in the issue and the log below.
    }
  };
  return (
    <section className="card" aria-label={row.filename}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ flex: '1 1 220px', fontSize: 17, overflowWrap: 'anywhere' }}>
          {row.name ?? row.filename}
        </h3>
        <span className="pill">{row.kind === 'webapp' ? 'Web-App' : 'Programm'}</span>
        <span className={`pill ${TONE[row.status] ?? ''}`}>
          <span className="dot" />
          {STATUS_LABEL[row.status]}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        <span className="mono">{row.filename}</span> · {formatSize(row.size_bytes)} ·{' '}
        {dateTime(row.created_at)}
        {row.slug && (
          <>
            {' · '}
            <span className="mono">{row.slug}.mininode.app</span>
          </>
        )}
      </p>

      {row.status === 'integrated' && (
        <p>
          {row.pr_url
            ? 'Die App liegt als Pull Request bereit. Prüfen und mergen, dann veröffentlicht der Deploy sie.'
            : 'Die App ist veröffentlicht.'}{' '}
          Zugriff vergibst du unter <Link to="/admin/apps">Apps</Link>.
        </p>
      )}
      {row.status === 'installed' && (
        <p>
          Das Programm ist installiert (<span className="mono">{row.summary.program}</span>).
          Zugriff vergibst du unter <Link to="/admin/apps">Apps</Link>.
        </p>
      )}
      {reasons.length > 0 && (row.status === 'needs_review' || row.status === 'failed') && (
        <ul className="stack" style={{ gap: 4, paddingLeft: 18 }}>
          {reasons.map((reason) => (
            <li key={`${reason.code}:${reason.file ?? ''}:${reason.message}`}>
              {reason.message}
              {reason.file && <span className="mono muted"> ({reason.file})</span>}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="stack muted" style={{ gap: 4, paddingLeft: 18, fontSize: 14 }}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {row.kind === 'program' && row.status === 'needs_review' && (
        <div className="stack" style={{ gap: 10 }}>
          <label className="field">
            Programmpfad
            <input
              value={program}
              onChange={(event) => setProgram(event.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="field">
            Argumente für die stille Installation
            <input
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              placeholder="/VERYSILENT /NORESTART"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        </div>
      )}

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {row.run_url && (
          <a className="button small" href={row.run_url} target="_blank" rel="noopener noreferrer">
            Protokoll
          </a>
        )}
        {row.pr_url && (
          <a className="button small" href={row.pr_url} target="_blank" rel="noopener noreferrer">
            Pull Request
          </a>
        )}
        {row.review_url && (
          <a
            className="button small"
            href={row.review_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            KI-Prüfung (Issue)
          </a>
        )}
        {row.status === 'needs_review' && (
          <button type="button" className="button small" onClick={() => void copy()}>
            {copied ? 'Kopiert' : 'Prüfauftrag kopieren'}
          </button>
        )}
        {(row.status === 'needs_review' || row.status === 'failed' || row.status === 'queued') && (
          <button
            type="button"
            className="button small primary"
            onClick={() =>
              void onAct(
                row,
                'retry',
                row.kind === 'program'
                  ? {
                      ...(program && program !== row.summary.program ? { program } : {}),
                      ...(args ? { silentArgs: args } : {}),
                    }
                  : {},
              )
            }
          >
            Erneut versuchen
          </button>
        )}
        {!isRunning(row.status) && (
          <button type="button" className="button small" onClick={() => void onAct(row, 'dismiss')}>
            Ausblenden
          </button>
        )}
      </div>

      {row.log && (
        <details>
          <summary>Protokoll</summary>
          <pre className="log">{row.log}</pre>
        </details>
      )}
    </section>
  );
}
