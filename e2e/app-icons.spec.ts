import { expect, test } from '@playwright/test';
import { admin, cleanup, createApp, createUser, grant, PASSWORD } from './seed.ts';

// Logos (ADR 0018): an admin uploads one in Verwaltung → Apps; the start page tile shows it.
const run = `e2eicon${Date.now().toString(36)}`;
const adminEmail = `${run}-admin@example.com`;
// A 2×2 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==',
  'base64',
);

test.afterAll(async () => {
  await cleanup(run);
});

test('an admin uploads a logo, the tile shows it, removing it brings the monogram back', async ({
  page,
}) => {
  const adminId = await createUser(adminEmail, 'admin', 'Wolfram');
  await createApp(`${run}-rezepte`, 'Rezepte');
  await grant(adminId, `${run}-rezepte`);

  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(adminEmail);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wolfram');
  await expect(
    page.locator('.tile-box', { hasText: 'Rezepte' }).locator('.monogram'),
  ).toBeVisible();

  await page.goto('/admin/apps');
  await page
    .getByLabel('Logo für Rezepte wählen')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Logo von Rezepte gespeichert.')).toBeVisible();
  const { data } = await admin
    .schema('platform')
    .from('apps')
    .select('icon_path')
    .eq('slug', `${run}-rezepte`)
    .single<{ icon_path: string }>();
  expect(data?.icon_path).toMatch(/\.webp$/);

  await page.goto('/');
  const logo = page.locator('.tile-box', { hasText: 'Rezepte' }).locator('img.app-icon');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);

  // The buttons sit in their own row below the text.
  const tile = page.locator('.tile-box', { hasText: 'Rezepte' });
  const text = await tile.locator('.tile p').boundingBox();
  const actions = await tile.locator('.tile-actions').boundingBox();
  expect((actions?.y ?? 0) >= (text?.y ?? 0) + (text?.height ?? 0)).toBe(true);

  await page.goto('/admin/apps');
  await page
    .getByRole('row', { name: new RegExp(`${run}-rezepte`) })
    .getByRole('button', { name: 'Logo entfernen' })
    .click();
  await expect(page.getByText('Logo von Rezepte entfernt.')).toBeVisible();
  await page.goto('/');
  await expect(tile.locator('.monogram')).toBeVisible();
});
