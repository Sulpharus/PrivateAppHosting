import { createHmac, createPublicKey } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { envFile } from './files.ts';
import { initDesktop } from './index.ts';
import { kongConfig } from './kong.ts';
import { migrationsToRun } from './migrations.ts';
import { generateSecrets, signJwt } from './secrets.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mininode-desktop-'));
  dirs.push(dir);
  return dir;
};
const settings = {
  domain: 'mininode.localhost',
  scheme: 'http',
  port: 8787,
  bind: '127.0.0.1',
} as const;

describe('secrets', () => {
  it('are new every time and none of them is a well-known default', () => {
    const a = generateSecrets();
    const b = generateSecrets();
    for (const key of [
      'postgresPassword',
      'jwtSecret',
      'publishableKey',
      'secretKey',
      'vaultKey',
      'anonJwt',
    ] as const)
      expect(a[key], key).not.toBe(b[key]);
    expect(a.publishableKey).toMatch(/^sb_publishable_[\w-]{30,}$/);
    expect(a.secretKey).toMatch(/^sb_secret_[\w-]{40,}$/);
    expect(a.postgresPassword).toMatch(/^[0-9a-f]{48}$/);
  });

  it('give the role tokens a signature PostgREST accepts, and a role that matches', () => {
    const secrets = generateSecrets(new Date('2026-01-01T00:00:00Z'));
    const [head, body, mac] = secrets.serviceRoleJwt.split('.');
    expect(
      createHmac('sha256', secrets.jwtSecret).update(`${head}.${body}`).digest('base64url'),
    ).toBe(mac);
    expect(JSON.parse(Buffer.from(body ?? '', 'base64url').toString())).toMatchObject({
      role: 'service_role',
    });
    expect(
      JSON.parse(Buffer.from(secrets.anonJwt.split('.')[1] ?? '', 'base64url').toString()),
    ).toMatchObject({ role: 'anon' });
    expect(signJwt('k', { a: 1 }).split('.')).toHaveLength(3);
  });

  it('keep the private signing key out of the public key set', () => {
    const secrets = generateSecrets();
    expect(secrets.signingKey).toHaveProperty('d');
    const ec = secrets.jwks.keys.find((key) => key.kty === 'EC');
    expect(ec).toBeDefined();
    expect(ec).not.toHaveProperty('d');
    // The public half really is the other half of the private key.
    const publicKey = createPublicKey({ key: ec as never, format: 'jwk' });
    const privateKey = createPublicKey({
      key: { ...secrets.signingKey, d: undefined } as never,
      format: 'jwk',
    });
    expect(publicKey.export({ type: 'spki', format: 'der' })).toEqual(
      privateKey.export({ type: 'spki', format: 'der' }),
    );
  });
});

describe('gateway', () => {
  it('maps only the project keys to role tokens and leaves a user token alone', () => {
    const secrets = generateSecrets();
    const kong = kongConfig(secrets);
    expect(kong).toContain(secrets.publishableKey);
    expect(kong).toContain(secrets.serviceRoleJwt);
    expect(kong).toContain("headers.authorization:sub(1, 10) ~= 'Bearer sb_'");
    for (const route of ['/auth/v1/', '/rest/v1/', '/storage/v1/'])
      expect(kong).toContain(`- ${route}`);
    // Nothing that exposes the database or a management API.
    expect(kong).not.toMatch(/pg-meta|\/pg\/|analytics|functions/);
  });
});

describe('.env', () => {
  it('quotes JSON values so Compose passes them on unchanged', () => {
    const secrets = generateSecrets();
    const env = envFile(settings, secrets);
    const line = env.split('\n').find((l) => l.startsWith('JWT_JWKS='));
    expect(line?.startsWith("JWT_JWKS='{")).toBe(true);
    expect(JSON.parse((line ?? '').slice("JWT_JWKS='".length, -1))).toEqual(secrets.jwks);
    expect(env).toContain("PORTAL_PUBLIC_URL='http://mininode.localhost:8787'");
    expect(env).toContain("SUPABASE_PUBLIC_URL='http://supabase.mininode.localhost:8787'");
    expect(env).toContain("BIND_ADDRESS='127.0.0.1'");
  });
});

describe('desktop init', () => {
  it('writes the files once, private to the installing user, and never replaces secrets by accident', () => {
    const dir = scratch();
    expect(initDesktop(dir, settings)).toEqual(['.env', 'kong.yml', 'roles.sql']);
    expect(statSync(dir).mode & 0o077).toBe(0);
    expect(statSync(join(dir, '.env')).mode & 0o077).toBe(0);
    const before = readFileSync(join(dir, '.env'), 'utf8');
    expect(() => initDesktop(dir, settings)).toThrow(/already has its secrets/);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe(before);
    initDesktop(dir, settings, { force: true });
    expect(readFileSync(join(dir, '.env'), 'utf8')).not.toBe(before);
    expect(existsSync(join(dir, 'kong.yml'))).toBe(true);
  });
});

describe('migrations', () => {
  it('runs only what has not run, in order', () => {
    const files = ['20260101000000', '20260102000000', '20260103000000'].map((version) => ({
      version,
      name: 'x',
      sql: '',
    }));
    expect(migrationsToRun(files, new Set(['20260101000000'])).map((f) => f.version)).toEqual([
      '20260102000000',
      '20260103000000',
    ]);
    expect(migrationsToRun(files, new Set(files.map((f) => f.version)))).toEqual([]);
  });
});
