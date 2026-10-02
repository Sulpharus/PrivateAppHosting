// App catalog on the start page (ADR 0007): categories, favourites, usage and curated sets.
import { runtimeConfig } from '../config.ts';
import { pinnedApps, savePinned } from './apps.ts';
import { platform, supabase } from './supabase.ts';

export interface Category {
  id: string;
  name: string;
  keywords: string[];
  position: number;
}

export interface AppSet {
  id: string;
  name: string;
  description: string | null;
  position: number;
  /** App slugs in order; only apps the user may open (RLS). */
  apps: string[];
}

export interface Usage {
  app_slug: string;
  opens: number;
  last_opened_at: string;
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await platform()
    .from('app_categories')
    .select('id, name, keywords, position')
    .order('position')
    .order('name');
  if (error) throw error;
  return (data as Category[] | null) ?? [];
}

export async function listSets(): Promise<AppSet[]> {
  const [sets, items] = await Promise.all([
    platform()
      .from('app_sets')
      .select('id, name, description, position')
      .order('position')
      .order('name'),
    platform().from('app_set_items').select('set_id, app_slug, position').order('position'),
  ]);
  if (sets.error) throw sets.error;
  if (items.error) throw items.error;
  const rows = (items.data ?? []) as { set_id: string; app_slug: string }[];
  return ((sets.data ?? []) as Omit<AppSet, 'apps'>[]).map((set) => ({
    ...set,
    apps: rows.filter((item) => item.set_id === set.id).map((item) => item.app_slug),
  }));
}

export async function listUsage(): Promise<Usage[]> {
  const { data, error } = await platform()
    .from('app_opens')
    .select('app_slug, opens, last_opened_at');
  if (error) throw error;
  return (data as Usage[] | null) ?? [];
}

/**
 * The user's favourites. Pins from before ADR 0007 lived in this browser only: they move into
 * the account once, then the local copy is cleared.
 */
export async function listFavorites(visible: Set<string>): Promise<Set<string>> {
  const legacy = [...pinnedApps()].filter((slug) => visible.has(slug));
  if (legacy.length > 0) {
    const { error } = await platform()
      .from('app_favorites')
      .upsert(
        legacy.map((app_slug) => ({ app_slug })),
        { onConflict: 'user_id,app_slug', ignoreDuplicates: true },
      );
    if (!error) savePinned(new Set());
  }
  const { data, error } = await platform().from('app_favorites').select('app_slug');
  if (error) throw error;
  return new Set(((data ?? []) as { app_slug: string }[]).map((row) => row.app_slug));
}

export async function setFavorite(slug: string, favorite: boolean): Promise<void> {
  const table = platform().from('app_favorites');
  const { error } = favorite
    ? await table.insert({ app_slug: slug })
    : await table.delete().eq('app_slug', slug);
  if (error) throw error;
}

/**
 * Counts an app opening for "Meistgenutzt". Sent with `keepalive`, so it still arrives when the
 * tile navigates away right after the click; failures are ignored.
 */
export function recordOpen(slug: string): void {
  const config = runtimeConfig();
  if (!config) return;
  void supabase()
    .auth.getSession()
    .then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      return fetch(`${config.supabaseUrl}/rest/v1/rpc/record_app_open`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: config.supabasePublishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Profile': 'platform',
        },
        body: JSON.stringify({ p_slug: slug }),
      });
    })
    .catch(() => undefined);
}

export type Sort = 'name' | 'used' | 'new' | 'old' | 'custom';

export const SORT_LABEL: Record<Sort, string> = {
  name: 'A–Z',
  used: 'Meistgenutzt',
  new: 'Neu',
  old: 'Alt',
  custom: 'Eigene Reihenfolge',
};

/** Sorts apps for the start page; ties fall back to the name. */
export function sortApps<T extends { slug: string; name: string; created_at: string }>(
  apps: T[],
  sort: Sort,
  usage: Map<string, number>,
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'de');
  const sorted = [...apps];
  if (sort === 'used')
    sorted.sort((a, b) => (usage.get(b.slug) ?? 0) - (usage.get(a.slug) ?? 0) || byName(a, b));
  else if (sort === 'new')
    sorted.sort((a, b) => b.created_at.localeCompare(a.created_at) || byName(a, b));
  else if (sort === 'old')
    sorted.sort((a, b) => a.created_at.localeCompare(b.created_at) || byName(a, b));
  else sorted.sort(byName);
  return sorted;
}
