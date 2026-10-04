import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '../components/Toast';
import { t } from '../i18n';
import {
  type Backup,
  DEFAULT_ROOMS,
  type Household,
  type Item,
  type MaintenanceEntry,
  type Prefs,
  type Settings,
  type User,
} from '../types';
import { maintenanceReminderAt, suggestMaintenance, toIso, warrantyReminderAt } from './domain';
import { formatDate, newId } from './format';
import { mininode, type Sdk, signedInUser } from './mininode';
import {
  defaultHousehold,
  deleteBackup,
  deleteItem,
  type Inventory,
  loadInventory,
  removeFiles,
  restoreBackup,
  saveBackup,
  saveHouseholds,
  saveItem,
  savePrefs,
  saveRooms,
  saveSettings,
  usedPaths,
} from './store';

const EMPTY: Inventory = {
  items: [],
  rooms: [...DEFAULT_ROOMS],
  households: [],
  backups: [],
  settings: { insuranceLimit: null },
  prefs: {},
};

/** Reminders go out through the platform, also when the app is closed. */
async function syncReminders(mn: Sdk, item: Item): Promise<void> {
  const now = new Date();
  const jobs: [string, Date | null, string, string][] = [
    [
      `warranty:${item.id}`,
      warrantyReminderAt(item.warrantyExpiry, now),
      t('reminder.warrantyTitle', { name: item.name }),
      t('reminder.warrantyBody', { date: formatDate(item.warrantyExpiry) }),
    ],
    [
      `maintenance:${item.id}`,
      maintenanceReminderAt(item.nextMaintenanceDate ?? '', now),
      t('reminder.maintenanceTitle', { name: item.name }),
      t('reminder.maintenanceBody', { date: formatDate(item.nextMaintenanceDate) }),
    ],
  ];
  for (const [key, at, title, body] of jobs) {
    try {
      if (at) await mn.push.schedule({ key, at, title, body, path: `/?item=${item.id}` });
      else await mn.push.cancel(key);
    } catch {
      // Reminders are a bonus: a failure must not stop saving.
    }
  }
}

async function cancelReminders(mn: Sdk, id: string): Promise<void> {
  for (const key of [`warranty:${id}`, `maintenance:${id}`]) {
    await mn.push.cancel(key).catch(() => undefined);
  }
}

export interface InventoryApi {
  mn: Sdk | null;
  user: User;
  loading: boolean;
  offline: boolean;
  data: Inventory;
  saveItem(item: Item, removedPaths?: (string | undefined)[]): Promise<boolean>;
  removeItem(item: Item): Promise<boolean>;
  logMaintenance(item: Item, title: string): Promise<boolean>;
  setRooms(rooms: string[]): Promise<void>;
  setHouseholds(households: Household[]): Promise<void>;
  setSettings(settings: Settings): Promise<void>;
  setPrefs(changes: Partial<Prefs>): Promise<void>;
  createBackup(label: string): Promise<boolean>;
  restore(backup: Backup): Promise<boolean>;
  removeBackup(backup: Backup): Promise<boolean>;
  /** Moves every item of one household to another (used when a household is deleted). */
  moveItems(fromId: string, toId: string): Promise<boolean>;
  /** Deletes files that no item and no backup uses any more. */
  dropFiles(paths: (string | undefined)[]): Promise<void>;
}

export function useInventory(): InventoryApi {
  const [mn, setMn] = useState<Sdk | null>(null);
  const [user, setUser] = useState<User>({ id: '', name: '' });
  const [data, setData] = useState<Inventory>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  const userRef = useRef(user);
  userRef.current = user;
  const dataRef = useRef(data);
  dataRef.current = data;

  const load = useCallback(async (sdk: Sdk, who: User) => {
    try {
      const loaded = await loadInventory(sdk, who.id, () =>
        defaultHousehold(t('household.defaultName'), who.name),
      );
      setData(loaded);
    } catch {
      showToast(t('app.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let off: (() => void)[] = [];
    let cancelled = false;
    (async () => {
      try {
        const sdk = await mininode();
        const who = await signedInUser(sdk);
        if (cancelled) return;
        setMn(sdk);
        setUser(who);
        await load(sdk, who);
        setOffline(!sdk.offline.online());
        const reload = () => load(sdk, who);
        const onVisible = () => {
          if (document.visibilityState === 'visible') void reload();
        };
        document.addEventListener('visibilitychange', onVisible);
        off = [
          sdk.offline.onChange((online) => setOffline(!online)),
          sdk.offline.onSynced(() => void reload()),
          () => document.removeEventListener('visibilitychange', onVisible),
        ];
      } catch {
        showToast(t('app.loadFailed'));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      for (const fn of off) fn();
    };
  }, [load]);

  const guard = useCallback(
    async (action: (sdk: Sdk) => Promise<void>): Promise<boolean> => {
      if (!mn) return false;
      try {
        await action(mn);
        return true;
      } catch {
        showToast(t('app.saveFailed'));
        return false;
      }
    },
    [mn],
  );

  const patch = (changes: Partial<Inventory>) => setData((prev) => ({ ...prev, ...changes }));
  const upsert = (item: Item) =>
    setData((prev) => ({
      ...prev,
      items: prev.items.some((entry) => entry.id === item.id)
        ? prev.items.map((entry) => (entry.id === item.id ? item : entry))
        : [item, ...prev.items],
    }));

  /**
   * Deletes files that no item and no backup uses. The use is read from the account, not from
   * what this page shows, because other people work on the same data.
   */
  const dropUnused = async (sdk: Sdk, paths: (string | undefined)[]): Promise<void> => {
    const wanted = paths.filter((path): path is string => Boolean(path));
    if (wanted.length === 0) return;
    const [itemRows, backupRows] = await Promise.all([
      sdk.kv.list('item:'),
      sdk.kv.list('backup:'),
    ]);
    const used = usedPaths(
      itemRows.map((row) => row.value as unknown as Item),
      backupRows.map((row) => row.value as unknown as Backup),
    );
    await removeFiles(
      sdk,
      wanted.filter((path) => !used.has(path)),
    );
  };

  const api: InventoryApi = {
    mn,
    user,
    loading,
    offline,
    data,

    saveItem: (item, removedPaths = []) =>
      guard(async (sdk) => {
        // Someone else may have logged a service while the editor was open: keep theirs too.
        const stored = await sdk.kv.get(`item:${item.id}`).catch(() => null);
        const theirs = (stored as Partial<Item> | null)?.maintenanceLog ?? [];
        const known = new Set((item.maintenanceLog ?? []).map((entry) => entry.id));
        const merged: Item = {
          ...item,
          maintenanceLog: [
            ...(item.maintenanceLog ?? []),
            ...theirs.filter((e) => !known.has(e.id)),
          ],
        };
        await saveItem(sdk, merged);
        upsert(merged);
        await dropUnused(sdk, removedPaths);
        await syncReminders(sdk, merged);
      }),

    removeItem: (item) =>
      guard(async (sdk) => {
        await deleteItem(sdk, item.id);
        setData((prev) => ({ ...prev, items: prev.items.filter((entry) => entry.id !== item.id) }));
        await cancelReminders(sdk, item.id);
        await dropUnused(sdk, [item.photoPath, item.receiptPath]);
      }),

    logMaintenance: (item, title) =>
      guard(async (sdk) => {
        const today = new Date();
        const entry: MaintenanceEntry = { id: newId('ml-'), title, date: toIso(today) };
        // The service is done: the next one is due one interval from today.
        const next = suggestMaintenance(item.name, item.category, toIso(today), today);
        const stored = (await sdk.kv.get(`item:${item.id}`).catch(() => null)) as Item | null;
        const base = stored ?? item;
        const updated: Item = {
          ...base,
          maintenanceLog: [...(base.maintenanceLog ?? []), entry],
          nextMaintenanceDate: base.nextMaintenanceDate ? next.nextDate : undefined,
          updatedAt: Date.now(),
        };
        await saveItem(sdk, updated);
        upsert(updated);
        await syncReminders(sdk, updated);
      }),

    setRooms: async (rooms) => {
      if (await guard((sdk) => saveRooms(sdk, rooms))) patch({ rooms });
    },

    setHouseholds: async (households) => {
      if (await guard((sdk) => saveHouseholds(sdk, households))) patch({ households });
    },

    moveItems: (fromId, toId) =>
      guard(async (sdk) => {
        const moved = dataRef.current.items
          .filter((item) => item.householdId === fromId)
          .map((item) => ({ ...item, householdId: toId, updatedAt: Date.now() }));
        for (const item of moved) await saveItem(sdk, item);
        for (const item of moved) upsert(item);
      }),

    setSettings: async (settings) => {
      if (await guard((sdk) => saveSettings(sdk, settings))) patch({ settings });
    },

    setPrefs: async (changes) => {
      const prefs = { ...dataRef.current.prefs, ...changes };
      patch({ prefs });
      await guard((sdk) => savePrefs(sdk, userRef.current.id, prefs));
    },

    createBackup: (label) =>
      guard(async (sdk) => {
        const backup: Backup = {
          id: newId('bk-'),
          label,
          savedAt: Date.now(),
          items: dataRef.current.items,
          rooms: dataRef.current.rooms,
          households: dataRef.current.households,
        };
        await saveBackup(sdk, backup);
        setData((prev) => ({ ...prev, backups: [backup, ...prev.backups] }));
      }),

    restore: (backup) =>
      guard(async (sdk) => {
        // Restoring replaces the inventory: keep what is there now as a backup first, so
        // nothing is lost (and its files stay in use).
        const safety: Backup = {
          id: newId('bk-'),
          label: t('backup.beforeRestore', { name: backup.label }),
          savedAt: Date.now(),
          items: dataRef.current.items,
          rooms: dataRef.current.rooms,
          households: dataRef.current.households,
        };
        await saveBackup(sdk, safety);
        const before = dataRef.current.items;
        await restoreBackup(sdk, backup, before);
        setData((prev) => ({
          ...prev,
          backups: [safety, ...prev.backups],
          items: [...backup.items].sort((a, b) => b.createdAt - a.createdAt),
          rooms: backup.rooms.length > 0 ? backup.rooms : [...DEFAULT_ROOMS],
          households: backup.households.length > 0 ? backup.households : prev.households,
        }));
        // Reminders belong to the person who saved them; restoring plans them for this person.
        for (const item of backup.items) await syncReminders(sdk, item);
        const kept = new Set(backup.items.map((item) => item.id));
        for (const item of before) if (!kept.has(item.id)) await cancelReminders(sdk, item.id);
      }),

    removeBackup: (backup) =>
      guard(async (sdk) => {
        await deleteBackup(sdk, backup.id);
        setData((prev) => ({ ...prev, backups: prev.backups.filter((e) => e.id !== backup.id) }));
        // Files only that backup used can go now.
        await dropUnused(
          sdk,
          backup.items.flatMap((item) => [item.photoPath, item.receiptPath]),
        );
      }),

    dropFiles: async (paths) => {
      if (mn) await dropUnused(mn, paths);
    },
  };
  return api;
}
