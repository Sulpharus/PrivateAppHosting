import { expect, test } from '@playwright/test';
import { cleanup, createApp, createUser, grant, PASSWORD } from './seed.ts';

// The app menu: at most three tiles per row, and four views (tiles, large, list, compact) that the
// browser remembers.
const run = `e2ev${Date.now().toString(36)}`;
const email = `${run}@example.com`;
const shots = process.env.SCREENSHOT_DIR;

test.beforeAll(async () => {
  const id = await createUser(email, 'user', 'Vera');
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
    await createApp(`${run}-${key}`, `App ${key.toUpperCase()} ${run}`);
    await grant(id, `${run}-${key}`);
  }
});

test.afterAll(async () => {
  await cleanup(run);
});

const columns = (grid: import('@playwright/test').Locator) =>
  grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);

test('three tiles per row at most, and the view can be chosen and is remembered', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  const grid = page.locator('.tiles').first();
  // (apps that everyone gets by default are there as well)
  await expect.poll(() => grid.locator('.tile-box').count()).toBeGreaterThanOrEqual(7);

  expect(await columns(grid)).toBe(3);
  if (shots) await page.screenshot({ path: `${shots}/apps-kacheln.png` });

  const views = page.getByRole('group', { name: 'Ansicht' });
  await views.getByRole('button', { name: 'Groß' }).click();
  await expect(grid).toHaveClass(/view-large/);
  expect(await columns(grid)).toBe(3);
  if (shots) await page.screenshot({ path: `${shots}/apps-gross.png` });

  await views.getByRole('button', { name: 'Liste' }).click();
  expect(await columns(grid)).toBe(1);
  if (shots) await page.screenshot({ path: `${shots}/apps-liste.png` });

  await views.getByRole('button', { name: 'Kompakt' }).click();
  expect(await columns(grid)).toBeGreaterThan(4);
  if (shots) await page.screenshot({ path: `${shots}/apps-kompakt.png` });

  await page.reload();
  await expect(views.getByRole('button', { name: 'Kompakt' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // A phone keeps the list readable.
  await page.setViewportSize({ width: 390, height: 844 });
  await views.getByRole('button', { name: 'Liste' }).click();
  expect(await columns(grid)).toBe(1);
  if (shots) await page.screenshot({ path: `${shots}/apps-liste-mobil.png` });
});
