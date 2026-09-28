import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { CodeForm } from '../auth/CodeForm.tsx';
import { googleEnabled, googleErrorFromUrl, signInWithGoogle } from '../auth/google.ts';
import { codeRequired } from '../auth/mfa.ts';
import { passkeyErrorMessage, passkeysSupported, signInWithPasskey } from '../auth/passkeys.ts';
import { GoogleMark, Logo } from '../components/icons.tsx';
import { emailEnabled } from '../config.ts';
import { goTo, safeNext } from '../lib/safe-next.ts';
import { supabase } from '../lib/supabase.ts';

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading, codePending, signOut } = useAuth();
  const next = safeNext(params.get('next'));
  const fromGoogle = params.get('via') === 'google';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => googleErrorFromUrl(params));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askCode, setAskCode] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    void googleEnabled().then(setGoogle);
  }, []);

  const done = () => goTo(next, navigate);
  const ready = !loading && session && !codePending && !askCode && !busy;

  // Back from Google (possibly to an app on another subdomain): finish like a password sign-in.
  useEffect(() => {
    if (ready && fromGoogle && !next.startsWith('/')) void goTo(next, navigate);
  }, [ready, fromGoogle, next, navigate]);

  if (ready && next.startsWith('/')) return <Navigate to={next} replace />;

  /** After the first factor: ask for the authenticator code when the account has one. */
  const afterSignIn = async () => {
    if (await codeRequired()) setAskCode(true);
    else await done();
  };

  const withPasskey = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPasskey();
      await afterSignIn();
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
    if (signInError) setError('E-Mail oder Passwort stimmt nicht.');
    else await afterSignIn();
    setBusy(false);
  };

  const withGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(next);
    } catch {
      setError('Die Anmeldung mit Google hat nicht geklappt. Bitte noch einmal versuchen.');
      setBusy(false);
    }
  };

  if (!loading && session && (codePending || askCode))
    return (
      <main className="auth">
        <div className="auth-card">
          <div className="brand">
            <Logo />
            <span>mininode</span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <h1>Zweiter Schritt</h1>
            <p className="muted">
              Öffne deine Authenticator-App und gib den sechsstelligen Code für MiniNode ein.
            </p>
          </div>
          <CodeForm
            onDone={() => void done()}
            onCancel={async () => {
              setAskCode(false);
              await signOut();
            }}
          />
        </div>
      </main>
    );

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

        {google && (
          <button type="button" className="button wide" onClick={withGoogle} disabled={busy}>
            <GoogleMark />
            Mit Google anmelden
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
