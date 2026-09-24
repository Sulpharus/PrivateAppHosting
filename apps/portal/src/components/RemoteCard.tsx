import { useEffect, useRef, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { ApiError, api } from '../lib/api.ts';
import { type AppRow, monogram, type RemoteStatus, tintFor } from '../lib/apps.ts';

type SessionResponse =
  | { status: 'queued'; sessionId: string }
  | { status: 'starting'; sessionId: string; etaSeconds: number }
  | { status: 'active'; sessionId: string; connectUrl: string };

const PLATFORM_LABEL: Record<string, string> = {
  windows: 'Windows',
  wine: 'Wine',
  android: 'Android',
};

/** One remote program: shows who is connected, queues, wakes the VM and opens the session. */
export function RemoteCard(props: {
  app: AppRow;
  runtime: string;
  status: RemoteStatus | undefined;
  onChange(): void;
}) {
  const { run } = useStepUp();
  const [state, setState] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const status = props.status;
  const busyByOther = Boolean(status?.active_user_name) && !status?.is_mine;

  useEffect(() => () => clearTimeout(timer.current), []);

  // Keep the session alive while this page is open and a session is ours.
  useEffect(() => {
    if (!state) return;
    const beat = setInterval(() => {
      void api<{ status: string }>(`/remote/sessions/${state.sessionId}/heartbeat`, {
        method: 'POST',
      }).catch(() => {});
    }, 60_000);
    return () => clearInterval(beat);
  }, [state]);

  const connect = async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await run(() =>
        api<SessionResponse>('/remote/sessions', { method: 'POST', body: { app: props.app.slug } }),
      );
      setState(response);
      if (response.status === 'active') {
        window.open(response.connectUrl, '_blank', 'noopener');
      } else {
        // Poll while the VM wakes up or while we wait in the queue.
        timer.current = setTimeout(
          () => void connect(),
          response.status === 'starting' ? 5000 : 15000,
        );
      }
      props.onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verbindung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    clearTimeout(timer.current);
    if (state)
      await api(`/remote/sessions/${state.sessionId}`, { method: 'DELETE' }).catch(() => {});
    setState(null);
    props.onChange();
  };

  const statusLine = (() => {
    if (state?.status === 'starting') return `Startet … etwa ${state.etaSeconds} s`;
    if (state?.status === 'queued')
      return `Du bist in der Warteschlange (Platz ${status?.my_position ?? 1})`;
    if (state?.status === 'active' || status?.is_mine) return 'Deine Sitzung läuft';
    if (busyByOther) return `${status?.active_user_name} ist verbunden`;
    return 'Frei';
  })();

  return (
    <div className="card">
      <div className="row">
        <div
          className="monogram"
          style={{ background: tintFor(props.app.slug), width: 40, height: 40 }}
          aria-hidden="true"
        >
          {monogram(props.app.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{props.app.name}</strong>
          <p className="muted" style={{ fontSize: 13 }}>
            {statusLine}
          </p>
        </div>
        <span className="pill mono">{PLATFORM_LABEL[props.runtime] ?? props.runtime}</span>
      </div>
      {state ? (
        <div className="row">
          {state.status === 'active' && (
            <a
              className="button primary"
              style={{ flex: 1 }}
              href={state.connectUrl}
              target="_blank"
              rel="noopener"
            >
              Öffnen
            </a>
          )}
          <button type="button" className="button" style={{ flex: 1 }} onClick={leave}>
            {state.status === 'active' ? 'Trennen' : 'Abbrechen'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`button wide ${busyByOther ? '' : 'primary'}`}
          onClick={connect}
          disabled={busy}
        >
          {busyByOther ? 'In die Warteschlange' : 'Verbinden'}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
