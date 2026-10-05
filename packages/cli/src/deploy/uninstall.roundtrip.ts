// Uninstall against the local stack: the app, its schema, its files and its rows are gone, a
// neighbour is untouched, and without --purge the data stays. Runs on its own because dropping
// a schema makes the local Data API reload (pnpm test:roundtrip).
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uninstallApp } from './uninstall.ts';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
const local = ['127.0.0.1', 'localhost'].includes(new URL(databaseUrl ?? 'x://none').hostname);
const enabled = Boolean(
  local && url && secret && databaseUrl && process.env.MININODE_ALLOW_DB_WIPE,
);

describe.skipIf(!enabled)('uninstall', () => {
  const run = Date.now().toString(36);
  const gone = `uninst-${run}`;
  const stays = `uninst-keep-${run}`;
  const schema = (slug: string) => `app_${slug.replaceAll('-', '_')}`;
  const admin = createClient(url ?? '', secret ?? '', { auth: { persistSession: false } });
  const sql = postgres(databaseUrl ?? '', { max: 1, onnotice: () => {} });

  async function seed(slug: string) {
    const { error } = await admin
      .schema('platform')
      .from('apps')
      .upsert({
        slug,
        name: slug,
        description: 'Test',
        kind: 'spa',
        target: 'cloudflare',
        manifest: {},
        status: 'online',
        icon_path: `${slug}-logo.svg`,
      });
    if (error) throw error;
    await sql.unsafe(`create schema if not exists "${schema(slug)}"`);
    await sql.unsafe(`create table "${schema(slug)}".notes (id int primary key)`);
    await sql.unsafe(`insert into "${schema(slug)}".notes values (1)`);
    await admin.schema('platform').from('app_kv').insert({ app_slug: slug, key: 'k', value: {} });
    await sql`insert into platform.app_migrations (app_slug, filename, checksum) values (${slug}, '001.sql', 'x')`;
    for (const [bucket, name] of [
      ['app-files', `${slug}/shared/a.txt`],
      ['app-files', `${slug}/user-1/deep/b.txt`],
      ['app-icons', `${slug}-logo.svg`],
    ] as const) {
      const { error: uploadError } = await admin.storage
        .from(bucket)
        .upload(name, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
          upsert: true,
          // The logo bucket only takes images.
          contentType: bucket === 'app-icons' ? 'image/svg+xml' : 'text/plain',
        });
      if (uploadError) throw uploadError;
    }
  }

  const rows = async (slug: string) =>
    (await admin.schema('platform').from('apps').select('slug').eq('slug', slug)).data?.length ?? 0;
  const schemaExists = async (slug: string) =>
    ((await sql`select 1 from pg_namespace where nspname = ${schema(slug)}`).length ?? 0) > 0;
  const files = async (slug: string) =>
    (await admin.storage.from('app-files').list(slug)).data?.length ?? 0;

  beforeAll(async () => {
    await seed(gone);
    await seed(stays);
  });

  afterAll(async () => {
    for (const slug of [gone, stays]) {
      await uninstallApp('local', slug, { purge: true, log: () => {} }).catch(() => undefined);
    }
    await sql.end();
  });

  it('keeps the data without --purge, but takes the app offline', async () => {
    const result = await uninstallApp('local', gone, { log: () => {} });
    expect(result).toMatchObject({ registry: 'disabled', schema: 'kept' });
    expect(await rows(gone)).toBe(1);
    expect(await schemaExists(gone)).toBe(true);
    const status = await admin.schema('platform').from('apps').select('status').eq('slug', gone);
    expect(status.data?.[0]?.status).toBe('disabled');
  });

  it('deletes everything of the app with --purge and nothing of its neighbour', async () => {
    const result = await uninstallApp('local', gone, { purge: true, log: () => {} });
    expect(result).toMatchObject({ registry: 'deleted', schema: 'dropped', files: 3 });
    expect(await rows(gone)).toBe(0);
    expect(await schemaExists(gone)).toBe(false);
    expect(await files(gone)).toBe(0);
    const kv = await admin.schema('platform').from('app_kv').select('key').eq('app_slug', gone);
    expect(kv.data).toEqual([]);
    // The record of applied migrations goes too: a new app with this address starts from zero.
    expect(await sql`select 1 from platform.app_migrations where app_slug = ${gone}`).toHaveLength(
      0,
    );
    expect(await sql`select 1 from platform.app_migrations where app_slug = ${stays}`).toHaveLength(
      1,
    );

    expect(await rows(stays)).toBe(1);
    expect(await schemaExists(stays)).toBe(true);
    expect(await files(stays)).toBeGreaterThan(0);
    // The Data API still answers after the schema is gone (it was hidden first).
    const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: secret ?? '' } });
    expect(response.status).toBeLessThan(500);
  });

  it('can be run again after a partial run', async () => {
    const again = await uninstallApp('local', gone, { purge: true, log: () => {} });
    expect(again).toMatchObject({ registry: 'none', schema: 'none', files: 0 });
  });
});
