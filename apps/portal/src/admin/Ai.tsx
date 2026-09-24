import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { platform } from '../lib/supabase.ts';
import { euro } from './AdminLayout.tsx';

interface UsageRow {
  user_id: string;
  display_name: string;
  role: string;
  app_slug: string;
  requests: number;
  cost_micro: number;
}

interface BudgetRow {
  scope: 'global' | 'role' | 'app' | 'user';
  scope_key: string;
  monthly_limit_micro: number;
}

const SCOPE_LABEL: Record<string, string> = {
  'global:*': 'Gesamtbudget (hartes Limit, außer für dich)',
  'role:user': 'Standard pro User',
  'role:trusted': 'Standard pro Trusted',
};

export function Ai() {
  const { run } = useStepUp();
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, b] = await Promise.all([
      platform().rpc('admin_ai_usage'),
      platform().from('ai_budgets').select('scope, scope_key, monthly_limit_micro').order('scope'),
    ]);
    setUsage((u.data as UsageRow[] | null) ?? []);
    setBudgets((b.data as BudgetRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (budget: BudgetRow, euros: number) => {
    setError(null);
    try {
      await run(async () => {
        const { error: updateError } = await platform()
          .from('ai_budgets')
          .update({ monthly_limit_micro: Math.round(euros * 1_000_000) })
          .eq('scope', budget.scope)
          .eq('scope_key', budget.scope_key);
        if (updateError) throw updateError;
      });
      await load();
    } catch {
      setError('Budget konnte nicht gespeichert werden.');
    }
  };

  const total = usage.reduce((sum, row) => sum + Number(row.cost_micro), 0);
  const byUser = new Map<string, { name: string; role: string; cost: number; requests: number }>();
  for (const row of usage) {
    const entry = byUser.get(row.user_id) ?? {
      name: row.display_name,
      role: row.role,
      cost: 0,
      requests: 0,
    };
    entry.cost += Number(row.cost_micro);
    entry.requests += Number(row.requests);
    byUser.set(row.user_id, entry);
  }
  const byApp = new Map<string, number>();
  for (const row of usage)
    byApp.set(row.app_slug, (byApp.get(row.app_slug) ?? 0) + Number(row.cost_micro));

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>KI-Proxy</h1>
        <p className="muted">
          Apps rufen KI über <code>ai.mininode.app</code> auf. Die Schlüssel bleiben auf dem Server;
          jede Anfrage wird vorab gegen die Budgets reserviert.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="kpis">
        <div className="card kpi">
          <span className="muted">Kosten diesen Monat</span>
          <strong>{euro(total)}</strong>
        </div>
        <div className="card kpi">
          <span className="muted">Anfragen</span>
          <strong>{usage.reduce((sum, row) => sum + Number(row.requests), 0)}</strong>
        </div>
      </div>

      <section className="card" aria-labelledby="budgets-title">
        <h2 id="budgets-title" className="section-title">
          Budgets pro Monat
        </h2>
        {budgets.map((budget) => {
          const key = `${budget.scope}:${budget.scope_key}`;
          return (
            <form
              key={key}
              className="row"
              style={{ flexWrap: 'wrap' }}
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(new FormData(event.currentTarget).get('euros'));
                if (Number.isFinite(value) && value >= 0) void save(budget, value);
              }}
            >
              <span style={{ flex: 1, minWidth: 200 }}>
                {SCOPE_LABEL[key] ?? `${budget.scope}: ${budget.scope_key}`}
              </span>
              <label className="field" style={{ width: 140 }}>
                <span className="sr-only">Limit in Euro</span>
                <input
                  name="euros"
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={budget.monthly_limit_micro / 1_000_000}
                />
              </label>
              <button type="submit" className="button small">
                Speichern
              </button>
            </form>
          );
        })}
      </section>

      <div className="home-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <section className="card" aria-labelledby="by-user">
          <h2 id="by-user" className="section-title">
            Pro Nutzer
          </h2>
          {byUser.size === 0 && <p className="muted">Diesen Monat noch keine Anfragen.</p>}
          {[...byUser.values()].map((entry) => (
            <div key={entry.name} className="row">
              <span style={{ flex: 1 }}>{entry.name}</span>
              <span className="muted">{entry.requests} Anfragen</span>
              <strong>{euro(entry.cost)}</strong>
            </div>
          ))}
        </section>
        <section className="card" aria-labelledby="by-app">
          <h2 id="by-app" className="section-title">
            Pro App
          </h2>
          {byApp.size === 0 && <p className="muted">Diesen Monat noch keine Anfragen.</p>}
          {[...byApp.entries()].map(([slug, cost]) => (
            <div key={slug} className="row">
              <span className="mono" style={{ flex: 1 }}>
                {slug}
              </span>
              <strong>{euro(cost)}</strong>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
