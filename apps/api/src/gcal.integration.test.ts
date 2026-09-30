// Google Calendar sync (ADR 0010) against the local Supabase stack, with a small in-memory
// Google Calendar standing in for Google.
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';
import { seal } from './lib/google.ts';
import { CALENDAR_SCOPE } from './routes/gcal.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
const enabled = Boolean(url && publishableKey && secretKey && dbUrl);

interface FakeEvent {
  id: string;
  etag: string;
  seq: number;
  status: string;
  updated: string;
  [key: string]: unknown;
}

describe.skipIf(!enabled)('google calendar sync', () => {
  const run = Date.now().toString(36);
  const origin = `https://kalender-${run}.test`;
  const password = 'correct horse battery staple';
  const env = {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    PORTAL_URL: 'https://mininode.app',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_TOKEN_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
  } as unknown as ApiEnv;
  const background: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void background.push(p),
    passThroughOnException: () => undefined,
    props: {},
  };
  const sql = postgres(dbUrl ?? '', { max: 1 });
  const admin = createClient(url ?? 'http://127.0.0.1', secretKey ?? 'unused', {
    auth: { persistSession: false },
  });
  let userId = '';
  let token = '';
  const created: string[] = [];

  // ---- a tiny Google Calendar ----
  let seq = 0;
  const calendars = new Map<string, Map<string, FakeEvent>>([['me@gmail.com', new Map()]]);
  const put = (cal: string, event: Record<string, unknown> & { id?: string }) => {
    const events = calendars.get(cal);
    if (!events) throw new Error(`no calendar ${cal}`);
    const id = event.id ?? `ev${++seq}`;
    const next: FakeEvent = {
      ...(events.get(id) ?? {}),
      ...event,
      id,
      etag: `"${++seq}"`,
      seq,
      status: (event.status as string | undefined) ?? 'confirmed',
      updated: new Date(Date.now() + seq).toISOString(),
    };
    events.set(id, next);
    return next;
  };
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = new URL(String(input instanceof Request ? input.url : input));
    if (target.href === 'https://oauth2.googleapis.com/token')
      return Response.json({ access_token: 'at', expires_in: 3599, scope: CALENDAR_SCOPE });
    if (target.hostname !== 'www.googleapis.com') return realFetch(input, init);
    const path = decodeURIComponent(target.pathname.replace('/calendar/v3', ''));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === '/users/me/calendarList')
      return Response.json({
        items: [...calendars.keys()].map((id) => ({
          id,
          summary: id === 'me@gmail.com' ? 'Lena' : 'MiniNode',
          backgroundColor: '#a4bdfc',
          accessRole: 'owner',
        })),
      });
    if (path === '/calendars' && method === 'POST') {
      calendars.set('mn-target', new Map());
      return Response.json({ id: 'mn-target' });
    }
    const m = /^\/calendars\/([^/]+)(?:\/events(?:\/(.+))?)?$/.exec(path);
    const events = m ? calendars.get(m[1] ?? '') : undefined;
    if (!m || !events) return new Response('not found', { status: 404 });
    if (!path.includes('/events')) return Response.json({ id: m[1] });
    const id = m[2];
    if (!id && method === 'GET') {
      const since = Number(target.searchParams.get('syncToken') ?? 0);
      return Response.json({
        items: [...events.values()].filter((e) => e.seq > since),
        nextSyncToken: String(seq),
      });
    }
    if (!id && method === 'POST') return Response.json(put(m[1] ?? '', body));
    if (id && !events.has(id)) return new Response('gone', { status: 404 });
    if (id && method === 'PATCH') return Response.json(put(m[1] ?? '', { ...body, id }));
    if (id && method === 'DELETE') {
      put(m[1] ?? '', { id, status: 'cancelled' });
      return new Response(null, { status: 204 });
    }
    return new Response('unexpected', { status: 500 });
  });

  const call = (path: string, init: { method?: string; body?: unknown; origin?: string } = {}) =>
    app.request(
      path,
      {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Origin: init.origin ?? origin,
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      },
      env,
      ctx,
    );
  const sync = async () => {
    const res = await call('/google/calendar/sync', { method: 'POST' });
    expect(res.status).toBe(200);
    return (await res.json()) as { ran: boolean; error?: string };
  };

  beforeAll(async () => {
    const email = `gcal-${run}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    // apps created here are removed again, so a later `mininode dev` registers them properly
    const madeApps =
      await sql`insert into platform.apps (slug, name, description, kind, target, manifest, status)
      values ('kalender', 'Kalender', 'x', 'static', 'cloudflare', '{}', 'online'),
             ('sportplaner', 'Sportplaner', 'x', 'static', 'cloudflare', '{}', 'online')
      on conflict (slug) do nothing returning slug`;
    created.push(...madeApps.map((a) => String(a.slug)));
    await sql`insert into platform.app_origins (origin, app_slug) values (${origin}, 'kalender')`;
    await sql`insert into platform.app_type_requests (app_slug, type, access, why)
      values ('kalender', 'event', 'delete', 'x'), ('kalender', 'activity', 'read', 'x')
      on conflict do nothing`;
    await sql`insert into platform.app_type_grants (app_slug, type, access)
      values ('kalender', 'event', 'delete'), ('kalender', 'activity', 'read')
      on conflict (app_slug, type) do update set access = excluded.access`;
    await sql`insert into platform.google_grants (user_id, google_sub, scopes, refresh_token_enc)
      values (${userId}, ${`g-${run}`}, ${[CALENDAR_SCOPE]},
        ${await seal(env.GOOGLE_TOKEN_KEY ?? '', 'refresh', userId)})`;
    const [sport] = await sql`insert into platform.collections (name, family, owner_id, personal)
      values ('Mein Sport', 'sport', ${userId}, true) returning id`;
    await sql`insert into platform.collection_members values (${sport?.id}, ${userId}, 'owner')`;
    await sql`insert into platform.records (type, collection_id, title, starts_at, ends_at, data,
        source_app, created_by_app, created_by)
      values ('activity', ${sport?.id}, 'Bouldern', now() + interval '1 day',
        now() + interval '1 day 2 hours', '{}', 'sportplaner', 'sportplaner', ${userId})`;
    put('me@gmail.com', {
      summary: 'Zahnarzt',
      start: { dateTime: new Date(Date.now() + 2 * 86_400_000).toISOString() },
      end: { dateTime: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString() },
    });
    const client = createClient(url ?? '', publishableKey ?? '', {
      auth: { persistSession: false },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    token = session.data.session?.access_token ?? '';
  });

  afterAll(async () => {
    await sql`delete from platform.app_origins where origin = ${origin}`;
    if (created.length) await sql`delete from platform.apps where slug in ${sql(created)}`;
    await admin.auth.admin.deleteUser(userId);
    await sql.end();
    vi.restoreAllMocks();
  });

  it('is only for the Kalender', async () => {
    expect((await call('/google/calendar', { origin: 'https://other.test' })).status).toBe(403);
    const state = (await (await call('/google/calendar')).json()) as Record<string, unknown>;
    expect(state).toMatchObject({
      available: true,
      connected: true,
      scopeOk: true,
      enabled: false,
    });
  });

  it('mirrors chosen sources into "MiniNode" and brings Google calendars in', async () => {
    const res = await call('/google/calendar', {
      method: 'PUT',
      body: { enabled: true, pushSources: ['app:sportplaner:activity'] },
    });
    expect(res.status).toBe(200);
    // the switch starts a sync right away; a second one runs after it
    await Promise.all(background);
    expect(await sync()).toEqual({ ran: true });
    const mirrored = [...(calendars.get('mn-target')?.values() ?? [])];
    expect(mirrored.map((e) => e.summary)).toEqual(['Bouldern']);
    expect(mirrored[0]?.extendedProperties).toBeDefined();
    const [pulled] = await sql`select r.title, c.name from platform.records r
      join platform.collections c on c.id = r.collection_id
      where r.created_by = ${userId} and r.source_app = 'google'`;
    expect(pulled).toMatchObject({ title: 'Zahnarzt', name: 'Lena' });
  });

  it('sends changes both ways', async () => {
    await sql`update platform.records set title = 'Zahnarzt (Kontrolle)', version = version + 1,
      updated_at = now() where created_by = ${userId} and source_app = 'google'`;
    await sync();
    const google = [...(calendars.get('me@gmail.com')?.values() ?? [])];
    expect(google[0]?.summary).toBe('Zahnarzt (Kontrolle)');

    const id = google[0]?.id ?? '';
    put('me@gmail.com', { id, summary: 'Zahnarzt verschoben' });
    await sync();
    const [row] = await sql`select title from platform.records
      where created_by = ${userId} and source_app = 'google'`;
    expect(row?.title).toBe('Zahnarzt verschoben');
  });

  it('removes what is deleted or no longer chosen', async () => {
    await sql`update platform.records set deleted_at = now(), version = version + 1
      where created_by = ${userId} and title = 'Bouldern'`;
    await sync();
    expect([...(calendars.get('mn-target')?.values() ?? [])].map((e) => e.status)).toEqual([
      'cancelled',
    ]);
    const off = await call('/google/calendar', {
      method: 'PUT',
      body: { enabled: false, pushSources: [] },
    });
    expect(off.status).toBe(200);
    const [left] = await sql`select count(*)::int as n from platform.records
      where created_by = ${userId} and source_app = 'google' and deleted_at is null`;
    expect(left?.n).toBe(0);
  });
});
