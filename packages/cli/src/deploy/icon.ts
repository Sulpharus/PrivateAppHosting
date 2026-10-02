// The logo of an app (ADR 0018): an `icon.svg`, `icon.webp` or `icon.png` next to mininode.json
// (build apps: in public/) goes to the public bucket `app-icons` on every deploy. A logo an admin
// uploaded by hand in Verwaltung is never replaced.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'app-icons';
const MAX_BYTES = 256 * 1024;
const TYPES = { svg: 'image/svg+xml', webp: 'image/webp', png: 'image/png' } as const;
type Ext = keyof typeof TYPES;

export interface FoundIcon {
  file: string;
  ext: Ext;
  bytes: Buffer;
  /** Bucket path: stable for the same content, so an unchanged logo is not uploaded again. */
  path: string;
}

export function findIcon(appDir: string, slug: string): FoundIcon | null {
  for (const dir of [appDir, join(appDir, 'public')])
    for (const ext of Object.keys(TYPES) as Ext[]) {
      const file = join(dir, `icon.${ext}`);
      if (!existsSync(file)) continue;
      if (statSync(file).size > (ext === 'svg' ? 128 * 1024 : MAX_BYTES)) {
        throw new Error(`${file} is too large for a logo (SVG 128 KB, PNG/WebP 256 KB)`);
      }
      const bytes = readFileSync(file);
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
      return { file, ext, bytes, path: `${slug}-app.${hash}.${ext}` };
    }
  return null;
}

/** Whether the logo currently set was put there by a deploy (not by an admin). */
export const isDeployIcon = (path: string | null, slug: string): boolean =>
  path === null || path.startsWith(`${slug}-app.`);

export async function syncIcon(
  db: SupabaseClient,
  appDir: string,
  slug: string,
  log: (line: string) => void,
): Promise<void> {
  const icon = findIcon(appDir, slug);
  if (!icon) return;
  const platform = db.schema('platform');
  const { data } = await platform
    .from('apps')
    .select('icon_path')
    .eq('slug', slug)
    .maybeSingle<{ icon_path: string | null }>();
  const current = data?.icon_path ?? null;
  if (!isDeployIcon(current, slug) || current === icon.path) return;
  const { error } = await db.storage.from(BUCKET).upload(icon.path, icon.bytes, {
    contentType: TYPES[icon.ext],
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(`uploading the logo of ${slug} failed: ${error.message}`);
  const { error: updateError } = await platform
    .from('apps')
    .update({ icon_path: icon.path })
    .eq('slug', slug);
  if (updateError) throw new Error(`saving the logo of ${slug} failed: ${updateError.message}`);
  if (current) await db.storage.from(BUCKET).remove([current]);
  log(`  logo: ${icon.path}`);
}
