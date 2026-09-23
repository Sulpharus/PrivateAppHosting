import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { api } from '../lib/api.ts';
import { type AppRow, listApps } from '../lib/apps.ts';
import { platform } from '../lib/supabase.ts';
import { dateTime } from './AdminLayout.tsx';

interface SessionRow {
  id: string;
  app_slug: string;
  user_id: string;
  status: 'queued' | 'active';
  created_at: string;
  started_at: string | null;
  last_seen_at: string | null;
}

export function Remote() {
  const { run } = useStepUp();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [appRows, sessionRows, users] = await Promise.all([
      listApps(),
      platform()
        .from('remote_sessions')
        .select('id, app_slug, user_id, status, created_at, started_at, last_seen_at')
        .in('status', ['queued', 'active'])
        .order('created_at'),
      platform().rpc('admin_list_users'),
    ]);
    setApps(appRows.filter((app) => app.kind === 'remote'));
    setSessions((sessionRows.data as SessionRow[] | null) ?? []);
    setNames(
      Object.fromEntries(
        ((users.data as { user_id: string; display_name: string }[] | null) ?? []).map((user) => [
          user.user_id,
          user.display_name,
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const end = (session: SessionRow) =>
    void run(() => api(`/remote/sessions/${session.id}`, { method: 'DELETE' })).then(load);

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Remote-Apps</h1>
        <p className="muted">
          Native Programme im Browser. Die Windows-VM und die Container schlafen, solange niemand
          verbunden ist; das Leerlauf-Limit liegt bei 15 Minuten.
        </p>
      </div>

      {apps.length === 0 && (
        <p className="empty">
          Noch keine Remote-Apps. Lege den Installer in R2 ab und beschreibe die App mit{' '}
          <code>kind: remote</code> im Manifest (siehe{' '}
          <code>docs/ai/playbooks/native-installer.md</code>).
        </p>
      )}

      {apps.map((app) => {
        const appSessions = sessions.filter((session) => session.app_slug === app.slug);
        const active = appSessions.find((session) => session.status === 'active');
        const queue = appSessions.filter((session) => session.status === 'queued');
        return (
          <section key={app.slug} className="card" aria-label={app.name}>
            <div className="row">
              <h2 className="section-title" style={{ fontSize: 18 }}>
                {app.name}
              </h2>
              <span className="pill mono">{app.remote_runtime ?? 'windows'}</span>
              {app.data_mode === 'shared-account' && (
                <span className="pill accent">geteilter Account</span>
              )}
              <span className="spacer" />
              <span className={`pill ${active ? 'ok' : ''}`}>
                <span className="dot" />
                {active ? 'aktiv' : 'frei'}
              </span>
            </div>
            {active && (
              <div className="row">
                <span>
                  {names[active.user_id] ?? 'Unbekannt'} seit {dateTime(active.started_at)} ·
                  zuletzt aktiv {dateTime(active.last_seen_at)}
                </span>
                <span className="spacer" />
                <button type="button" className="button small danger" onClick={() => end(active)}>
                  Sitzung beenden
                </button>
              </div>
            )}
            {queue.length > 0 && (
              <p className="muted">
                Warteschlange: {queue.map((session) => names[session.user_id] ?? '?').join(', ')}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
