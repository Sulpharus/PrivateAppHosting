// "Mit Google anmelden". Sign-ups stay off, so Google only signs in an existing account: one with
// the same (verified) email address, or one that connected Google under "Dein Konto".

import type { UserIdentity } from '@supabase/supabase-js';
import { runtimeConfig } from '../config.ts';
import { supabase } from '../lib/supabase.ts';

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
function returnUrl(next: string): string {
  return `${location.origin}/login?${new URLSearchParams({ next, via: 'google' })}`;
}

export async function signInWithGoogle(next: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: returnUrl(next), queryParams: { prompt: 'select_account' } },
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
    options: { redirectTo: `${location.origin}/account?linked=google` },
  });
  if (error) throw error;
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
