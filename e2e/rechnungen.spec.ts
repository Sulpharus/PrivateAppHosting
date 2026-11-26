import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/rechnungen behind its local gate: an Austrian sole trader fills in the company profile,
// writes an invoice to a new customer, issues it (number, stored PDF) and books the payment.
const run = `e2er${Date.now().toString(36)}`;
const APP = 'http://localhost:8810';

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

test('rechnungen issues an invoice with a number and books its payment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const anna = `${run}-anna@example.com`;
  await createUser(anna, 'user', 'Anna');
  await signIn(page, anna);
  await expect(page.getByText('Rechnungen schreiben, Zahlungen im Blick')).toBeVisible();

  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Firmendaten eintragen' }).click();
  await dialog.getByLabel(/^Firmenname/).fill('Muster Design e.U.');
  await dialog.getByLabel(/^Straße und Hausnummer/).fill('Mariahilfer Straße 1');
  await dialog.getByLabel(/^PLZ/).fill('1060');
  await dialog.getByRole('textbox', { name: /^Ort/ }).fill('Wien');
  await dialog.getByLabel(/^Land deines Unternehmens/).selectOption('AT');
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  await dialog.getByLabel(/^UID-Nummer/).fill('ATU12345678');
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  await dialog.getByLabel(/^IBAN/).fill('AT61 1904 3002 3457 3201');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Erste Rechnung erstellen' }).click();
  await dialog.getByLabel(/^Name oder Firma/).fill('Kunde GmbH');
  await dialog.getByLabel(/^Straße und Hausnummer/).fill('Herrengasse 5');
  await dialog.getByLabel(/^PLZ/).fill('8010');
  await dialog.getByRole('textbox', { name: /^Ort/ }).fill('Graz');
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  await dialog.getByLabel(/^Bezeichnung/).fill('Webdesign Startseite');
  await dialog.getByLabel(/^Menge/).fill('12,5');
  await dialog.getByLabel(/^Einzelpreis netto in €/).fill('85');
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  await expect(dialog.getByText('Alle Pflichtangaben sind da.')).toBeVisible();
  await expect(dialog.getByText('1.275,00 €')).toBeVisible();
  await dialog.getByRole('button', { name: 'Rechnung ausstellen' }).click();
  await expect(dialog).toBeHidden();

  const year = new Date().getFullYear();
  await page.getByRole('button', { name: 'Rechnungen', exact: true }).last().click();
  await page.getByRole('button', { name: new RegExp(`Kunde GmbH.*RE-${year}-0001`) }).click();
  await expect(dialog.getByText('gespeichert', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Zahlung erfassen' }).click();
  await dialog.getByRole('button', { name: 'Zahlung speichern' }).click();
  await expect(dialog.getByText('Bezahlt', { exact: true })).toBeVisible();

  // Stored on the server: still there after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Rechnungen', exact: true }).last().click();
  await expect(page.getByText(`RE-${year}-0001`)).toBeVisible();

  // Cancelling makes a cancellation invoice with the next number; the original stays, cancelled.
  await page.getByRole('button', { name: new RegExp(`Kunde GmbH.*RE-${year}-0001`) }).click();
  await dialog.getByRole('button', { name: 'Rechnung stornieren' }).click();
  await dialog.getByRole('button', { name: 'Zum Stornieren erneut tippen' }).click();
  await expect(dialog.getByRole('heading', { name: `RE-${year}-0002` })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Rechnungen', exact: true }).last().click();
  await expect(page.getByText('Storniert', { exact: true })).toBeVisible();
  await expect(page.getByText('Stornorechnung', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
