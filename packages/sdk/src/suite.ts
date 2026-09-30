import type { SupabaseClient } from '@supabase/supabase-js';

// Suite data (ADR 0002): records of shared types that several apps read and write, in
// collections people can share. An app only gets the types the admin approved for it
// (`suite.uses` in mininode.json); the database checks the app from the page's origin.

export type SuiteType =
  | 'event'
  | 'task'
  | 'reminder'
  | 'project'
  | 'activity'
  | 'contract'
  | 'transaction';

export interface SuiteRecord<D extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  type: SuiteType;
  collection_id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  due_at: string | null;
  status: string | null;
  amount_cents: number | null;
  currency: string | null;
  place_name: string | null;
  lat: number | null;
  lon: number | null;
  data: D;
  source_app: string | null;
  source_key: string | null;
  created_by: string | null;
  created_by_app: string | null;
  updated_by_app: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Common columns an app may set; `data` is merged key by key (null removes a key). */
export interface SuiteFields {
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  due_at?: string | null;
  status?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  place_name?: string | null;
  lat?: number | null;
  lon?: number | null;
  data?: Record<string, unknown>;
}

export interface SuiteWrite<D extends Record<string, unknown> = Record<string, unknown>> {
  record: SuiteRecord<D>;
  /** A create matched an existing record by its identity keys and was merged into it. */
  merged: boolean;
  /** Fields another app with higher priority owns, or foreign fields this app may not change. */
  rejectedFields: string[];
}

export interface SuiteCollection {
  id: string;
  name: string;
  family: string | null;
  personal: boolean;
  color: string | null;
  role: 'owner' | 'editor' | 'viewer';
  ownerName: string;
  members: { userId: string; name: string; role: 'owner' | 'editor' | 'viewer' }[];
}

export interface RangeQuery {
  /** ISO timestamps; records overlapping [from, to), plus every recurring one. */
  from: string;
  to: string;
  types?: SuiteType[];
  collections?: string[];
}

const COLUMNS =
  'id, type, collection_id, title, starts_at, ends_at, due_at, status, amount_cents, currency, place_name, lat, lon, data, source_app, source_key, created_by, created_by_app, updated_by_app, version, created_at, updated_at';

function instant(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`range: invalid date ${value}`);
  return date.toISOString();
}

/** PostgREST `or` filter for records in a time range (spans, due dates, recurring events). */
export function rangeFilter(from: string, to: string): string {
  const f = instant(from);
  const t = instant(to);
  if (f >= t) throw new RangeError('range: from must be before to');
  return [
    `and(starts_at.lt.${t},ends_at.gt.${f})`,
    `and(starts_at.gte.${f},starts_at.lt.${t})`,
    `and(due_at.gte.${f},due_at.lt.${t})`,
    'data->recurrence.not.is.null',
  ].join(',');
}

export function createSuite(supabase: SupabaseClient) {
  const platform = () => supabase.schema('platform');
  const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await platform().rpc(fn, args);
    if (error) throw error;
    return data as T;
  };

  const type = <D extends Record<string, unknown> = Record<string, unknown>>(t: SuiteType) => ({
    /** Records of this type the user may see, newest change first. */
    async list(options: { collection?: string; limit?: number } = {}): Promise<SuiteRecord<D>[]> {
      let q = platform().from('records').select(COLUMNS).eq('type', t);
      if (options.collection) q = q.eq('collection_id', options.collection);
      const { data, error } = await q
        .order('updated_at', { ascending: false })
        .limit(options.limit ?? 500);
      if (error) throw error;
      return (data ?? []) as unknown as SuiteRecord<D>[];
    },
    /** Creates or updates by `sourceKey` (the app's own id) or `id`; returns merge details. */
    async upsert(
      fields: SuiteFields,
      options: { sourceKey?: string; collection?: string; id?: string } = {},
    ): Promise<SuiteWrite<D>> {
      return rpc<SuiteWrite<D>>('suite_upsert', {
        p_type: t,
        p_fields: fields,
        p_source_key: options.sourceKey ?? null,
        p_collection: options.collection ?? null,
        p_id: options.id ?? null,
      });
    },
    /** Moves the record to the bin (kept 30 days). */
    async delete(id: string): Promise<void> {
      await rpc('suite_delete', { p_id: id });
    },
  });

  return {
    type,

    /** Every readable record in a time range, across types and collections (calendars). */
    async range(query: RangeQuery): Promise<SuiteRecord[]> {
      let q = platform().from('records').select(COLUMNS).or(rangeFilter(query.from, query.to));
      if (query.types?.length) q = q.in('type', query.types);
      if (query.collections?.length) q = q.in('collection_id', query.collections);
      const { data, error } = await q
        .order('starts_at', { ascending: true, nullsFirst: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as SuiteRecord[];
    },

    /** The type registry: label, family and how the calendar shows each type. */
    async types(): Promise<
      { type: SuiteType; label: string; family: string; calendar: 'span' | 'due' | null }[]
    > {
      const { data, error } = await platform()
        .from('record_types')
        .select('type, label, family, calendar');
      if (error) throw error;
      return (data ?? []) as {
        type: SuiteType;
        label: string;
        family: string;
        calendar: 'span' | 'due' | null;
      }[];
    },

    /** Collections the user belongs to (their personal ones and shared ones). */
    async collections(family?: string): Promise<SuiteCollection[]> {
      const rows = await rpc<
        {
          id: string;
          name: string;
          family: string | null;
          personal: boolean;
          color: string | null;
          role: SuiteCollection['role'];
          owner_name: string;
          members: { user_id: string; name: string; role: SuiteCollection['role'] }[];
        }[]
      >('suite_collections', { p_family: family ?? null });
      return (rows ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        family: c.family,
        personal: c.personal,
        color: c.color,
        role: c.role,
        ownerName: c.owner_name,
        members: (c.members ?? []).map((m) => ({ userId: m.user_id, name: m.name, role: m.role })),
      }));
    },

    /** The user's personal collection of a family, created on first use. */
    personal(family: string): Promise<string> {
      return rpc<string>('personal_collection', { p_family: family });
    },

    createCollection(name: string, family: string, color?: string): Promise<string> {
      return rpc<string>('collection_create', {
        p_name: name,
        p_family: family,
        p_color: color ?? null,
      });
    },

    /** Owner only: adds or changes a member (`editor`/`viewer`), or removes them (null). */
    async setMember(
      collection: string,
      userId: string,
      role: 'editor' | 'viewer' | null,
    ): Promise<void> {
      await rpc('collection_set_member', {
        p_collection: collection,
        p_user: userId,
        p_role: role,
      });
    },

    /** Leaves a shared collection; the owner deletes it with all its records. */
    async leave(collection: string): Promise<void> {
      await rpc('collection_leave', { p_collection: collection });
    },
  };
}
