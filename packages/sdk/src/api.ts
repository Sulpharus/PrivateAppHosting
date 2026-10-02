import type { MininodeConfig } from './config.ts';
import { promptForKey } from './key-prompt.ts';

// External APIs with host-level keys (ADR 0006): an app declares each API in mininode.json
// (`apis`), the admin enters the key once under Verwaltung → API-Schlüssel, and calls go through
// api.mininode.app, which adds the key. Apps never hold the key.

export class ExternalApiError extends Error {
  constructor(
    message: string,
    /**
     * MiniNode's reason: `api_key_missing` (the admin has not entered the key yet),
     * `api_key_unreadable` (the admin has to enter it again), `api_not_declared`, `api_blocked`, `rate_limited`, `api_unavailable`, `api_redirect`, `invalid_path`,
     * `too_large`, `forbidden`, `unauthenticated`, `vault_not_configured`.
     */
    readonly code: string,
    readonly status: number,
    /** For a personal API (ADR 0014): the key is the user's own, and the SDK has asked for it. */
    readonly personal: { service: string; serviceName: string } | null = null,
  ) {
    super(message);
    this.name = 'ExternalApiError';
  }

  /** The user has to enter their own key (a popup already asked); show "not set up yet". */
  get needsPersonalKey(): boolean {
    return this.personal !== null;
  }

  /** The key is not there yet; show a friendly "not set up yet" state instead of an error. */
  get keyMissing(): boolean {
    return ['api_key_missing', 'api_key_unreadable', 'vault_not_configured'].includes(this.code);
  }
}

type TokenSource = () => Promise<string | null>;

export function createApi(config: MininodeConfig, session: TokenSource) {
  return (id: string) => {
    const api = {
      /**
       * `fetch` against the API declared as `id`, with a path below its `baseUrl`, e.g.
       * `mn.api('openweather').fetch('/weather?q=München')`. Returns the API's own response
       * (check `ok` and `status` as usual); throws `ExternalApiError` when MiniNode refuses the call.
       */
      async fetch(path: string, init: RequestInit = {}): Promise<Response> {
        if (!/^[a-z][a-z0-9-]{1,40}$/.test(id))
          throw new ExternalApiError(`Unknown API id "${id}"`, 'invalid_id', 0);
        const token = await session();
        if (!token) throw new ExternalApiError('Not signed in', 'unauthenticated', 401);
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${token}`);
        const suffix = path.startsWith('/') ? path : `/${path}`;
        const response = await fetch(`${config.apiUrl.replace(/\/$/, '')}/proxy/${id}${suffix}`, {
          ...init,
          headers,
          credentials: 'omit',
        });
        if (response.headers.get('X-MiniNode-Error')) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            personal?: boolean;
            service?: string;
            serviceName?: string;
          };
          const personal =
            body.personal === true && body.service && body.serviceName
              ? { service: body.service, serviceName: body.serviceName }
              : null;
          // A personal API without the user's key: ask for it right here (once), then let the
          // app show its own "not set up" state from the error.
          if (personal)
            void promptForKey(config.portalUrl, {
              ...personal,
              again: body.error === 'api_key_unreadable',
            });
          throw new ExternalApiError(
            body.message ?? response.statusText,
            body.error ?? 'error',
            response.status,
            personal,
          );
        }
        return response;
      },

      /** Shorthand: GET (or `init`) and parse JSON; throws `ExternalApiError` on a non-2xx answer. */
      async json<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
        const response = await api.fetch(path, init);
        if (!response.ok)
          throw new ExternalApiError(
            `${id} answered ${response.status}`,
            'upstream_error',
            response.status,
          );
        return (await response.json()) as T;
      },
    };
    return api;
  };
}
