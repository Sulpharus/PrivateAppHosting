// Logos of apps (ADR 0018): small images in the public bucket `app-icons`, named in
// platform.apps.icon_path. Admins upload them in Verwaltung → Apps.

import { runtimeConfig } from '../config.ts';
import { platform, supabase } from './supabase.ts';

const BUCKET = 'app-icons';
const SIZE = 256;
const MAX_SVG_BYTES = 128 * 1024;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** The public address of a logo, or null when the app has none. */
export function iconUrl(path: string | null | undefined): string | null {
  const config = runtimeConfig();
  if (!path || !config) return null;
  return `${config.supabaseUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}`;
}

export interface PreparedIcon {
  blob: Blob;
  ext: 'webp' | 'svg';
  type: string;
}

/** An SVG as it is; any other picture as a centred square WebP of 256 px. */
export async function prepareIcon(file: File): Promise<PreparedIcon> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    if (file.size > MAX_SVG_BYTES) throw new Error('Die SVG-Datei ist größer als 128 KB.');
    return { blob: file, ext: 'svg', type: 'image/svg+xml' };
  }
  if (!file.type.startsWith('image/')) throw new Error('Das ist kein Bild.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Das Bild ist größer als 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    // Cover: the larger side is cropped, so a wide screenshot still gives a square logo.
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    );
    if (!blob) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    return { blob, ext: 'webp', type: 'image/webp' };
  } finally {
    bitmap.close();
  }
}

/** Stores the logo, points the app at it and removes the previous file. */
export async function setAppIcon(slug: string, file: File, previous: string | null) {
  const icon = await prepareIcon(file);
  const path = `${slug}-${Date.now().toString(36)}.${icon.ext}`;
  const { error } = await supabase().storage.from(BUCKET).upload(path, icon.blob, {
    contentType: icon.type,
    cacheControl: '31536000',
  });
  if (error) throw error;
  const { error: rpcError } = await platform().rpc('admin_set_app_icon', {
    p_slug: slug,
    p_path: path,
  });
  if (rpcError) {
    await supabase().storage.from(BUCKET).remove([path]);
    throw rpcError;
  }
  if (previous) await supabase().storage.from(BUCKET).remove([previous]);
}

export async function clearAppIcon(slug: string, previous: string | null) {
  const { error } = await platform().rpc('admin_set_app_icon', { p_slug: slug, p_path: null });
  if (error) throw error;
  if (previous) await supabase().storage.from(BUCKET).remove([previous]);
}
