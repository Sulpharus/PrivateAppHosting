import { useCallback, useEffect, useState } from 'react';
import {
  type Area,
  createDrawer,
  type Drawer,
  deleteDrawer,
  loadDrawers,
  loadOrders,
  renameDrawer,
  saveOrder,
  setDrawerApps,
} from './drawers.ts';

/**
 * A person's own drawers and order for the start page (`apps`) or the Gaming Hub (`games`).
 * Changes show at once and are saved in the background; a failed save is reported and undone
 * on the next load.
 */
export function useArrangement(area: Area) {
  const [drawers, setDrawers] = useState<Drawer[]>([]);
  const [orders, setOrders] = useState<Map<string, string[]>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedDrawers, loadedOrders] = await Promise.all([loadDrawers(area), loadOrders()]);
      setDrawers(loadedDrawers);
      setOrders(loadedOrders);
    } catch {
      // Drawers are a convenience: without them everything else still works.
    }
  }, [area]);

  useEffect(() => {
    void load();
  }, [load]);

  const fail = (message: string) => {
    setError(message);
    void load();
  };

  const create = async (name: string): Promise<Drawer | null> => {
    try {
      const position = drawers.reduce((max, drawer) => Math.max(max, drawer.position), 0) + 1;
      const drawer = await createDrawer(area, name, position);
      setDrawers((current) => [...current, drawer]);
      setError(null);
      return drawer;
    } catch {
      setError('Die Schublade konnte nicht angelegt werden (höchstens 30).');
      return null;
    }
  };

  const rename = async (id: string, name: string) => {
    setDrawers((current) => current.map((d) => (d.id === id ? { ...d, name } : d)));
    try {
      await renameDrawer(id, name);
    } catch {
      fail('Umbenennen hat nicht geklappt.');
    }
  };

  const remove = async (id: string) => {
    setDrawers((current) => current.filter((d) => d.id !== id));
    try {
      await deleteDrawer(id);
    } catch {
      fail('Die Schublade konnte nicht gelöscht werden.');
    }
  };

  const setApps = async (drawer: Drawer, slugs: string[]) => {
    setDrawers((current) => current.map((d) => (d.id === drawer.id ? { ...d, apps: slugs } : d)));
    try {
      await setDrawerApps(drawer.id, drawer.apps, slugs);
    } catch {
      fail('Die Schublade konnte nicht gespeichert werden (höchstens 200 Einträge).');
    }
  };

  const reorder = async (scope: string, slugs: string[]) => {
    setOrders((current) => new Map(current).set(scope, slugs));
    try {
      await saveOrder(scope, slugs);
    } catch {
      fail('Die Reihenfolge konnte nicht gespeichert werden.');
    }
  };

  return { drawers, orders, error, setError, create, rename, remove, setApps, reorder };
}
