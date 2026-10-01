import { expect, test } from '@playwright/test';
import { cleanup, createApp, createUser, PASSWORD } from './seed.ts';

// Apps as GitHub projects (ADR 0012): the admin opens the export dialog of a hosted app; link
// tiles and library programs have none. There is no API server in e2e, so starting fails visibly.
const run = `e2ex${Date.now().toString(36)}`;
const adminEmail = `${run}-admin@example.com`;

test.beforeAll(async () => {
  await createUser(adminEmail, 'admin', 'Wolfram');
  await createApp(`${run}-notes`, `Notizen ${run}`);
  await createApp(`${run}-link`, `Link ${run}`, {
    kind: 'link',
    target: 'external',
    link_url: 'https://example.com',
  });
});

test.afterAll(async () => {
  await cleanup(run);
});

test('the admin opens the export dialog of a hosted app', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(adminEmail);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /(Hallo|Guten \w+), / })).toBeVisible();

  await page.goto('/admin/apps');
  await expect(
    page.getByRole('button', { name: `Link ${run} als GitHub-Projekt exportieren` }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: `Notizen ${run} als GitHub-Projekt exportieren` }).click();

  const dialog = page.getByRole('dialog', { name: `Notizen ${run} als GitHub-Projekt` });
  await expect(dialog.getByLabel('Projektname')).toHaveValue(`mininode-${run}-notes`);
  await expect(dialog.getByLabel(/^Privat/)).toBeChecked();
  await dialog.getByRole('button', { name: 'Exportieren' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
