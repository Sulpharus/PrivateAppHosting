// The privacy rules of db/001_init.sql against the local Supabase stack, in one transaction that
// is rolled back: the wish owner never learns who reserves what, others see "geschenkt" for 30
// days, and the giver keeps the reservation until it is ticked off.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const dbUrl = process.env.SUPABASE_DB_URL;
const init = readFileSync(new URL('../db/001_init.sql', import.meta.url), 'utf8');

describe.skipIf(!dbUrl)('wunschliste database', () => {
  const sql = postgres(dbUrl ?? '', { max: 1, onnotice: () => {} });
  afterAll(() => sql.end());

  it('hides reservations from the owner and shares them with everyone else', async () => {
    const rollback = new Error('rollback');
    await sql
      .begin(async (tx) => {
        await tx.unsafe('drop schema if exists app_wunschliste cascade');
        await tx.unsafe(init);
        await tx`insert into platform.apps (slug, name, description, kind, target, manifest, status)
          values ('wunschliste', 'Wunschliste', 'x', 'static', 'cloudflare', '{}', 'online')
          on conflict (slug) do nothing`;
        await tx`insert into platform.app_origins (origin, app_slug)
          values ('https://wunschliste.test', 'wunschliste') on conflict (origin) do nothing`;
        const user = async (name) => {
          const [row] = await tx`insert into auth.users
            (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
            values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', ${`${name}-${Date.now()}@example.com`},
              ${tx.json({ display_name: name })}, now(), now())
            returning id`;
          await tx`update platform.profiles set role = 'user' where user_id = ${row.id}`;
          await tx`insert into platform.app_grants (user_id, app_slug)
            values (${row.id}, 'wunschliste') on conflict do nothing`;
          return row.id;
        };
        const lena = await user('Lena');
        const tom = await user('Tom');
        const mia = await user('Mia');

        /** Runs `fn` as `userId`, calling from the app's origin (or another one). */
        const as = async (userId, fn, origin = 'https://wunschliste.test', db = tx) => {
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
        const refused = (userId, fn, origin) => tx.savepoint((sp) => as(userId, fn, origin, sp));

        const [wish] = await as(
          lena,
          () =>
            tx`insert into app_wunschliste.wishes (title, price_cents) values ('Kopfhörer', 9900)
            returning id, owner_id`,
        );
        expect(wish.owner_id).toBe(lena);
        await as(lena, () => tx`insert into app_wunschliste.wishes (title) values ('Buch')`);

        // Tom reserves the headphones; Lena cannot reserve her own wish.
        await as(tom, () => tx`select app_wunschliste.reserve(${wish.id})`);
        await expect(
          refused(lena, (db) => db`select app_wunschliste.reserve(${wish.id})`),
        ).rejects.toThrow(/own_wish/);
        await expect(
          refused(mia, (db) => db`select app_wunschliste.reserve(${wish.id})`),
        ).rejects.toThrow(/already_reserved/);

        // Lena: her own list, no trace of the reservation, and nothing through wishlist().
        const own = await as(
          lena,
          () => tx`select title from app_wunschliste.wishes order by title`,
        );
        expect(own.map((r) => r.title)).toEqual(['Buch', 'Kopfhörer']);
        expect(await as(lena, () => tx`select * from app_wunschliste.reservations`)).toHaveLength(
          0,
        );
        expect(
          await as(lena, () => tx`select * from app_wunschliste.wishlist(${lena})`),
        ).toHaveLength(0);

        // Mia sees it as given, Tom as his.
        const forMia = await as(
          mia,
          () => tx`select title, status from app_wunschliste.wishlist(${lena}) order by title`,
        );
        expect(forMia.map((r) => [r.title, r.status])).toEqual([
          ['Buch', 'frei'],
          ['Kopfhörer', 'geschenkt'],
        ]);
        const forTom = await as(
          tom,
          () => tx`select status from app_wunschliste.wishlist(${lena}) where id = ${wish.id}`,
        );
        expect(forTom[0]?.status).toBe('von-dir');
        const people = await as(
          mia,
          () => tx`select display_name, wishes from app_wunschliste.people()`,
        );
        expect(people.map((p) => [p.display_name, Number(p.wishes)])).toEqual([['Lena', 2]]);

        // The owner cannot probe for reservations by changing ids: refused either way.
        const [free] = await as(
          lena,
          (db) => db`select id from app_wunschliste.wishes where title = 'Buch'`,
        );
        for (const id of [wish.id, free.id])
          await expect(
            refused(
              lena,
              (db) => db`update app_wunschliste.wishes set id = gen_random_uuid() where id = ${id}`,
            ),
          ).rejects.toThrow(/permission denied/);
        const edits = [];
        for (const id of [wish.id, free.id])
          edits.push(
            (
              await as(
                lena,
                (db) => db`update app_wunschliste.wishes set note = 'x' where id = ${id}`,
              )
            ).count,
          );
        expect(edits).toEqual([1, 1]);

        // Not from another app's page, and not by writing reservations directly.
        expect(
          await as(
            mia,
            () => tx`select * from app_wunschliste.wishlist(${lena})`,
            'https://evil.test',
          ),
        ).toHaveLength(0);
        await expect(
          refused(
            mia,
            (db) =>
              db`insert into app_wunschliste.reservations (recipient_name, title) values ('x', 'y')`,
          ),
        ).rejects.toThrow(/permission denied/);

        // After 30 days others no longer see the given wish; Tom still does.
        await tx`update app_wunschliste.reservations set reserved_at = now() - interval '31 days'`;
        const later = await as(mia, () => tx`select title from app_wunschliste.wishlist(${lena})`);
        expect(later.map((r) => r.title)).toEqual(['Buch']);
        const counted = await as(mia, (db) => db`select wishes from app_wunschliste.people()`);
        expect(Number(counted[0]?.wishes)).toBe(1);
        expect(
          await as(tom, () => tx`select * from app_wunschliste.wishlist(${lena})`),
        ).toHaveLength(2);

        // Lena deletes the wish; Tom's shopping list keeps it until he ticks it off.
        await as(lena, () => tx`delete from app_wunschliste.wishes where id = ${wish.id}`);
        const kept = await as(
          tom,
          () => tx`select title, wish_id, recipient_name from app_wunschliste.reservations`,
        );
        expect(kept).toEqual([{ title: 'Kopfhörer', wish_id: null, recipient_name: 'Lena' }]);
        await as(tom, () => tx`update app_wunschliste.reservations set purchased_at = now()`);
        await expect(
          refused(tom, (db) => db`update app_wunschliste.reservations set title = 'x'`),
        ).rejects.toThrow(/permission denied/);

        throw rollback;
      })
      .catch((err) => {
        if (err !== rollback) throw err;
      });
  });
});
