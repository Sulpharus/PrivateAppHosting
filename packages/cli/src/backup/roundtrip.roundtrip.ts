// A backup of the local stack, damage, a restore: the accounts (with their passwords), the
// platform rows and the stored files come back as they were. Needs Docker or PostgreSQL tools of
// the server's version, and empties the local database, so it only runs when allowed:
//   pnpm test:roundtrip
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBackup } from './create.ts';
import { restoreBackup } from './restore.ts';
import { verifyBackup } from './verify.ts';

const url = process.env.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
// Only ever against a database on this machine: the restore empties it.
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(
  new URL(databaseUrl ?? 'x://none').hostname,
);
const enabled = Boolean(
  local && url && publishable && secret && databaseUrl && process.env.MININODE_ALLOW_DB_WIPE,
);

describe.skipIf(!enabled)('backup and restore', () => {
  const run = Date.now().toString(36);
  const email = `backup-${run}@example.com`;
  const password = 'correct horse battery staple';
  const bucket = 'app-files';
  const files: Record<string, string> = {
    [`backup-test/${run}/photo one.txt`]: 'first file',
    [`backup-test/${run}/sub dir/two (2).txt`]: 'second file',
  };
  const admin = createClient(url ?? '', secret ?? '', { auth: { persistSession: false } });
  const sql = postgres(databaseUrl ?? '', { max: 1, onnotice: () => {} });
  const out = mkdtempSync(join(tmpdir(), 'mn-backup-'));
  const folder = join(out, 'backup');
  let userId = '';

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'Backup Test' },
    });
    if (error) throw error;
    userId = data.user.id;
    await sql`update platform.profiles set display_name = 'Vor dem Backup' where user_id = ${userId}`;
    for (const [name, text] of Object.entries(files)) {
      const { error: uploadError } = await admin.storage
        .from(bucket)
        .upload(name, Buffer.from(text), { upsert: true, contentType: 'text/plain' });
      if (uploadError) throw uploadError;
    }
  });

  afterAll(async () => {
    await admin.storage.from(bucket).remove(Object.keys(files));
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    await sql.end();
    rmSync(out, { recursive: true, force: true });
  });

  it('brings accounts, rows and files back after damage', async () => {
    const manifest = await createBackup({
      databaseUrl: databaseUrl ?? '',
      supabaseUrl: url ?? '',
      serviceKey: secret ?? '',
      out: folder,
      commit: 'test',
    });
    expect(manifest.database.tables.some((t) => t.table === 'users' && t.rows > 0)).toBe(true);
    expect((await verifyBackup(folder)).problems).toEqual([]);

    // Damage: the account (and with it the profile), a file, and an unrelated row.
    await admin.auth.admin.deleteUser(userId);
    await admin.storage.from(bucket).remove(Object.keys(files));
    await sql`update platform.apps set name = 'kaputt' where true`;

    const plan = await restoreBackup({
      dir: folder,
      databaseUrl: databaseUrl ?? '',
      supabaseUrl: url ?? '',
      serviceKey: secret ?? '',
    });
    expect(plan.tables.length).toBeGreaterThan(10);
    // Without --yes nothing changed.
    const [stillBroken] = await sql`select count(*)::int as n from auth.users where id = ${userId}`;
    expect(stillBroken?.n).toBe(0);

    await restoreBackup({
      dir: folder,
      databaseUrl: databaseUrl ?? '',
      supabaseUrl: url ?? '',
      serviceKey: secret ?? '',
      yes: true,
    });

    // The same person, with the same password and profile.
    const client = createClient(url ?? '', publishable ?? '', { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    expect(login.data.user?.id).toBe(userId);
    const [profile] =
      await sql`select display_name from platform.profiles where user_id = ${userId}`;
    expect(profile?.display_name).toBe('Vor dem Backup');
    const [renamed] = await sql`select count(*)::int as n from platform.apps where name = 'kaputt'`;
    expect(renamed?.n).toBe(0);

    for (const [name, text] of Object.entries(files)) {
      const { data, error } = await admin.storage.from(bucket).download(name);
      expect(error).toBeNull();
      expect(await data?.text()).toBe(text);
    }
  });
});
