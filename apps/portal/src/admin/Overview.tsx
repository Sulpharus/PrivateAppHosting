import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { type AuditRow, describeActivity } from '../lib/activity.ts';
import { type AppRow, listApps } from '../lib/apps.ts';
import { platform } from '../lib/supabase.ts';
import { dateTime, euro } from './AdminLayout.tsx';

export function Overview() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [users, setUsers] = useState(0);
  const [aiSpent, setAiSpent] = useState(0);
  const [aiLimit, setAiLimit] = useState<number | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [names, setNames] = useState(new Map<string, string>());

  useEffect(() => {
    void Promise.all([
      listApps().then(setApps),
      platform()
        .from('profiles')
        .select('user_id, display_name', { count: 'exact' })
        .then(({ data, count }) => {
          setUsers(count ?? 0);
          setNames(
            new Map(
              ((data as { user_id: string; display_name: string }[] | null) ?? []).map((p) => [
                p.user_id,
                p.display_name,
              ]),
            ),
          );
        }),
      platform()
        .rpc('admin_ai_usage')
        .then(({ data }) =>
          setAiSpent(
            ((data as { cost_micro: number }[] | null) ?? []).reduce(
              (sum, row) => sum + Number(row.cost_micro),
              0,
            ),
          ),
        ),
      platform()
        .from('ai_budgets')
        .select('monthly_limit_micro')
        .eq('scope', 'global')
        .maybeSingle()
        .then(({ data }) => setAiLimit((data?.monthly_limit_micro as number | undefined) ?? null)),
      platform()
        .from('audit_log')
        .select('id, at, action, app_slug, actor_id, detail')
        .order('at', { ascending: false })
        .limit(8)
        .then(({ data }) => setAudit((data as AuditRow[] | null) ?? [])),
    ]);
  }, []);

  const problems = apps.filter((app) => app.status === 'down' || app.status === 'degraded');

  return (
    <>
      <h1 style={{ fontSize: 36 }}>Übersicht</h1>
      <div className="kpis">
        <div className="card kpi">
          <span className="muted">Apps</span>
          <strong>{apps.length}</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            {problems.length ? `${problems.length} mit Problemen` : 'alle erreichbar'}
          </span>
        </div>
        <div className="card kpi">
          <span className="muted">Nutzer</span>
          <strong>{users}</strong>
          <Link to="/admin/users" style={{ fontSize: 13 }}>
            Einladen →
          </Link>
        </div>
        <div className="card kpi">
          <span className="muted">KI-Kosten diesen Monat</span>
          <strong>{euro(aiSpent)}</strong>
          {aiLimit !== null && (
            <div
              className="meter"
              role="img"
              aria-label={`${Math.round((aiSpent / aiLimit) * 100)} % vom Budget`}
            >
              <span style={{ width: `${Math.min(100, (aiSpent / aiLimit) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      {problems.length > 0 && (
        <section className="card" aria-label="Probleme">
          <h2 className="section-title">Braucht Aufmerksamkeit</h2>
          {problems.map((app) => (
            <div key={app.slug} className="row">
              <span
                className="dot"
                style={{ color: app.status === 'down' ? 'var(--bad)' : 'var(--warn)' }}
              />
              <strong>{app.name}</strong>
              <span className="muted">
                {app.status === 'down' ? 'nicht erreichbar' : 'gestört'}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="card" aria-label="Letzte Aktivität">
        <h2 className="section-title">Letzte Aktivität</h2>
        {audit.length === 0 && <p className="muted">Noch nichts passiert.</p>}
        {audit.map((row) => (
          <div key={row.id} className="row">
            <span className="muted mono" style={{ minWidth: 110 }}>
              {dateTime(row.at)}
            </span>
            <span>{describeActivity(row, names)}</span>
            {row.app_slug && <span className="pill mono">{row.app_slug}</span>}
          </div>
        ))}
      </section>
    </>
  );
}
