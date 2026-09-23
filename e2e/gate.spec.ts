import { expect, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

const run = `e2eg${Date.now().toString(36)}`;
const APP = 'http://localhost:8790';

test.afterAll(async () => {
  await cleanup(run);
});

test('app pages redirect to the central login and work after sign-in', async ({ page }) => {
  // "hallo" is registered by `mininode dev` as a default app, so new users get it automatically.
  const email = `${run}-user@example.com`;
  await createUser(email, 'user', 'Mia');

  await page.goto(APP);
  await expect(page).toHaveURL(/localhost:5173\/login\?next=/);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();

  await expect(page).toHaveURL(`${APP}/`);
  await expect(page.locator('#count')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#count')).toHaveText('2');

  const response = await page.request.get(APP);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
});

test('users without a grant get the 403 page', async ({ page }) => {
  const email = `${run}-nogrant@example.com`;
  const id = await createUser(email, 'user', 'Tom');
  await admin
    .schema('platform')
    .from('app_grants')
    .delete()
    .eq('user_id', id)
    .eq('app_slug', 'hallo');

  await page.goto(`http://localhost:5173/login?next=${encodeURIComponent(APP)}`);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Kein Zugriff auf Hallo/ })).toBeVisible();
});
