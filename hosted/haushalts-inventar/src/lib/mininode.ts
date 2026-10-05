/**
 * The platform for this app: login, data (mn.kv, works offline), files, reminders and the
 * people who share the account. Data is shared-account: trusted people work on the owner's data.
 */
import { mininode as boot, type Mininode } from '@mininode/sdk';
import type { User } from '../types';

export type Sdk = Mininode;
type KvValue = Parameters<Mininode['kv']['set']>[1];

let instance: Promise<Mininode> | null = null;

/** The one SDK instance of the page. */
export function mininode(): Promise<Mininode> {
  instance ??= boot();
  return instance;
}

/** A JSON copy for mn.kv (drops undefined fields). */
export const toJson = (value: unknown): KvValue => JSON.parse(JSON.stringify(value ?? null));

/** Signs in (redirects to the portal when needed) and returns the person with their name. */
export async function signedInUser(mn: Mininode): Promise<User> {
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
  name ||= user.email?.split('@')[0] ?? '';
  return { id: user.id, name };
}
