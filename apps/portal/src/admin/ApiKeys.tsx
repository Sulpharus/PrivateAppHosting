import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { ApiError, api } from '../lib/api.ts';
import { platform } from '../lib/supabase.ts';
import { dateTime } from './AdminLayout.tsx';

// Host-level API keys (ADR 0006). Apps declare the APIs they need in mininode.json; each API is
// one entry here, shared by every app that uses it. The key is stored encrypted by the API Worker
// and never comes back to the browser: only its last four characters are shown.

type Auth =
  | { type: 'header'; name: string; prefix?: string }
  | { type: 'bearer' }
  | { type: 'query'; param: string };

interface ServiceRow {
  id: string;
  name: string;
  base_url: string;
  auth: Auth;
  docs_url: string | null;
  key_hint: string | null;
  key_updated_at: string | null;
}

interface RequestRow {
  app_slug: string;
  service_id: string;
  reason: string;
}

function placement(auth: Auth): string {
  if (auth.type === 'bearer') return 'Authorization: Bearer …';
  if (auth.type === 'query') return `Query-Parameter ${auth.param}`;
  return `Header ${auth.name}`;
}

export function ApiKeys() {
  const { run } = useStepUp();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([
      platform()
        .from('api_services')
        .select('id, name, base_url, auth, docs_url, key_hint, key_updated_at')
        .order('name'),
      platform().from('app_api_services').select('app_slug, service_id, reason').order('app_slug'),
    ]);
    setServices((s.data as ServiceRow[] | null) ?? []);
    setRequests((r.data as RequestRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const guarded = async (action: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await run(action);
      setNotice(done);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
    }
  };

  const saveKey = (service: ServiceRow, key: string) =>
    void guarded(
      () => api(`/admin/api-keys/${service.id}`, { method: 'PUT', body: { key } }),
      `Schlüssel für ${service.name} gespeichert.`,
    );

  const removeKey = (service: ServiceRow) => {
    if (!confirm(`Schlüssel für ${service.name} entfernen? Apps, die ihn nutzen, stoppen dann.`))
      return;
    void guarded(
      () => api(`/admin/api-keys/${service.id}`, { method: 'DELETE' }),
      `Schlüssel für ${service.name} entfernt.`,
    );
  };

  const removeService = (service: ServiceRow) => {
    if (
      !confirm(
        `${service.name} aus der Liste entfernen? Ein gespeicherter Schlüssel wird gelöscht.`,
      )
    )
      return;
    void guarded(
      () => api(`/admin/api-services/${service.id}`, { method: 'DELETE' }),
      `${service.name} aus der Liste entfernt.`,
    );
  };

  const appsOf = (id: string) => requests.filter((r) => r.service_id === id);
  const missing = services.filter((s) => !s.key_hint && appsOf(s.id).length > 0);
  const ready = services.filter((s) => s.key_hint && appsOf(s.id).length > 0);
  const unused = services.filter((s) => appsOf(s.id).length === 0);

  const card = (service: ServiceRow) => {
    const apps = appsOf(service.id);
    const open = editing === service.id || !service.key_hint;
    return (
      <section key={service.id} className="card" aria-labelledby={`api-${service.id}`}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h3 id={`api-${service.id}`} style={{ flex: '1 1 200px', fontSize: 18 }}>
            {service.name}
          </h3>
          {service.key_hint ? (
            <span className="pill ok">
              <span className="dot" />
              Schlüssel …{service.key_hint}
            </span>
          ) : apps.length > 0 ? (
            <span className="pill bad">
              <span className="dot" />
              Schlüssel fehlt
            </span>
          ) : (
            <span className="pill">Unbenutzt</span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          <span className="mono">{service.id}</span> ·{' '}
          <span className="mono">{service.base_url}</span> · {placement(service.auth)}
          {service.docs_url && (
            <>
              {' · '}
              <a href={service.docs_url} target="_blank" rel="noopener noreferrer">
                Schlüssel besorgen
              </a>
            </>
          )}
        </div>
        {apps.length > 0 && (
          <ul className="stack" style={{ gap: 4, paddingLeft: 18 }}>
            {apps.map((r) => (
              <li key={r.app_slug}>
                <span className="mono">{r.app_slug}</span>
                <span className="muted">: {r.reason}</span>
              </li>
            ))}
          </ul>
        )}
        {service.key_updated_at && (
          <p className="muted" style={{ fontSize: 14 }}>
            Zuletzt geändert {dateTime(service.key_updated_at)}
          </p>
        )}
        {open && apps.length > 0 ? (
          <form
            className="budget-row"
            onSubmit={(event) => {
              event.preventDefault();
              const key = String(new FormData(event.currentTarget).get('key') ?? '').trim();
              if (key.length >= 4) saveKey(service, key);
            }}
          >
            <label className="field" style={{ flex: '1 1 260px' }}>
              <span className="sr-only">API-Schlüssel für {service.name}</span>
              <input
                name="key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                minLength={4}
                maxLength={4000}
                required
                placeholder="API-Schlüssel einfügen"
              />
            </label>
            <div className="row">
              <button type="submit" className="button small primary">
                Speichern
              </button>
              {service.key_hint && (
                <button type="button" className="button small" onClick={() => setEditing(null)}>
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="row row-end">
            {service.key_hint && apps.length > 0 && (
              <button type="button" className="button small" onClick={() => setEditing(service.id)}>
                Ersetzen
              </button>
            )}
            {service.key_hint && (
              <button
                type="button"
                className="button small danger"
                onClick={() => removeKey(service)}
              >
                Schlüssel entfernen
              </button>
            )}
            {apps.length === 0 && (
              <button type="button" className="button small" onClick={() => removeService(service)}>
                Aus der Liste entfernen
              </button>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>API-Schlüssel</h1>
        <p className="muted">
          Apps melden die externen APIs, die sie brauchen, in <code>mininode.json</code> an. Jede
          API steht hier einmal, egal wie viele Apps sie nutzen; ein Schlüssel gilt für alle. Er
          wird verschlüsselt gespeichert und nur auf dem Server eingesetzt.
        </p>
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
      {services.length === 0 && <p className="empty">Noch keine App hat eine API angemeldet.</p>}
      {missing.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <h2 className="section-title">Benötigt ({missing.length})</h2>
          {missing.map(card)}
        </div>
      )}
      {ready.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <h2 className="section-title">Eingerichtet</h2>
          {ready.map(card)}
        </div>
      )}
      {unused.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <h2 className="section-title">Von keiner App mehr genutzt</h2>
          {unused.map(card)}
        </div>
      )}
    </>
  );
}
