import { expect, type Page, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/haushalt behind its local gate: bookings, bank CSV import and the tax forms, stored in
// tables (copied once from the kv entries older versions wrote).
const run = `e2eb${Date.now().toString(36)}`;
const APP = 'http://localhost:8795';
const year = new Date().getFullYear();
const shots = process.env.SCREENSHOT_DIR;
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
  await page.getByRole('button', { name: 'Buchung hinzufügen' }).first().click();
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

test('haushalt imports a bank statement as PDF', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const paul = `${run}-paul@example.com`;
  await createUser(paul, 'user', 'Paul');

  // A statement as banks print it: dates without year, continuation lines, amounts with a
  // trailing minus, balances above and below. Chromium renders it to a real text PDF.
  const printer = await browser.newPage();
  await printer.setContent(`<!doctype html><html lang="de"><body style="font:12px sans-serif">
    <h1>Kontoauszug 9/${year}</h1>
    <p>Zeitraum 01.${month}.${year} bis 28.${month}.${year}</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td>Alter Kontostand</td><td></td><td></td><td style="text-align:right">1.200,00</td></tr>
      <tr style="vertical-align:top"><td>04.${month}.</td><td>04.${month}.</td>
        <td>Lastschrift<br>Stadtwerke Musterstadt<br>Abschlag Strom Kd 4711</td>
        <td style="text-align:right">89,00-</td></tr>
      <tr style="vertical-align:top"><td>05.${month}.</td><td>05.${month}.</td>
        <td>Gutschrift<br>Beispiel GmbH<br>Gehalt</td>
        <td style="text-align:right">2.750,00+</td></tr>
      <tr><td>Neuer Kontostand</td><td></td><td></td><td style="text-align:right">3.861,00</td></tr>
    </table></body></html>`);
  const pdf = await printer.pdf({ format: 'A4' });
  await printer.close();

  await signIn(page, paul);
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click();
  await page.getByRole('button', { name: 'Kontoauszug importieren' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'auszug.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(dialog.getByText('2 Buchungen erkannt, davon 2 neu')).toBeVisible({
    timeout: 20_000,
  });
  await dialog.getByRole('button', { name: '2 importieren' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Stadtwerke Musterstadt')).toBeVisible();
  await expect(page.getByText('+2.750,00 €')).toBeVisible();
  expect(errors).toEqual([]);
});

test('haushalt plans fixed costs, spots a changed price and shows the month', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const clara = `${run}-clara@example.com`;
  await createUser(clara, 'user', 'Clara');
  await signIn(page, clara);

  await page.getByRole('button', { name: 'Planung' }).first().click();
  await expect(page.getByText('Noch keine Fixkosten')).toBeVisible();
  const dialog = page.getByRole('dialog');
  const addFixed = async (text: string, amount: string, art: string, kind?: string) => {
    await page.getByRole('button', { name: 'Fixkosten hinzufügen' }).first().click();
    await dialog.getByLabel('Beschreibung', { exact: true }).fill(text);
    await dialog.getByRole('combobox', { name: 'Gruppe' }).selectOption({ label: art });
    await dialog.getByLabel('Betrag in €').fill(amount);
    if (kind)
      await dialog
        .getByRole('combobox', { name: 'Art', exact: true })
        .selectOption({ label: kind });
    if (text === 'Netflix') {
      // Picked the way a person does: month abbreviation and year, the same in every browser.
      const first = dialog.locator('.mn-date').first();
      const names = [
        'Jan.',
        'Feb.',
        'März',
        'Apr.',
        'Mai',
        'Juni',
        'Juli',
        'Aug.',
        'Sept.',
        'Okt.',
        'Nov.',
        'Dez.',
      ];
      await first
        .getByRole('combobox', { name: 'Monat' })
        .selectOption({ label: names[Number(month) - 1] });
      await first.getByRole('textbox', { name: 'Jahr' }).fill(String(year));
      await expect(dialog.getByLabel('Erste Buchung')).toHaveValue(`${year}-${month}`);
    } else await dialog.getByLabel('Erste Buchung').fill(`${year}-${month}`);
    await dialog.getByLabel('Am Tag').fill('1');
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(dialog).toBeHidden();
  };
  await addFixed('Gehalt', '3000', 'Regelmäßige Einnahmen', 'Einnahme');
  await addFixed('Miete', '1000', 'Wohnen');
  await addFixed('Netflix', '12,99', 'Abos und Verträge');
  await expect(page.getByText('Fixkosten pro Monat')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Netflix/ })).toContainText('12,99 €');

  // The bank shows a higher Netflix price: recognised, not booked twice, flagged.
  const printer = await browser.newPage();
  await printer.setContent(`<!doctype html><html lang="de"><body style="font:12px sans-serif">
    <p>Kontoauszug vom 01.${month}.${year} bis 28.${month}.${year}</p>
    <table style="width:100%"><tr><td>02.${month}.</td><td>NETFLIX.COM</td>
    <td style="text-align:right">15,99-</td></tr></table></body></html>`);
  const pdf = await printer.pdf({ format: 'A4' });
  await printer.close();
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click();
  await page.getByRole('button', { name: 'Kontoauszug importieren' }).click();
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'auszug.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(dialog.getByText('1 als Fixkosten')).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: '1 importieren' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('−12,99 €')).toHaveCount(0);

  await page.getByRole('button', { name: 'Übersicht' }).first().click();
  await expect(page.getByRole('region', { name: 'Dein Monat' })).toBeVisible();
  await expect(page.getByText(/Netflix 15,99\s€ statt 12,99\s€/)).toBeVisible();
  await page.getByRole('button', { name: 'Ansehen' }).click();
  await page.getByRole('button', { name: 'Als neuen Betrag übernehmen' }).click();
  await expect(page.getByRole('button', { name: /^Netflix/ })).toContainText('15,99 €');

  await page.getByRole('button', { name: 'Statistik' }).first().click();
  await expect(page.getByText('Fixkostenquote')).toBeVisible();
  await expect(page.getByText('Fixkosten nach Art')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/haushalt-stats.png`, fullPage: true });
  await page.getByRole('button', { name: 'Übersicht' }).first().click();
  if (shots) await page.screenshot({ path: `${shots}/haushalt-overview.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('entries of the old kv storage are copied into the tables once and kept as a backup', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `${run}-karl@example.com`;
  const userId = await createUser(email, 'user', 'Karl');
  const date = `${year}-${month}-03`;
  const kv = admin.schema('platform').from('app_kv');
  const old = [
    {
      key: `tx:${date}:alt1`,
      value: {
        id: 'alt1',
        date,
        cents: 4250,
        kind: 'expense',
        cat: 'lebensmittel',
        text: 'Wocheneinkauf',
        party: 'REWE',
      },
    },
    {
      key: 'rec:miete',
      value: {
        id: 'miete',
        text: 'Miete',
        cents: 90000,
        kind: 'expense',
        cat: 'miete',
        every: 1,
        day: 1,
        start: `${year}-01`,
      },
    },
    { key: `profile:${year}`, value: { commuteKm: 12, commuteDays: 200, income: 48000 } },
    {
      key: 'settings',
      value: {
        categories: [
          { id: 'lebensmittel', name: 'Essen daheim', kind: 'expense', budget: 40000, tax: '' },
        ],
        rules: [],
      },
    },
  ];
  for (const { key, value } of old) {
    const { error } = await kv.insert({ app_slug: 'haushalt', owner_id: userId, key, value });
    if (error) throw error;
  }

  await signIn(page, email);
  await expect(page.getByText('2 Buchungen')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Buchungen', exact: true }).click();
  await expect(page.getByText('Wocheneinkauf')).toBeVisible();

  const tables = admin.schema('app_haushalt');
  const one = async (table: string) =>
    (await tables.from(table).select('*').eq('owner_id', userId)).data ?? [];
  await expect.poll(async () => (await one('bookings')).map((row) => row.id)).toContain('alt1');
  const bookings = await one('bookings');
  expect(bookings.find((row) => row.id === 'alt1')).toMatchObject({
    booked_on: date,
    cents: 4250,
    cat: 'lebensmittel',
    party: 'REWE',
  });
  // the fixed cost is booked up to today by the app itself: its row has the deterministic id
  expect((await one('recurring')).map((row) => row.id)).toEqual(['miete']);
  expect(await one('tax_profiles')).toMatchObject([
    { id: `${year}`, commute_km: 12, income: 48000 },
  ]);
  expect(await one('categories')).toMatchObject([
    { id: 'lebensmittel', name: 'Essen daheim', budget_cents: 40000 },
  ]);

  const { data: left } = await kv.select('key').eq('owner_id', userId);
  expect(left?.map((row) => row.key)).toEqual(expect.arrayContaining(old.map((o) => o.key)));
  expect(left?.map((row) => row.key)).toContain('meta:tablesFrom');
  const before = bookings.length;
  await page.reload();
  await expect(page.getByText('2 Buchungen')).toBeVisible();
  expect((await one('bookings')).length).toBe(before);
  expect(errors).toEqual([]);
});
