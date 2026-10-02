// Own drawers ("Schubladen") and the order of apps and games per account (ADR 0013).
// Both live in the user's own rows (RLS on user_id); nobody else sees them.
import { platform } from './supabase.ts';

export type Area = 'apps' | 'games';

export interface Drawer {
  id: string;
  area: Area;
  name: string;
  position: number;
  /** App addresses in the drawer. */
  apps: string[];
}

export const MAX_DRAWER_NAME = 40;

export async function loadDrawers(area: Area): Promise<Drawer[]> {
  const { data, error } = await platform()
    .from('user_drawers')
    .select('id, area, name, position')
    .eq('area', area)
    .order('position')
    .order('created_at');
  if (error) throw error;
  const drawers = (data ?? []) as Omit<Drawer, 'apps'>[];
  if (drawers.length === 0) return [];
  const items = await platform()
    .from('user_drawer_items')
    .select('drawer_id, app_slug')
    .in(
      'drawer_id',
      drawers.map((drawer) => drawer.id),
    );
  if (items.error) throw items.error;
  const rows = (items.data ?? []) as { drawer_id: string; app_slug: string }[];
  return drawers.map((drawer) => ({
    ...drawer,
    apps: rows.filter((row) => row.drawer_id === drawer.id).map((row) => row.app_slug),
  }));
}

export async function createDrawer(area: Area, name: string, position: number): Promise<Drawer> {
  const { data, error } = await platform()
    .from('user_drawers')
    .insert({ area, name: name.trim(), position })
    .select('id, area, name, position')
    .single();
  if (error) throw error;
  return { ...(data as Omit<Drawer, 'apps'>), apps: [] };
}

export async function renameDrawer(id: string, name: string): Promise<void> {
  const { error } = await platform()
    .from('user_drawers')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteDrawer(id: string): Promise<void> {
  const { error } = await platform().from('user_drawers').delete().eq('id', id);
  if (error) throw error;
}

/** Makes `slugs` the apps of the drawer (adds the new ones, removes the others). */
export async function setDrawerApps(id: string, current: string[], slugs: string[]): Promise<void> {
  const wanted = new Set(slugs);
  const existing = new Set(current);
  const remove = current.filter((slug) => !wanted.has(slug));
  const add = slugs.filter((slug) => !existing.has(slug));
  if (remove.length > 0) {
    const { error } = await platform()
      .from('user_drawer_items')
      .delete()
      .eq('drawer_id', id)
      .in('app_slug', remove);
    if (error) throw error;
  }
  if (add.length > 0) {
    const { error } = await platform()
      .from('user_drawer_items')
      .insert(add.map((app_slug) => ({ drawer_id: id, app_slug })));
    if (error) throw error;
  }
}

/** The saved order per screen (`all`, `favorites`, `cat:<id>`, `drawer:<id>`, `games:<genre>`). */
export async function loadOrders(): Promise<Map<string, string[]>> {
  const { data, error } = await platform().from('user_app_order').select('scope, slugs');
  if (error) throw error;
  return new Map(
    ((data ?? []) as { scope: string; slugs: string[] }[]).map((r) => [r.scope, r.slugs]),
  );
}

export async function saveOrder(scope: string, slugs: string[]): Promise<void> {
  const { error } = await platform()
    .from('user_app_order')
    .upsert(
      { scope, slugs, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,scope' },
    );
  if (error) throw error;
}
