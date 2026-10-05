/**
 * The platform client: the real SDK, typed for what this app uses.
 *
 * The export shipped its own stand-in with a browser-only fallback; that would have kept every
 * item on one device and never reached the account. The platform provides the data (mn.kv), the
 * files (mn.files), realtime and push, and works offline by itself.
 */
import { mininode } from '@mininode/sdk';

export interface MiniNodeUser {
  id: string;
  name?: string;
  email?: string;
  role?: 'admin' | 'trusted' | 'user';
}

export interface MiniNodePushSchedule {
  key: string;
  at: Date | string | number;
  title: string;
  path?: string;
}

export interface MiniNodeClient {
  auth: {
    requireLogin: () => Promise<MiniNodeUser>;
    role: () => Promise<'admin' | 'trusted' | 'user'>;
  };
  kv: {
    get: <T = any>(key: string, scope?: string) => Promise<T | null>;
    set: <T = any>(key: string, value: T, scope?: string) => Promise<void>;
    list: <T = any>(prefix?: string, scope?: string) => Promise<{ key: string; value: T }[]>;
    delete: (key: string, scope?: string) => Promise<void>;
  };
  files: {
    upload: (
      path: string,
      blob: Blob | File,
      options?: { contentType?: string; shared?: boolean },
    ) => Promise<{ path: string; size: number }>;
    url: (path: string) => Promise<string>;
    list: (prefix?: string) => Promise<string[]>;
    delete: (path: string) => Promise<void>;
  };
  realtime: (channel: string) => {
    on: (type: string, filter: any, handler: (payload: any) => void) => any;
    subscribe: () => () => void;
    broadcast: (event: string, payload: any) => Promise<void>;
  };
  notify: (title: string, message: string, path?: string) => Promise<void>;
  push: {
    schedule: (params: MiniNodePushSchedule) => Promise<void>;
    cancel: (key: string) => Promise<void>;
  };
  offline: {
    online: () => boolean;
    pending: () => Promise<number>;
    onChange: (cb: (online: boolean) => void) => () => void;
    onSynced: (cb: () => void) => () => void;
  };
}

let client: Promise<MiniNodeClient> | null = null;

export function getMiniNode(): Promise<MiniNodeClient> {
  client ??= mininode() as unknown as Promise<MiniNodeClient>;
  return client;
}
