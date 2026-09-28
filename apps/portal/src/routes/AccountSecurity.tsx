// "Dein Konto": the authenticator app (second factor) and the Google connection.

import type { UserIdentity } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  connectGoogle,
  disconnectGoogle,
  GOOGLE_CONNECTED,
  type GoogleServices,
  googleEnabled,
  googleIdentity,
  googleServices,
  grantedForOtherUser,
  grantGoogleServices,
  revokeGoogleServices,
} from '../auth/google.ts';
import {
  type AuthenticatorInfo,
  type Enrolment,
  finishEnrolment,
  listAuthenticators,
  mfaErrorMessage,
  removeAuthenticator,
  startEnrolment,
} from '../auth/mfa.ts';
import { useStepUp } from '../auth/StepUp.tsx';
import { Dialog } from '../components/Dialog.tsx';

interface Feedback {
  ok(message: string): void;
  fail(message: string): void;
}

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
  const { run: stepUp } = useStepUp();

  const reload = useCallback(async () => {
    setFactors(await listAuthenticators().catch(() => []));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Runs `action`; when Supabase wants a confirmed session first, asks for the code and retries. */
  const guarded = async (action: () => Promise<void>) => {
    try {
      await stepUp(action);
    } catch (err) {
      if (!(err instanceof Error && err.message === 'Bestätigung abgebrochen.'))
        feedback.fail(mfaErrorMessage(err));
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
    </section>
  );
}

export function GoogleCard({
  feedback,
  linked,
  onLinkedShown,
}: {
  feedback: Feedback;
  linked: boolean;
  /** Clears `?linked=google`, so the message does not come back on reload. */
  onLinkedShown(): void;
}) {
  const { run: stepUp } = useStepUp();
  const { profile } = useAuth();
  const [available, setAvailable] = useState(false);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [services, setServices] = useState<GoogleServices | null>(null);

  const reload = useCallback(async () => {
    setIdentity(await googleIdentity().catch(() => null));
    setServices(await googleServices().catch(() => null));
  }, []);

  useEffect(() => {
    void googleEnabled().then(setAvailable);
    void reload();
    const refresh = () => void reload();
    window.addEventListener(GOOGLE_CONNECTED, refresh);
    return () => window.removeEventListener(GOOGLE_CONNECTED, refresh);
  }, [reload]);

  useEffect(() => {
    if (!linked || !identity || !profile) return;
    if (grantedForOtherUser(profile.userId))
      feedback.fail(
        'Achtung: Du bist jetzt mit einem anderen MiniNode-Konto angemeldet, weil du bei Google ein anderes Konto gewählt hast.',
      );
    else feedback.ok('Google-Konto verbunden.');
    onLinkedShown();
  }, [linked, identity, feedback, onLinkedShown, profile]);

  // Hidden while Google is switched off, unless an old connection is still there to remove.
  if (!available && !identity) return null;
  const googleEmail =
    typeof identity?.identity_data?.email === 'string' ? identity.identity_data.email : null;

  return (
    <section className="card" id="google" aria-labelledby="google-title">
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
                await stepUp(async () => {
                  if (services?.connected) await revokeGoogleServices();
                  await disconnectGoogle(identity);
                });
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
      {identity && services?.available && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>Gmail und Kalender in Apps</strong>
            <p className="muted" style={{ fontSize: 13 }}>
              {services.connected
                ? 'Freigegeben. Apps, die Google nutzen, lesen und schreiben Mails und Termine ohne eigene Anmeldung, jede nur so weit, wie sie es angemeldet hat.'
                : 'Noch nicht freigegeben. Apps für Mail oder Kalender brauchen einmal deine Zustimmung bei Google. Danach meldest du dich neu an (mit Code, falls du eine Authenticator-App nutzt).'}
            </p>
          </div>
          {services.connected ? (
            <button
              type="button"
              className="button small danger"
              onClick={async () => {
                if (!confirm('Den Apps den Zugriff auf Gmail und Kalender entziehen?')) return;
                try {
                  await revokeGoogleServices();
                  feedback.ok('Zugriff auf Gmail und Kalender entzogen.');
                  await reload();
                } catch {
                  feedback.fail('Das hat nicht geklappt. Bitte noch einmal versuchen.');
                }
              }}
            >
              Zugriff entziehen
            </button>
          ) : (
            <button
              type="button"
              className="button small primary"
              onClick={async () => {
                try {
                  await grantGoogleServices(profile?.userId ?? '', googleEmail);
                } catch {
                  feedback.fail('Die Freigabe bei Google hat nicht geklappt.');
                }
              }}
            >
              Freigeben
            </button>
          )}
        </div>
      )}
    </section>
  );
}
