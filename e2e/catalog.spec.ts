import { expect, type Page, test } from '@playwright/test';
import { admin, cleanup, createApp, createUser, grant, PASSWORD } from './seed.ts';

// Start page catalog (ADR 0007): custom categories sort new apps automatically, the admin
// curates app sets, users keep favourites, filter by category and sort by usage and age, and
// link tiles open external websites in a new tab.
const shots = process.env.SCREENSHOT_DIR;
const run = `e2ec${Date.now().toString(36)}`;
const adminEmail = `${run}-admin@example.com`;
const userEmail = `${run}-user@example.com`;
const category = `Eigene ${run}`;
const setName = `Start ${run}`;
const older = `Tagebuch ${run}`;
const newer = `Vokabeln ${run}`;

test.beforeAll(async () => {
  await createUser(adminEmail, 'admin', 'Wolfram');
  const userId = await createUser(userEmail, 'user', 'Lena');
  await createApp(`${run}-tagebuch`, older);
  await createApp(`${run}-vokabeln`, newer, {
    created_at: new Date(Date.now() + 1000).toISOString(),
  });
  await grant(userId, `${run}-tagebuch`);
  await grant(userId, `${run}-vokabeln`);
  await createApp(`${run}-geheim`, `Geheim ${run}`);
  await grant(userId, `${run}-geheim`);
});

test.afterAll(async () => {
  await admin.schema('platform').from('app_sets').delete().eq('name', setName);
  await admin.schema('platform').from('app_categories').delete().eq('name', category);
  await cleanup(run);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /(Hallo|Guten \w+), / })).toBeVisible();
}

test('admin curates categories and sets; users filter, sort and keep favourites', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await signIn(page, adminEmail);

  // A custom category picks up both apps by its keyword.
  await page.goto('/admin/catalog');
  await expect(page.getByRole('heading', { level: 1, name: 'Kategorien & Pakete' })).toBeVisible();
  const newCategory = page.getByRole('form', { name: 'Neue Kategorie' });
  await newCategory.getByLabel('Name').fill(category);
  await newCategory.getByLabel('Stichwörter (mit Komma getrennt)').fill(run);
  await newCategory.getByLabel('Reihenfolge').fill('1');
  await newCategory.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('status')).toContainText(`Kategorie ${category} angelegt`);
  await expect(page.getByRole('form', { name: `Kategorie ${category}` })).toContainText('3 Apps');

  // A set with both apps.
  const newSet = page.getByRole('form', { name: 'Neues Paket' });
  await newSet.getByLabel('Name').fill(setName);
  await newSet.getByLabel('Beschreibung').fill('Zum Loslegen');
  await newSet.getByLabel(older).check();
  await newSet.getByLabel(newer).check();
  await newSet.getByRole('button', { name: 'Paket anlegen' }).click();
  await expect(page.getByRole('status')).toContainText(`Paket ${setName} gespeichert`);

  // Under Apps the category shows as automatic.
  await page.goto('/admin/apps');
  await expect(page.getByLabel(`Kategorie von ${older}`)).toHaveValue('');
  await expect(page.getByLabel(`Kategorie von ${older}`).locator('option').first()).toContainText(
    category,
  );

  // The user: the set, the ATT link tile, favourites, category filter and sorting.
  await context.clearCookies();
  await signIn(page, userEmail);
  const set = page.getByRole('region', { name: setName });
  await expect(set).toContainText('Zum Loslegen');
  await expect(set.getByRole('link', { name: older })).toBeVisible();
  if (shots) {
    await page.screenshot({ path: `${shots}/start-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${shots}/start-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  const att = page.getByRole('link', { name: /ATT - Werkzeugkasten/ });
  await expect(att).toHaveAttribute('href', 'https://att-allthetools.com');
  await expect(att).toHaveAttribute('target', '_blank');
  await expect(att).toHaveAttribute('rel', 'noopener noreferrer');

  await page.getByRole('button', { name: `${older} als Favorit` }).click();
  await expect(page.getByRole('button', { name: `${older} als Favorit` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /^Favoriten/ }).click();
  const tiles = page.locator('.tiles .tile');
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toContainText(older);

  await page.getByRole('button', { name: new RegExp(`^${category}`) }).click();
  await expect(tiles).toHaveCount(3);

  // Newest first, oldest first, then most used (a ctrl-click opens the app in a new tab).
  await page.getByLabel('Sortieren').selectOption('new');
  await expect(tiles.first()).toContainText(newer);
  await page.getByLabel('Sortieren').selectOption('old');
  await expect(tiles.first()).toContainText(older);
  const opened = page.waitForResponse((r) => r.url().includes('record_app_open'));
  await tiles.filter({ hasText: newer }).click({ modifiers: ['ControlOrMeta'] });
  expect((await opened).status()).toBe(204);
  await page.reload();
  await page.getByRole('button', { name: new RegExp(`^${category}`) }).click();
  await page.getByLabel('Sortieren').selectOption('used');
  await expect(tiles.first()).toContainText(newer);

  // Favourites live in the account, not in this browser.
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, userEmail);
  await expect(page.getByRole('button', { name: `${older} als Favorit` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('whitelist: only the admin and chosen people see the app', async ({ page, context }) => {
  const secret = `Geheim ${run}`;
  await signIn(page, userEmail);
  await expect(page.getByRole('link', { name: new RegExp(secret) })).toBeVisible();

  await context.clearCookies();
  await signIn(page, adminEmail);
  await page.goto('/admin/apps');
  await page.getByRole('button', { name: `Zugriff auf ${secret} verwalten` }).click();
  await page.getByLabel(/Nur Whitelist/).check();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Zugriff speichern' }).click();
  await expect(page.getByRole('status')).toContainText('nur noch für die Whitelist');
  await expect(page.getByRole('button', { name: `Zugriff auf ${secret} verwalten` })).toHaveText(
    'Nur Whitelist',
  );

  await context.clearCookies();
  await signIn(page, userEmail);
  await expect(page.getByRole('link', { name: /ATT - Werkzeugkasten/ })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(secret) })).toHaveCount(0);
});
