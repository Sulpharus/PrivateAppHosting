/**
 * MiniNode SDK for Medialog: login, data (mn.kv, works offline), external APIs through the
 * platform proxy (mn.api) and the people who share this app (mn.people).
 */

import { mininode as boot, ExternalApiError, type Mininode } from '@mininode/sdk';
import type { MiniNodeUser } from '../types';

export { ExternalApiError };
export type MiniNodeSDK = Mininode;

let instance: Promise<Mininode> | null = null;

/** The one SDK instance of the page. */
export function mininode(): Promise<Mininode> {
  instance ??= boot();
  return instance;
}

/** A JSON copy for mn.kv (drops undefined fields and functions). */
export type KvValue = Parameters<Mininode['kv']['set']>[1];
export const toJson = (value: unknown): KvValue => JSON.parse(JSON.stringify(value ?? null));

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}

/** Signs in (redirects to the portal if needed) and returns the user with their display name. */
export async function signedInUser(mn: Mininode): Promise<MiniNodeUser> {
  const user = await mn.auth.requireLogin();
  let name = String(user.user_metadata?.display_name ?? '');
  try {
    const { data } = await mn.supabase
      .schema('platform')
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle<{ display_name: string }>();
    if (data?.display_name) name = data.display_name;
  } catch {
    // Offline: the name from the session is good enough.
  }
  name ||= user.email?.split('@')[0] ?? 'Ich';
  return { id: user.id, name, email: user.email ?? '', avatarInitials: initials(name) };
}
