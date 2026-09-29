import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/medialog (AI Studio export) behind its local gate: an empty start, adding works by
// hand, lists, settings, and sharing a list with another user.
const run = `e2el${Date.now().toString(36)}`;
const APP = 'http://localhost:8797';
const shots = process.env.SCREENSHOT_DIR;
const lena = { email: `${run}-lena@example.com`, name: `Lena ${run}` };
const tom = { email: `${run}-tom@example.com`, name: `Tom ${run}` };

test.beforeAll(async () => {
  await createUser(lena.email, 'user', lena.name);
  await createUser(tom.email, 'user', tom.name);
});

test.afterAll(async () => {
  await cleanup(run);
});

async function signIn(page: Page, email: string) {
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(`${APP}/`);
}

test('medialog starts empty and has no demo people', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, lena.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
  page.on('console', (m) => console.log('console:', m.type(), m.text()));
  await expect(page.locator('.mn-sk')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText(/Jana|Felix|Sophie/)).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/medialog-start.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('medialog: add a work, put it on a list and share the list', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, lena.email);
  await expect(page.locator('.mn-sk')).toHaveCount(0, { timeout: 15_000 });

  // A list first, so the new work can go on it.
  await page.getByRole('button', { name: 'Listen' }).first().click();
  await page.getByRole('button', { name: 'Neue Liste' }).click();
  await page.getByLabel('Name der Liste *').fill('Sommer-Lektüre');
  await page.getByRole('button', { name: 'Liste anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Sommer-Lektüre' })).toBeVisible();

  // A work entered by hand.
  await page.getByRole('button', { name: 'Medium anlegen' }).first().click();
  await page.getByRole('button', { name: 'Ohne Suche manuell eingeben' }).click();
  await page.getByLabel('Titel *').fill('Die unendliche Geschichte');
  await page.getByLabel('Urheber / Autor / Regisseur *').fill('Michael Ende');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel('Sommer-Lektüre').check();
  await page.getByRole('button', { name: 'Medium anlegen' }).last().click();
  await expect(page.getByText('Medium angelegt')).toBeVisible();

  // Persisted: still there after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Sammlung' }).first().click();
  await expect(page.getByText('Die unendliche Geschichte').first()).toBeVisible();

  // Share the list with Tom.
  await page.getByRole('button', { name: 'Listen' }).first().click();
  await page.getByRole('button', { name: /Teilen & PDF/ }).click();
  const dialog = page.getByRole('dialog', { name: /Teilen: Sommer-Lektüre/ });
  const shareTom = dialog.getByRole('button', { name: `Mit ${tom.name} teilen` });
  await shareTom.click();
  await expect(shareTom).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  if (shots) await page.screenshot({ path: `${shots}/medialog-listen.png`, fullPage: true });

  // Tom sees it under "Mit dir geteilt" and copies the work.
  const other = await (await browser.newContext()).newPage();
  await signIn(other, tom.email);
  await expect(other.locator('.mn-sk')).toHaveCount(0, { timeout: 15_000 });
  await other.getByRole('button', { name: 'Listen' }).first().click();
  const shared = other.getByRole('region', { name: /Mit dir geteilt/ });
  await expect(shared).toContainText('Sommer-Lektüre');
  await expect(shared).toContainText(`Von ${lena.name}`);
  await shared.getByRole('button', { name: 'In meine Sammlung' }).click();
  await expect(other.getByText(/in deine Sammlung übernommen/)).toBeVisible();
  if (shots) await other.screenshot({ path: `${shots}/medialog-geteilt.png`, fullPage: true });
  expect(errors).toEqual([]);
});
