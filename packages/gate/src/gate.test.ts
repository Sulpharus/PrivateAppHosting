import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { decide, isNavigation } from './decide.ts';
import { contentSecurityPolicy } from './headers.ts';
import { createVerifier, hasRecentAuth, readSession, type Verifier } from './session.ts';

const SUPABASE_URL = 'https://proj.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const PORTAL = 'https://mininode.app';

let privateKey: CryptoKey;
let verifier: Verifier;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
  verifier = createVerifier(SUPABASE_URL, createLocalJWKSet({ keys: [jwk] }));
});

async function token(options: { expiresIn?: string; issuer?: string; sub?: string } = {}) {
  return new SignJWT({ role: 'authenticated', mn_role: 'user' })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(options.sub ?? '11111111-1111-1111-1111-111111111111')
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(privateKey);
}

function cookie(session: object, chunked = false): string {
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  if (!chunked) return `mn-auth=${value}`;
  const half = Math.ceil(value.length / 2);
  return `other=1; mn-auth.0=${value.slice(0, half)}; mn-auth.1=${value.slice(half)}`;
}

const allowAll = async () => true;
const url = new URL('https://rezepte.mininode.app/woche?tag=2');

describe('readSession', () => {
  it('reads plain, base64 and chunked cookies', () => {
    const session = { access_token: 'a', refresh_token: 'r' };
    expect(readSession(`mn-auth=${encodeURIComponent(JSON.stringify(session))}`)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(readSession(cookie(session))?.accessToken).toBe('a');
    expect(readSession(cookie(session, true))?.refreshToken).toBe('r');
  });

  it('returns null for missing or malformed cookies', () => {
    expect(readSession(null)).toBeNull();
    expect(readSession('mn-auth=base64-!!!')).toBeNull();
    expect(readSession('mn-auth=%7B%7D')).toBeNull();
  });
});

describe('decide', () => {
  it('allows a valid session with a grant', async () => {
    const decision = await decide({
      url,
      cookieHeader: cookie({ access_token: await token(), refresh_token: 'r' }),
      appSlug: 'rezepte',
      portalUrl: PORTAL,
      verifier,
      checkGrant: allowAll,
    });
    expect(decision.action).toBe('allow');
  });

  it('sends users without a session to the central login with the return url', async () => {
    const decision = await decide({
      url,
      cookieHeader: null,
      appSlug: 'rezepte',
      portalUrl: PORTAL,
      verifier,
      checkGrant: allowAll,
    });
    expect(decision).toEqual({
      action: 'redirect',
      reason: 'login',
      location: `${PORTAL}/login?next=${encodeURIComponent(url.toString())}`,
    });
  });

  it('sends expired sessions to the central refresh endpoint', async () => {
    const expired = await token({ expiresIn: '-1m' });
    const decision = await decide({
      url,
      cookieHeader: cookie({ access_token: expired, refresh_token: 'r' }),
      appSlug: 'rezepte',
      portalUrl: PORTAL,
      verifier,
      checkGrant: allowAll,
    });
    expect(decision.action === 'redirect' && decision.reason).toBe('refresh');
  });

  it('rejects tokens from another issuer', async () => {
    const foreign = await token({ issuer: 'https://evil.example/auth/v1' });
    const decision = await decide({
      url,
      cookieHeader: cookie({ access_token: foreign }),
      appSlug: 'rezepte',
      portalUrl: PORTAL,
      verifier,
      checkGrant: allowAll,
    });
    expect(decision.action === 'redirect' && decision.reason).toBe('login');
  });

  it('forbids users without a grant', async () => {
    const decision = await decide({
      url,
      cookieHeader: cookie({ access_token: await token() }),
      appSlug: 'rezepte',
      portalUrl: PORTAL,
      verifier,
      checkGrant: async () => false,
    });
    expect(decision.action).toBe('forbidden');
  });
});

describe('helpers', () => {
  it('detects navigations', () => {
    expect(isNavigation(new Request(url, { headers: { 'Sec-Fetch-Mode': 'navigate' } }))).toBe(
      true,
    );
    expect(isNavigation(new Request(url, { headers: { 'Sec-Fetch-Mode': 'cors' } }))).toBe(false);
    expect(isNavigation(new Request(url, { headers: { Accept: 'text/html' } }))).toBe(true);
  });

  it('checks recent authentication', () => {
    const now = Date.now();
    const claims = {
      sub: 'x',
      amr: [{ method: 'passkey', timestamp: Math.floor(now / 1000) - 60 }],
    };
    expect(hasRecentAuth(claims, 600, now)).toBe(true);
    expect(hasRecentAuth(claims, 30, now)).toBe(false);
    expect(hasRecentAuth({ sub: 'x' }, 600, now)).toBe(false);
  });

  it('builds a CSP without inline scripts and with platform endpoints', () => {
    const csp = contentSecurityPolicy({ supabaseUrl: SUPABASE_URL });
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('wss://proj.supabase.co');
    expect(csp).toContain('https://ai.mininode.app');
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
