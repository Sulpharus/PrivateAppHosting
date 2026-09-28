// "Dein Konto": the authenticator app (second factor) and the Google connection.

import type { UserIdentity } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { CodeForm } from '../auth/CodeForm.tsx';
import { connectGoogle, disconnectGoogle, googleEnabled, googleIdentity } from '../auth/google.ts';
import {
  type AuthenticatorInfo,
  type Enrolment,
  finishEnrolment,
  listAuthenticators,
  mfaErrorMessage,
  removeAuthenticator,
  startEnrolment,
} from '../auth/mfa.ts';
import { Dialog } from '../components/Dialog.tsx';

interface Feedback {
  ok(message: string): void;
  fail(message: string): void;
}

const needsAal2 = (error: unknown) => /aal2/i.test(error instanceof Error ? error.message : '');

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function AuthenticatorCard({ feedback }: { feedback: Feedback }) {
  const [factors, setFactors] = useState<AuthenticatorInfo[]>([]);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [enrolError, setEnrolError] = useState<string | null>(null);
  // An action that needs a session confirmed with the current authenticator code first.
  const [confirming, setConfirming] = useState<(() => Promise<void>) | null>(null);

  const reload = useCallback(async () => {
    setFactors(await listAuthenticators().catch(() => []));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Runs `action`; when Supabase wants an aal2 session first, asks for a code and retries. */
  const guarded = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (err) {
      if (needsAal2(err)) setConfirming(() => action);
      else feedback.fail(mfaErrorMessage(err));
    }
  };

  const begin = () =>
    guarded(async () => {
      setCode('');
      setEnrolError(null);
      setEnrolment(await startEnrolment(`Authenticator ${new Date().toLocaleString('de-DE')}`));
    });

  const finish = async () => {
    if (!enrolment) return;
    setEnrolError(null);
    try {
      await finishEnrolment(enrolment.factorId, code);
      setEnrolment(null);
      feedback.ok(
        'Authenticator-App eingerichtet. Ab jetzt fragt die Anmeldung mit Passwort nach dem Code.',
      );
      await reload();
    } catch (err) {
      setEnrolError(mfaErrorMessage(err));
      setCode('');
    }
  };

  const remove = (factor: AuthenticatorInfo) => {
    if (
      !confirm(
        `„${factor.name}“ entfernen? Die Anmeldung mit Passwort fragt dann keinen Code mehr.`,
      )
    )
      return;
    void guarded(async () => {
      await removeAuthenticator(factor.id);
      feedback.ok('Authenticator-App entfernt.');
      await reload();
    });
  };

  return (
    <section className="card" aria-labelledby="totp-title">
      <div className="row">
        <h2 id="totp-title" className="section-title">
          Authenticator-App
        </h2>
        <span className="spacer" />
        {factors.length === 0 && (
          <button type="button" className="button small primary" onClick={() => void begin()}>
            Einrichten
          </button>
        )}
      </div>
      {factors.length === 0 ? (
        <p className="muted">
          Zusätzlicher Schutz für die Anmeldung mit Passwort oder Google: danach fragt MiniNode nach
          dem Code aus einer App wie Google Authenticator, Microsoft Authenticator oder 1Password.
          Passkeys brauchen keinen Code.
        </p>
      ) : (
        factors.map((factor) => (
          <div key={factor.id} className="row" style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong>{factor.name}</strong>
              <p className="muted" style={{ fontSize: 13 }}>
                Eingerichtet {formatDate(factor.createdAt)} · Passwort- und Google-Anmeldungen
                fragen nach dem Code
              </p>
            </div>
            <button type="button" className="button small danger" onClick={() => remove(factor)}>
              Entfernen
            </button>
          </div>
        ))
      )}

      <Dialog
        open={enrolment !== null}
        title="Authenticator-App einrichten"
        onClose={() => setEnrolment(null)}
      >
        {enrolment && (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void finish();
            }}
          >
            <p className="muted">
              1. Scanne den QR-Code mit deiner Authenticator-App (oder tippe den Schlüssel ab).
            </p>
            <img
              className="totp-qr"
              src={enrolment.qrCode}
              alt="QR-Code für die Authenticator-App"
            />
            <p className="muted">Schlüssel zum Abtippen:</p>
            <p className="mono totp-secret">{enrolment.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
            <label className="field">
              <span>2. Gib den sechsstelligen Code aus der App ein</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="button primary wide"
              disabled={code.replace(/\s/g, '').length !== 6}
            >
              Einrichten
            </button>
            {enrolError && (
              <p className="error" role="alert">
                {enrolError}
              </p>
            )}
          </form>
        )}
      </Dialog>

      <Dialog
        open={confirming !== null}
        title="Kurz bestätigen"
        onClose={() => setConfirming(null)}
      >
        {confirming && (
          <CodeForm
            onDone={() => {
              const action = confirming;
              setConfirming(null);
              void guarded(action);
            }}
          />
        )}
      </Dialog>
    </section>
  );
}

export function GoogleCard({ feedback, linked }: { feedback: Feedback; linked: boolean }) {
  const [available, setAvailable] = useState(false);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);

  const reload = useCallback(async () => {
    setIdentity(await googleIdentity().catch(() => null));
  }, []);

  useEffect(() => {
    void googleEnabled().then(setAvailable);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (linked && identity) feedback.ok('Google-Konto verbunden.');
  }, [linked, identity, feedback]);

  // Hidden while Google is switched off, unless an old connection is still there to remove.
  if (!available && !identity) return null;
  const googleEmail =
    typeof identity?.identity_data?.email === 'string' ? identity.identity_data.email : null;

  return (
    <section className="card" aria-labelledby="google-title">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 id="google-title" className="section-title">
            Google
          </h2>
          <p className="muted">
            {identity
              ? `Verbunden${googleEmail ? ` mit ${googleEmail}` : ''}. Du kannst dich mit „Mit Google anmelden“ anmelden.`
              : 'Verbinde dein Google-Konto, um dich mit „Mit Google anmelden“ anzumelden, auch wenn es eine andere Adresse hat.'}
          </p>
        </div>
        {identity ? (
          <button
            type="button"
            className="button small danger"
            onClick={async () => {
              if (!confirm('Google-Konto trennen?')) return;
              try {
                await disconnectGoogle(identity);
                feedback.ok('Google-Konto getrennt.');
                await reload();
              } catch {
                feedback.fail(
                  'Trennen hat nicht geklappt. Du brauchst noch eine andere Anmeldeart (Passwort).',
                );
              }
            }}
          >
            Trennen
          </button>
        ) : (
          <button
            type="button"
            className="button small"
            onClick={async () => {
              try {
                await connectGoogle();
              } catch {
                feedback.fail('Verbinden mit Google hat nicht geklappt.');
              }
            }}
          >
            Verbinden
          </button>
        )}
      </div>
    </section>
  );
}
