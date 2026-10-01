/** Reads at most `max` bytes; null when the body is larger (whatever Content-Length says). */
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}
