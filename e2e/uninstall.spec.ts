import { expect, test } from '@playwright/test';
import { cleanup, createApp, createUser, PASSWORD } from './seed.ts';

// Verwaltung → Apps → Löschen (ADR 0020). The e2e stack has no API Worker and no GitHub, so the
// API is answered here; what is checked is the dialog: the typed confirmation and what is sent.
const run = `e2euninst${Date.now().toString(36)}`;
const email = `${run}-admin@example.com`;
const slug = `${run}-rezepte`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

test.afterAll(async () => {
  await cleanup(run);
});

test('deleting an app needs the typed address and sends the choice', async ({ page }) => {
  await createUser(email, 'admin', 'Wolfram');
  await createApp(slug, 'Rezepte');
  let sent: { url: string; body: unknown } | null = null;
  await page.route('**/admin/apps/*/uninstall', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    sent = { url: request.url(), body: request.postDataJSON() };
    return route.fulfill({ status: 202, headers: CORS, json: { started: true, manual: null } });
  });

  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wolfram');

  await page.goto('/admin/apps');
  await page.getByRole('button', { name: 'Rezepte löschen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rezepte löschen' });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Endgültig löschen' });
  await expect(confirm).toBeDisabled();

  // The data goes by default; unticking keeps it.
  await dialog.getByLabel(/Auch alle Daten löschen/).uncheck();
  await expect(dialog.getByRole('button', { name: 'Entfernen' })).toBeDisabled();
  await dialog.getByLabel(/Auch alle Daten löschen/).check();

  await dialog.getByLabel(/zur Bestätigung/).fill('falsch');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/zur Bestätigung/).fill(slug);
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText(/Rezepte wird gelöscht und ist schon offline/)).toBeVisible();
  expect(sent).toEqual({
    url: expect.stringContaining(`/admin/apps/${slug}/uninstall`),
    body: { purge: true, confirm: slug },
  });
});

test('the dialog closes with Escape and sends nothing', async ({ page }) => {
  await createApp(`${slug}-zwei`, 'Zwei');
  let called = false;
  await page.route('**/admin/apps/*/uninstall', (route) => {
    called = true;
    return route.fulfill({ status: 202, headers: CORS, json: {} });
  });
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wolfram');
  await page.goto('/admin/apps');
  await page.getByRole('button', { name: 'Zwei löschen' }).click();
  await expect(page.getByRole('dialog', { name: 'Zwei löschen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Zwei löschen' })).toBeHidden();
  expect(called).toBe(false);
});
