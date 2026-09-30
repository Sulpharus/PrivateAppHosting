// Google Calendar sync for the Kalender app (ADR 0010).
//   GET  /google/calendar       state for the switch in the Kalender header
//   PUT  /google/calendar       switch on/off, choose sources and Google calendars
//   POST /google/calendar/sync  sync now (the Kalender calls it when opened)
// The cron syncs one due user every five minutes. Every run has a subrequest budget (Workers
// Free: 50 per invocation) and simply continues on the next run when it is used up.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import type { ApiEnv } from '../env.ts';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import {
  type ApplyItem,
  DEFAULT_TZ,
  eventBody,
  type GoogleEvent,
  type PlanRecord,
  paletteColor,
  sourceId,
  applyItem as toApplyItem,
} from '../lib/gcal.ts';
import { GoogleError, type GoogleSettings, refreshAccessToken, unseal } from '../lib/google.ts';
import { adminClient } from '../lib/supabase.ts';
import { googleSettings } from './google.ts';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
export const GCAL_CRON = '2-59/5 * * * *';

const log = (event: string, detail: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...detail }));

class OutOfBudget extends Error {}
/** Counts subrequests; a run stops cleanly when its share is used up. */
class Budget {
  constructor(private left: number) {}
  take(): void {
    if (this.left <= 0) throw new OutOfBudget('subrequest budget used up');
    this.left--;
  }
  get remaining(): number {
    return this.left;
  }
}

/** A failure the user should see in the Kalender ("Google-Zugang erneuern" and so on). */
class SyncError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
  }
}

type Db = SupabaseClient;

async function rpc<T>(
  budget: Budget,
  db: Db,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  budget.take();
  const { data, error } = await db.schema('platform').rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function google(
  budget: Budget,
  token: string,
  method: string,
  path: string,
  options: {
    query?: Record<string, string>;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  budget.take();
  const url = new URL(`${CALENDAR_API}${path}`);
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function googleFailure(response: Response): Promise<SyncError> {
  const text = await response.text().catch(() => '');
  if (response.status === 401) return new SyncError('google_token_invalid');
  return new SyncError('google_error', `Google ${response.status}: ${text.slice(0, 200)}`);
}

const enc = encodeURIComponent;

async function accessToken(oauth: GoogleSettings, db: Db, userId: string, budget: Budget) {
  budget.take();
  const { data: grant } = await db
    .schema('platform')
    .from('google_grants')
    .select('scopes, refresh_token_enc')
    .eq('user_id', userId)
    .maybeSingle<{ scopes: string[]; refresh_token_enc: string }>();
  if (!grant) throw new SyncError('google_not_connected');
  if (!grant.scopes.includes(CALENDAR_SCOPE)) throw new SyncError('google_scope_missing');
  const refresh = await unseal(oauth.tokenKey, grant.refresh_token_enc, userId);
  budget.take();
  try {
    return (await refreshAccessToken(oauth, refresh, [CALENDAR_SCOPE])).accessToken;
  } catch (err) {
    // only a revoked or expired grant needs the user; anything else is retried later
    if (err instanceof GoogleError && err.code === 'invalid_grant')
      throw new SyncError('google_token_invalid');
    throw new SyncError('google_error', String(err));
  }
}

/** The calendar "MiniNode" in Google; created when missing (or deleted by the user). */
async function ensureTarget(budget: Budget, token: string, id: string | null): Promise<string> {
  if (id) {
    const found = await google(budget, token, 'GET', `/calendars/${enc(id)}`);
    if (found.ok) return id;
    if (found.status !== 404 && found.status !== 410) throw await googleFailure(found);
  }
  const created = await google(budget, token, 'POST', '/calendars', {
    body: {
      summary: 'MiniNode',
      description: 'Termine aus MiniNode (mininode.app), automatisch abgeglichen.',
      timeZone: DEFAULT_TZ,
    },
  });
  if (!created.ok) throw await googleFailure(created);
  return ((await created.json()) as { id: string }).id;
}

interface CalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  accessRole?: string;
  deleted?: boolean;
  hidden?: boolean;
}

async function calendarList(budget: Budget, token: string, target: string) {
  const response = await google(budget, token, 'GET', '/users/me/calendarList', {
    query: { maxResults: '250', minAccessRole: 'reader' },
  });
  if (!response.ok) throw await googleFailure(response);
  const body = (await response.json()) as { items?: CalendarListEntry[] };
  return (body.items ?? [])
    .filter((c) => c.id !== target && !c.deleted && !c.hidden)
    .map((c) => ({
      google_id: c.id,
      name: c.summaryOverride ?? c.summary ?? 'Google',
      color: paletteColor(c.backgroundColor),
      writable: c.accessRole === 'owner' || c.accessRole === 'writer',
    }));
}

/**
 * Brings Google's changes of one calendar in, page by page: each page is applied as it arrives
 * and the listing continues on the next run where the budget ends (`pageToken`).
 */
async function pull(
  budget: Budget,
  db: Db,
  token: string,
  userId: string,
  calendarId: string,
  kind: 'pull' | 'push',
  syncToken: string | null,
  pageToken: string | null,
): Promise<void> {
  let current = syncToken;
  let page = pageToken;
  // only a fresh listing within one run can tell which events Google no longer has
  let fresh = !current && !page;
  let seen: string[] = [];
  for (;;) {
    const query: Record<string, string> = {
      maxResults: '1000',
      singleEvents: 'false',
      showDeleted: 'true',
    };
    if (page) query.pageToken = page;
    else if (current) query.syncToken = current;
    const response = await google(budget, token, 'GET', `/calendars/${enc(calendarId)}/events`, {
      query,
    });
    if (response.status === 410 && (current || page)) {
      // the sync token (or page) expired: list everything again
      current = null;
      page = null;
      fresh = true;
      seen = [];
      continue;
    }
    if (!response.ok) throw await googleFailure(response);
    const body = (await response.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    const items: ApplyItem[] = [];
    for (const ev of body.items ?? []) {
      seen.push(ev.id);
      const item = toApplyItem(ev, DEFAULT_TZ);
      if (item) items.push(item);
    }
    // series before their exceptions
    items.sort((a, b) => Number(Boolean(a.master_event_id)) - Number(Boolean(b.master_event_id)));
    const last = !body.nextPageToken;
    const result = await rpc<{ failed?: { event_id: string; error: string }[] }>(
      budget,
      db,
      'gcal_apply',
      {
        p_user: userId,
        p_calendar: calendarId,
        p_kind: kind,
        p_items: items,
        p_sync_token: last ? (body.nextSyncToken ?? null) : null,
        p_page_token: last ? null : (body.nextPageToken ?? null),
        p_seen: last && fresh && kind === 'pull' ? seen : null,
      },
    );
    if (result?.failed?.length)
      log('gcal_apply_failed', {
        user: userId,
        calendar: calendarId,
        failed: result.failed.slice(0, 20),
      });
    if (last) return;
    page = body.nextPageToken ?? null;
  }
}

interface PlanOp {
  kind: 'push' | 'pull';
  record: PlanRecord;
  event_id: string | null;
  calendar_id: string | null;
  etag: string | null;
}
interface Plan {
  target: string | null;
  prefs: { sources?: Record<string, { color?: string }> } | null;
  deletes: { record_id: string; calendar_id: string; event_id: string; kind: string }[];
  upserts: PlanOp[];
}

/** Sends MiniNode's changes to Google and stores the links; `db` calls outside the budget. */
async function push(budget: Budget, db: Db, token: string, userId: string, target: string) {
  const plan = await rpc<Plan>(budget, db, 'gcal_push_plan', {
    p_user: userId,
    p_limit: Math.max(0, budget.remaining - 1),
  });
  const links: Record<string, unknown>[] = [];
  const removed: string[] = [];
  const colors = plan.prefs?.sources ?? {};
  try {
    for (const d of plan.deletes) {
      const response = await google(
        budget,
        token,
        'DELETE',
        `/calendars/${enc(d.calendar_id)}/events/${enc(d.event_id)}`,
      );
      if (!response.ok && ![403, 404, 410].includes(response.status))
        throw await googleFailure(response);
      removed.push(d.record_id);
    }
    for (const op of plan.upserts) {
      if (budget.remaining < 2) break;
      const r = op.record;
      const calendar = op.kind === 'push' ? target : op.calendar_id;
      if (!calendar) continue;
      const own = op.kind === 'pull' || (r.created_by_app ?? 'kalender') === 'kalender';
      const body = eventBody(r, {
        own,
        mirrored: op.kind === 'push',
        color:
          op.kind === 'push' ? (colors[sourceId(r)]?.color ?? r.collection_color ?? null) : null,
      });
      let response: Response | null = null;
      if (op.event_id && op.calendar_id === calendar)
        response = await google(
          budget,
          token,
          'PATCH',
          `/calendars/${enc(calendar)}/events/${enc(op.event_id)}`,
          // only over the version we know: a change in Google since is pulled first
          { body, ...(op.etag ? { headers: { 'If-Match': op.etag } } : {}) },
        );
      if (response?.status === 412) {
        // changed in Google meanwhile: the next pull decides (newer wins), then this pushes again
        links.push({
          record_id: r.id,
          calendar_id: calendar,
          event_id: op.event_id,
          etag: null,
          version: -1,
          kind: op.kind,
        });
        continue;
      }
      if (!response || response.status === 404 || response.status === 410)
        response = await google(budget, token, 'POST', `/calendars/${enc(calendar)}/events`, {
          body,
        });
      if (response.status === 400 || response.status === 403) {
        // Google refuses this one (read-only calendar, odd rule): leave it until it changes
        log('gcal_push_refused', { user: userId, record: r.id, status: response.status });
        links.push({
          record_id: r.id,
          calendar_id: calendar,
          event_id: op.event_id ?? `refused-${r.id}`,
          etag: null,
          version: r.version,
          kind: op.kind,
        });
        continue;
      }
      if (!response.ok) throw await googleFailure(response);
      const ev = (await response.json()) as { id: string; etag?: string };
      links.push({
        record_id: r.id,
        calendar_id: calendar,
        event_id: ev.id,
        etag: ev.etag ?? null,
        version: r.version,
        kind: op.kind,
      });
    }
  } finally {
    if (links.length || removed.length) {
      const { error } = await db
        .schema('platform')
        .rpc('gcal_save_links', { p_user: userId, p_links: links, p_removed: removed });
      if (error) log('gcal_save_failed', { user: userId, error: error.message });
    }
  }
}

interface CalendarRow {
  google_id: string;
  enabled: boolean;
  collection_id: string | null;
  sync_token: string | null;
  page_token: string | null;
  pulled_at: string | null;
}

/**
 * One sync run for a user: the calendar list, changes made in "MiniNode", MiniNode's changes,
 * then the Google calendars, longest waiting first. `size` is the run's share of the
 * invocation's subrequests (two more save links and finish); `minGap` refuses a run that
 * follows the last one too closely.
 */
export async function syncUser(
  env: ApiEnv,
  userId: string,
  size = 44,
  minGap: string | null = null,
): Promise<{ ran: boolean; error?: string; paused?: boolean }> {
  const oauth = googleSettings(env);
  if (!oauth) return { ran: false, error: 'google_not_configured' };
  const db = adminClient(env);
  const budget = new Budget(size - 2);
  const state = await rpc<{
    target_calendar_id: string | null;
    target_sync_token: string | null;
    target_page_token: string | null;
  } | null>(budget, db, 'gcal_begin', { p_user: userId, p_min_gap: minGap }).catch(() => null);
  if (!state) return { ran: false };
  let error: string | null = null;
  let paused = false;
  try {
    const token = await accessToken(oauth, db, userId, budget);
    const target = await ensureTarget(budget, token, state.target_calendar_id);
    const list = await calendarList(budget, token, target);
    const calendars = await rpc<CalendarRow[]>(budget, db, 'gcal_calendars_sync', {
      p_user: userId,
      p_target: target,
      p_list: list,
    });
    const sameTarget = state.target_calendar_id === target;
    await pull(
      budget,
      db,
      token,
      userId,
      target,
      'push',
      sameTarget ? state.target_sync_token : null,
      sameTarget ? state.target_page_token : null,
    );
    await push(budget, db, token, userId, target);
    const due = calendars
      .filter((cal) => cal.enabled && cal.collection_id)
      .sort((a, b) => (a.pulled_at ?? '').localeCompare(b.pulled_at ?? ''));
    for (const cal of due)
      await pull(budget, db, token, userId, cal.google_id, 'pull', cal.sync_token, cal.page_token);
  } catch (err) {
    if (err instanceof OutOfBudget) {
      paused = true;
      log('gcal_sync_paused', { user: userId });
    } else {
      error = err instanceof SyncError ? err.code : 'sync_failed';
      log('gcal_sync_failed', { user: userId, error: String(err) });
    }
  }
  const { error: finishError } = await db
    .schema('platform')
    .rpc('gcal_finish', { p_user: userId, p_error: error, p_paused: paused });
  if (finishError) log('gcal_finish_failed', { user: userId, error: finishError.message });
  return { ran: true, ...(error ? { error } : {}), ...(paused ? { paused } : {}) };
}

/** Cron: the user whose sync is most overdue. */
export async function syncDue(env: ApiEnv): Promise<void> {
  if (!googleSettings(env)) return;
  const { data, error } = await adminClient(env).schema('platform').rpc('gcal_due', { p_limit: 1 });
  if (error) throw new Error(error.message);
  for (const userId of (data ?? []) as string[]) await syncUser(env, userId, 48);
}

// ---------- routes ----------
export const gcal = new Hono<AppContext>();

/**
 * Only the Kalender's own pages (browsers set Origin), for people who may use the Kalender and
 * have passed the second factor: the same checks as /google/token (ADR 0004).
 */
async function kalenderOnly(c: Context<AppContext>): Promise<Response | null> {
  const { data } = await adminClient(c.env)
    .schema('platform')
    .from('app_origins')
    .select('app_slug')
    .eq('origin', (c.req.header('Origin') ?? '').toLowerCase())
    .maybeSingle<{ app_slug: string }>();
  if (data?.app_slug !== 'kalender') return problem(403, 'forbidden', 'Nur aus dem Kalender.');
  const asUser = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${c.get('token')}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed } = await asUser
    .schema('platform')
    .rpc('has_grant', { p_slug: 'kalender' });
  if (allowed !== true)
    return problem(403, 'forbidden', 'Der Kalender ist für dich nicht freigegeben.');
  return null;
}

gcal.get('/', requireUser(), async (c) => {
  const refused = await kalenderOnly(c);
  if (refused) return refused;
  const userId = c.get('claims').sub;
  const db = adminClient(c.env).schema('platform');
  const [grant, state, calendars] = await Promise.all([
    db.from('google_grants').select('email, scopes').eq('user_id', userId).maybeSingle<{
      email: string | null;
      scopes: string[];
    }>(),
    db
      .from('gcal_sync')
      .select('enabled, push_sources, status, error, last_sync_at')
      .eq('user_id', userId)
      .maybeSingle<{
        enabled: boolean;
        push_sources: string[];
        status: string;
        error: string | null;
        last_sync_at: string | null;
      }>(),
    db
      .from('gcal_calendars')
      .select('google_id, name, color, enabled, writable, collection_id')
      .eq('user_id', userId)
      .order('name'),
  ]);
  return c.json({
    available: Boolean(googleSettings(c.env)),
    connected: Boolean(grant.data),
    email: grant.data?.email ?? null,
    scopeOk: grant.data?.scopes.includes(CALENDAR_SCOPE) ?? false,
    connectUrl: new URL('/account#google', c.env.PORTAL_URL).toString(),
    enabled: state.data?.enabled ?? false,
    pushSources: state.data?.push_sources ?? [],
    status: state.data?.status ?? 'idle',
    error: state.data?.error ?? null,
    lastSyncAt: state.data?.last_sync_at ?? null,
    calendars: (calendars.data ?? []).map((cal) => ({
      id: cal.google_id,
      name: cal.name,
      color: cal.color,
      enabled: cal.enabled,
      writable: cal.writable,
      collectionId: cal.collection_id,
    })),
  });
});

const settingsSchema = z.object({
  enabled: z.boolean(),
  pushSources: z
    .array(z.string().regex(/^(col:[0-9a-f-]{36}|app:[a-z][a-z0-9-]{0,30}[a-z0-9]:[a-z_]{1,40})$/))
    .max(100),
  calendars: z
    .record(z.string().min(1).max(300), z.boolean())
    .refine((o) => Object.keys(o).length <= 250, 'too many calendars')
    .optional(),
});

gcal.put('/', requireUser(), async (c) => {
  const refused = await kalenderOnly(c);
  if (refused) return refused;
  if (!googleSettings(c.env))
    return problem(503, 'google_not_configured', 'Google ist auf MiniNode nicht eingerichtet.');
  const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'invalid_request', 'Ungültige Einstellungen.');
  const userId = c.get('claims').sub;
  const db = adminClient(c.env).schema('platform');
  const { error } = await db.from('gcal_sync').upsert({
    user_id: userId,
    enabled: parsed.data.enabled,
    push_sources: [...new Set(parsed.data.pushSources)],
    requested_at: new Date().toISOString(),
  });
  if (error) return problem(500, 'db_error', 'Speichern fehlgeschlagen.');
  if (!parsed.data.enabled) {
    const { error: offError } = await db.rpc('gcal_disable', { p_user: userId });
    if (offError) return problem(500, 'db_error', 'Abschalten fehlgeschlagen.');
    log('gcal_disabled', { user: userId });
    return c.json({ ok: true });
  }
  if (parsed.data.calendars) {
    const { error: calError } = await db.rpc('gcal_set_calendars', {
      p_user: userId,
      p_switches: parsed.data.calendars,
    });
    if (calError) return problem(500, 'db_error', 'Kalender konnten nicht umgestellt werden.');
  }
  // this request already used a few subrequests (JWKS, origin, grant, saving)
  c.executionCtx.waitUntil(syncUser(c.env, userId, 38).then(() => undefined));
  return c.json({ ok: true });
});

gcal.post('/sync', requireUser(), async (c) => {
  const refused = await kalenderOnly(c);
  if (refused) return refused;
  // at most every 30 seconds unless something was requested; the cron does the rest
  const result = await syncUser(c.env, c.get('claims').sub, 42, '30 seconds');
  return c.json(result);
});
