// App library (ADR 0011): curated self-hostable programs that the admin installs on the NucBox.
// The catalog lives in infra/nucbox/library.json; nucbox-deploy reads the same file from main
// and applies the same limits (keep both in sync).

import { z } from 'zod';
import catalog from '../../../infra/nucbox/library.json' with { type: 'json' };
import { CURRENT_SPEC_VERSION, type Manifest, slugSchema } from './schema.ts';

/** `registry/name:tag@sha256:<64 hex>`: third-party images are pinned by digest, never a tag alone. */
const IMAGE =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\.[a-z]{2,})?(?::\d+)?(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+(?::[A-Za-z0-9._-]{1,128})?@sha256:[a-f0-9]{64}$/;
/**
 * Values may use `{host}` (`<slug>.<domain>`), `{slug}` and `{domain}`; one line, no secrets,
 * and no `$`, `'` or `\` (nucbox-deploy writes them single-quoted so Compose expands nothing).
 */
const ENV_VALUE = /^[^\n\r\t\0$'\\]{0,500}$/;

export const libraryEntrySchema = z
  .object({
    id: slugSchema,
    name: z.string().min(1).max(40),
    description: z.string().min(1).max(120),
    category: z.string().min(1).max(40),
    website: z.url({ protocol: /^https$/ }),
    docs: z.url({ protocol: /^https$/ }).optional(),
    image: z.string().regex(IMAGE, 'image must be pinned: <registry>/<name>:<tag>@sha256:<digest>'),
    port: z.number().int().min(1).max(65_535),
    memoryMb: z.number().int().min(64).max(4096),
    healthPath: z.string().regex(/^\/[A-Za-z0-9/._-]*$/),
    /** Container user; apps run as 10001 unless the image needs its own unprivileged user. */
    user: z
      .string()
      .regex(/^[1-9]\d{2,5}:[1-9]\d{2,5}$/, 'user must be an unprivileged uid:gid')
      .default('10001:10001'),
    /** Named folders under the app's data directory → paths in the container. */
    volumes: z
      .record(
        z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
        z
          .string()
          .regex(/^\/[A-Za-z0-9._/-]{1,200}$/)
          .refine((path) => !path.includes('..'), 'volume paths must not contain ..'),
      )
      .default({}),
    env: z
      .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/), z.string().regex(ENV_VALUE))
      .default({}),
    /** A read-only root filesystem; most third-party images write outside their volumes. */
    readOnly: z.boolean().default(true),
    /** Shown in the portal: what to know before and after installing. */
    note: z.string().max(300).optional(),
  })
  .strict();

export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

export const libraryCatalogSchema = z
  .object({
    $comment: z.string().optional(),
    entries: z
      .array(libraryEntrySchema)
      .refine((e) => new Set(e.map((x) => x.id)).size === e.length, 'library ids must be unique'),
  })
  .strict();

/** The curated catalog, validated when the module loads (a broken entry fails every build). */
export const LIBRARY: LibraryEntry[] = libraryCatalogSchema.parse(catalog).entries;

export function libraryEntry(id: string): LibraryEntry | undefined {
  return LIBRARY.find((entry) => entry.id === id);
}

/** The manifest an installed library app is registered with (platform.apps). */
export function libraryManifest(entry: LibraryEntry, slug: string): Manifest {
  return {
    specVersion: CURRENT_SPEC_VERSION,
    slug,
    name: entry.name,
    description: entry.description,
    kind: 'container',
    target: 'nucbox',
    access: { default: false, roles: ['user', 'trusted', 'admin'] },
    data: { mode: 'none' },
    container: { port: entry.port, memoryMb: entry.memoryMb, healthPath: entry.healthPath },
    library: entry.id,
  };
}
