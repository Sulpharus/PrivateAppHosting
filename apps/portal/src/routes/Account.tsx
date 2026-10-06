import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { googleErrorFromUrl } from '../auth/google.ts';
import { needsAal2 } from '../auth/mfa.ts';
import {
  deletePasskey,
  listPasskeys,
  type PasskeyInfo,
  passkeyErrorMessage,
  passkeysSupported,
  registerPasskey,
  renamePasskey,
} from '../auth/passkeys.ts';
import { useStepUp } from '../auth/StepUp.tsx';
import { TopBar } from '../components/TopBar.tsx';
import { runtimeConfig } from '../config.ts';
import { isReauthError } from '../lib/api.ts';
import { LANGUAGES, type Language, writeLanguageCookie } from '../lib/language.ts';
import { platform, supabase } from '../lib/supabase.ts';
import { PersonalKeysCard } from './AccountKeys.tsx';
import { NotificationsCard } from './AccountNotifications.tsx';
import { AuthenticatorCard, GoogleCard } from './AccountSecurity.tsx';

const ROLE_LABEL = { admin: 'Admin', trusted: 'Vertrauenswürdig', user: 'Nutzer' } as const;

function formatDate(value: string | null): string {
  if (!value) return 'noch nie';
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function Account() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { run: stepUp } = useStepUp();
  const [params, setParams] = useSearchParams();
  const resetMode = params.get('reset') === '1';
  const [name, setName] = useState(profile?.displayName ?? '');
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => googleErrorFromUrl(params));
  const feedback = useMemo(
    () => ({
      ok(text: string) {
        setError(null);
        setMessage(text);
      },
      fail(text: string) {
        setMessage(null);
        setError(text);
      },
    }),
    [],
  );

  const clearLinked = useCallback(() => setParams({}, { replace: true }), [setParams]);

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
      // Accounts with an authenticator app confirm passkey changes with its code (aal2).
      await stepUp(action);
      setMessage(success);
      await reload();
    } catch (err) {
      if (err instanceof Error && err.message === 'Bestätigung abgebrochen.') return;
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

  // A preference, not a security setting: no confirmation code is asked for.
  const saveLanguage = async (language: Language) => {
    if (!profile || language === profile.language) return;
    setError(null);
    setMessage(null);
    const { data: saved, error: updateError } = await platform()
      .from('profiles')
      .update({ language })
      .eq('user_id', profile.userId)
      .select('language');
    // No error but no row either: RLS refused it, nothing was saved.
    if (updateError || !saved?.length) {
      setError(
        language === 'en'
          ? 'Could not save the language.'
          : 'Die Sprache konnte nicht gespeichert werden.',
      );
      return;
    }
    writeLanguageCookie(language, runtimeConfig()?.cookieDomain);
    await refreshProfile();
    setMessage(language === 'en' ? 'Language saved.' : 'Sprache gespeichert.');
  };

  const [birthday, setBirthday] = useState({ month: '', day: '', year: '', shared: false });
  useEffect(() => {
    void (async () => {
      const { data } = await platform().rpc('my_birthday');
      const row = (
        data as { month: number | null; day: number | null; year: number | null; shared: boolean }[]
      )?.[0];
      if (row)
        setBirthday({
          month: row.month ? String(row.month) : '',
          day: row.day ? String(row.day) : '',
          year: row.year ? String(row.year) : '',
          shared: row.shared,
        });
    })();
  }, []);

  // A preference, not a security setting: no confirmation code is asked for.
  const saveBirthday = async (clear = false) => {
    setError(null);
    setMessage(null);
    const set = !clear && birthday.month && birthday.day;
    const { error: rpcError } = await platform().rpc('set_my_birthday', {
      p_month: set ? Number(birthday.month) : null,
      p_day: set ? Number(birthday.day) : null,
      p_year: set && birthday.year ? Number(birthday.year) : null,
      p_shared: set ? birthday.shared : false,
    });
    if (rpcError) {
      setError('Das Datum gibt es nicht. Bitte Tag, Monat und Jahr prüfen.');
      return;
    }
    if (!set) setBirthday({ month: '', day: '', year: '', shared: false });
    setMessage(set ? 'Geburtstag gespeichert.' : 'Geburtstag entfernt.');
  };

  const savePassword = async () => {
    setError(null);
    setMessage(null);
    try {
      await stepUp(async () => {
        const { error: updateError } = await supabase().auth.updateUser({ password });
        if (updateError) throw updateError;
      });
      setPassword('');
      setMessage('Passwort geändert.');
    } catch (err) {
      setError(
        isReauthError(err) ||
          needsAal2(err) ||
          (err instanceof Error && err.message === 'Bestätigung abgebrochen.')
          ? 'Bitte bestätige kurz deine Identität und versuch es noch einmal.'
          : 'Das Passwort ist zu schwach (mindestens 10 Zeichen, Buchstaben und Ziffern).',
      );
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

        <section className="card" aria-labelledby="language-title">
          <h2 id="language-title" className="section-title">
            Sprache / Language
          </h2>
          <p className="muted">
            Gilt für alle Apps, die ein Sprachpaket haben; die übrigen bleiben deutsch. · Applies to
            every app that has a language package; the others stay German.
          </p>
          <fieldset className="chip-scroll" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Sprache / Language</legend>
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                className="chip"
                lang={code}
                aria-pressed={profile?.language === code}
                onClick={() => void saveLanguage(code)}
              >
                {label}
              </button>
            ))}
          </fieldset>
        </section>

        <section className="card" aria-labelledby="birthday-title">
          <h2 id="birthday-title" className="section-title">
            Geburtstag
          </h2>
          <p className="muted">
            Nur für dich, bis du ihn freigibst. Freigegeben sehen ihn nur Personen, die dieselben
            Apps nutzen (zum Beispiel in der Wunschliste, damit sie rechtzeitig ein Geschenk
            finden). Das Jahr ist freiwillig.
          </p>
          <form
            className="row"
            style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveBirthday();
            }}
          >
            <label className="field" style={{ width: 90 }}>
              <span>Tag</span>
              <input
                inputMode="numeric"
                maxLength={2}
                value={birthday.day}
                onChange={(event) =>
                  setBirthday({ ...birthday, day: event.target.value.replace(/\D/g, '') })
                }
              />
            </label>
            <label className="field" style={{ width: 90 }}>
              <span>Monat</span>
              <input
                inputMode="numeric"
                maxLength={2}
                value={birthday.month}
                onChange={(event) =>
                  setBirthday({ ...birthday, month: event.target.value.replace(/\D/g, '') })
                }
              />
            </label>
            <label className="field" style={{ width: 110 }}>
              <span>Jahr (freiwillig)</span>
              <input
                inputMode="numeric"
                maxLength={4}
                value={birthday.year}
                onChange={(event) =>
                  setBirthday({ ...birthday, year: event.target.value.replace(/\D/g, '') })
                }
              />
            </label>
            <label className="row" style={{ minHeight: 44 }}>
              <input
                type="checkbox"
                checked={birthday.shared}
                onChange={(event) => setBirthday({ ...birthday, shared: event.target.checked })}
              />
              <span>Für andere Personen sichtbar</span>
            </label>
            <button type="submit" className="button" disabled={!birthday.day || !birthday.month}>
              Speichern
            </button>
            <button type="button" className="button" onClick={() => void saveBirthday(true)}>
              Entfernen
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

        <NotificationsCard feedback={feedback} />
        <PersonalKeysCard />
        <AuthenticatorCard feedback={feedback} />
        <GoogleCard
          feedback={feedback}
          linked={params.get('linked') === 'google'}
          onLinkedShown={clearLinked}
        />

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
          // /logout signs out (push off, offline copies gone) and only then shows the login page.
          onClick={() => navigate('/logout', { replace: true, state: { fromPortal: true } })}
        >
          Abmelden
        </button>
      </main>
    </>
  );
}
