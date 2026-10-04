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
  /** Deletes files that neither the given items nor the given backups use any more. */
  dropFiles(paths: (string | undefined)[], items: Item[], backups: Backup[]): Promise<void>;
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

  const api: InventoryApi = {
    mn,
    user,
    loading,
    offline,
    data,

    saveItem: (item, removedPaths = []) =>
      guard(async (sdk) => {
        await saveItem(sdk, item);
        const exists = dataRef.current.items.some((entry) => entry.id === item.id);
        const items = exists
          ? dataRef.current.items.map((entry) => (entry.id === item.id ? item : entry))
          : [item, ...dataRef.current.items];
        patch({ items });
        await api.dropFiles(removedPaths, items, dataRef.current.backups);
        await syncReminders(sdk, item);
      }),

    removeItem: (item) =>
      guard(async (sdk) => {
        await deleteItem(sdk, item.id);
        const items = dataRef.current.items.filter((entry) => entry.id !== item.id);
        patch({ items });
        await cancelReminders(sdk, item.id);
        await api.dropFiles([item.photoPath, item.receiptPath], items, dataRef.current.backups);
      }),

    logMaintenance: (item, title) =>
      guard(async (sdk) => {
        const today = new Date();
        const entry: MaintenanceEntry = { id: newId('ml-'), title, date: toIso(today) };
        // The service is done: the next one is due one interval from today.
        const next = suggestMaintenance(item.name, item.category, toIso(today), today);
        const updated: Item = {
          ...item,
          maintenanceLog: [...(item.maintenanceLog ?? []), entry],
          nextMaintenanceDate: item.nextMaintenanceDate ? next.nextDate : undefined,
          updatedAt: Date.now(),
        };
        await saveItem(sdk, updated);
        patch({
          items: dataRef.current.items.map((entry2) => (entry2.id === item.id ? updated : entry2)),
        });
        await syncReminders(sdk, updated);
      }),

    setRooms: async (rooms) => {
      if (await guard((sdk) => saveRooms(sdk, rooms))) patch({ rooms });
    },

    setHouseholds: async (households) => {
      if (await guard((sdk) => saveHouseholds(sdk, households))) patch({ households });
    },

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
        patch({ backups: [backup, ...dataRef.current.backups] });
      }),

    restore: (backup) =>
      guard(async (sdk) => {
        const before = dataRef.current.items;
        await restoreBackup(sdk, backup, before);
        patch({
          items: [...backup.items].sort((a, b) => b.createdAt - a.createdAt),
          rooms: backup.rooms.length > 0 ? backup.rooms : [...DEFAULT_ROOMS],
          households: backup.households.length > 0 ? backup.households : dataRef.current.households,
        });
        for (const item of backup.items) await syncReminders(sdk, item);
        const kept = new Set(backup.items.map((item) => item.id));
        for (const item of before) if (!kept.has(item.id)) await cancelReminders(sdk, item.id);
      }),

    removeBackup: (backup) =>
      guard(async (sdk) => {
        await deleteBackup(sdk, backup.id);
        const backups = dataRef.current.backups.filter((entry) => entry.id !== backup.id);
        patch({ backups });
        // Files only that backup used can go now.
        await api.dropFiles(
          backup.items.flatMap((item) => [item.photoPath, item.receiptPath]),
          dataRef.current.items,
          backups,
        );
      }),

    dropFiles: async (paths, items, backups) => {
      if (!mn) return;
      const used = usedPaths(items, backups);
      await removeFiles(
        mn,
        paths.filter((path) => path && !used.has(path)),
      );
    },
  };
  return api;
}
