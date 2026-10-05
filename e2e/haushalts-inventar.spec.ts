import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/haushalts-inventar behind its local gate: an empty start, an item with photo and
// receipt, persistence after a reload, a logged service, and deleting with a second tap.
const run = `e2ei${Date.now().toString(36)}`;
const APP = 'http://localhost:8805';
const lena = { email: `${run}-lena@example.com`, name: `Lena ${run}` };

// A 1x1 PNG, enough for a photo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeAll(async () => {
  await createUser(lena.email, 'user', lena.name);
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

test('haushalts-inventar: add an item with files, keep it, log a service, delete it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, lena.email);

  // Empty start, no demo items.
  await expect(page.getByRole('heading', { level: 1, name: 'Übersicht' })).toBeVisible();
  await expect(page.locator('.mn-sk')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText('Noch keine Gegenstände im Inventar')).toBeVisible();
  await expect(page.getByText(/Samsung|Breville|MacBook/)).toHaveCount(0);

  // A new item with a photo and a receipt.
  await page.getByRole('button', { name: 'Gegenstand hinzufügen' }).first().click();
  const editor = page.getByRole('dialog', { name: 'Neuer Gegenstand' });
  await editor.getByLabel('Name *').fill('Waschmaschine Test');
  await editor.getByLabel('Kategorie').selectOption('appliances');
  await editor.getByLabel('Kaufpreis (€)').fill('1.299,00');
  await editor.getByLabel('Kaufdatum').fill(new Date().toISOString().slice(0, 10));
  await editor.getByLabel('Foto des Gegenstands').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await editor.getByLabel('Beleg oder Rechnung (Bild oder PDF)').setInputFiles({
    name: 'beleg.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await editor.getByRole('button', { name: 'Gegenstand anlegen' }).click();
  await expect(page.getByText('Gegenstand angelegt')).toBeVisible();

  // Still there after a reload, with the money in German format.
  await page.reload();
  await expect(page.locator('.mn-sk')).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Inventar', exact: true }).first().click();
  await expect(page.getByText('1 Gegenstand', { exact: true })).toBeVisible();
  await page.locator('.mn-tile').filter({ hasText: 'Waschmaschine Test' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Waschmaschine Test' })).toBeVisible();
  await expect(sheet.getByText('1.299,00 €')).toBeVisible();
  await expect(sheet.getByText('Garantie aktiv').first()).toBeVisible();
  await expect(sheet.getByText('Garantie bis')).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Beleg öffnen' })).toBeVisible();

  // A service is logged and shows in the list.
  await sheet.getByRole('button', { name: 'Wartung eintragen' }).click();
  const maintenance = page.getByRole('dialog', { name: 'Wartung eintragen' });
  await maintenance.getByRole('button', { name: 'Wartung speichern' }).click();
  await expect(page.getByText('Wartung eingetragen')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Noch keine Wartung eingetragen.')).toHaveCount(
    0,
  );

  // Delete asks for a second tap.
  const open = page.getByRole('dialog');
  await open.getByRole('button', { name: 'Löschen', exact: true }).click();
  await open.getByRole('button', { name: 'Zum Löschen erneut tippen' }).click();
  await expect(page.getByText('Gegenstand gelöscht')).toBeVisible();
  await expect(page.getByText('Dein Inventar ist noch leer')).toBeVisible();

  expect(errors).toEqual([]);
});

test('haushalts-inventar: a restored backup brings back deleted items and keeps the old state', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, lena.email);
  await expect(page.locator('.mn-sk')).toHaveCount(0, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Gegenstand hinzufügen' }).first().click();
  const editor = page.getByRole('dialog', { name: 'Neuer Gegenstand' });
  await editor.getByLabel('Name *').fill('Sofa Sicherung');
  await editor.getByRole('button', { name: 'Gegenstand anlegen' }).click();
  await expect(page.getByText('Gegenstand angelegt')).toBeVisible();

  // Back it up, then delete the item.
  await page.getByRole('button', { name: 'Haushalt', exact: true }).first().click();
  await page.getByLabel('Name der Sicherung').fill('Vorher');
  await page.getByRole('button', { name: 'Sicherung anlegen' }).click();
  await expect(page.getByText('Sicherung angelegt')).toBeVisible();
  await page.getByRole('button', { name: 'Inventar', exact: true }).first().click();
  await page.locator('.mn-tile').filter({ hasText: 'Sofa Sicherung' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Löschen', exact: true }).click();
  await sheet.getByRole('button', { name: 'Zum Löschen erneut tippen' }).click();
  await expect(page.getByText('Dein Inventar ist noch leer')).toBeVisible();

  // Restore asks twice and saves the empty state first.
  await page.getByRole('button', { name: 'Haushalt', exact: true }).first().click();
  await page.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
  await page.getByRole('button', { name: 'Erneut tippen: ersetzt dein Inventar' }).click();
  await expect(page.getByText('Sicherung wiederhergestellt')).toBeVisible();
  await expect(page.getByText('Vor dem Wiederherstellen von „Vorher“')).toBeVisible();
  await page.getByRole('button', { name: 'Inventar', exact: true }).first().click();
  await expect(page.locator('.mn-tile').filter({ hasText: 'Sofa Sicherung' })).toBeVisible();

  expect(errors).toEqual([]);
});
