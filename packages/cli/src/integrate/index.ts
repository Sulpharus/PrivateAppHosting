import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { MANIFEST_FILENAME, RESERVED_SLUGS, slugSchema } from '@mininode/manifest';
import { doctor } from '../doctor.ts';
import {
  type ConvertContext,
  type Converted,
  convertNative,
  convertStatic,
  convertVite,
  removeOutput,
} from './convert.ts';
import { type Inspection, inspectProject } from './inspect.ts';
import type { IntegrateResult, Reason } from './types.ts';
import { copyProject, projectRoot, UnpackError, unpackZip } from './unpack.ts';

export { reportMarkdown } from './report.ts';
export type { IntegrateResult, Reason } from './types.ts';

export interface IntegrateOptions {
  /** A ZIP or an unpacked folder. */
  input: string;
  /** Repository root (hosted/ lives there). */
  root: string;
  /** Force the address instead of deriving it from the export. */
  slug?: string;
  /** Write here instead of `hosted/<slug>` (tests). */
  hostedDir?: string;
}

const GENERIC_NAMES = new Set([
  'react-example',
  'vite-project',
  'my-app',
  'app',
  'project',
  'vite-react-typescript-starter',
]);

/** `Mein Versicherungs-Manager!` → `mein-versicherungs-manager`. */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const letterFirst = /^[a-z]/.test(slug) ? slug : slug ? `app-${slug}` : '';
  return letterFirst.slice(0, 32).replace(/-+$/g, '');
}

/** The name an export goes by: AI Studio metadata, page title, package name, then the file name. */
export function deriveName(inspection: Inspection, origin: string): string {
  const fromFile = basename(origin)
    .replace(/\.zip$/i, '')
    .replace(/^[0-9a-f]{8}-/i, '');
  const title = inspection.title?.split(/\s[–—|-]\s/)[0]?.trim();
  const pkgName = inspection.pkg?.name;
  const candidates = [
    inspection.metadata.name,
    title,
    pkgName && !GENERIC_NAMES.has(pkgName) ? pkgName : undefined,
    fromFile,
  ];
  const name = candidates.find((candidate) => candidate && slugify(candidate).length >= 2);
  return (name ?? 'Neue App').trim();
}

function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function finish(
  partial: Partial<IntegrateResult>,
  base: Pick<IntegrateResult, 'framework'>,
): IntegrateResult {
  return {
    status: 'needs_review',
    slug: null,
    name: null,
    reasons: [],
    warnings: [],
    actions: [],
    outDir: null,
    ...base,
    ...partial,
  };
}

/**
 * Turns an export into `hosted/<slug>` when the shape is one the script knows, and checks it with
 * `mininode doctor`. Anything else (or a failed check) returns `needs_review` with the reasons,
 * and leaves nothing behind in hosted/.
 */
export function integrate(options: IntegrateOptions): IntegrateResult {
  const work = mkdtempSync(join(tmpdir(), 'mininode-integrate-'));
  try {
    const unpacked = join(work, 'src');
    try {
      if (statSync(options.input).isDirectory()) copyProject(options.input, unpacked);
      else unpackZip(options.input, unpacked);
    } catch (error) {
      const message =
        error instanceof UnpackError ? error.message : 'Die Eingabe lässt sich nicht lesen.';
      return finish({ reasons: [{ code: 'unpack', message }] }, { framework: 'unknown' });
    }
    mkdirSync(unpacked, { recursive: true });
    const inspection = inspectProject(projectRoot(unpacked));
    const base = { framework: inspection.framework };
    if (inspection.blockers.length > 0)
      return finish({ reasons: inspection.blockers, warnings: inspection.warnings }, base);

    const name = shorten(deriveName(inspection, options.input), 40);
    const manifestSlug =
      inspection.framework === 'mininode'
        ? (
            JSON.parse(readFileSync(join(inspection.root, MANIFEST_FILENAME), 'utf8')) as {
              slug?: string;
            }
          ).slug
        : undefined;
    const slug = options.slug ?? manifestSlug ?? slugify(name);
    const slugProblem = slugIssue(slug);
    if (slugProblem) return finish({ name, reasons: [slugProblem] }, base);

    const hosted = options.hostedDir ?? join(options.root, 'hosted');
    const outDir = join(hosted, slug);
    if (existsSync(outDir))
      return finish(
        {
          name,
          slug,
          reasons: [
            {
              code: 'slug_exists',
              message: `Es gibt schon eine App „${slug}“. Eine neue Version einer bestehenden App prüft eine KI, damit keine Daten oder Änderungen verloren gehen.`,
            },
          ],
        },
        base,
      );

    const description = shorten(
      inspection.metadata.description ?? inspection.pkg?.description ?? `${name} als MiniNode-App`,
      120,
    );
    const ctx: ConvertContext = {
      inspection,
      slug,
      name,
      description,
      outDir,
      origin: basename(options.input),
    };
    let converted: Converted;
    try {
      mkdirSync(outDir, { recursive: true });
      converted =
        inspection.framework === 'vite'
          ? convertVite(ctx)
          : inspection.framework === 'static'
            ? convertStatic(ctx)
            : convertNative(ctx);
    } catch (error) {
      removeOutput(outDir);
      return finish(
        {
          name,
          slug,
          reasons: [{ code: 'convert_failed', message: `Umbau fehlgeschlagen: ${String(error)}` }],
        },
        base,
      );
    }

    const report = doctor(outDir);
    const errors = report.findings.filter((finding) => finding.severity === 'error');
    if (errors.length > 0) {
      removeOutput(outDir);
      return finish(
        {
          name,
          slug,
          warnings: converted.warnings,
          reasons: errors.map(
            (finding): Reason => ({
              code: `doctor_${finding.rule}`,
              message: finding.message,
              ...(finding.file ? { file: finding.file } : {}),
            }),
          ),
        },
        base,
      );
    }
    return finish({ status: 'integrated', slug, name, ...converted, outDir }, base);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function slugIssue(slug: string): Reason | null {
  if ((RESERVED_SLUGS as readonly string[]).includes(slug))
    return { code: 'slug_reserved', message: `${slug} ist für die Plattform reserviert.` };
  if (!slugSchema.safeParse(slug).success)
    return {
      code: 'slug_invalid',
      message: `Aus dem Namen ergibt sich keine gültige Adresse („${slug}“). Gib mit --slug eine an.`,
    };
  return null;
}
