import { type Manifest, manifestSchema } from './schema.ts';

export * from './schema.ts';

export const MANIFEST_FILENAME = 'mininode.json';
export const PLATFORM_DOMAIN = 'mininode.app';

export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; errors: string[] };

/** Validates untrusted manifest JSON and returns readable, path-prefixed errors. */
export function parseManifest(input: unknown): ManifestResult {
  const result = manifestSchema.safeParse(input);
  if (result.success) return { ok: true, manifest: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    }),
  };
}

export function appHostname(slug: string): string {
  return `${slug}.${PLATFORM_DOMAIN}`;
}

/** Postgres schema that holds an app's tables. Dashes are not valid in unquoted identifiers. */
export function appSchemaName(slug: string): string {
  return `app_${slug.replaceAll('-', '_')}`;
}
