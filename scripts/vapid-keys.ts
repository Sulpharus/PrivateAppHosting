// Prints a new VAPID key pair for Web Push (ADR 0005) as base64url, ready for the GitHub
// secrets VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY. Run: node scripts/vapid-keys.ts
// Changing the keys later invalidates every device subscription (users switch push on again).
const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
])) as CryptoKeyPair;
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const b64url = (data: Uint8Array) => Buffer.from(data).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
