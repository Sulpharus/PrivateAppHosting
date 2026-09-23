import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortalConfig } from '../config.ts';

let client: SupabaseClient | undefined;

/**
 * The session lives in the `mn-auth` cookie on `.mininode.app`, so every hosted app and its gate
 * see the same login. Keep this cookie name in sync with packages/gate and packages/sdk.
 */
export function initSupabase(config: PortalConfig): SupabaseClient {
  client = createBrowserClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookieOptions: {
      name: 'mn-auth',
      path: '/',
      sameSite: 'lax',
      secure: location.protocol === 'https:',
      ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
    },
  });
  return client;
}

export function supabase(): SupabaseClient {
  if (!client) throw new Error('supabase client used before initSupabase()');
  return client;
}

export function platform() {
  return supabase().schema('platform');
}

/**
 * supabase-js persists the session asynchronously. Before leaving the page (full reload or another
 * subdomain) wait until the `mn-auth` cookie exists, otherwise the next page starts signed out.
 */
export async function sessionPersisted(timeoutMs = 3000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (/(?:^|;\s*)mn-auth(?:\.0)?=/.test(document.cookie)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}
