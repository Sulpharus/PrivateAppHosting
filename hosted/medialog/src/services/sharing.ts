/**
 * Sharing with other MiniNode users of Medialog. A shared work or list is a snapshot in the
 * app's table `app_medialog.shares` (db/001_shares.sql): only the owner writes it, only the
 * named recipients can read it (shared_with_me()), and the sender is the row's owner.
 * Snapshots leave out private parts: notes, history, logs and photos.
 */

import type { MediaItem, MediaList, MiniNodeUser } from '../types';
import { type MiniNodeSDK, toJson } from './mininode';

export interface Person {
  id: string;
  name: string;
}

export interface SharedEntry {
  key: string;
  type: 'work' | 'list';
  from: Person;
  updatedAt: string;
  work?: MediaItem;
  list?: MediaList;
  /** The works of a shared list, so the recipient sees them without access to the owner's data. */
  items?: MediaItem[];
}

interface ShareRow {
  id: string;
  owner_id: string;
  owner_name: string;
  kind: 'work' | 'list';
  item_id: string;
  payload: unknown;
  updated_at: string;
}

/** A work as others see it: progress and ratings, without private notes, history or photos. */
export function publicWork(work: MediaItem): MediaItem {
  const {
    notes: _notes,
    history: _history,
    consumptionLogs: _logs,
    photos: _photos,
    sharedWith: _to,
    sharedWithNames: _names,
    listIds: _lists,
    ...rest
  } = work;
  return {
    ...rest,
    // Uploaded covers are data URLs; only linked covers travel with the share.
    cover: rest.cover?.startsWith('https://') ? rest.cover : undefined,
    volumes: rest.volumes?.map(({ notes: _n, ...v }) => ({
      ...v,
      cover: v.cover?.startsWith('https://') ? v.cover : undefined,
    })),
    episodes: rest.episodes?.map(({ notes: _n, ...e }) => e),
  };
}

function publicList(list: MediaList): MediaList {
  const { sharedWith: _to, sharedWithNames: _names, ...rest } = list;
  return {
    ...rest,
    customItems: rest.customItems?.map(({ notes: _n, ...c }) => c),
  };
}

/** Writes (or removes, when nobody is left) the shared snapshot of a work or list. */
export async function publishShare(
  mn: MiniNodeSDK,
  me: MiniNodeUser,
  target: { work?: MediaItem; list?: MediaList; items?: MediaItem[] },
): Promise<void> {
  const kind = target.work ? 'work' : 'list';
  const source = target.work ?? target.list;
  if (!source) return;
  const recipients = (source.sharedWith ?? []).filter((id) => id !== me.id);
  if (recipients.length === 0) {
    await unpublishShare(mn, me, kind, source.id);
    return;
  }
  const payload = target.work
    ? { work: publicWork(target.work) }
    : { list: publicList(target.list as MediaList), items: (target.items ?? []).map(publicWork) };
  const { error } = await mn.db.from('shares').upsert(
    {
      owner_id: me.id,
      kind,
      item_id: source.id,
      recipients,
      payload: toJson(payload),
    },
    { onConflict: 'owner_id,kind,item_id' },
  );
  if (error) throw error;
}

export async function unpublishShare(
  mn: MiniNodeSDK,
  me: MiniNodeUser,
  kind: 'work' | 'list',
  id: string,
): Promise<void> {
  const { error } = await mn.db
    .from('shares')
    .delete()
    .eq('owner_id', me.id)
    .eq('kind', kind)
    .eq('item_id', id);
  if (error) throw error;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const optionalArray = (v: Record<string, unknown>, keys: string[]) =>
  keys.every((k) => v[k] === undefined || Array.isArray(v[k]));
const isWork = (v: unknown): v is MediaItem =>
  isObject(v) &&
  typeof v.id === 'string' &&
  typeof v.title === 'string' &&
  Array.isArray(v.genres) &&
  Array.isArray(v.tags) &&
  optionalArray(v, ['volumes', 'episodes', 'chapters', 'achievements', 'seasonDetails']);
const isList = (v: unknown): v is MediaList =>
  isObject(v) &&
  typeof v.id === 'string' &&
  typeof v.title === 'string' &&
  (v.customItems === undefined || Array.isArray(v.customItems));

/** Everything other people shared with me, newest first. Rows that don't parse are skipped. */
export async function sharedWithMe(mn: MiniNodeSDK): Promise<SharedEntry[]> {
  const { data, error } = await mn.db.rpc('shared_with_me');
  if (error) throw error;
  const entries: SharedEntry[] = [];
  for (const row of (Array.isArray(data) ? data : []) as ShareRow[]) {
    const from = { id: row.owner_id, name: row.owner_name };
    const payload = isObject(row.payload) ? row.payload : {};
    if (row.kind === 'work' && isWork(payload.work)) {
      entries.push({
        key: row.id,
        type: 'work',
        from,
        updatedAt: row.updated_at,
        work: payload.work,
      });
    } else if (row.kind === 'list' && isList(payload.list)) {
      const items = Array.isArray(payload.items) ? payload.items.filter(isWork) : [];
      entries.push({
        key: row.id,
        type: 'list',
        from,
        updatedAt: row.updated_at,
        list: payload.list,
        items,
      });
    }
  }
  return entries;
}
