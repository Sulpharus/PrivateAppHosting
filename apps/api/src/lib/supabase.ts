import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ApiEnv } from '../env.ts';

/** Service-role client. Only use after the caller has been authorized. */
export function adminClient(env: ApiEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
