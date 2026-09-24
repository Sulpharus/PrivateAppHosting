// Verification of Standard Webhooks signatures (https://www.standardwebhooks.com), as used by
// Supabase auth hooks. Signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256, base64.

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/** Accepts `v1,whsec_<base64>`, `whsec_<base64>` or the bare base64 secret. */
export function secretBytes(secret: string): Uint8Array<ArrayBuffer> {
  return base64ToBytes(secret.replace(/^v1,/, '').replace(/^whsec_/, ''));
}

export async function sign(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return `v1,${bytesToBase64(mac)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export async function verify(
  secret: string,
  headers: Headers,
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS) return false;

  const expected = await sign(secret, id, timestamp, body);
  return signatures.split(' ').some((candidate) => timingSafeEqual(candidate, expected));
}
