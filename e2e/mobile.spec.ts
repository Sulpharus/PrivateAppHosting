import { expect, test } from '@playwright/test';
import { cleanup, createApp, createUser, grant, PASSWORD } from './seed.ts';

const run = `e2em${Date.now().toString(36)}`;
const email = `${run}-anna@example.com`;
const shots = process.env.SCREENSHOT_DIR;

test.beforeAll(async () => {
  const adminId = await createUser(`${run}-admin@example.com`, 'admin', 'Wolfram');
  const userId = await createUser(email, 'trusted', 'Anna');
  const apps: [string, string, Record<string, unknown>?][] = [
    ['lesezeichen', 'Lesezeichen'],
    ['haushalt', 'Haushalt', { data_mode: 'shared-account', owner_id: adminId }],
    ['rezepte', 'Rezepte'],
    ['filmabend', 'Filmabend'],
  ];
  for (const [slug, name, extra] of apps) {
    await createApp(`${run}-${slug}`, name, extra);
    await grant(userId, `${run}-${slug}`);
  }
});

test.afterAll(async () => {
  await cleanup(run);
});

test('mobile start page: two-column tiles, tab bar, 44px targets', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Anna/ })).toBeVisible();

  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
  const tiles = page.locator('.tile').filter({ hasText: run });
  await expect(tiles).toHaveCount(4);
  const allTiles = page.locator('.tile');
  const [first, second] = [
    await allTiles.nth(0).boundingBox(),
    await allTiles.nth(1).boundingBox(),
  ];
  expect(first?.y).toBe(second?.y);

  for (const button of await page.getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
  }

  if (shots) {
    await page.screenshot({ path: `${shots}/mobile-light.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: `${shots}/mobile-dark.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: `${shots}/desktop-dark.png` });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({ path: `${shots}/desktop-light.png` });
    await page.goto('/login');
  }
});
