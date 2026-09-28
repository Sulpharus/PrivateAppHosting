// Google OAuth for "Google services for apps" (ADR 0004): sealing refresh tokens at rest and the
// three Google endpoints the API needs. No token ever appears in a log line.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface GoogleSettings {
  clientId: string;
  clientSecret: string;
  /** Base64 of 32 random bytes (`openssl rand -base64 32`). */
  tokenKey: string;
}

const bytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
const base64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));

async function aesKey(tokenKey: string): Promise<CryptoKey> {
  const raw = bytes(tokenKey);
  if (raw.length !== 32) throw new Error('GOOGLE_TOKEN_KEY must be 32 bytes (base64)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-GCM with the user id as associated data, so a row cannot be moved to another user. */
export async function seal(tokenKey: string, plaintext: string, userId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(userId) },
    await aesKey(tokenKey),
    new TextEncoder().encode(plaintext),
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), iv.length);
  return base64(out);
}

export async function unseal(tokenKey: string, sealed: string, userId: string): Promise<string> {
  const data = bytes(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12), additionalData: new TextEncoder().encode(userId) },
    await aesKey(tokenKey),
    data.slice(12),
  );
  return new TextDecoder().decode(plain);
}

export class GoogleError extends Error {
  constructor(
    message: string,
    /** `invalid_grant` means the user revoked access or the token expired: reconnect. */
    readonly code: string,
  ) {
    super(message);
    this.name = 'GoogleError';
  }
}

export interface GoogleAccessToken {
  accessToken: string;
  expiresIn: number;
  scopes: string[];
}

/**
 * Exchanges the refresh token for an access token. With `scopes`, Google issues a token limited
 * to that subset of the granted scopes, so each app only gets what its manifest declares.
 */
export async function refreshAccessToken(
  settings: GoogleSettings,
  refreshToken: string,
  scopes?: readonly string[],
): Promise<GoogleAccessToken> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      ...(scopes?.length ? { scope: scopes.join(' ') } : {}),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!response.ok || !body.access_token)
    throw new GoogleError(
      `Google token refresh failed (${response.status})`,
      body.error ?? 'error',
    );
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? 3600,
    scopes: (body.scope ?? '').split(' ').filter(Boolean),
  };
}

/** The Google account behind an access token (needs the `openid` scope). */
export async function googleAccount(accessToken: string): Promise<{ sub: string; email?: string }> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json().catch(() => ({}))) as { sub?: string; email?: string };
  if (!response.ok || !body.sub)
    throw new GoogleError(`Google userinfo failed (${response.status})`, 'userinfo');
  return { sub: body.sub, ...(body.email ? { email: body.email } : {}) };
}

/** Revokes the grant at Google (best effort: an already revoked token is fine). */
export async function revoke(refreshToken: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => undefined);
}
