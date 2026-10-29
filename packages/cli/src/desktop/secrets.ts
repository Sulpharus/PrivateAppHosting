import { createHmac, generateKeyPairSync, randomBytes } from 'node:crypto';

/** Everything the desktop edition needs to be secret, made fresh for each installation. */
export interface DesktopSecrets {
  postgresPassword: string;
  /** Signs the anon and service_role tokens and is accepted by PostgREST and Storage. */
  jwtSecret: string;
  /** GoTrue's private signing key (ES256) as a JWK, and the public JWKS PostgREST and Storage trust. */
  signingKey: Record<string, unknown>;
  jwks: { keys: Record<string, unknown>[] };
  anonJwt: string;
  serviceRoleJwt: string;
  publishableKey: string;
  secretKey: string;
  vaultKey: string;
  guacamoleJsonSecret: string;
  nucboxControlToken: string;
}

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

/** HS256 JWT, enough for the two fixed role tokens. */
export function signJwt(secret: string, claims: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  const mac = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${mac}`;
}

const token = (bytes: number): string => randomBytes(bytes).toString('base64url');

export function generateSecrets(now = new Date()): DesktopSecrets {
  const jwtSecret = randomBytes(32).toString('hex');
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const kid = randomBytes(8).toString('hex');
  const signingKey = {
    ...privateKey.export({ format: 'jwk' }),
    kid,
    alg: 'ES256',
    use: 'sig',
    key_ops: ['sign', 'verify'],
  };
  const { d: _private, ...publicKey } = signingKey as Record<string, unknown>;
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + 10 * 365 * 24 * 60 * 60;
  const role = (name: string) =>
    signJwt(jwtSecret, { iss: 'mininode-desktop', role: name, iat, exp });
  return {
    // Letters and digits only: the value is also used inside a connection URL.
    postgresPassword: randomBytes(24).toString('hex'),
    jwtSecret,
    signingKey,
    jwks: {
      keys: [
        { ...publicKey, key_ops: ['verify'] },
        { kty: 'oct', k: b64url(jwtSecret), alg: 'HS256', use: 'sig', key_ops: ['verify'] },
      ],
    },
    anonJwt: role('anon'),
    serviceRoleJwt: role('service_role'),
    publishableKey: `sb_publishable_${token(24)}`,
    secretKey: `sb_secret_${token(32)}`,
    vaultKey: randomBytes(32).toString('base64'),
    guacamoleJsonSecret: randomBytes(16).toString('hex'),
    nucboxControlToken: randomBytes(32).toString('hex'),
  };
}
