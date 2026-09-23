// @mininode/sdk — the one import a hosted app needs for login, data, files, realtime, AI and
// notifications. Configuration comes from the host (`/_mininode/config.json`), never from the app.

import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js';
import { type AiChatOptions, type AiMessage, createAi } from './ai.ts';
import { appSchema, loadConfig, type MininodeConfig } from './config.ts';
import { createKv, type KvScope } from './kv.ts';

export { appSchema, assertConfig } from './config.ts';
export type { AiChatOptions, AiMessage, KvScope, MininodeConfig };

export type Role = 'admin' | 'trusted' | 'user';

export interface Mininode {
  readonly config: MininodeConfig;
  /** The raw supabase-js client (platform schema helpers, auth events). */
  readonly supabase: SupabaseClient;
  readonly auth: {
    user(): Promise<User | null>;
    role(): Promise<Role | null>;
    /** Resolves with the user, or redirects to the central login and never resolves. */
    requireLogin(): Promise<User>;
    signOut(): Promise<void>;
    /** Link to the portal's account page (passkeys, password, profile). */
    accountUrl(): string;
  };
  /** supabase-js query builder scoped to this app's schema: `mn.db.from('recipes').select()`. */
  readonly db: ReturnType<SupabaseClient['schema']>;
  readonly kv: ReturnType<typeof createKv>;
  readonly files: {
    upload(
      path: string,
      body: Blob | File | ArrayBuffer,
      options?: { shared?: boolean; contentType?: string },
    ): Promise<string>;
    url(path: string, options?: { shared?: boolean; expiresIn?: number }): Promise<string>;
    list(prefix?: string, options?: { shared?: boolean }): Promise<string[]>;
    remove(path: string, options?: { shared?: boolean }): Promise<void>;
  };
  realtime(channel: string): RealtimeChannel;
  readonly ai: ReturnType<typeof createAi>;
  notify(title: string, body?: string, url?: string): Promise<void>;
}

const FILE_BUCKET = 'app-files';

function decodeRole(accessToken: string | undefined): Role | null {
  if (!accessToken) return null;
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as {
      mn_role?: unknown;
    };
    return json.mn_role === 'admin' || json.mn_role === 'trusted' || json.mn_role === 'user'
      ? json.mn_role
      : null;
  } catch {
    return null;
  }
}

export function createMininode(config: MininodeConfig): Mininode {
  const supabase = createBrowserClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookieOptions: {
      name: 'mn-auth',
      path: '/',
      sameSite: 'lax',
      secure: location.protocol === 'https:',
      ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
    },
  });

  const loginUrl = () => {
    const url = new URL('/login', config.portalUrl);
    url.searchParams.set('next', location.href);
    return url.toString();
  };

  const currentUser = async () => (await supabase.auth.getUser()).data.user;

  // Resolves the owner folder for file paths: shared-account apps store under the app owner.
  const ownerFolder = async (shared?: boolean): Promise<string> => {
    if (shared) return 'shared';
    const { data, error } = await supabase
      .schema('platform')
      .rpc('effective_owner', { p_slug: config.appSlug });
    if (error || typeof data !== 'string') throw new Error('mininode: not signed in');
    return data;
  };
  const objectPath = async (path: string, shared?: boolean) => {
    const clean = path.replace(/^\/+/, '');
    if (!clean || clean.includes('..')) throw new Error('mininode: invalid file path');
    return `${config.appSlug}/${await ownerFolder(shared)}/${clean}`;
  };

  return {
    config,
    supabase,
    auth: {
      user: currentUser,
      async role() {
        const { data } = await supabase.auth.getSession();
        return decodeRole(data.session?.access_token);
      },
      async requireLogin() {
        const user = await currentUser();
        if (user) return user;
        location.assign(loginUrl());
        return new Promise<never>(() => {});
      },
      async signOut() {
        await supabase.auth.signOut();
        location.assign(config.portalUrl);
      },
      accountUrl: () => new URL('/account', config.portalUrl).toString(),
    },
    db: supabase.schema(appSchema(config.appSlug)),
    kv: createKv(supabase, config.appSlug),
    files: {
      async upload(path, body, options = {}) {
        const target = await objectPath(path, options.shared);
        const { error } = await supabase.storage.from(FILE_BUCKET).upload(target, body, {
          upsert: true,
          ...(options.contentType ? { contentType: options.contentType } : {}),
        });
        if (error) throw error;
        return target;
      },
      async url(path, options = {}) {
        const target = await objectPath(path, options.shared);
        const { data, error } = await supabase.storage
          .from(FILE_BUCKET)
          .createSignedUrl(target, options.expiresIn ?? 3600);
        if (error) throw error;
        return data.signedUrl;
      },
      async list(prefix = '', options = {}) {
        const folder = `${config.appSlug}/${await ownerFolder(options.shared)}/${prefix}`.replace(
          /\/$/,
          '',
        );
        const { data, error } = await supabase.storage.from(FILE_BUCKET).list(folder);
        if (error) throw error;
        return data.map((entry) => entry.name);
      },
      async remove(path, options = {}) {
        const { error } = await supabase.storage
          .from(FILE_BUCKET)
          .remove([await objectPath(path, options.shared)]);
        if (error) throw error;
      },
    },
    realtime: (channel) => supabase.channel(`${config.appSlug}:${channel}`),
    ai: createAi(
      config,
      async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    ),
    async notify(title, body, url) {
      const { error } = await supabase.schema('platform').rpc('notify_self', {
        p_app_slug: config.appSlug,
        p_title: title,
        p_body: body ?? null,
        p_url: url ?? null,
      });
      if (error) throw error;
    },
  };
}

let instance: Promise<Mininode> | undefined;

/** Loads the host configuration once and returns the shared client. */
export function mininode(): Promise<Mininode> {
  instance ??= loadConfig().then(createMininode);
  return instance;
}
