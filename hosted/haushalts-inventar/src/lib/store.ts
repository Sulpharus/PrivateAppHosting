/**
 * Everything the app keeps, in mn.kv:
 *   item:<id>       one inventory item
 *   rooms           the room names
 *   households      households and their members
 *   backup:<id>     a named copy of items, rooms and households
 *   settings        the insured sum
 *   prefs:<userId>  what one person last looked at
 * Files (photos, receipts) go to mn.files under items/<id>/.
 */
import {
  type Backup,
  DEFAULT_ROOMS,
  type Household,
  type Item,
  type Prefs,
  type Settings,
} from '../types';
import { newId } from './format';
import { type Sdk, toJson } from './mininode';

export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface Inventory {
  items: Item[];
  rooms: string[];
  households: Household[];
  backups: Backup[];
  settings: Settings;
  prefs: Prefs;
}

export function defaultHousehold(name: string, member: string): Household {
  return {
    id: 'hh-main',
    name,
    members: member ? [{ id: newId('m-'), name: member }] : [],
    createdAt: Date.now(),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function loadInventory(
  mn: Sdk,
  userId: string,
  fallbackHousehold: () => Household,
): Promise<Inventory> {
  const [itemRows, backupRows, rooms, households, settings, prefs] = await Promise.all([
    mn.kv.list('item:'),
    mn.kv.list('backup:'),
    mn.kv.get('rooms'),
    mn.kv.get('households'),
    mn.kv.get('settings'),
    mn.kv.get(`prefs:${userId}`),
  ]);
  const items = itemRows
    .map((row) => row.value as unknown as Item)
    .filter((item) => isObject(item) && typeof item.id === 'string')
    .sort((a, b) => b.createdAt - a.createdAt);
  const backups = backupRows
    .map((row) => row.value as unknown as Backup)
    .filter((backup) => isObject(backup) && typeof backup.id === 'string')
    .sort((a, b) => b.savedAt - a.savedAt);
  const roomList =
    Array.isArray(rooms) && rooms.every((room) => typeof room === 'string') && rooms.length > 0
      ? (rooms as string[])
      : [...DEFAULT_ROOMS];
  const householdList =
    Array.isArray(households) && households.length > 0
      ? (households as unknown as Household[])
      : [fallbackHousehold()];
  const limit = isObject(settings) ? settings.insuranceLimit : null;
  return {
    items,
    rooms: roomList,
    households: householdList,
    backups,
    settings: { insuranceLimit: typeof limit === 'number' && limit > 0 ? limit : null },
    prefs: isObject(prefs) ? (prefs as Prefs) : {},
  };
}

export const saveItem = (mn: Sdk, item: Item) => mn.kv.set(`item:${item.id}`, toJson(item));
export const deleteItem = (mn: Sdk, id: string) => mn.kv.delete(`item:${id}`);
export const saveRooms = (mn: Sdk, rooms: string[]) => mn.kv.set('rooms', toJson(rooms));
export const saveHouseholds = (mn: Sdk, households: Household[]) =>
  mn.kv.set('households', toJson(households));
export const saveSettings = (mn: Sdk, settings: Settings) =>
  mn.kv.set('settings', toJson(settings));
export const savePrefs = (mn: Sdk, userId: string, prefs: Prefs) =>
  mn.kv.set(`prefs:${userId}`, toJson(prefs));
export const saveBackup = (mn: Sdk, backup: Backup) =>
  mn.kv.set(`backup:${backup.id}`, toJson(backup));
export const deleteBackup = (mn: Sdk, id: string) => mn.kv.delete(`backup:${id}`);

/** Writes a backup back: items, rooms and households are replaced by the copy. */
export async function restoreBackup(mn: Sdk, backup: Backup, current: Item[]): Promise<void> {
  const keep = new Set(backup.items.map((item) => item.id));
  for (const item of backup.items) await saveItem(mn, item);
  for (const item of current) if (!keep.has(item.id)) await deleteItem(mn, item.id);
  await saveRooms(mn, backup.rooms.length > 0 ? backup.rooms : [...DEFAULT_ROOMS]);
  if (backup.households.length > 0) await saveHouseholds(mn, backup.households);
}

// --- Files ---------------------------------------------------------------------------------

function extension(file: File): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1];
  if (fromName) return fromName.toLowerCase();
  const fromType = /\/([a-z0-9]+)/i.exec(file.type)?.[1];
  return fromType?.toLowerCase() ?? 'bin';
}

/** Stores a photo or receipt for an item and returns its logical path. */
export async function uploadItemFile(
  mn: Sdk,
  itemId: string,
  kind: 'photo' | 'thumb' | 'receipt',
  file: File | Blob,
): Promise<string> {
  // A scaled picture is a JPEG whatever the original was.
  const name = file instanceof File ? extension(file) : 'jpg';
  const path = `items/${itemId}/${kind}-${Date.now().toString(36)}.${name}`;
  await mn.files.upload(path, file, file.type ? { contentType: file.type } : {});
  return path;
}

export async function removeFiles(mn: Sdk, paths: (string | undefined)[]): Promise<void> {
  for (const path of paths) {
    if (!path) continue;
    await mn.files.remove(path).catch(() => undefined);
  }
}

/** Paths used by the items and by every backup: those must not be deleted from storage. */
export function usedPaths(items: Item[], backups: Backup[]): Set<string> {
  const used = new Set<string>();
  for (const list of [items, ...backups.map((backup) => backup.items)]) {
    for (const item of list) {
      if (item.photoPath) used.add(item.photoPath);
      if (item.thumbPath) used.add(item.thumbPath);
      if (item.receiptPath) used.add(item.receiptPath);
    }
  }
  return used;
}
