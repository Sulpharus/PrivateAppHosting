// Reads and verifies the Supabase session that the portal stores in a cookie on `.mininode.app`.
// The cookie format follows @supabase/ssr: optional `base64-` prefix with base64url JSON, split
// into `<name>.0`, `<name>.1`, … chunks when large.

import {
  createRemoteJWKSet,
  errors,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';

export const SESSION_COOKIE = 'mn-auth';
const BASE64_PREFIX = 'base64-';

export interface SessionClaims extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  mn_role?: 'admin' | 'trusted' | 'user';
  amr?: { method: string; timestamp: number }[];
}

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }
  return cookies;
}

function base64UrlToString(input: string): string {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Reassembles the (possibly chunked) session cookie value. */
export function readCookieValue(cookies: Map<string, string>, name: string): string | null {
  const whole = cookies.get(name);
  if (whole) return whole;
  const chunks: string[] = [];
  for (let i = 0; ; i++) {
    const chunk = cookies.get(`${name}.${i}`);
    if (!chunk) break;
    chunks.push(chunk);
  }
  return chunks.length > 0 ? chunks.join('') : null;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
}

export function readSession(cookieHeader: string | null, name = SESSION_COOKIE): StoredSession | null {
  const raw = readCookieValue(parseCookies(cookieHeader), name);
  if (!raw) return null;
  try {
    const json = raw.startsWith(BASE64_PREFIX) ? base64UrlToString(raw.slice(BASE64_PREFIX.length)) : raw;
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.access_token !== 'string') return null;
    return {
      accessToken: record.access_token,
      refreshToken: typeof record.refresh_token === 'string' ? record.refresh_token : null,
    };
  } catch {
    return null;
  }
}

export type VerifyResult =
  | { status: 'valid'; claims: SessionClaims }
  | { status: 'expired' }
  | { status: 'invalid'; reason: string };

export interface Verifier {
  verify(token: string): Promise<VerifyResult>;
}

/**
 * Verifies access tokens against the project's JWKS (asymmetric signing keys).
 * The key set is cached by jose for the lifetime of the isolate.
 */
export function createVerifier(supabaseUrl: string, keys?: JWTVerifyGetKey): Verifier {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  const jwks =
    keys ??
    createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      cacheMaxAge: 10 * 60 * 1000,
    });
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' });
        if (typeof payload.sub !== 'string') return { status: 'invalid', reason: 'missing sub' };
        return { status: 'valid', claims: payload as SessionClaims };
      } catch (error) {
        if (error instanceof errors.JWTExpired) return { status: 'expired' };
        return { status: 'invalid', reason: error instanceof Error ? error.name : 'unknown' };
      }
    },
  };
}

/** True when the user signed in (any method) within `maxAgeSeconds` — used for step-up checks. */
export function hasRecentAuth(claims: SessionClaims, maxAgeSeconds = 600, now = Date.now()): boolean {
  const cutoff = Math.floor(now / 1000) - maxAgeSeconds;
  return (claims.amr ?? []).some((entry) => entry.timestamp >= cutoff);
}
