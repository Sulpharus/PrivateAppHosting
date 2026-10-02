import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { TopBar } from '../components/TopBar.tsx';
import { ApiError, api } from '../lib/api.ts';
import { safeNext } from '../lib/safe-next.ts';
import { platform } from '../lib/supabase.ts';

// "Dein Konto → Eigene API-Schlüssel" (ADR 0014). For APIs the admin set to "persönlich" every
// person brings their own key. An app that needs one sends people here (?service=<id>&next=<app>),
// with instructions, the provider's page when known, and a field for the key.

export interface PersonalKey {
  service_id: string;
  name: string;
  docs_url: string | null;
  base_url: string;
  auth_type: string;
  key_hint: string | null;
  apps: { slug: string; name: string; reason: string }[] | null;
}

export async function listPersonalKeys(): Promise<PersonalKey[]> {
  const { data, error } = await platform().rpc('my_api_keys');
  if (error) throw error;
  return (data as PersonalKey[] | null) ?? [];
}

/** Only https links are rendered as links (the address comes from an uploaded app's manifest). */
const safeLink = (url: string | null) => (url?.startsWith('https://') ? url : null);

const host = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function AccountKeys() {
  const [params] = useSearchParams();
  const wanted = params.get('service');
  const back = params.get('next') ? safeNext(params.get('next')) : null;
  const [keys, setKeys] = useState<PersonalKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys(await listPersonalKeys());
    } catch {
      setError('Die Liste konnte nicht geladen werden.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (service: PersonalKey, key: string): Promise<boolean> => {
    setError(null);
    setSaved(null);
    try {
      await api(`/me/api-keys/${service.service_id}`, { method: 'PUT', body: { key } });
      setSaved(service.service_id);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
      return false;
    }
  };

  const remove = async (service: PersonalKey) => {
    if (!confirm(`Deinen Schlüssel für ${service.name} entfernen?`)) return;
    setError(null);
    try {
      await api(`/me/api-keys/${service.service_id}`, { method: 'DELETE' });
      setSaved(null);
      await load();
    } catch {
      setError('Das hat nicht geklappt.');
    }
  };

  // The requested API first, then missing ones, then the rest.
  const sorted = [...(keys ?? [])].sort(
    (a, b) =>
      Number(b.service_id === wanted) - Number(a.service_id === wanted) ||
      Number(a.key_hint !== null) - Number(b.key_hint !== null) ||
      a.name.localeCompare(b.name, 'de'),
  );

  return (
    <>
      <TopBar />
      <main className="page stack" style={{ gap: 20, maxWidth: 760 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 36 }}>Eigene API-Schlüssel</h1>
          <p className="muted">
            Für manche Dienste (Wetter, Karten, Übersetzung …) bringt jede Person ihren eigenen
            Schlüssel mit. Er wird verschlüsselt gespeichert und nur für deine Aufrufe verwendet;
            auch der Admin sieht ihn nicht.
          </p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {keys && keys.length === 0 && (
          <p className="empty">
            Für deine Apps ist kein eigener Schlüssel nötig.
            {back && (
              <>
                {' '}
                <a href={back}>Zurück zur App</a>
              </>
            )}
          </p>
        )}
        {sorted.map((service) => (
          <KeyCard
            key={service.service_id}
            service={service}
            open={service.service_id === wanted || service.key_hint === null}
            justSaved={saved === service.service_id}
            back={back}
            onSave={(key) => save(service, key)}
            onRemove={() => void remove(service)}
          />
        ))}
      </main>
    </>
  );
}

function KeyCard(props: {
  service: PersonalKey;
  open: boolean;
  justSaved: boolean;
  back: string | null;
  onSave(key: string): Promise<boolean>;
  onRemove(): void;
}) {
  const { service } = props;
  const [replacing, setReplacing] = useState(false);
  const form = !service.key_hint || replacing;
  const id = `key-${service.service_id}`;
  return (
    <section className="card" aria-labelledby={id}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 id={id} style={{ flex: '1 1 200px', fontSize: 20 }}>
          {service.name}
        </h2>
        {service.key_hint ? (
          <span className="pill ok">
            <span className="dot" />
            Dein Schlüssel …{service.key_hint}
          </span>
        ) : (
          <span className="pill bad">
            <span className="dot" />
            Fehlt noch
          </span>
        )}
      </div>
      {service.apps && service.apps.length > 0 && (
        <p className="muted" style={{ fontSize: 14 }}>
          Gebraucht von: {service.apps.map((app) => `${app.name} (${app.reason})`).join(', ')}
        </p>
      )}

      <details open={props.open}>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>
          So kommst du an den Schlüssel
        </summary>
        <ol className="stack" style={{ gap: 8, paddingLeft: 20 }}>
          <li>
            {safeLink(service.docs_url) ? (
              <>
                Öffne die Seite des Anbieters:{' '}
                <a
                  href={safeLink(service.docs_url) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {host(service.docs_url ?? '')}
                </a>
                .
              </>
            ) : (
              <>
                Suche beim Anbieter ({host(service.base_url)}) nach „API key“, „Developer“ oder
                „Zugang“. Einen Link hat die App nicht hinterlegt.
              </>
            )}
          </li>
          <li>
            Melde dich an oder lege ein Konto an. Viele Anbieter haben einen kostenlosen Tarif.
          </li>
          <li>Erzeuge einen API-Schlüssel (meist unter „API keys“ oder im Konto-Bereich).</li>
          <li>Kopiere ihn und füge ihn unten ein. Wähle, wenn möglich, nur lesenden Zugriff.</li>
        </ol>
      </details>

      {form ? (
        <form
          className="budget-row"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const key = String(new FormData(form).get('key') ?? '').trim();
            // Keep what was typed until the save worked.
            if (key.length >= 12)
              void props.onSave(key).then((saved) => {
                if (!saved) return;
                setReplacing(false);
                form.reset();
              });
          }}
        >
          <label className="field" style={{ flex: '1 1 260px' }}>
            <span className="sr-only">API-Schlüssel für {service.name}</span>
            <input
              name="key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              minLength={12}
              maxLength={4000}
              required
              placeholder="Schlüssel hier einfügen"
            />
          </label>
          <div className="row">
            <button type="submit" className="button small primary">
              Speichern
            </button>
            {replacing && (
              <button type="button" className="button small" onClick={() => setReplacing(false)}>
                Abbrechen
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="row row-end">
          <button type="button" className="button small" onClick={() => setReplacing(true)}>
            Ersetzen
          </button>
          <button type="button" className="button small danger" onClick={props.onRemove}>
            Entfernen
          </button>
        </div>
      )}
      {props.justSaved && (
        <p className="pill ok" role="status">
          Gespeichert.{' '}
          {props.back && (
            <a href={props.back} style={{ marginLeft: 6 }}>
              Zurück zur App
            </a>
          )}
        </p>
      )}
    </section>
  );
}

/** A link card for the account page: shows only when the user has personal-key APIs. */
export function PersonalKeysCard() {
  const [keys, setKeys] = useState<PersonalKey[] | null>(null);
  useEffect(() => {
    listPersonalKeys().then(setKeys, () => setKeys(null));
  }, []);
  if (!keys || keys.length === 0) return null;
  const missing = keys.filter((key) => key.key_hint === null).length;
  return (
    <section className="card" aria-labelledby="personal-keys-title">
      <h2 id="personal-keys-title" className="section-title">
        Eigene API-Schlüssel
      </h2>
      <p className="muted">
        {missing > 0
          ? `Für ${missing} ${missing === 1 ? 'Dienst fehlt' : 'Dienste fehlen'} noch dein Schlüssel.`
          : 'Alle deine Schlüssel sind eingetragen.'}
      </p>
      <a className="button" href="/account/keys">
        Schlüssel verwalten
      </a>
    </section>
  );
}
