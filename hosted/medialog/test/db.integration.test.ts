// The sharing rules of db/001_shares.sql against the local Supabase stack, in one transaction
// that is rolled back: only the owner writes a share, only its recipients read it (from the
// app's own page), and the sender comes from the database.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const dbUrl = process.env.SUPABASE_DB_URL;
const init = readFileSync(new URL('../db/001_shares.sql', import.meta.url), 'utf8');

describe.skipIf(!dbUrl)('medialog database', () => {
  const sql = postgres(dbUrl ?? '', { max: 1, onnotice: () => {} });
  afterAll(() => sql.end());

  it('shows a share to its recipients only', async () => {
    const rollback = new Error('rollback');
    await sql
      .begin(async (tx) => {
        await tx.unsafe('drop schema if exists app_medialog cascade');
        await tx.unsafe(init);
        await tx`insert into platform.apps (slug, name, description, kind, target, manifest, status)
          values ('medialog', 'Medialog', 'x', 'spa', 'cloudflare', '{}', 'online')
          on conflict (slug) do nothing`;
        await tx`insert into platform.app_origins (origin, app_slug)
          values ('https://medialog.test', 'medialog') on conflict (origin) do nothing`;
        const user = async (name: string): Promise<string> => {
          const [row] = await tx<{ id: string }[]>`insert into auth.users
            (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
            values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', ${`${name}-${Date.now()}@example.com`},
              ${tx.json({ display_name: name })}, now(), now())
            returning id`;
          if (!row) throw new Error('no user');
          await tx`update platform.profiles set role = 'user' where user_id = ${row.id}`;
          await tx`insert into platform.app_grants (user_id, app_slug)
            values (${row.id}, 'medialog') on conflict do nothing`;
          return row.id;
        };
        const lena = await user('Lena');
        const tom = await user('Tom');
        const mia = await user('Mia');

        type Tx = typeof tx;
        /** Runs `fn` as `userId`, calling from the app's origin (or another one). */
        const as = async <T>(
          userId: string,
          fn: (db: Tx) => Promise<T>,
          origin = 'https://medialog.test',
          db: Tx = tx,
        ): Promise<T> => {
          await db`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal1' })}, true)`;
          await db`select set_config('request.headers', ${JSON.stringify({ origin })}, true)`;
          await db.unsafe('set local role authenticated');
          try {
            return await fn(db);
          } finally {
            await db.unsafe('reset role');
          }
        };
        /** Like `as`, for a statement that must fail; the transaction carries on. */
        const refused = (userId: string, fn: (db: Tx) => Promise<unknown>) =>
          tx.savepoint((sp) => as(userId, fn, 'https://medialog.test', sp as unknown as Tx));

        const payload = { list: { id: 'l1', title: 'Sommer-Lektüre' }, items: [] };
        await as(
          lena,
          (db) => db`insert into app_medialog.shares (kind, item_id, recipients, payload)
            values ('list', 'l1', ${[tom]}::uuid[], ${db.json(payload)})`,
        );

        // Tom gets it through the function, with Lena's name from her profile.
        const got = await as(tom, (db) => db`select * from app_medialog.shared_with_me()`);
        expect(got.map((r) => [r.owner_id, r.owner_name, r.item_id])).toEqual([
          [lena, 'Lena', 'l1'],
        ]);
        // Not from another app's page, and never for Mia.
        expect(
          await as(tom, (db) => db`select * from app_medialog.shared_with_me()`, 'https://x.test'),
        ).toHaveLength(0);
        expect(await as(mia, (db) => db`select * from app_medialog.shared_with_me()`)).toHaveLength(
          0,
        );

        // Recipients cannot read or change the table directly.
        expect(await as(tom, (db) => db`select * from app_medialog.shares`)).toHaveLength(0);
        const changed = await as(
          tom,
          (db) => db`update app_medialog.shares set recipients = ${[tom, mia]}::uuid[]`,
        );
        expect(changed.count).toBe(0);

        // Nobody writes a share in someone else's name.
        await expect(
          refused(
            mia,
            (
              db,
            ) => db`insert into app_medialog.shares (owner_id, kind, item_id, recipients, payload)
              values (${lena}, 'work', 'w1', ${[tom]}::uuid[], '{}')`,
          ),
        ).rejects.toThrow(/row-level security/);

        throw rollback;
      })
      .catch((err) => {
        if (err !== rollback) throw err;
      });
  });
});
