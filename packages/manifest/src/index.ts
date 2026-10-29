import { type Manifest, manifestSchema } from './schema.ts';

export * from './i18n.ts';
export * from './instance.ts';
export * from './schema.ts';
export { programName, slugify, type UploadKind, uploadKind } from './slug.ts';

export const MANIFEST_FILENAME = 'mininode.json';

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

/** Postgres schema that holds an app's tables. Dashes are not valid in unquoted identifiers. */
export function appSchemaName(slug: string): string {
  return `app_${slug.replaceAll('-', '_')}`;
}
