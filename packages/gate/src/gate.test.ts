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

async function token(
  options: { expiresIn?: string; issuer?: string; sub?: string; mn_mfa?: 'pending' } = {},
) {
  return new SignJWT({
    role: 'authenticated',
    mn_role: 'user',
    ...(options.mn_mfa ? { mn_mfa: options.mn_mfa } : {}),
  })
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

  it('sends sessions without the authenticator code to the login page', async () => {
    const decision = await decide({
      url,
      cookieHeader: cookie({ access_token: await token({ mn_mfa: 'pending' }) }),
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
    expect(csp).not.toContain('wasm-unsafe-eval');
  });

  it('allows WebAssembly only for apps that declare it', () => {
    const csp = contentSecurityPolicy({ supabaseUrl: SUPABASE_URL, wasm: true });
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
});

describe('precompressed WebAssembly', () => {
  const env = (files: Record<string, string>, wasm = '1', fallback?: string) => ({
    APP_SLUG: 'wordcraft',
    APP_NAME: 'WordCraft',
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    PORTAL_URL: PORTAL,
    WASM: wasm,
    ASSETS: {
      fetch: async (input: Request) => {
        const body = files[new URL(input.url).pathname];
        if (body === undefined && fallback !== undefined)
          return new Response(fallback, { headers: { 'Content-Type': 'text/html' } });
        if (body === undefined) return new Response('not found', { status: 404 });
        const etag = `"${body.length}-etag"`;
        if (input.headers.get('If-None-Match') === etag)
          return new Response(null, { status: 304, headers: { ETag: etag } });
        return new Response(body, {
          headers: { 'Content-Type': 'application/octet-stream', ETag: etag },
        });
      },
    } as unknown as Fetcher,
  });

  it('serves app.wasm from app.wasm.br, still Brotli encoded', async () => {
    const { handleAppRequest } = await import('./worker.ts');
    const response = await handleAppRequest(
      new Request('https://wordcraft.mininode.app/app.wasm'),
      env({ '/app.wasm.br': 'BROTLI' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/wasm');
    expect(response.headers.get('Content-Encoding')).toBe('br');
    expect(response.headers.get('Content-Security-Policy')).toContain("'wasm-unsafe-eval'");
    expect(await response.text()).toBe('BROTLI');
  });

  it('caches only names with a content hash for a year', async () => {
    const { handleAppRequest, hasContentHash } = await import('./worker.ts');
    expect(hasContentHash('/wordcraft-web-dac7e7b375acbaf2_bg.wasm')).toBe(true);
    expect(hasContentHash('/lightcraft_web_bg.wasm')).toBe(false);
    expect(hasContentHash('/build-2026/app.wasm')).toBe(false);
    const hashed = await handleAppRequest(
      new Request('https://wordcraft.mininode.app/app-dac7e7b375acbaf2_bg.wasm'),
      env({ '/app-dac7e7b375acbaf2_bg.wasm.br': 'BROTLI' }),
    );
    expect(hashed.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const plain = await handleAppRequest(
      new Request('https://lightcraft.mininode.app/app_bg.wasm'),
      env({ '/app_bg.wasm.br': 'BROTLI' }),
    );
    expect(plain.headers.get('Content-Encoding')).toBe('br');
    expect(plain.headers.get('Cache-Control')).toBe('no-cache');
    expect(plain.headers.get('ETag')).toBe('"6-etag"');
  });

  it('answers 304 while an unhashed module is unchanged', async () => {
    const { handleAppRequest } = await import('./worker.ts');
    const files = { '/app_bg.wasm.br': 'BROTLI' };
    const same = await handleAppRequest(
      new Request('https://lightcraft.mininode.app/app_bg.wasm', {
        headers: { 'If-None-Match': '"6-etag"' },
      }),
      env(files),
    );
    expect(same.status).toBe(304);
    expect(same.headers.get('ETag')).toBe('"6-etag"');
    const changed = await handleAppRequest(
      new Request('https://lightcraft.mininode.app/app_bg.wasm', {
        headers: { 'If-None-Match': '"old"' },
      }),
      env(files),
    );
    expect(changed.status).toBe(200);
    expect(await changed.text()).toBe('BROTLI');
  });

  it('ignores .wasm.br files of apps without wasm', async () => {
    const { handleAppRequest } = await import('./worker.ts');
    const response = await handleAppRequest(
      new Request('https://other.mininode.app/app.wasm'),
      env({ '/app.wasm.br': 'BROTLI' }, ''),
    );
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(response.status).toBe(404);
  });

  it('never sends a single-page app’s index.html as WebAssembly', async () => {
    const { handleAppRequest } = await import('./worker.ts');
    const response = await handleAppRequest(
      new Request('https://spa.mininode.app/missing.wasm'),
      env({}, '1', '<!doctype html><title>SPA</title>'),
    );
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(response.headers.get('Content-Type')).toContain('text/html');
  });

  it('serves a plain .wasm file as it is', async () => {
    const { handleAppRequest } = await import('./worker.ts');
    const response = await handleAppRequest(
      new Request('https://wordcraft.mininode.app/small.wasm'),
      env({ '/small.wasm': 'RAW' }),
    );
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(await response.text()).toBe('RAW');
  });
});

describe('connectSources', () => {
  it('adds the portal only when running locally', async () => {
    const { connectSources } = await import('./worker.ts');
    expect(connectSources({ PORTAL_URL: 'https://mininode.app', CONNECT_SRC: '' })).toEqual([]);
    expect(
      connectSources({ PORTAL_URL: 'https://mininode.app', CONNECT_SRC: 'https://a.example' }),
    ).toEqual(['https://a.example']);
    expect(connectSources({ PORTAL_URL: 'http://localhost:5173', CONNECT_SRC: '' })).toEqual([
      'http://localhost:5173',
    ]);
  });
});
