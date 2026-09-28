import type { SupabaseClient } from '@supabase/supabase-js';

/** `user`: private to the (effective) owner. `shared`: visible to everyone who has the app. */
export type KvScope = 'user' | 'shared';

/** Rows per request; must not exceed PostgREST's max_rows (supabase/config.toml). */
const PAGE = 1000;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Keeps the HTTP status on the error, so offline sync can tell a refusal from an outage. */
function failure(error: { message: string }, status: number): Error {
  return Object.assign(error instanceof Error ? error : new Error(error.message), error, {
    status,
  });
}

export function createKv(supabase: SupabaseClient, appSlug: string) {
  const table = () => supabase.schema('platform').from('app_kv');

  const ownerFor = async (scope: KvScope): Promise<string | null> => {
    if (scope === 'shared') return null;
    const { data, error, status } = await supabase
      .schema('platform')
      .rpc('effective_owner', { p_slug: appSlug });
    // Network and server errors pass through unchanged (offline sync retries them).
    if (error) throw failure(error, status);
    if (typeof data !== 'string') throw new Error('mininode: not signed in');
    return data;
  };

  // Query builders are thenables, so this must not be async: awaiting would execute the query.
  const scoped = (owner: string | null) => {
    const query = table().select('key, value, updated_at').eq('app_slug', appSlug);
    return owner === null ? query.is('owner_id', null) : query.eq('owner_id', owner);
  };

  return {
    async get<T extends Json = Json>(key: string, scope: KvScope = 'user'): Promise<T | null> {
      const { data, error, status } = await scoped(await ownerFor(scope))
        .eq('key', key)
        .maybeSingle();
      if (error) throw failure(error, status);
      return (data?.value as T | undefined) ?? null;
    },

    async set(key: string, value: Json, scope: KvScope = 'user'): Promise<void> {
      const owner = await ownerFor(scope);
      const { error, status } = await table().upsert(
        { app_slug: appSlug, owner_id: owner, key, value },
        { onConflict: 'app_slug,owner_id,key' },
      );
      if (error) throw failure(error, status);
    },

    async delete(key: string, scope: KvScope = 'user'): Promise<void> {
      const owner = await ownerFor(scope);
      let query = table().delete().eq('app_slug', appSlug).eq('key', key);
      query = owner === null ? query.is('owner_id', null) : query.eq('owner_id', owner);
      const { error, status } = await query;
      if (error) throw failure(error, status);
    },

    async list(prefix = '', scope: KvScope = 'user'): Promise<{ key: string; value: Json }[]> {
      const owner = await ownerFor(scope);
      const pattern = `${prefix.replace(/[%_]/g, '\\$&')}%`;
      const out: { key: string; value: Json }[] = [];
      // PostgREST caps every response (max_rows, 1000 on Supabase): page until a short page.
      for (let from = 0; ; from += PAGE) {
        const { data, error, status } = await scoped(owner)
          .like('key', pattern)
          .order('key')
          .range(from, from + PAGE - 1);
        if (error) throw failure(error, status);
        const rows = data ?? [];
        for (const row of rows) out.push({ key: row.key as string, value: row.value as Json });
        if (rows.length < PAGE) return out;
      }
    },
  };
}
