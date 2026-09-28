import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/haushalt behind its local gate: bookings, bank CSV import and the tax forms.
const run = `e2eb${Date.now().toString(36)}`;
const APP = 'http://localhost:8795';
const year = new Date().getFullYear();
const month = String(new Date().getMonth() + 1).padStart(2, '0');

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

test('haushalt books, imports a bank CSV and fills the tax forms', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const hanna = `${run}-hanna@example.com`;
  await createUser(hanna, 'user', 'Hanna');
  await signIn(page, hanna);
  await expect(page.getByText('Noch keine Buchungen in diesem Monat')).toBeVisible();

  // A craftsman's invoice: only the labour part counts for § 35a.
  await page.getByRole('button', { name: '+ Buchung' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Betrag in €').fill('500');
  await dialog.getByLabel('Beschreibung').fill('Heizungswartung');
  await dialog.getByLabel('Kategorie').selectOption({ label: 'Handwerker' });
  await dialog.getByLabel('Davon steuerlich absetzbar in €').fill('300');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Ausgaben', { exact: true })).toBeVisible();

  // Bank export with preamble, semicolons, German numbers and a duplicate on re-import.
  const csv = [
    'Kontonummer;DE00123',
    '',
    'Buchungstag;Valuta;Auftraggeber/Empfänger;Verwendungszweck;Betrag (EUR)',
    `02.${month}.${year};02.${month}.${year};REWE Markt;Einkauf;-45,10`,
    `01.${month}.${year};01.${month}.${year};ACME GmbH;LOHN/GEHALT;3.210,00`,
    `03.${month}.${year};03.${month}.${year};Tierschutzverein;Spende;-50,00`,
  ].join('\n');
  const file = { name: 'umsatz.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') };
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click();
  await page.getByRole('button', { name: 'Kontoauszug importieren' }).click();
  await dialog.locator('input[type=file]').setInputFiles(file);
  await expect(dialog.getByText('3 Buchungen erkannt, davon 3 neu')).toBeVisible();
  await dialog.getByRole('button', { name: '3 importieren' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('REWE Markt')).toBeVisible();
  await expect(page.getByText('+3.210,00 €')).toBeVisible();

  await page.getByRole('button', { name: 'Kontoauszug importieren' }).click();
  await dialog.locator('input[type=file]').setInputFiles(file);
  await expect(dialog.getByText('3 Buchungen erkannt, davon 0 neu')).toBeVisible();
  await page.keyboard.press('Escape');

  // The tax view picks up the booking and the donation without any extra step.
  await page.getByRole('button', { name: 'Steuer', exact: true }).click();
  const hh = page.getByRole('region', { name: 'Anlage Haushaltsnahe Aufwendungen' });
  await expect(hh.getByRole('row', { name: /^Handwerkerleistungen/ })).toContainText('300,00 €');
  await expect(hh.getByText('Steuerermäßigung: 60,00 €')).toBeVisible();
  const sa = page.getByRole('region', { name: 'Anlage Sonderausgaben' });
  await expect(sa.getByRole('row', { name: /^Spenden und Mitgliedsbeiträge/ })).toContainText(
    '50,00 €',
  );

  await page.getByLabel('Entfernung zur Arbeit (km, einfach)').fill('10');
  await page.getByLabel('Tage im Büro').fill('100');
  await page.getByLabel('Tage im Büro').blur();
  const n = page.getByRole('region', { name: 'Anlage N' });
  await expect(
    n.getByText('Wege zur ersten Tätigkeitsstätte (Entfernungspauschale)'),
  ).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Steuer', exact: true }).click();
  await expect(page.getByLabel('Tage im Büro')).toHaveValue('100');
  expect(errors).toEqual([]);
});
