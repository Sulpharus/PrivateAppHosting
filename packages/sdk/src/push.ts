import type { SupabaseClient } from '@supabase/supabase-js';
import type { MininodeConfig } from './config.ts';

// Push notifications for apps (ADR 0005). Devices are switched on once in the portal; apps
// schedule reminders by key and the platform delivers them, also when the app is closed.

export interface ScheduledPush {
  key: string;
  at: string;
  title: string;
  body: string | null;
  path: string | null;
}

export interface PushOptions {
  /** Stable per item (`task:<id>`): scheduling the same key again replaces the reminder. */
  key: string;
  /** When to deliver (minute precision); in the past means "within the next minute". */
  at: Date | string;
  title: string;
  body?: string;
  /** App route opened on tap, e.g. `/heute`. */
  path?: string;
}

export type PushStatus = 'on' | 'off' | 'unsupported';

export function createPush(config: MininodeConfig, supabase: SupabaseClient) {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.schema('platform').rpc(fn, args);
    if (error) throw error;
    return data as T;
  };

  return {
    async schedule(options: PushOptions): Promise<void> {
      const at = options.at instanceof Date ? options.at : new Date(options.at);
      if (Number.isNaN(at.getTime())) throw new Error('mininode: invalid push date');
      if (options.path && !options.path.startsWith('/'))
        throw new Error('mininode: push path must start with "/"');
      await rpc('push_schedule', {
        p_app_slug: config.appSlug,
        p_key: options.key,
        p_due_at: at.toISOString(),
        p_title: options.title,
        p_body: options.body ?? null,
        p_url: options.path ?? null,
      });
    },

    async cancel(key: string): Promise<void> {
      await rpc('push_cancel', { p_app_slug: config.appSlug, p_key: key });
    },

    async list(): Promise<ScheduledPush[]> {
      const rows = await rpc<
        { key: string; due_at: string; title: string; body: string | null; url: string | null }[]
      >('push_list', { p_app_slug: config.appSlug });
      return (rows ?? []).map((row) => ({
        key: row.key,
        at: row.due_at,
        title: row.title,
        body: row.body,
        path: row.url,
      }));
    },

    /**
     * `'on'` when the user has notifications switched on on at least one device (they arrive
     * on all of them), `'off'` otherwise, `'unsupported'` when this browser cannot receive any.
     */
    async status(): Promise<PushStatus> {
      const count = await rpc<number>('push_device_count', {});
      if (count > 0) return 'on';
      const capable =
        typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
      const ios = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
      return capable || ios ? 'off' : 'unsupported';
    },

    /** Portal page where the user switches notifications on for a device. */
    settingsUrl: () => new URL('/account#notifications', config.portalUrl).toString(),
  };
}
