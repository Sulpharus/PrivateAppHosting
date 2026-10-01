import type { PortalConfig } from '../config.ts';
import { supabase } from './supabase.ts';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get needsReauth(): boolean {
    return this.code === 'reauth_required';
  }
}

let apiUrl = '';
export function initApi(config: PortalConfig): void {
  apiUrl = config.apiUrl;
}

/** Calls api.mininode.app with the current access token. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Nicht angemeldet.', 'unauthenticated', 401);

  const response = await fetch(`${apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!response.ok) {
    throw new ApiError(
      payload.message ?? 'Unbekannter Fehler.',
      payload.error ?? 'error',
      response.status,
    );
  }
  return payload as T;
}

/** Postgres permission errors raised by step-up checks look like 42501. */
export function isReauthError(error: unknown): boolean {
  if (error instanceof ApiError) return error.needsReauth;
  const code = (error as { code?: unknown } | null)?.code;
  // Supabase Auth: password change with `secure_password_change` and an old session.
  if (code === 'reauthentication_needed') return true;
  const message = (error as { message?: unknown } | null)?.message;
  return (
    code === '42501' &&
    typeof message === 'string' &&
    /recent sign-in|row-level security/.test(message)
  );
}

/**
 * Sends a file as the raw request body (with progress). The name travels in `X-Filename`, so the
 * API can stream the body instead of parsing a form.
 */
export async function apiUpload<T>(
  path: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Nicht angemeldet.', 'unauthenticated', 401);
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${apiUrl}${path}`);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new ApiError('Die API ist nicht erreichbar.', 'unreachable', 0));
    request.onload = () => {
      let payload: { error?: string; message?: string } = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        // An empty or non-JSON body is reported below by status.
      }
      if (request.status >= 200 && request.status < 300) resolve(payload as T);
      else
        reject(
          new ApiError(
            payload.message ?? 'Der Upload hat nicht geklappt.',
            payload.error ?? 'error',
            request.status,
          ),
        );
    };
    request.send(file);
  });
}
