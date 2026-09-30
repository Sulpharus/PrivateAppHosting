import { platform, supabase } from './supabase.ts';

/** Last app list per user, so the start page also works offline (PWA, ADR 0005). */
const cacheKey = async () => {
  const { data } = await supabase().auth.getSession();
  return data.session ? `mn-apps:${data.session.user.id}` : null;
};

export interface AppRow {
  slug: string;
  name: string;
  description: string;
  kind: string;
  target: string;
  data_mode: string;
  status: string;
  is_default: boolean;
  deployed_version: string | null;
  deployed_at: string | null;
  remote_runtime: string | null;
  category_id: string | null;
  category_manual: boolean;
  created_at: string;
  /** Link tiles (kind `link`) open this external website instead of a hosted app. */
  link_url: string | null;
  /** Only the admin and the people on the whitelist see the app. */
  whitelist: boolean;
  /** Set for games (manifest `game` block): they also appear in the Gaming Hub. */
  game_genre: string | null;
}

export interface RemoteStatus {
  app_slug: string;
  active_user_name: string | null;
  active_since: string | null;
  is_mine: boolean;
  queue_length: number;
  my_position: number | null;
}

/** Removes the offline app lists (sign-out). */
export function forgetOfflineCopies(): void {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('mn-apps:')) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was stored either.
  }
}

/** Apps the signed-in user may open (RLS decides); the last known list when offline. */
export async function listApps(): Promise<AppRow[]> {
  const key = await cacheKey();
  const { data, error } = await platform()
    .from('apps')
    .select(
      'slug, name, description, kind, target, data_mode, status, is_default, deployed_version, deployed_at, remote_runtime:manifest->remote->>runtime, category_id, category_manual, created_at, link_url, whitelist, game_genre:manifest->game->>genre',
    )
    .order('name');
  if (error) {
    const cached = key && !navigator.onLine ? localStorage.getItem(key) : null;
    if (cached) return JSON.parse(cached) as AppRow[];
    throw error;
  }
  const rows = (data as AppRow[] | null) ?? [];
  try {
    if (key) localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Storage full or blocked: the list just is not available offline.
  }
  return rows;
}

export async function remoteStatus(): Promise<RemoteStatus[]> {
  const { data, error } = await platform().rpc('remote_status');
  if (error) throw error;
  return (data as RemoteStatus[] | null) ?? [];
}

const TINTS = [
  '#3a6ea5',
  '#4f7a3a',
  '#86681a',
  '#a0522d',
  '#6b4fa0',
  '#2f7f7a',
  '#9a3f6a',
  '#44576e',
  '#8a4a2a',
  '#5a4a8a',
];

/** Stable, readable tile color per app (white text on all tints meets AA). */
export function tintFor(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length] ?? '#44576e';
}

export function monogram(name: string): string {
  // Words with a letter or digit only: "ATT - Werkzeugkasten" → "AW".
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : name.slice(0, 2);
  return letters.toUpperCase();
}

/** Where a tile leads: the hosted app, or the website of a link tile. */
export function tileUrl(app: Pick<AppRow, 'slug' | 'link_url'>): string {
  return app.link_url ?? appUrl(app.slug);
}

export function appUrl(slug: string): string {
  const { hostname, protocol, port } = location;
  if (hostname === 'localhost' || hostname === '127.0.0.1')
    return `${protocol}//${slug}.localhost:${port || '80'}`;
  return `${protocol}//${slug}.${hostname}`;
}

const PIN_KEY = 'mn-pinned';

export function pinnedApps(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function savePinned(pins: Set<string>): void {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify([...pins]));
  } catch {
    // pins are a convenience; ignore storage failures
  }
}
