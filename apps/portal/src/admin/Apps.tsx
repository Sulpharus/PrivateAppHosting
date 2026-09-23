import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { type AppRow, appUrl, listApps, monogram, tintFor } from '../lib/apps.ts';
import { platform } from '../lib/supabase.ts';
import { dateTime } from './AdminLayout.tsx';

const STATUS: Record<string, [string, string]> = {
  online: ['Online', 'ok'],
  degraded: ['Gestört', 'bad'],
  down: ['Down', 'bad'],
  pending: ['Noch nicht deployt', ''],
  disabled: ['Deaktiviert', ''],
};

const TARGET: Record<string, string> = {
  cloudflare: 'Cloudflare',
  vercel: 'Vercel',
  nucbox: 'NucBox',
  remote: 'Remote',
};

export function Apps() {
  const { run } = useStepUp();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => listApps().then(setApps), []);
  useEffect(() => {
    void load();
  }, [load]);

  const setState = async (
    slug: string,
    change: { p_disabled?: boolean; p_is_default?: boolean },
  ) => {
    setError(null);
    try {
      await run(async () => {
        const { error: rpcError } = await platform().rpc('admin_set_app_state', {
          p_slug: slug,
          ...change,
        });
        if (rpcError) throw rpcError;
      });
      await load();
    } catch {
      setError('Änderung fehlgeschlagen.');
    }
  };

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Apps</h1>
        <p className="muted">
          Neue Apps kommen als ZIP in <code>inbox/</code>, werden mit <code>/integrate-app</code>{' '}
          integriert und per Push veröffentlicht. Hier steuerst du Sichtbarkeit und
          Standard-Freigabe.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {apps.length === 0 && <p className="empty">Noch keine Apps veröffentlicht.</p>}
      {apps.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>App</th>
                <th>Status</th>
                <th>Host</th>
                <th>Version</th>
                <th>Für alle neuen Nutzer</th>
                <th>
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => {
                const [label, tone] = STATUS[app.status] ?? [app.status, ''];
                return (
                  <tr key={app.slug}>
                    <td>
                      <div className="row">
                        <div
                          className="monogram"
                          style={{
                            background: tintFor(app.slug),
                            width: 32,
                            height: 32,
                            fontSize: 12,
                          }}
                          aria-hidden="true"
                        >
                          {monogram(app.name)}
                        </div>
                        <div>
                          <a href={appUrl(app.slug)}>{app.name}</a>
                          <div className="muted mono">{app.slug}.mininode.app</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${tone}`}>
                        <span className="dot" />
                        {label}
                      </span>
                    </td>
                    <td>{TARGET[app.target] ?? app.target}</td>
                    <td className="mono">
                      {app.deployed_version ?? '–'}
                      <div className="muted">{dateTime(app.deployed_at)}</div>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${app.name} automatisch für neue Nutzer freigeben`}
                        checked={app.is_default}
                        onChange={(event) =>
                          void setState(app.slug, { p_is_default: event.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button small"
                        onClick={() =>
                          void setState(app.slug, { p_disabled: app.status !== 'disabled' })
                        }
                      >
                        {app.status === 'disabled' ? 'Aktivieren' : 'Deaktivieren'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
