// The gate's decision, independent of the runtime (Workers or the NucBox forward-auth server).

import { readSession, type SessionClaims, SESSION_COOKIE, type Verifier } from './session.ts';

export type GrantChecker = (accessToken: string, appSlug: string) => Promise<boolean>;

export type Decision =
  | { action: 'allow'; claims: SessionClaims }
  | { action: 'redirect'; location: string; reason: 'login' | 'refresh' }
  | { action: 'forbidden' };

export interface DecideInput {
  url: URL;
  cookieHeader: string | null;
  appSlug: string;
  portalUrl: string;
  verifier: Verifier;
  checkGrant: GrantChecker;
  cookieName?: string;
}

export function loginUrl(portalUrl: string, next: URL): string {
  const url = new URL('/login', portalUrl);
  url.searchParams.set('next', next.toString());
  return url.toString();
}

export function refreshUrl(portalUrl: string, next: URL): string {
  const url = new URL('/auth/refresh', portalUrl);
  url.searchParams.set('next', next.toString());
  return url.toString();
}

export async function decide(input: DecideInput): Promise<Decision> {
  const session = readSession(input.cookieHeader, input.cookieName ?? SESSION_COOKIE);
  if (!session) {
    return { action: 'redirect', location: loginUrl(input.portalUrl, input.url), reason: 'login' };
  }

  const result = await input.verifier.verify(session.accessToken);
  if (result.status === 'expired') {
    // Refreshing happens centrally on the portal so that concurrent subdomains never race
    // on refresh-token rotation.
    const location = session.refreshToken
      ? refreshUrl(input.portalUrl, input.url)
      : loginUrl(input.portalUrl, input.url);
    return { action: 'redirect', location, reason: session.refreshToken ? 'refresh' : 'login' };
  }
  if (result.status === 'invalid') {
    return { action: 'redirect', location: loginUrl(input.portalUrl, input.url), reason: 'login' };
  }

  const allowed = await input.checkGrant(session.accessToken, input.appSlug);
  return allowed ? { action: 'allow', claims: result.claims } : { action: 'forbidden' };
}

/** Calls platform.has_grant through PostgREST with the user's own token (RLS applies). */
export function supabaseGrantChecker(
  supabaseUrl: string,
  publishableKey: string,
  fetcher: typeof fetch = fetch,
): GrantChecker {
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/has_grant`;
  return async (accessToken, appSlug) => {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'platform',
      },
      body: JSON.stringify({ p_slug: appSlug }),
    });
    if (!response.ok) return false;
    return (await response.json()) === true;
  };
}

/** Browsers send `Sec-Fetch-Mode: navigate` for page loads; fall back to the Accept header. */
export function isNavigation(request: Request): boolean {
  const mode = request.headers.get('Sec-Fetch-Mode');
  if (mode) return mode === 'navigate';
  return request.method === 'GET' && (request.headers.get('Accept') ?? '').includes('text/html');
}
