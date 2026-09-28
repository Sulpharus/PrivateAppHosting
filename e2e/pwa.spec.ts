import { expect, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

// Hosted apps as PWAs (ADR 0005): the gate adds the manifest and service worker, the app opens
// offline, and mn.kv changes made offline reach the server once the device is back online.

const run = `e2ep${Date.now().toString(36)}`;
const APP = 'http://localhost:8790';

test.afterAll(async () => {
  await cleanup(run);
});

test('an app works offline and syncs what was entered offline', async ({ page, context }) => {
  const email = `${run}-user@example.com`;
  const userId = await createUser(email, 'user', 'Ole');

  await page.goto(`http://localhost:5173/login?next=${encodeURIComponent(APP)}`);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.locator('#count')).toHaveText('1');

  // Installable: manifest linked by the gate, service worker active.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/_mininode/manifest.webmanifest',
  );
  const manifest = await (await page.request.get(`${APP}/_mininode/manifest.webmanifest`)).json();
  expect(manifest).toMatchObject({ name: 'Hallo', display: 'standalone', start_url: '/' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('#count')).toHaveText('2');
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  // Offline: the page comes from the cache, the visit is counted locally and queued.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#count')).toHaveText('3');
  const pending = await page.evaluate(async () => {
    const mn = await (
      window as unknown as {
        mininode: { mininode(): Promise<{ offline: { pending(): Promise<number> } }> };
      }
    ).mininode.mininode();
    return mn.offline.pending();
  });
  expect(pending).toBe(1);

  // Online again: the queued change reaches the server.
  await context.setOffline(false);
  await expect
    .poll(async () => {
      const { data } = await admin
        .schema('platform')
        .from('app_kv')
        .select('value')
        .eq('app_slug', 'hallo')
        .eq('owner_id', userId)
        .eq('key', 'visits')
        .maybeSingle();
      return data?.value;
    })
    .toBe(3);
});
