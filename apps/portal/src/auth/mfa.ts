// Authenticator apps (TOTP) as a second factor. The database enforces it (platform.mfa_ok):
// once a user has a verified factor, a password or Google session sees nothing until it verifies
// a code. A passkey sign-in counts as enough on its own.

import { supabase } from '../lib/supabase.ts';

/** AMR methods Supabase Auth records for a passkey sign-in (keep in sync with platform.mfa_ok). */
const PASSKEY_METHODS = ['webauthn', 'passkey', 'mfa/webauthn'];

/** True when this session still has to enter a code from the authenticator app. */
export async function codeRequired(): Promise<boolean> {
  const { data, error } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  if (data.nextLevel !== 'aal2' || data.currentLevel === 'aal2') return false;
  const methods = (data.currentAuthenticationMethods ?? []).map((entry) =>
    typeof entry === 'string' ? entry : entry.method,
  );
  return !methods.some((method) => PASSKEY_METHODS.includes(method));
}

export interface AuthenticatorInfo {
  id: string;
  name: string;
  createdAt: string;
}

/** Verified authenticator apps of the signed-in user. */
export async function listAuthenticators(): Promise<AuthenticatorInfo[]> {
  const { data, error } = await supabase().auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.map((factor) => ({
    id: factor.id,
    name: factor.friendly_name || 'Authenticator-App',
    createdAt: factor.created_at,
  }));
}

/** Verifies a code against the user's first authenticator app; the session becomes aal2. */
export async function verifyCode(code: string): Promise<void> {
  const [factor] = await listAuthenticators();
  if (!factor) throw new Error('no_factor');
  const { error } = await supabase().auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.replace(/\s/g, ''),
  });
  if (error) throw error;
}

export interface Enrolment {
  factorId: string;
  /** SVG data URL to scan. */
  qrCode: string;
  /** The secret for typing it in by hand. */
  secret: string;
}

/**
 * Starts adding an authenticator app. Abandoned attempts stay unverified and do not count;
 * they are removed here so the name can be reused.
 */
export async function startEnrolment(name: string): Promise<Enrolment> {
  const auth = supabase().auth;
  const { data: factors } = await auth.mfa.listFactors();
  for (const factor of factors?.all ?? [])
    if (factor.factor_type === 'totp' && factor.status === 'unverified')
      await auth.mfa.unenroll({ factorId: factor.id });
  const { data, error } = await auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: name,
    issuer: 'MiniNode',
  });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function finishEnrolment(factorId: string, code: string): Promise<void> {
  const { error } = await supabase().auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s/g, ''),
  });
  if (error) throw error;
}

export async function removeAuthenticator(factorId: string): Promise<void> {
  const { error } = await supabase().auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

export function mfaErrorMessage(error: unknown): string {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/no_factor/.test(text)) return 'Für dein Konto ist keine Authenticator-App eingerichtet.';
  if (/rate|too many/i.test(text))
    return 'Zu viele Versuche. Warte kurz und versuch es noch einmal.';
  if (/friendly.?name|already exists/i.test(text))
    return 'Es gibt schon eine Authenticator-App mit diesem Namen.';
  if (/aal2/i.test(text))
    return 'Bestätige zuerst mit dem Code aus deiner Authenticator-App, dann geht das.';
  if (/disabled|not enabled/i.test(text))
    return 'Authenticator-Apps sind auf dem Server gerade ausgeschaltet.';
  if (/invalid|code/i.test(text))
    return 'Der Code stimmt nicht. Nimm den aktuellen Code aus der App (er wechselt alle 30 Sekunden).';
  return 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
}
