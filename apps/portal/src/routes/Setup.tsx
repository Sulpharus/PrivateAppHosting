import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '../components/icons.tsx';
import { ApiError, publicApi } from '../lib/api.ts';
import { supabase } from '../lib/supabase.ts';

/** First start of a new installation: whoever gets here first creates the admin account. */
export function Setup() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    publicApi<{ open: boolean }>('/setup')
      .then((status) => {
        if (status.open) setOpen(true);
        else navigate('/login', { replace: true });
      })
      .catch(() => setError('Die Einrichtung ist gerade nicht erreichbar. Bitte neu laden.'));
  }, [navigate]);

  const submit = async () => {
    setError(null);
    if (password.length < 12) {
      setError('Das Passwort braucht mindestens 12 Zeichen.');
      return;
    }
    if (password !== repeat) {
      setError('Die beiden Passwörter sind nicht gleich.');
      return;
    }
    setBusy(true);
    try {
      await publicApi('/setup', { method: 'POST', body: { email, password } });
      const { error: signInError } = await supabase().auth.signInWithPassword({ email, password });
      navigate(signInError ? '/login' : '/welcome', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'setup_closed')
        navigate('/login', { replace: true });
      else setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <Logo />
          <span>mininode</span>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h1>Admin-Account anlegen</h1>
          <p className="muted">
            Das ist der erste Start. Dieser Account bekommt alle Admin-Rechte; danach ist diese
            Seite für immer geschlossen. Weitere Personen lädst du in der Verwaltung ein.
          </p>
        </div>
        {open && (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="field">
              <span>E-Mail</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Passwort (mindestens 12 Zeichen)</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Passwort wiederholen</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
              />
            </label>
            <button type="submit" className="button primary wide" disabled={busy}>
              Account anlegen
            </button>
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
