import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  deletePasskey,
  listPasskeys,
  type PasskeyInfo,
  passkeyErrorMessage,
  passkeysSupported,
  registerPasskey,
  renamePasskey,
} from '../auth/passkeys.ts';
import { TopBar } from '../components/TopBar.tsx';
import { platform, supabase } from '../lib/supabase.ts';

const ROLE_LABEL = { admin: 'Admin', trusted: 'Vertrauenswürdig', user: 'Nutzer' } as const;

function formatDate(value: string | null): string {
  if (!value) return 'noch nie';
  return new Date(value).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function Account() {
  const { profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resetMode = params.get('reset') === '1';
  const [name, setName] = useState(profile?.displayName ?? '');
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (passkeysSupported()) setPasskeys(await listPasskeys().catch(() => []));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (profile) setName(profile.displayName);
  }, [profile]);

  const run = async (action: () => Promise<void>, success: string) => {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await reload();
    } catch (err) {
      setError(passkeyErrorMessage(err));
    }
  };

  const saveName = () =>
    run(async () => {
      if (!profile) return;
      const { error: updateError } = await platform()
        .from('profiles')
        .update({ display_name: name.trim() })
        .eq('user_id', profile.userId);
      if (updateError) throw updateError;
      await refreshProfile();
    }, 'Name gespeichert.');

  const savePassword = async () => {
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase().auth.updateUser({ password });
    if (updateError)
      setError('Das Passwort ist zu schwach (mindestens 10 Zeichen, Buchstaben und Ziffern).');
    else {
      setPassword('');
      setMessage('Passwort geändert.');
    }
  };

  return (
    <>
      <TopBar />
      <main className="page" style={{ maxWidth: 760 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 40 }}>Dein Konto</h1>
          <p className="muted">
            {profile?.email} · {profile ? ROLE_LABEL[profile.role] : ''}
          </p>
        </div>

        {message && (
          <p className="pill ok" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <section className="card" aria-labelledby="profile-title">
          <h2 id="profile-title" className="section-title">
            Profil
          </h2>
          <form
            className="row"
            style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <label className="field" style={{ flex: 1, minWidth: 220 }}>
              <span>Anzeigename</span>
              <input
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit" className="button" disabled={!name.trim()}>
              Speichern
            </button>
          </form>
        </section>

        {passkeysSupported() && (
          <section className="card" aria-labelledby="passkey-title">
            <div className="row">
              <h2 id="passkey-title" className="section-title">
                Passkeys
              </h2>
              <span className="spacer" />
              <button
                type="button"
                className="button small primary"
                onClick={() => run(registerPasskey, 'Passkey hinzugefügt.')}
              >
                Dieses Gerät hinzufügen
              </button>
            </div>
            {passkeys.length === 0 && (
              <p className="muted">
                Noch kein Passkey. Füge dieses Gerät hinzu, um dich ohne Passwort anzumelden.
              </p>
            )}
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="row" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <strong>{passkey.name}</strong>
                  <p className="muted" style={{ fontSize: 13 }}>
                    Hinzugefügt {formatDate(passkey.createdAt)} · zuletzt benutzt{' '}
                    {formatDate(passkey.lastUsedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="button small"
                  onClick={() => {
                    const next = prompt('Neuer Name für diesen Passkey', passkey.name);
                    if (next?.trim())
                      void run(() => renamePasskey(passkey.id, next.trim()), 'Umbenannt.');
                  }}
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  className="button small danger"
                  onClick={() => {
                    if (confirm(`Passkey „${passkey.name}“ entfernen?`)) {
                      void run(() => deletePasskey(passkey.id), 'Passkey entfernt.');
                    }
                  }}
                >
                  Entfernen
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="card" aria-labelledby="password-title">
          <h2 id="password-title" className="section-title">
            {resetMode ? 'Neues Passwort festlegen' : 'Passwort'}
          </h2>
          <form
            className="row"
            style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
            onSubmit={(event) => {
              event.preventDefault();
              void savePassword();
            }}
          >
            <label className="field" style={{ flex: 1, minWidth: 220 }}>
              <span>Neues Passwort (mindestens 10 Zeichen)</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                // biome-ignore lint/a11y/noAutofocus: the reset link lands here to set a password
                autoFocus={resetMode}
              />
            </label>
            <button type="submit" className="button" disabled={password.length < 10}>
              Ändern
            </button>
          </form>
        </section>

        <button
          type="button"
          className="button danger"
          onClick={async () => {
            // Leave the protected area first so the session guard does not add ?next=/account.
            navigate('/login', { replace: true });
            await signOut();
          }}
        >
          Abmelden
        </button>
      </main>
    </>
  );
}
