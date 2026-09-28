// Push notifications (ADR 0005). Devices subscribe in the portal (platform.push_subscribe); the
// cron delivers new bell notifications and due reminders every minute.
//   GET  /push/config  the VAPID public key for the portal's subscription
//   POST /push/test    sends a test message to all of the caller's devices now

import { Hono } from 'hono';
import type { ApiEnv } from '../env.ts';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { adminClient } from '../lib/supabase.ts';
import {
  type PushSubscription,
  type SendResult,
  sendPush,
  type VapidKeys,
  vapidAuthorization,
} from '../lib/webpush.ts';

interface SubscriptionRow extends PushSubscription {
  id: string;
  user_id: string;
}

interface ClaimedNotification {
  id: string;
  user_id: string;
  app_slug: string | null;
  title: string;
  body: string | null;
  url: string | null;
}

export interface PushMessage {
  title: string;
  body?: string;
  /** Absolute URL opened on tap (always the portal or one of its apps). */
  url: string;
  tag: string;
}

/**
 * Push requests one cron run may make. Workers Free allows 50 subrequests per invocation: the
 * run needs up to 8 database calls around the pushes, and every fifth minute the maintenance
 * (4 more) shares the invocation. Override with PUSH_SEND_BUDGET on Workers Paid.
 */
const DEFAULT_SEND_BUDGET = 35;

function vapid(env: ApiEnv): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: `mailto:${env.MAIL_FROM}`,
  };
}

/**
 * `/heute` of app `todo` → https://todo.mininode.app/heute. Anything that would leave the portal
 * or its apps (another host, `//host`) falls back to the app's or portal's start page.
 */
export function absoluteUrl(portalUrl: string, appSlug: string | null, url: string | null): string {
  const portal = new URL(portalUrl);
  const base = new URL(portal);
  if (appSlug) base.hostname = `${appSlug}.${portal.hostname}`;
  let target: URL;
  try {
    target = new URL(url ?? '/', base);
  } catch {
    return base.toString();
  }
  const ours =
    target.protocol === portal.protocol &&
    (target.hostname === portal.hostname || target.hostname.endsWith(`.${portal.hostname}`));
  return ours ? target.toString() : base.toString();
}

interface Job {
  notification: string;
  subscription: SubscriptionRow;
  message: PushMessage;
}

/** Sends jobs (VAPID signed once per push service), then records the outcome per device. */
async function sendAll(env: ApiEnv, keys: VapidKeys, jobs: Job[]) {
  const db = adminClient(env);
  const authorizations = new Map<string, Promise<string>>();
  const authorizationFor = (endpoint: string) => {
    const origin = new URL(endpoint).origin;
    let header = authorizations.get(origin);
    if (!header) {
      header = vapidAuthorization(endpoint, keys);
      authorizations.set(origin, header);
    }
    return header;
  };

  const results: { job: Job; result: SendResult }[] = [];
  for (let i = 0; i < jobs.length; i += 10) {
    const batch = jobs.slice(i, i + 10);
    const settled = await Promise.allSettled(
      batch.map(async (job) =>
        sendPush(job.subscription, job.message, keys, {
          authorization: await authorizationFor(job.subscription.endpoint),
        }),
      ),
    );
    settled.forEach((outcome, index) => {
      const job = batch[index];
      if (job)
        results.push({ job, result: outcome.status === 'fulfilled' ? outcome.value : 'failed' });
    });
  }

  const ids = (result: SendResult) => [
    ...new Set(results.filter((r) => r.result === result).map((r) => r.job.subscription.id)),
  ];
  const table = () => db.schema('platform').from('push_subscriptions');
  const rejected = ids('rejected');
  // One call each, whatever the number of devices (subrequest budget).
  const updates = [
    ids('gone').length ? table().delete().in('id', ids('gone')) : null,
    ids('sent').length
      ? table()
          .update({ last_success_at: new Date().toISOString(), rejected_count: 0 })
          .in('id', ids('sent'))
      : null,
    rejected.length ? db.schema('platform').rpc('push_reject', { p_ids: rejected }) : null,
  ];
  for (const result of await Promise.all(updates))
    if (result?.error)
      console.error(
        JSON.stringify({ event: 'push_bookkeeping_failed', error: result.error.message }),
      );

  return {
    results,
    sent: results.filter((r) => r.result === 'sent').length,
    gone: ids('gone').length,
    rejected: results.filter((r) => r.result === 'rejected').length,
    failed: results.filter((r) => r.result === 'failed').length,
  };
}

async function subscriptionsOf(env: ApiEnv, userIds: string[]): Promise<SubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await adminClient(env)
    .schema('platform')
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as SubscriptionRow[];
}

/**
 * Cron, every minute: due reminders into the bell, then push what is new, within a send
 * budget. Notifications that did not fit or failed on every device go back to the queue (at
 * most three attempts); older than an hour they are skipped (see push_claim).
 */
export async function deliverPushes(env: ApiEnv): Promise<void> {
  const keys = vapid(env);
  const db = adminClient(env);
  const released = await db.schema('platform').rpc('push_release_due');
  if (released.error) throw new Error(released.error.message);
  // Without keys nothing can be pushed; notifications still reach the bell.
  if (!keys) return;
  const budget = Number(env.PUSH_SEND_BUDGET) || DEFAULT_SEND_BUDGET;
  const claimed = await db.schema('platform').rpc('push_claim', { p_limit: budget });
  if (claimed.error) throw new Error(claimed.error.message);
  const notifications = (claimed.data ?? []) as ClaimedNotification[];
  if (notifications.length === 0) return;
  try {
    await sendClaimed(env, keys, notifications, budget, released.data);
  } catch (error) {
    // Claimed but not sent: back into the queue (counts as an attempt), then report.
    await db
      .schema('platform')
      .rpc('push_unclaim', { p_ids: notifications.map((n) => n.id), p_count_attempt: true });
    throw error;
  }
}

async function sendClaimed(
  env: ApiEnv,
  keys: VapidKeys,
  notifications: ClaimedNotification[],
  budget: number,
  released: unknown,
): Promise<void> {
  const db = adminClient(env);
  const subscriptions = await subscriptionsOf(env, [
    ...new Set(notifications.map((n) => n.user_id)),
  ]);
  const jobs: Job[] = [];
  const deferred: string[] = [];
  for (const n of notifications) {
    const devices = subscriptions.filter((s) => s.user_id === n.user_id);
    if (jobs.length + devices.length > budget) {
      deferred.push(n.id);
      continue;
    }
    for (const subscription of devices)
      jobs.push({
        notification: n.id,
        subscription,
        message: {
          title: n.title,
          ...(n.body ? { body: n.body } : {}),
          url: absoluteUrl(env.PORTAL_URL, n.app_slug, n.url),
          tag: n.id,
        },
      });
  }

  const outcome = await sendAll(env, keys, jobs);
  // Retry a notification when no device got it and at least one failure was transient.
  const retry = notifications
    .filter((n) => !deferred.includes(n.id))
    .filter((n) => {
      const mine = outcome.results.filter((r) => r.job.notification === n.id);
      return mine.some((r) => r.result === 'failed') && !mine.some((r) => r.result === 'sent');
    })
    .map((n) => n.id);
  for (const [ids, count] of [
    [retry, true],
    [deferred, false],
  ] as const)
    if (ids.length) {
      const back = await db
        .schema('platform')
        .rpc('push_unclaim', { p_ids: ids, p_count_attempt: count });
      if (back.error) throw new Error(back.error.message);
    }

  console.log(
    JSON.stringify({
      event: 'push_delivered',
      notifications: notifications.length,
      released,
      sent: outcome.sent,
      gone: outcome.gone,
      rejected: outcome.rejected,
      failed: outcome.failed,
      retry: retry.length,
      deferred: deferred.length,
    }),
  );
}

export const push = new Hono<AppContext>();

push.get('/config', (c) => {
  const keys = vapid(c.env);
  return c.json({ publicKey: keys?.publicKey ?? null });
});

/** One test per user and 30 seconds (per isolate; devices are capped at ten anyway). */
const lastTest = new Map<string, number>();

push.post('/test', requireUser(), async (c) => {
  const keys = vapid(c.env);
  if (!keys)
    return problem(503, 'push_not_configured', 'Push ist auf MiniNode nicht eingerichtet.');
  const userId = c.get('claims').sub;
  if ((lastTest.get(userId) ?? 0) > Date.now() - 30_000)
    return problem(429, 'rate_limited', 'Warte kurz, bevor du noch eine Testnachricht sendest.');
  const subscriptions = await subscriptionsOf(c.env, [userId]);
  if (subscriptions.length === 0)
    return problem(409, 'no_devices', 'Auf keinem Gerät sind Benachrichtigungen eingeschaltet.');
  lastTest.set(userId, Date.now());
  const outcome = await sendAll(
    c.env,
    keys,
    subscriptions.map((subscription) => ({
      notification: 'test',
      subscription,
      message: {
        title: 'MiniNode',
        body: 'Benachrichtigungen funktionieren auf diesem Gerät.',
        url: absoluteUrl(c.env.PORTAL_URL, null, '/account'),
        tag: 'test',
      },
    })),
  );
  return c.json({
    devices: subscriptions.length,
    sent: outcome.sent,
    failed: outcome.failed + outcome.rejected,
  });
});
