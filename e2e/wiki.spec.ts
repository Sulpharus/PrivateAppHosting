import { expect, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// Verwaltung → Wissen (Wiki and Startup-Guide). The articles are docs/wiki, bundled into the portal.
const run = `e2ewiki${Date.now().toString(36)}`;
const email = `${run}-admin@example.com`;

test.afterAll(async () => {
  await cleanup(run);
});

test('the Wissen group has a Wiki with search and articles and a Startup-Guide with a checklist', async ({
  page,
}) => {
  await createUser(email, 'admin', 'Wolfram');
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wolfram');

  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: 'Verwaltung' });
  await expect(nav.getByText('Wissen', { exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Wiki', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Wiki' })).toBeVisible();

  // Categories with articles, and the generated reference pages.
  await expect(page.getByRole('heading', { name: 'Einstieg' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Was ist MiniNode\?/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Referenz/ })).toBeVisible();

  // Search
  await page.getByLabel('Suchen').fill('passphrase');
  await expect(page.getByRole('link', { name: /Sicherung und Wiederherstellung/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Was ist MiniNode\?/ })).toBeHidden();
  await page.getByLabel('Suchen').fill('gibtesbestimmtnicht');
  await expect(page.getByText('Nichts gefunden')).toBeVisible();
  await page.getByLabel('Suchen').fill('');

  // An article, and an internal link inside it that stays in the app.
  await page.getByRole('link', { name: /Was ist MiniNode\?/ }).click();
  await expect(page).toHaveURL(/\/admin\/wiki\/ueberblick$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Was ist MiniNode?' })).toBeVisible();
  await page.getByRole('link', { name: 'Hochladen und Einbau' }).click();
  await expect(page).toHaveURL(/\/admin\/wiki\/hochladen$/);
  await expect(page.getByRole('heading', { level: 1, name: /Hochladen/ })).toBeVisible();

  // A generated page lists the apps of the repository.
  await page.goto('/admin/wiki/ref-apps');
  await expect(page.getByRole('cell', { name: 'kalender.mininode.app' })).toBeVisible();

  // No raw HTML and no script from an article reaches the page.
  expect(await page.locator('.wiki-prose script').count()).toBe(0);
});

test('the Startup-Guide remembers what is done', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wolfram');

  await page.goto('/admin/guide');
  await expect(page.getByRole('heading', { level: 1, name: 'Startup-Guide' })).toBeVisible();
  const progress = page.getByText(/\d+ von \d+ Schritten erledigt/);
  await expect(progress).toContainText('0 von');

  const first = page.getByRole('checkbox', { name: /Schritt 1 erledigt/ });
  await first.check();
  await expect(progress).toContainText('1 von');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Schritt 1 erledigt/ })).toBeChecked();
  await expect(page.getByText(/\d+ von \d+ Schritten erledigt/)).toContainText('1 von');

  // A step opens and its link goes to a Verwaltung page.
  await page.getByRole('button', { name: /Eine Person einladen/ }).click();
  await page
    .getByRole('link', { name: /Nutzer & Rollen/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  await page.goto('/admin/guide');
  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(page.getByText(/\d+ von \d+ Schritten erledigt/)).toContainText('0 von');
});
