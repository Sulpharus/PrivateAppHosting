import type { SupabaseClient } from '@supabase/supabase-js';

/** `user`: private to the (effective) owner. `shared`: visible to everyone who has the app. */
export type KvScope = 'user' | 'shared';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export function createKv(supabase: SupabaseClient, appSlug: string) {
  const table = () => supabase.schema('platform').from('app_kv');

  const ownerFor = async (scope: KvScope): Promise<string | null> => {
    if (scope === 'shared') return null;
    const { data, error } = await supabase
      .schema('platform')
      .rpc('effective_owner', { p_slug: appSlug });
    if (error || typeof data !== 'string') throw new Error('mininode: not signed in');
    return data;
  };

  // Query builders are thenables, so this must not be async: awaiting would execute the query.
  const scoped = (owner: string | null) => {
    const query = table().select('key, value, updated_at').eq('app_slug', appSlug);
    return owner === null ? query.is('owner_id', null) : query.eq('owner_id', owner);
  };

  return {
    async get<T extends Json = Json>(key: string, scope: KvScope = 'user'): Promise<T | null> {
      const { data, error } = await scoped(await ownerFor(scope))
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      return (data?.value as T | undefined) ?? null;
    },

    async set(key: string, value: Json, scope: KvScope = 'user'): Promise<void> {
      const owner = await ownerFor(scope);
      const { error } = await table().upsert(
        { app_slug: appSlug, owner_id: owner, key, value },
        { onConflict: 'app_slug,owner_id,key' },
      );
      if (error) throw error;
    },

    async delete(key: string, scope: KvScope = 'user'): Promise<void> {
      const owner = await ownerFor(scope);
      let query = table().delete().eq('app_slug', appSlug).eq('key', key);
      query = owner === null ? query.is('owner_id', null) : query.eq('owner_id', owner);
      const { error } = await query;
      if (error) throw error;
    },

    async list(prefix = '', scope: KvScope = 'user'): Promise<{ key: string; value: Json }[]> {
      const { data, error } = await scoped(await ownerFor(scope))
        .like('key', `${prefix.replace(/[%_]/g, '\\$&')}%`)
        .order('key');
      if (error) throw error;
      return (data ?? []).map((row) => ({ key: row.key as string, value: row.value as Json }));
    },
  };
}
