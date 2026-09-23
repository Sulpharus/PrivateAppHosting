import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { passkeyErrorMessage, passkeysSupported, registerPasskey } from '../auth/passkeys.ts';
import { Logo } from '../components/icons.tsx';
import { goTo, safeNext } from '../lib/safe-next.ts';
import { platform, supabase } from '../lib/supabase.ts';

/** First visit after accepting an invite: name, passkey (recommended) and a fallback password. */
export function Welcome() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [name, setName] = useState(profile?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [hasPasskey, setHasPasskey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addPasskey = async () => {
    setError(null);
    try {
      await registerPasskey();
      setHasPasskey(true);
    } catch (err) {
      setError(passkeyErrorMessage(err));
    }
  };

  const finish = async () => {
    setError(null);
    if (!hasPasskey && password.length < 10) {
      setError('Richte einen Passkey ein oder vergib ein Passwort mit mindestens 10 Zeichen.');
      return;
    }
    setBusy(true);
    if (profile && name.trim() && name.trim() !== profile.displayName) {
      await platform()
        .from('profiles')
        .update({ display_name: name.trim() })
        .eq('user_id', profile.userId);
    }
    if (password) {
      const { error: updateError } = await supabase().auth.updateUser({ password });
      if (updateError) {
        setBusy(false);
        setError(
          'Das Passwort ist zu schwach. Nimm mindestens 10 Zeichen mit Buchstaben und Ziffern.',
        );
        return;
      }
    }
    await refreshProfile();
    setBusy(false);
    await goTo(next, navigate);
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <Logo />
          <span>mininode</span>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h1>Schön, dass du da bist</h1>
          <p className="muted">Zwei kurze Schritte, dann kannst du loslegen.</p>
        </div>

        <label className="field">
          <span>Wie sollen wir dich nennen?</span>
          <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </label>

        {passkeysSupported() && (
          <div className="card">
            <strong>Passkey einrichten</strong>
            <p className="muted">
              Melde dich künftig mit Fingerabdruck, Gesichtserkennung oder Windows Hello an – ohne
              Passwort.
            </p>
            <button
              type="button"
              className={`button wide ${hasPasskey ? '' : 'primary'}`}
              onClick={addPasskey}
              disabled={hasPasskey}
            >
              {hasPasskey ? 'Passkey eingerichtet' : 'Passkey einrichten'}
            </button>
          </div>
        )}

        <label className="field">
          <span>{hasPasskey ? 'Passwort als Reserve (optional)' : 'Passwort'}</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button type="button" className="button primary wide" onClick={finish} disabled={busy}>
          Fertig
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
