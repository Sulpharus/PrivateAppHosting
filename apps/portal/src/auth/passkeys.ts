// All passkey calls live here (ADR 0001): if the Supabase passkey API changes, only this file does.

import { supabase } from '../lib/supabase.ts';

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

export async function signInWithPasskey(): Promise<void> {
  const { error } = await supabase().auth.signInWithPasskey();
  if (error) throw error;
}

export async function registerPasskey(): Promise<void> {
  const { error } = await supabase().auth.registerPasskey();
  if (error) throw error;
}

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const { data, error } = await supabase().auth.passkey.list();
  if (error) throw error;
  return (data ?? []).map((passkey) => ({
    id: passkey.id,
    name: passkey.friendly_name ?? 'Passkey',
    createdAt: passkey.created_at,
    lastUsedAt: passkey.last_used_at ?? null,
  }));
}

export async function renamePasskey(id: string, name: string): Promise<void> {
  const { error } = await supabase().auth.passkey.update({ passkeyId: id, friendlyName: name });
  if (error) throw error;
}

export async function deletePasskey(id: string): Promise<void> {
  const { error } = await supabase().auth.passkey.delete({ passkeyId: id });
  if (error) throw error;
}

/** Human-readable German message for WebAuthn/Supabase passkey errors. */
export function passkeyErrorMessage(error: unknown): string {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/NotAllowed|ABORTED|cancel/i.test(text)) return 'Vorgang abgebrochen.';
  if (/credential_exists/i.test(text)) return 'Dieses Gerät ist bereits registriert.';
  if (/credential_not_found/i.test(text))
    return 'Dieser Passkey ist nicht (mehr) bei MiniNode registriert.';
  if (/challenge_expired/i.test(text))
    return 'Das hat zu lange gedauert. Bitte noch einmal versuchen.';
  if (/too_many_passkeys/i.test(text)) return 'Du hast bereits die maximale Anzahl an Passkeys.';
  return 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
}
