import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// The three hosted test apps (hosted/notizen, hosted/einkauf, hosted/ideen) served through the
// local gate. They are default apps, so new users get them automatically.
const run = `e2eh${Date.now().toString(36)}`;
const NOTIZEN = 'http://localhost:8791';
const EINKAUF = 'http://localhost:8792';
const IDEEN = 'http://localhost:8793';

test.afterAll(async () => {
  await cleanup(run);
});

async function signInTo(page: Page, appUrl: string, email: string) {
  await page.goto(appUrl);
  await expect(page).toHaveURL(/localhost:5173\/login\?next=/);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(`${appUrl}/`);
}

test('notizen keeps private notes per user', async ({ browser }) => {
  const alice = `${run}-alice@example.com`;
  const bob = `${run}-bob@example.com`;
  await createUser(alice, 'user', 'Alice');
  await createUser(bob, 'user', 'Bob');

  const a = await (await browser.newContext()).newPage();
  await signInTo(a, NOTIZEN, alice);
  await expect(a.getByText('Noch keine Notizen')).toBeVisible();
  await a.getByLabel('Neue Notiz').fill('Zahnarzt Dienstag');
  await a.getByRole('button', { name: 'Speichern' }).click();
  await expect(a.getByText('Zahnarzt Dienstag')).toBeVisible();
  await a.reload();
  await expect(a.getByText('Zahnarzt Dienstag')).toBeVisible();

  const b = await (await browser.newContext()).newPage();
  await signInTo(b, NOTIZEN, bob);
  await expect(b.getByText('Noch keine Notizen')).toBeVisible();
  await expect(b.getByText('Zahnarzt Dienstag')).toHaveCount(0);

  await a.getByRole('button', { name: /Notiz löschen/ }).click();
  await expect(a.getByText('Noch keine Notizen')).toBeVisible();
});

test('einkauf shares one list between users', async ({ browser }) => {
  const carla = `${run}-carla@example.com`;
  const dave = `${run}-dave@example.com`;
  await createUser(carla, 'user', 'Carla');
  await createUser(dave, 'user', 'Dave');
  const item = `Milch ${run}`;

  const c = await (await browser.newContext()).newPage();
  await signInTo(c, EINKAUF, carla);
  await c.getByLabel('Artikel').fill(item);
  await c.getByRole('button', { name: 'Hinzufügen' }).click();
  await expect(c.getByText(item)).toBeVisible();

  const d = await (await browser.newContext()).newPage();
  await signInTo(d, EINKAUF, dave);
  const row = d.getByRole('listitem').filter({ hasText: item });
  await expect(row).toBeVisible();
  await row.getByRole('checkbox').check();

  // Carla's page polls every 5 s and shows Dave's tick.
  await expect(c.getByRole('listitem').filter({ hasText: item }).getByRole('checkbox')).toBeChecked(
    {
      timeout: 10_000,
    },
  );
  await c.getByRole('button', { name: 'Erledigte entfernen' }).click();
  await expect(c.getByText(item)).toHaveCount(0);
});

test('ideen explains the problem when the AI proxy is not reachable', async ({ page }) => {
  const erik = `${run}-erik@example.com`;
  await createUser(erik, 'user', 'Erik');
  await signInTo(page, IDEEN, erik);
  await page.getByRole('button', { name: 'Beispiel: Regentag' }).click();
  await expect(page.getByLabel('Wofür brauchst du Ideen?')).toHaveValue(/Regen/);
  await page.getByRole('button', { name: 'Ideen holen' }).click();
  await expect(page.getByRole('alert')).toContainText(/KI/);
  await expect(page.getByRole('button', { name: 'Ideen holen' })).toBeEnabled();
});
