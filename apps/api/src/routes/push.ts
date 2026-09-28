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
  /** Absolute URL opened on tap. */
  url: string;
  tag: string;
}

function vapid(env: ApiEnv): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: `mailto:${env.MAIL_FROM}`,
  };
}

/** `/heute` of app `todo` → https://todo.mininode.app/heute; portal paths stay on the portal. */
export function absoluteUrl(portalUrl: string, appSlug: string | null, url: string | null): string {
  const portal = new URL(portalUrl);
  if (url && /^https:\/\//.test(url)) return url;
  if (!appSlug) return new URL(url ?? '/', portal).toString();
  const app = new URL(portal);
  app.hostname = `${appSlug}.${portal.hostname}`;
  return new URL(url ?? '/', app).toString();
}

async function sendAll(
  env: ApiEnv,
  keys: VapidKeys,
  jobs: { subscription: SubscriptionRow; message: PushMessage }[],
): Promise<{ sent: number; gone: number; failed: number }> {
  const db = adminClient(env);
  const results: { id: string; result: SendResult }[] = [];
  for (let i = 0; i < jobs.length; i += 20) {
    const batch = jobs.slice(i, i + 20);
    const settled = await Promise.allSettled(
      batch.map((job) => sendPush(job.subscription, job.message, keys)),
    );
    settled.forEach((outcome, index) => {
      const id = batch[index]?.subscription.id ?? '';
      results.push({ id, result: outcome.status === 'fulfilled' ? outcome.value : 'failed' });
    });
  }
  const gone = [...new Set(results.filter((r) => r.result === 'gone').map((r) => r.id))];
  const sent = [...new Set(results.filter((r) => r.result === 'sent').map((r) => r.id))];
  if (gone.length) await db.schema('platform').from('push_subscriptions').delete().in('id', gone);
  if (sent.length)
    await db
      .schema('platform')
      .from('push_subscriptions')
      .update({ last_success_at: new Date().toISOString() })
      .in('id', sent);
  return {
    sent: results.filter((r) => r.result === 'sent').length,
    gone: results.filter((r) => r.result === 'gone').length,
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

/** Cron, every minute: due reminders into the bell, then push everything new. */
export async function deliverPushes(env: ApiEnv): Promise<void> {
  const keys = vapid(env);
  const db = adminClient(env);
  const released = await db.schema('platform').rpc('push_release_due');
  if (released.error) throw new Error(released.error.message);
  // Without keys nothing can be pushed; notifications still reach the bell.
  if (!keys) return;
  const claimed = await db.schema('platform').rpc('push_claim', { p_limit: 200 });
  if (claimed.error) throw new Error(claimed.error.message);
  const notifications = (claimed.data ?? []) as ClaimedNotification[];
  if (notifications.length === 0) return;

  const subscriptions = await subscriptionsOf(env, [
    ...new Set(notifications.map((n) => n.user_id)),
  ]);
  const jobs = notifications.flatMap((n) =>
    subscriptions
      .filter((s) => s.user_id === n.user_id)
      .map((subscription) => ({
        subscription,
        message: {
          title: n.title,
          ...(n.body ? { body: n.body } : {}),
          url: absoluteUrl(env.PORTAL_URL, n.app_slug, n.url),
          tag: n.id,
        },
      })),
  );
  const outcome = await sendAll(env, keys, jobs);
  console.log(
    JSON.stringify({
      event: 'push_delivered',
      notifications: notifications.length,
      released: released.data,
      ...outcome,
    }),
  );
}

export const push = new Hono<AppContext>();

push.get('/config', (c) => {
  const keys = vapid(c.env);
  return c.json({ publicKey: keys?.publicKey ?? null });
});

push.post('/test', requireUser(), async (c) => {
  const keys = vapid(c.env);
  if (!keys)
    return problem(503, 'push_not_configured', 'Push ist auf MiniNode nicht eingerichtet.');
  const subscriptions = await subscriptionsOf(c.env, [c.get('claims').sub]);
  if (subscriptions.length === 0)
    return problem(409, 'no_devices', 'Auf keinem Gerät sind Benachrichtigungen eingeschaltet.');
  const outcome = await sendAll(
    c.env,
    keys,
    subscriptions.map((subscription) => ({
      subscription,
      message: {
        title: 'MiniNode',
        body: 'Benachrichtigungen funktionieren auf diesem Gerät.',
        url: absoluteUrl(c.env.PORTAL_URL, null, '/account'),
        tag: 'test',
      },
    })),
  );
  return c.json({ devices: subscriptions.length, ...outcome });
});
