// Push notifications on this device (ADR 0005). The portal's service worker (/sw.js) receives
// pushes for every app; subscriptions are stored per user (platform.push_subscribe) and the API
// delivers bell notifications and scheduled reminders to them.

import { api } from './api.ts';
import { platform } from './supabase.ts';

export type DeviceStatus = 'unsupported' | 'install-first' | 'denied' | 'on' | 'off';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Registers /sw.js (offline shell and push); safe to call on every start. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? registerServiceWorker();
}

export async function deviceStatus(): Promise<DeviceStatus> {
  // iPhone and iPad only allow push for web apps on the home screen.
  if (isIos() && !isStandalone()) return 'install-first';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function store(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const { error } = await platform().rpc('push_subscribe', {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

/** Asks for permission and subscribes this device. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('unsupported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const { publicKey } = await api<{ publicKey: string | null }>('/push/config');
  if (!publicKey) throw new Error('not_configured');
  const reg = await registration();
  if (!reg) throw new Error('unsupported');
  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    }));
  await store(subscription);
}

/** Unsubscribes this device and forgets it on the server. */
export async function disablePush(): Promise<void> {
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  await platform().from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}

/** On sign-out: this device should not receive the next person's… or this person's messages. */
export async function forgetThisDevice(): Promise<void> {
  await disablePush().catch(() => undefined);
}

export const sendTestPush = () =>
  api<{ devices: number; sent: number; failed: number }>('/push/test', { method: 'POST' });

/** Re-registers when the browser renewed the subscription (message from the service worker). */
export function listenForRenewals(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if ((event.data as { type?: string } | null)?.type !== 'push-renew') return;
    if (Notification.permission === 'granted') void enablePush().catch(() => undefined);
  });
}

export function pushErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text === 'denied')
    return 'Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen für mininode.app.';
  if (text === 'not_configured') return 'Push ist auf MiniNode noch nicht eingerichtet.';
  if (text === 'unsupported') return 'Dieser Browser unterstützt keine Push-Benachrichtigungen.';
  if (/no_devices|keinem Gerät/.test(text))
    return 'Auf keinem Gerät sind Benachrichtigungen eingeschaltet.';
  return 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
}
