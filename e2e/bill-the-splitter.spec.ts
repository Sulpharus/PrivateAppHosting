import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, grant, PASSWORD } from './seed.ts';

// hosted/bill-the-splitter behind its local gate: a group, an expense with an uneven split, the
// suggested transfers, booking one as paid, and deleting an expense with the undo.
const run = `e2ebs${Date.now().toString(36)}`;
const APP = 'http://localhost:8807';

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

test('bill splitter splits by shares, suggests transfers and undoes a delete', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const bea = `${run}-bea@example.com`;
  await grant(await createUser(bea, 'user', 'Bea'), 'bill-the-splitter');
  await signIn(page, bea);
  await expect(page.locator('#mn-splash')).toBeHidden();

  // The app's data is shared by everyone with access, so the group has a name of its own.
  const group = `Ski ${run}`;
  await page
    .getByRole('button', { name: /Gruppen$/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole('button', { name: /Neue Gruppe/ })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByPlaceholder('z. B. Ski-Wochenende').fill(group);
  await page.getByPlaceholder('z.B. Lisa, Jonas, Sophie').fill('Lisa, Jonas');
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await expect(page.getByText('Alles ausgeglichen')).toBeVisible();

  // 90 € paid by Bea, shared 1:2 between Bea and Lisa: Lisa owes 60.
  await page
    .getByRole('button', { name: 'Rechnung hinzufügen' })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByPlaceholder('0,00').fill('90');
  await page.getByPlaceholder('Wofür war das?').fill('Hütte');
  await page.getByRole('button', { name: 'Jonas' }).click();
  await page.getByRole('button', { name: 'Anteile' }).click();
  await page.getByRole('textbox', { name: /^Lisa/ }).fill('2');
  await page.getByRole('button', { name: 'Speichern' }).last().click();

  await expect(page.getByText('Lisa zahlt dir')).toBeVisible();
  await expect(page.getByText('60,00 €').first()).toBeVisible();

  // Booking the transfer settles the group.
  await page.getByRole('button', { name: 'Als bezahlt buchen' }).click();
  await expect(page.getByText('Alles ausgeglichen')).toBeVisible();

  // Deleting an expense can be undone.
  await page
    .getByRole('button', { name: /löschen/i })
    .first()
    .click();
  const confirm = page.getByRole('button', { name: /^(Löschen|Ja)/ });
  if (await confirm.count()) await confirm.first().click();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByText('Hütte').first()).toBeVisible();

  expect(errors).toEqual([]);
});
