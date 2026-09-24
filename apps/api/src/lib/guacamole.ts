// Guacamole "encrypted JSON" authentication (guacamole-auth-json): the JSON is signed with
// HMAC-SHA256, the signature is prepended, and the result is encrypted with AES-128-CBC using
// the same 128-bit key and an all-zero IV, then base64-encoded.

export interface GuacConnection {
  protocol: 'rdp' | 'vnc' | 'ssh';
  parameters: Record<string, string>;
}

export interface GuacAuthPayload {
  username: string;
  /** Epoch milliseconds after which Guacamole rejects the blob. */
  expires: number;
  connections: Record<string, GuacConnection>;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-fA-F]{32}$/.test(hex))
    throw new Error('GUACAMOLE_JSON_SECRET must be 32 hex characters');
  const bytes = new Uint8Array(new ArrayBuffer(16));
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function encryptAuthPayload(
  secretHex: string,
  payload: GuacAuthPayload,
): Promise<string> {
  const keyBytes = hexToBytes(secretHex);
  const json = new TextEncoder().encode(JSON.stringify(payload));

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, json));

  const plaintext = new Uint8Array(signature.length + json.length);
  plaintext.set(signature, 0);
  plaintext.set(json, signature.length);

  const aesKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, [
    'encrypt',
  ]);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: new Uint8Array(16) },
    aesKey,
    plaintext,
  );

  let binary = '';
  for (const byte of new Uint8Array(encrypted)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Client identifier Guacamole uses in `#/client/<id>` for a JSON-auth connection. */
export function clientIdentifier(connectionName: string): string {
  return btoa(`${connectionName}\0c\0json`).replace(/=+$/, '');
}

/** Hardening applied to every connection; trusted users of shared accounts get no data channels. */
export function lockDownParameters(
  parameters: Record<string, string>,
  restricted: boolean,
): Record<string, string> {
  const locked: Record<string, string> = {
    ...parameters,
    'enable-drive': 'false',
    'enable-printing': 'false',
  };
  if (restricted) {
    Object.assign(locked, {
      'disable-copy': 'true',
      'disable-paste': 'true',
      'enable-sftp': 'false',
      'disable-download': 'true',
      'disable-upload': 'true',
    });
  }
  return locked;
}
