// Minimal types for the reference implementation used in the Web Push tests.
declare module 'http_ece' {
  export function decrypt(buffer: Buffer, params: Record<string, unknown>): Buffer;
}
