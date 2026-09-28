import type { MininodeConfig } from './config.ts';

// Google services (ADR 0004): apps that declare `google` in mininode.json get short-lived access
// tokens for the signed-in user's Gmail and Calendar from api.mininode.app, limited to the
// declared scopes. The user connects Google once in the portal ("Mit Google anmelden" or
// "Dein Konto"); apps never see a password or refresh token.

export class GoogleError extends Error {
  constructor(
    message: string,
    /** `google_not_connected` / `google_scope_missing`: send the user to `connectUrl`. */
    readonly code: string,
    readonly status: number,
    readonly connectUrl: string,
  ) {
    super(message);
    this.name = 'GoogleError';
  }
}

type TokenSource = () => Promise<string | null>;

export function createGoogle(config: MininodeConfig, session: TokenSource) {
  const connectUrl = new URL('/account#google', config.portalUrl).toString();
  let cached: { token: string; expiresAt: number } | undefined;
  let pending: Promise<string> | undefined;

  const fetchToken = async (): Promise<string> => {
    const accessToken = await session();
    if (!accessToken) throw new GoogleError('Not signed in', 'unauthenticated', 401, connectUrl);
    const response = await fetch(new URL('/google/token', config.apiUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: config.appSlug }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      expiresAt?: number;
      error?: string;
      message?: string;
    };
    if (!response.ok || !body.accessToken)
      throw new GoogleError(
        body.message ?? response.statusText,
        body.error ?? 'error',
        response.status,
        connectUrl,
      );
    cached = { token: body.accessToken, expiresAt: body.expiresAt ?? Date.now() + 30 * 60_000 };
    return body.accessToken;
  };

  const accessToken = async (): Promise<string> => {
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    pending ??= fetchToken().finally(() => {
      pending = undefined;
    });
    return pending;
  };

  return {
    /** A Google access token for this app's declared scopes (cached until shortly before expiry). */
    accessToken,

    /**
     * `fetch` against a Google API with the token attached, e.g.
     * `mn.google.fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events')`.
     * Retries once with a fresh token when Google answers 401.
     */
    async fetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
      // The token is only ever sent to Google's APIs, never to another host by mistake.
      const target = new URL(input);
      if (target.protocol !== 'https:' || !target.hostname.endsWith('.googleapis.com'))
        throw new GoogleError('Only Google API URLs', 'invalid_url', 0, connectUrl);
      const send = async (token: string) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      };
      const response = await send(await accessToken());
      if (response.status !== 401) return response;
      cached = undefined;
      return send(await accessToken());
    },

    /**
     * Whether the user has connected Google with the scopes this app needs. The first call asks
     * Google for a token (which later calls reuse), so call it once per view, not per render.
     */
    async connected(): Promise<boolean> {
      try {
        await accessToken();
        return true;
      } catch (err) {
        if (
          err instanceof GoogleError &&
          ['google_not_connected', 'google_scope_missing'].includes(err.code)
        )
          return false;
        throw err;
      }
    },

    /** Portal page where the user connects Google (or grants the missing scopes). */
    connectUrl: () => connectUrl,
  };
}
