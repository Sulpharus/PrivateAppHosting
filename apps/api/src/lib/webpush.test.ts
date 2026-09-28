import { createECDH, randomBytes } from 'node:crypto';
import { decrypt } from 'http_ece';
import { describe, expect, it } from 'vitest';
import { encryptPayload, fromBase64Url, toBase64Url, vapidAuthorization } from './webpush.ts';

/** A browser-side subscription: its key pair and auth secret. */
function userAgent() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    subscription: {
      p256dh: toBase64Url(new Uint8Array(ecdh.getPublicKey())),
      auth: toBase64Url(new Uint8Array(auth)),
    },
  };
}

describe('Web Push encryption (RFC 8291)', () => {
  it('produces a body the reference implementation decrypts', async () => {
    const ua = userAgent();
    const message = JSON.stringify({
      title: 'Müll rausbringen',
      body: 'Heute Abend',
      url: '/heute',
    });
    const body = await encryptPayload(ua.subscription, new TextEncoder().encode(message));
    // Header: salt (16) | record size (4) | key id length (1) | sender public key (65)
    expect(body[20]).toBe(65);
    const plain = decrypt(Buffer.from(body), {
      version: 'aes128gcm',
      privateKey: ua.ecdh,
      authSecret: toBase64Url(new Uint8Array(ua.auth)),
      dh: toBase64Url(body.slice(21, 86)),
    });
    expect(plain.toString('utf8')).toBe(message);
  });

  it('uses a fresh key and salt for every message', async () => {
    const ua = userAgent();
    const payload = new TextEncoder().encode('x');
    const a = await encryptPayload(ua.subscription, payload);
    const b = await encryptPayload(ua.subscription, payload);
    expect(toBase64Url(a.slice(0, 86))).not.toBe(toBase64Url(b.slice(0, 86)));
  });
});

describe('VAPID (RFC 8292)', () => {
  it('signs a JWT for the push service origin that verifies with the public key', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicKey = toBase64Url(
      new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
    );
    const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', {
      publicKey,
      privateKey: jwk.d ?? '',
      subject: 'mailto:hallo@mininode.app',
    });
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match?.[4]).toBe(publicKey);
    const [, head = '', claims = '', signature = ''] = match ?? [];
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(claims))) as {
      aud: string;
      exp: number;
      sub: string;
    };
    expect(payload.aud).toBe('https://fcm.googleapis.com');
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});
