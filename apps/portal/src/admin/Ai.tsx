import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { platformDomain } from '../lib/host.ts';
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

const GEMINI_DOCS = 'https://ai.google.dev/gemini-api/docs/models';
const CLAUDE_DOCS = 'https://docs.claude.com/en/docs/about-claude/models/overview';

interface ModelRow {
  alias: 'gemini-flash' | 'gemini-pro' | 'claude-haiku' | 'claude-sonnet';
  model_id: string;
  input_eur_per_mtok: number | string;
  output_eur_per_mtok: number | string;
  effort: 'low' | 'medium' | 'high' | null;
  updated_at: string;
}

/** The aliases apps declare in mininode.json, in the order of the table. */
const ALIASES: { alias: ModelRow['alias']; label: string; docs: string }[] = [
  { alias: 'gemini-flash', label: 'Gemini Flash (schnell, günstig)', docs: GEMINI_DOCS },
  { alias: 'gemini-pro', label: 'Gemini Pro', docs: GEMINI_DOCS },
  { alias: 'claude-haiku', label: 'Claude Haiku (schnell, günstig)', docs: CLAUDE_DOCS },
  { alias: 'claude-sonnet', label: 'Claude Sonnet', docs: CLAUDE_DOCS },
];

const EFFORTS: [string, string][] = [
  ['', 'Standard des Modells'],
  ['low', 'Niedrig'],
  ['medium', 'Mittel'],
  ['high', 'Hoch'],
];

/** Model ids: lowercase letters, digits, dots, dashes and underscores (checked again in the database). */
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;

const SCOPE_LABEL: Record<string, string> = {
  'global:*': 'Gesamtbudget (hartes Limit, außer für dich)',
  'role:user': 'Standard pro User',
  'role:trusted': 'Standard pro Trusted',
};

export function Ai() {
  const { run } = useStepUp();
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, b, m] = await Promise.all([
      platform().rpc('admin_ai_usage'),
      platform().from('ai_budgets').select('scope, scope_key, monthly_limit_micro').order('scope'),
      platform()
        .from('ai_models')
        .select('alias, model_id, input_eur_per_mtok, output_eur_per_mtok, effort, updated_at'),
    ]);
    setUsage((u.data as UsageRow[] | null) ?? []);
    setBudgets((b.data as BudgetRow[] | null) ?? []);
    setModels((m.data as ModelRow[] | null) ?? []);
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

  const saveModel = async (alias: ModelRow['alias'], form: FormData) => {
    setError(null);
    setSaved('');
    const modelId = String(form.get('model') ?? '').trim();
    const input = Number(String(form.get('input') ?? '').replace(',', '.'));
    const output = Number(String(form.get('output') ?? '').replace(',', '.'));
    const effort = String(form.get('effort') ?? '');
    if (!MODEL_ID.test(modelId)) {
      setError(
        'Die Modell-ID besteht nur aus Kleinbuchstaben, Ziffern, Punkt und Bindestrich, z. B. claude-haiku-5-5.',
      );
      return;
    }
    if (!(input >= 0 && input <= 1000 && output >= 0 && output <= 1000)) {
      setError('Gib die Preise in Euro pro Million Tokens an, zwischen 0 und 1000.');
      return;
    }
    try {
      await run(async () => {
        const { error: updateError } = await platform()
          .from('ai_models')
          .update({
            model_id: modelId,
            input_eur_per_mtok: input,
            output_eur_per_mtok: output,
            ...(alias.startsWith('claude-') ? { effort: effort || null } : {}),
          })
          .eq('alias', alias);
        if (updateError) throw updateError;
      });
      await load();
      setSaved(`${alias} gespeichert. Der KI-Proxy nutzt es spätestens in einer Minute.`);
    } catch {
      setError('Das Modell konnte nicht gespeichert werden.');
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
          Apps rufen KI über <code>ai.{platformDomain()}</code> auf. Die Schlüssel bleiben auf dem
          Server; jede Anfrage wird vorab gegen die Budgets reserviert.
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

      <section className="card" aria-labelledby="models-title">
        <h2 id="models-title" className="section-title">
          Modelle
        </h2>
        <p className="muted">
          Apps wählen eines von vier Modellen (in ihrer <code>mininode.json</code>). Hier legst du
          fest, welches Modell der Anbieter dafür wirklich aufruft und was es kostet. Wenn ein
          Anbieter ein neues Modell herausbringt, trägst du hier seine ID und die Preise ein; das
          gilt nach spätestens einer Minute für alle Apps. Die Preise rechnen die Budgets: nimm die
          Listenpreise des Anbieters in Dollar als Euro, dann reicht ein Budget sicher.
        </p>
        <p className="muted" role="status" aria-live="polite">
          {saved}
        </p>
        {ALIASES.map(({ alias, label, docs }) => {
          const row = models.find((m) => m.alias === alias);
          if (!row) return null;
          const claude = alias.startsWith('claude-');
          return (
            <form
              key={`${alias}:${row.updated_at}`}
              className="model-row"
              onSubmit={(event) => {
                event.preventDefault();
                void saveModel(alias, new FormData(event.currentTarget));
              }}
            >
              <div className="model-head">
                <strong>{label}</strong>
                <span className="mono muted">{alias}</span>
                <a href={docs} target="_blank" rel="noopener noreferrer">
                  Modelle des Anbieters
                </a>
              </div>
              <div className="model-fields">
                <label className="field">
                  <span>Modell-ID beim Anbieter</span>
                  <input
                    name="model"
                    defaultValue={row.model_id}
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </label>
                <label className="field">
                  <span>Eingabe, € pro Mio. Tokens</span>
                  <input
                    name="input"
                    inputMode="decimal"
                    defaultValue={String(Number(row.input_eur_per_mtok))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Ausgabe, € pro Mio. Tokens</span>
                  <input
                    name="output"
                    inputMode="decimal"
                    defaultValue={String(Number(row.output_eur_per_mtok))}
                    required
                  />
                </label>
                {claude && (
                  <label className="field">
                    <span>Denkaufwand</span>
                    <select name="effort" defaultValue={row.effort ?? ''}>
                      {EFFORTS.map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                    <small className="muted">Niedrig passt für kurze App-Antworten</small>
                  </label>
                )}
              </div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <span className="muted small-text" style={{ flex: 1 }}>
                  Zuletzt geändert{' '}
                  {new Date(row.updated_at).toLocaleString('de-DE', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                <button type="submit" className="button small">
                  Speichern
                </button>
              </div>
            </form>
          );
        })}
        {models.length === 0 && (
          <p className="muted">Die Modelle werden geladen oder sind noch nicht eingerichtet.</p>
        )}
      </section>

      <section className="card" aria-labelledby="budgets-title">
        <h2 id="budgets-title" className="section-title">
          Budgets pro Monat
        </h2>
        {budgets.map((budget) => {
          const key = `${budget.scope}:${budget.scope_key}`;
          return (
            <form
              key={key}
              className="budget-row"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(new FormData(event.currentTarget).get('euros'));
                if (Number.isFinite(value) && value >= 0) void save(budget, value);
              }}
            >
              <span className="budget-name">
                {SCOPE_LABEL[key] ?? `${budget.scope}: ${budget.scope_key}`}
              </span>
              <label className="money-field">
                <span className="sr-only">Monatliches Limit in Euro</span>
                <input
                  name="euros"
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={budget.monthly_limit_micro / 1_000_000}
                />
                <span className="muted" aria-hidden="true">
                  €
                </span>
              </label>
              <button type="submit" className="button small">
                Speichern
              </button>
            </form>
          );
        })}
      </section>

      <div className="pair-grid">
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
