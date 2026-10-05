/**
 * The platform client: the real SDK, typed for what this app uses.
 *
 * The export shipped its own stand-in with a browser-only fallback; that would have kept every
 * item on one device and never reached the account. The platform provides the data (mn.kv), the
 * files (mn.files), realtime and push, and works offline by itself.
 */
import { type Mininode, mininode } from '@mininode/sdk';

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
  files: Pick<Mininode['files'], 'upload' | 'url' | 'list' | 'remove'>;
  realtime: (channel: string) => {
    on: (type: string, filter: any, handler: (payload: any) => void) => any;
    subscribe: () => any;
    broadcast: (event: string, payload: any) => Promise<any>;
  };
  notify: Mininode['notify'];
  push: Mininode['push'];
  offline: Mininode['offline'];
}
export interface MiniNodeUser {
  id: string;
  name?: string;
  email?: string;
  role?: 'admin' | 'trusted' | 'user';
}

let client: Promise<MiniNodeClient> | null = null;

/**
 * The SDK, as far as this app uses it. `files` comes from the SDK's own type, so a call to a method
 * that does not exist there (the export had files.delete; it is files.remove) fails to compile.
 */
export function getMiniNode(): Promise<MiniNodeClient> {
  client ??= mininode() as unknown as Promise<MiniNodeClient>;
  return client;
}
