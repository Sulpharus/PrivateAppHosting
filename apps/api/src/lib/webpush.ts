// Web Push with Web Crypto only: payload encryption (RFC 8291, aes128gcm per RFC 8188) and VAPID
// (RFC 8292). Keys are base64url: the public key is the uncompressed P-256 point (65 bytes), the
// private key the 32-byte scalar `d`.

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** `mailto:` or `https:` contact for push services. */
  subject: string;
}

const encoder = new TextEncoder();

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export function toBase64Url(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** HKDF-SHA-256 (extract with `salt`, then expand with `info`). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** JWK for a P-256 key from the raw public point and (optionally) the private scalar. */
function p256Jwk(publicKey: Uint8Array, privateKey?: Uint8Array): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('invalid P-256 public key');
  return {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33, 65)),
    ...(privateKey ? { d: toBase64Url(privateKey) } : {}),
    ext: true,
  };
}

/**
 * ECDH parameters. Web Crypto names the peer key `public`; the Workers type definitions call it
 * `$public` (a reserved word workaround), while the runtime reads `public`.
 */
const ecdhWith = (peer: CryptoKey) =>
  ({ name: 'ECDH', public: peer }) as unknown as SubtleCryptoDeriveKeyAlgorithm;

export interface EncryptOptions {
  /** Test hooks: fixed sender key pair and salt instead of random ones. */
  senderKeys?: CryptoKeyPair;
  salt?: Uint8Array;
}

/** Encrypts `payload` for one subscription; returns the request body (aes128gcm). */
export async function encryptPayload(
  subscription: Pick<PushSubscription, 'p256dh' | 'auth'>,
  payload: Uint8Array,
  options: EncryptOptions = {},
): Promise<Uint8Array> {
  const uaPublic = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  const sender =
    options.senderKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', sender.publicKey)) as ArrayBuffer,
  );
  const uaKey = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(uaPublic),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhWith(uaKey), sender.privateKey, 256),
  );

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // One record: the payload plus the last-record delimiter (0x02), no padding.
  const record = concat(payload, new Uint8Array([2]));
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record),
  );

  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/** `Authorization` header value for a push service (VAPID, ES256 JWT valid for 12 hours). */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(fromBase64Url(keys.publicKey), fromBase64Url(keys.privateKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      encoder.encode(`${header}.${claims}`),
    ),
  );
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`;
}

/**
 * `gone`: the subscription is dead (404/410). `rejected`: the push service refused our
 * credentials for it (401/403, e.g. subscribed with an older VAPID key). `failed`: transient.
 */
export type SendResult = 'sent' | 'gone' | 'rejected' | 'failed';

/**
 * Sends one push message. `gone` (404/410) means the subscription is dead and should be deleted.
 */
export async function sendPush(
  subscription: PushSubscription,
  message: object,
  keys: VapidKeys,
  options: {
    ttlSeconds?: number;
    urgency?: 'normal' | 'high';
    topic?: string;
    /** Precomputed VAPID header for the endpoint's origin (one signature per origin and run). */
    authorization?: string;
  } = {},
): Promise<SendResult> {
  const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(message)));
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization:
        options.authorization ?? (await vapidAuthorization(subscription.endpoint, keys)),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttlSeconds ?? 24 * 3600),
      Urgency: options.urgency ?? 'normal',
      ...(options.topic ? { Topic: options.topic } : {}),
    },
    body,
  });
  await response.body?.cancel();
  if (response.status === 404 || response.status === 410) return 'gone';
  if (response.status === 401 || response.status === 403) return 'rejected';
  return response.ok ? 'sent' : 'failed';
}
