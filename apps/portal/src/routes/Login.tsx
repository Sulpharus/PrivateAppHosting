import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { passkeyErrorMessage, passkeysSupported, signInWithPasskey } from '../auth/passkeys.ts';
import { Logo } from '../components/icons.tsx';
import { emailEnabled } from '../config.ts';
import { goTo, safeNext } from '../lib/safe-next.ts';
import { supabase } from '../lib/supabase.ts';

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session && next.startsWith('/')) return <Navigate to={next} replace />;

  const done = () => goTo(next, navigate);

  const withPasskey = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPasskey();
      await done();
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const withPassword = async () => {
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) setError('E-Mail oder Passwort stimmt nicht.');
    else await done();
  };

  const forgotPassword = async () => {
    setError(null);
    if (!emailEnabled()) {
      setNotice('Frag den Admin nach einem Link zum Zurücksetzen (Verwaltung → Nutzer & Rollen).');
      return;
    }
    if (!email) {
      setError('Gib zuerst deine E-Mail-Adresse ein.');
      return;
    }
    await supabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/account?reset=1`,
    });
    // Same message whether or not the address exists.
    setNotice('Falls es einen Account gibt, ist eine E-Mail zum Zurücksetzen unterwegs.');
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <Logo />
          <span>mininode</span>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h1>Anmelden</h1>
          <p className="muted">
            Nur mit Einladung. Am schnellsten mit Fingerabdruck oder Gesichtserkennung.
          </p>
        </div>

        {passkeysSupported() && (
          <button
            type="button"
            className="button primary wide"
            onClick={withPasskey}
            disabled={busy}
          >
            Mit Passkey anmelden
          </button>
        )}

        <div className="divider">oder mit Passwort</div>

        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void withPassword();
          }}
        >
          <label className="field">
            <span>E-Mail</span>
            <input
              type="email"
              autoComplete="username webauthn"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Passwort</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit" className="button wide" disabled={busy}>
            Anmelden
          </button>
          <button type="button" className="button small" onClick={forgotPassword}>
            Passwort vergessen?
          </button>
        </form>

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
      </div>
    </main>
  );
}
