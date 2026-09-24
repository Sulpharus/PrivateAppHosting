import type { EmailOtpType } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Logo } from '../components/icons.tsx';
import { goTo, safeNext } from '../lib/safe-next.ts';
import { supabase } from '../lib/supabase.ts';

const OTP_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <Logo />
          <span>mininode</span>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

/**
 * Landing page for links in emails. The token is only redeemed when the person presses the
 * button, so link scanners in mail systems cannot use it up.
 */
export function AuthConfirm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tokenHash = params.get('token_hash') ?? '';
  const type = params.get('type') as EmailOtpType | null;
  const next = safeNext(params.get('next'));
  const valid = Boolean(tokenHash && type && OTP_TYPES.includes(type));

  const title =
    type === 'invite'
      ? 'Willkommen bei MiniNode'
      : type === 'recovery'
        ? 'Neues Passwort festlegen'
        : 'E-Mail bestätigen';

  const confirm = async () => {
    if (!type) return;
    setBusy(true);
    const { error: verifyError } = await supabase().auth.verifyOtp({ token_hash: tokenHash, type });
    setBusy(false);
    if (verifyError) {
      setError(
        'Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an.',
      );
      return;
    }
    if (type === 'invite') navigate(`/welcome?next=${encodeURIComponent(next)}`);
    else if (type === 'recovery') navigate('/account?reset=1');
    else await goTo(next, navigate);
  };

  return (
    <AuthCard title={title}>
      {valid ? (
        <>
          <p className="muted">Tippe auf „Weiter“, um fortzufahren.</p>
          <button type="button" className="button primary wide" onClick={confirm} disabled={busy}>
            Weiter
          </button>
        </>
      ) : (
        <p className="error">Dieser Link ist unvollständig.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </AuthCard>
  );
}

/**
 * Central token refresh: gates on other subdomains send expired sessions here, so refresh-token
 * rotation only ever happens on one origin.
 */
export function AuthRefresh() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));

  useEffect(() => {
    void supabase()
      .auth.refreshSession()
      .then(({ data }) => {
        if (data.session) void goTo(next, navigate);
        else navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
      });
  }, [next, navigate]);

  return (
    <AuthCard title="Einen Moment …">
      <p className="muted" role="status">
        Deine Anmeldung wird erneuert.
      </p>
    </AuthCard>
  );
}
