// Installers go to the R2 bucket the NucBox reads from (nucbox-control signs download links for
// the same keys). The API Worker uses R2's S3 API with its own credentials, so the Worker needs no
// bucket binding: without credentials, program uploads are simply switched off.

import { AwsClient } from 'aws4fetch';
import type { ApiEnv } from '../env.ts';
import { readCapped, sha256Hex } from './body.ts';

/** Workers have a streaming digest; other runtimes (tests) fall back to buffering. */
type DigestStreamClass = new (
  algorithm: string,
) => WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> };

export function r2Configured(env: ApiEnv): boolean {
  return Boolean(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

/** Streams `body` to `key`; resolves with the SHA-256 of what was sent. */
export async function putInstaller(
  env: ApiEnv,
  key: string,
  body: ReadableStream<Uint8Array>,
  length: number,
): Promise<{ sha256: string } | { error: string }> {
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
    return { error: 'R2 ist nicht eingerichtet.' };
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  const bucket = env.R2_BUCKET ?? 'mininode-installers';
  const url = `${env.R2_ENDPOINT.replace(/\/$/, '')}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const DigestStream = (crypto as { DigestStream?: DigestStreamClass }).DigestStream;
  const headers = { 'Content-Length': String(length), 'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD' };
  const put = (payload: BodyInit) =>
    aws
      .fetch(url, {
        method: 'PUT',
        headers,
        body: payload,
        // @ts-expect-error `duplex` is required for streaming request bodies in fetch.
        duplex: 'half',
        signal: AbortSignal.timeout(280_000),
      })
      .catch(() => null);

  if (!DigestStream) {
    const bytes = await readCapped(body, length);
    if (!bytes) return { error: 'Die Datei ist größer als angegeben.' };
    const response = await put(bytes);
    if (!response?.ok) return { error: 'Der Upload nach R2 ist fehlgeschlagen.' };
    return { sha256: await sha256Hex(bytes) };
  }

  // One branch goes to R2, the other through a digest: the file is never held in memory.
  const [upload, hashing] = body.tee();
  const digest = new DigestStream('SHA-256');
  const hashed = hashing.pipeTo(digest);
  const response = await put(upload);
  await hashed.catch(() => undefined);
  if (!response?.ok) return { error: 'Der Upload nach R2 ist fehlgeschlagen.' };
  const bytes = new Uint8Array(await digest.digest);
  return { sha256: [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
