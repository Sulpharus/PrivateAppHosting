import { type Browser, expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/wunschliste behind its local gate: Lena keeps a list, Tom reserves a wish, Mia sees it
// as given, and Lena never learns who gives what.
const run = `e2ew${Date.now().toString(36)}`;
const APP = 'http://localhost:8796';
const shots = process.env.SCREENSHOT_DIR;
const people = {
  lena: { email: `${run}-lena@example.com`, name: `Lena ${run}` },
  tom: { email: `${run}-tom@example.com`, name: `Tom ${run}` },
  mia: { email: `${run}-mia@example.com`, name: `Mia ${run}` },
};

test.beforeAll(async () => {
  for (const p of Object.values(people)) await createUser(p.email, 'user', p.name);
});

test.afterAll(async () => {
  await cleanup(run);
});

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(`${APP}/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Meine Liste' })).toBeVisible();
  return page;
}

async function openList(page: Page, name: string) {
  await page.getByRole('button', { name: 'Andere' }).first().click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('wishlists: reserve for others, hidden from the owner', async ({ browser }) => {
  test.setTimeout(120_000);
  const lena = await signedIn(browser, people.lena.email);
  await expect(lena.getByText('Noch keine Wünsche')).toBeVisible();

  // An Amazon link fills the title and is cleaned of tracking parameters.
  await lena.getByRole('button', { name: 'Wunsch hinzufügen' }).first().click();
  const dialog = lena.getByRole('dialog', { name: 'Neuer Wunsch' });
  await dialog
    .getByLabel('Link zum Artikel (optional)')
    .fill(
      'https://www.amazon.de/Sony-WH-1000XM5-Kopfh%C3%B6rer-Noise-Cancelling/dp/B09Y2MYL5C/ref=sr_1_1?keywords=sony',
    );
  await dialog.getByLabel('Link zum Artikel (optional)').blur();
  await expect(dialog.getByLabel('Was wünschst du dir?')).toHaveValue(
    'Sony WH 1000XM5 Kopfhörer Noise Cancelling',
  );
  await expect(dialog.getByLabel('Link zum Artikel (optional)')).toHaveValue(
    'https://www.amazon.de/dp/B09Y2MYL5C',
  );
  await dialog.getByLabel('Preis in € (ungefähr)').fill('299,00');
  await dialog.getByRole('button', { name: 'Sehr gern' }).click();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  // A manual wish without a link.
  await lena.getByRole('button', { name: 'Wunsch hinzufügen' }).first().click();
  await lena.getByLabel('Was wünschst du dir?').fill('Kochkurs für zwei');
  await lena.getByRole('button', { name: 'Speichern' }).click();
  await expect(lena.getByText('Kochkurs für zwei')).toBeVisible();
  await expect(lena.getByRole('heading', { level: 1, name: 'Meine Liste' })).toBeVisible();
  await expect(lena.locator('#subtitle')).toHaveText('2 Wünsche');
  if (shots) await lena.screenshot({ path: `${shots}/wunschliste-meine.png`, fullPage: true });

  // Tom reserves the headphones; they go onto his shopping list.
  const tom = await signedIn(browser, people.tom.email);
  await openList(tom, people.lena.name);
  await tom.getByRole('button', { name: /Sony WH 1000XM5.* schenken/ }).click();
  await expect(tom.getByText('Du schenkst das')).toBeVisible();
  if (shots) await tom.screenshot({ path: `${shots}/wunschliste-andere.png`, fullPage: true });
  await tom.getByRole('button', { name: 'Einkaufsliste' }).first().click();
  await expect(tom.getByRole('heading', { name: `Für ${people.lena.name}` })).toBeVisible();

  // Mia sees it as given and cannot pick it.
  const mia = await signedIn(browser, people.mia.email);
  await openList(mia, people.lena.name);
  await expect(mia.getByText('Geschenkt', { exact: true })).toBeVisible();
  await expect(mia.getByRole('button', { name: /Sony WH 1000XM5.* schenken/ })).toHaveCount(0);
  await expect(mia.getByRole('button', { name: /Kochkurs für zwei schenken/ })).toBeVisible();

  // Lena sees her list unchanged, with no hint of the reservation.
  await lena.reload();
  await expect(lena.getByText('Sony WH 1000XM5 Kopfhörer Noise Cancelling')).toBeVisible();
  await expect(lena.getByText(/Geschenkt|schenkst|reserviert/)).toHaveCount(0);

  // Lena deletes the wish: Tom keeps it until he ticks it off.
  await lena.getByRole('button', { name: /Sony WH 1000XM5.* bearbeiten/ }).click();
  await lena.getByRole('button', { name: 'Löschen' }).click();
  await lena.getByRole('button', { name: 'Zum Löschen erneut tippen' }).click();
  await expect(lena.getByText('Sony WH 1000XM5 Kopfhörer Noise Cancelling')).toHaveCount(0);
  await tom.reload();
  await tom.getByRole('button', { name: 'Einkaufsliste' }).first().click();
  await expect(tom.getByText(`Nicht mehr auf der Liste von ${people.lena.name}`)).toBeVisible();
  if (shots) await tom.screenshot({ path: `${shots}/wunschliste-einkauf.png`, fullPage: true });
  await tom.getByRole('button', { name: /Noise Cancelling gekauft/ }).click();
  await expect(tom.getByRole('heading', { name: /Gekauft/ })).toBeVisible();
  await expect(tom.locator('#subtitle')).toHaveText('Alles besorgt');
  if (shots) {
    await mia.setViewportSize({ width: 390, height: 844 });
    await mia.emulateMedia({ colorScheme: 'dark' });
    await mia.screenshot({ path: `${shots}/wunschliste-mobil-dunkel.png`, fullPage: true });
  }
});
