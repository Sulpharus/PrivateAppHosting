// App-Bibliothek (ADR 0011): registers a library program installed on the NucBox in
// platform.apps, or disables it again. The container itself is rolled out by nucbox-deploy.

import { slugSchema } from '@mininode/manifest';
import { libraryEntry, libraryManifest } from '@mininode/manifest/library';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type DeployEnv, environmentSettings } from './environment.ts';
import { registerApp } from './register.ts';

export interface LibraryOptions {
  /** fetch for Supabase (tests). */
  fetch?: typeof fetch;
}

function client(envName: DeployEnv, options: LibraryOptions) {
  const env = environmentSettings(envName);
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is required');
  const db = createClient(env.supabaseUrl, secret, {
    auth: { persistSession: false },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  });
  return { db, domain: env.domain, local: env.name === 'local' };
}

function checkSlug(slug: string): string {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) throw new Error(`invalid slug ${slug}`);
  return parsed.data;
}

/** The registered app with this slug, if any. */
async function existing(db: SupabaseClient, slug: string) {
  const { data, error } = await db
    .schema('platform')
    .from('apps')
    .select('slug, manifest')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`looking up ${slug} failed: ${error.message}`);
  return data as { slug: string; manifest: { library?: string } | null } | null;
}

/** Checks an install before anything is rolled out: known entry, free (or same-entry) slug. */
export async function checkLibraryInstall(
  envName: DeployEnv,
  entryId: string,
  slug: string,
  options: LibraryOptions = {},
): Promise<void> {
  if (!libraryEntry(entryId)) throw new Error(`unknown library entry ${entryId}`);
  const { db } = client(envName, options);
  const app = await existing(db, checkSlug(slug));
  if (app && app.manifest?.library !== entryId)
    throw new Error(`${slug} is already taken by another app; pick another address`);
}

export async function installLibraryApp(
  envName: DeployEnv,
  entryId: string,
  slug: string,
  version: string,
  options: LibraryOptions = {},
): Promise<void> {
  const entry = libraryEntry(entryId);
  if (!entry) throw new Error(`unknown library entry ${entryId}`);
  const { db, domain, local } = client(envName, options);
  const app = await existing(db, checkSlug(slug));
  if (app && app.manifest?.library !== entryId)
    throw new Error(`${slug} is already taken by another app`);
  await registerApp(
    db,
    libraryManifest(entry, slug),
    version,
    local ? [] : [`https://${slug}.${domain}`],
  );
  // Installing again is the admin's explicit choice: a removed (disabled) program comes back.
  const { error } = await db
    .schema('platform')
    .from('apps')
    .update({ status: 'online' })
    .eq('slug', slug);
  if (error) throw new Error(`enabling ${slug} failed: ${error.message}`);
}

/** Disables a removed library app; grants and settings stay for a later reinstall. */
export async function removeLibraryApp(
  envName: DeployEnv,
  slug: string,
  entryId: string,
  options: LibraryOptions = {},
): Promise<void> {
  const { db } = client(envName, options);
  const app = await existing(db, checkSlug(slug));
  if (!app) return;
  if (app.manifest?.library !== entryId)
    throw new Error(`${slug} is not ${entryId} from the App-Bibliothek`);
  const { error } = await db
    .schema('platform')
    .from('apps')
    .update({ status: 'disabled' })
    .eq('slug', slug);
  if (error) throw new Error(`disabling ${slug} failed: ${error.message}`);
}
