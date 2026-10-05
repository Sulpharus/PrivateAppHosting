// The table of contents of a backup folder (ADR 0019): what is inside, and a checksum for every
// file, so `mininode backup verify` can tell a complete copy from a damaged or edited one.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { z } from 'zod';

export const BACKUP_FORMAT = 1;

const fileSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const bucketSchema = z.object({
  id: z.string().min(1),
  public: z.boolean(),
  fileSizeLimit: z.number().int().nullable(),
  allowedMimeTypes: z.array(z.string()).nullable(),
  objects: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});

export const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  createdAt: z.string(),
  /** Commit of the repository the backup was made from (the migrations a restore needs). */
  commit: z.string().nullable(),
  database: z.object({
    serverVersion: z.string(),
    /** Versions in supabase_migrations.schema_migrations, oldest first. */
    migrations: z.array(z.string()),
    schemas: z.array(z.string()),
    tables: z.array(z.object({ schema: z.string(), table: z.string(), rows: z.number().int() })),
  }),
  storage: z.object({
    included: z.boolean(),
    buckets: z.array(bucketSchema),
  }),
  files: z.array(fileSchema),
});

export type BackupManifest = z.infer<typeof manifestSchema>;
export type BackupFile = z.infer<typeof fileSchema>;
export type BackupBucket = z.infer<typeof bucketSchema>;

export const MANIFEST_FILE = 'manifest.json';

export function sha256File(path: string): Promise<{ sha256: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let bytes = 0;
    createReadStream(path)
      .on('data', (chunk) => {
        hash.update(chunk);
        bytes += chunk.length;
      })
      .on('error', reject)
      .on('end', () => resolve({ sha256: hash.digest('hex'), bytes }));
  });
}
