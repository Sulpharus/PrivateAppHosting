// "Mit Google anmelden". Sign-ups stay off, so Google only signs in an existing account: one with
// the same (verified) email address, or one that connected Google under "Dein Konto".

import { ALL_GOOGLE_SCOPES } from '@mininode/manifest';
import type { Session, UserIdentity } from '@supabase/supabase-js';
import { runtimeConfig } from '../config.ts';
import { api } from '../lib/api.ts';
import { supabase } from '../lib/supabase.ts';

/**
 * Google sign-in also asks for Gmail and Calendar, so apps can use them without another login
 * (ADR 0004). `offline` makes Google hand out a refresh token on the first consent.
 */
const SCOPES = ['openid', 'email', 'profile', ...ALL_GOOGLE_SCOPES].join(' ');
const oauthParams = (prompt: 'select_account' | 'consent') => ({
  access_type: 'offline',
  include_granted_scopes: 'true',
  prompt,
});

let enabled: Promise<boolean> | undefined;

/** Whether the Google provider is switched on (public Auth settings, cached per page load). */
export function googleEnabled(): Promise<boolean> {
  enabled ??= (async () => {
    const config = runtimeConfig();
    if (!config) return false;
    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: config.supabasePublishableKey },
      });
      if (!response.ok) return false;
      const settings = (await response.json()) as { external?: { google?: boolean } };
      return settings.external?.google === true;
    } catch {
      return false;
    }
  })();
  return enabled;
}

/** Back to the login page, which finishes the sign-in (second factor, then `next`). */
export function returnUrl(next: string): string {
  return `${location.origin}/login?${new URLSearchParams({ next, via: 'google' })}`;
}

export async function signInWithGoogle(next: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: returnUrl(next),
      scopes: SCOPES,
      queryParams: oauthParams('select_account'),
    },
  });
  if (error) throw error;
}

export async function googleIdentity(): Promise<UserIdentity | null> {
  const { data, error } = await supabase().auth.getUserIdentities();
  if (error) throw error;
  return data.identities.find((identity) => identity.provider === 'google') ?? null;
}

export async function connectGoogle(): Promise<void> {
  const { error } = await supabase().auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/account?linked=google`,
      scopes: SCOPES,
      queryParams: oauthParams('consent'),
    },
  });
  if (error) throw error;
}

const GRANT_USER_KEY = 'mn-google-grant-user';

/**
 * Asks Google again (consent screen) for Gmail and Calendar: after access was revoked, or for
 * accounts that connected Google before apps could use it. This signs in again with the linked
 * Google account (a new session, so the authenticator code is asked again). `login_hint`
 * preselects that account; `grantedForOtherUser()` detects a switch to another account.
 */
export async function grantGoogleServices(
  userId: string,
  googleEmail: string | null,
): Promise<void> {
  sessionStorage.setItem(GRANT_USER_KEY, userId);
  const { error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/account?linked=google`,
      scopes: SCOPES,
      queryParams: {
        ...oauthParams('consent'),
        ...(googleEmail ? { login_hint: googleEmail } : {}),
      },
    },
  });
  if (error) throw error;
}

/** True when "Freigeben" ended in a different MiniNode account than the one that started it. */
export function grantedForOtherUser(userId: string): boolean {
  const started = sessionStorage.getItem(GRANT_USER_KEY);
  sessionStorage.removeItem(GRANT_USER_KEY);
  return started !== null && started !== userId;
}

export interface GoogleServices {
  available: boolean;
  connected: boolean;
  email?: string | null;
  scopes?: string[];
}

export const googleServices = () => api<GoogleServices>('/google');
export const revokeGoogleServices = () => api<void>('/google', { method: 'DELETE' });

const handedOver = new Set<string>();
let handOver: Promise<void> = Promise.resolve();
/** Fired on window once the grant is stored, so "Dein Konto" can refresh its status. */
export const GOOGLE_CONNECTED = 'mn:google-connected';

/** Resolves once a running hand-over is finished; navigate away only after it. */
export const googleHandOverDone = () => handOver;

/** Replaces the stored session by one without `provider_*` fields. */
async function scrubProviderTokens(session: Session): Promise<void> {
  const auth = supabase().auth;
  // A refreshed session carries no provider tokens and replaces the stored one.
  const { error } = await auth.refreshSession();
  if (!error) return;
  // setSession stores only access and refresh token (and the user).
  const { error: setError } = await auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  // Last resort: the Google refresh token must not stay in the shared cookie.
  if (setError) await auth.signOut({ scope: 'local' });
}

/**
 * Right after a Google sign-in the session carries Google's refresh token. The session cookie
 * is shared with every app on *.mininode.app, so the token is taken into memory and scrubbed
 * from the session first, then handed to the API, which stores it encrypted (ADR 0004).
 */
export function handOverGoogleGrant(session: Session): Promise<void> {
  const refreshToken = session.provider_refresh_token;
  if (!refreshToken || handedOver.has(refreshToken)) return handOver;
  handedOver.add(refreshToken);
  const previous = handOver;
  handOver = (async () => {
    await previous;
    await scrubProviderTokens(session);
    try {
      await api('/google/connect', { method: 'POST', body: { refreshToken } });
      window.dispatchEvent(new Event(GOOGLE_CONNECTED));
    } catch (err) {
      console.warn('Google services not connected', err);
    }
  })();
  return handOver;
}

export async function disconnectGoogle(identity: UserIdentity): Promise<void> {
  const { error } = await supabase().auth.unlinkIdentity(identity);
  if (error) throw error;
}

/** Message for an OAuth error that came back in the URL (`error_description`), or null. */
export function googleErrorFromUrl(params: URLSearchParams): string | null {
  const hash = new URLSearchParams(location.hash.slice(1));
  const code = params.get('error_code') ?? hash.get('error_code');
  const description = params.get('error_description') ?? hash.get('error_description');
  if (!code && !description) return null;
  const text = `${code ?? ''} ${description ?? ''}`;
  if (/signup|not allowed|Signups/i.test(text))
    return 'Für dieses Google-Konto gibt es keinen Zugang. Melde dich mit deiner eingeladenen Adresse an oder verbinde Google unter „Dein Konto“.';
  if (/identity_already_exists|already linked/i.test(text))
    return 'Dieses Google-Konto ist schon mit einem anderen Zugang verbunden.';
  if (/access_denied/i.test(text)) return 'Google-Anmeldung abgebrochen.';
  return 'Die Anmeldung mit Google hat nicht geklappt. Bitte noch einmal versuchen.';
}
