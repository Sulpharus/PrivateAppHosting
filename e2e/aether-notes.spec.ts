import { expect, test } from '@playwright/test';
import { cleanup, createUser, grant, PASSWORD } from './seed.ts';

// hosted/aether-notes behind its local gate: it greets the MiniNode account by name, offers no
// profile or name settings, and the contacts tab works (data goes to the account, not the browser).
const run = `e2ea${Date.now().toString(36)}`;
const APP = 'http://localhost:8806';
const person = { email: `${run}@example.com`, name: `Nora${run}` };

test.beforeAll(async () => {
  // The app is granted by an admin (access.default is false).
  await grant(await createUser(person.email, 'user', person.name), 'aether-notes');
});

test.afterAll(async () => {
  await cleanup(run);
});

test('greets the account name, has no name settings, and keeps contacts in the account', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(person.email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(person.name) })).toBeVisible({
    timeout: 30_000,
  });

  // A way back to the app menu, and icons that are drawn, not written out (nights_stay is a ligature).
  await expect(page.getByRole('link', { name: 'Alle Apps' }).first()).toBeVisible();
  await page
    .getByRole('button', { name: /Rhythmen & Routinen/ })
    .first()
    .click();
  const moon = page.locator('.material-symbols-outlined', { hasText: 'nights_stay' }).first();
  await expect(moon).toBeVisible();
  expect((await moon.boundingBox())?.width ?? 999).toBeLessThan(48);

  // No profile picture and no name fields.
  await page
    .getByRole('button', { name: /Bereichs-Einstellungen/ })
    .first()
    .click();
  await expect(page.getByText('Bereichs-Titel')).toHaveCount(0);
  await expect(page.getByText('Benutzername')).toHaveCount(0);

  // Contacts: no "storage restricted" warning, a contact survives a reload.
  await page
    .getByRole('button', { name: /CRM & Kontakte/ })
    .first()
    .click();
  await expect(page.getByText('Speicher eingeschränkt')).toHaveCount(0);
  await page.getByRole('button', { name: 'Neuer Kontakt' }).click();
  await page.getByPlaceholder('Erika Mustermann').fill('Erika Muster');
  await page.getByRole('button', { name: 'Profil speichern' }).click();
  await page.reload();
  await page
    .getByRole('button', { name: /CRM & Kontakte/ })
    .first()
    .click();
  await expect(page.getByText('Erika Muster').first()).toBeVisible();
  expect(errors).toEqual([]);
});
