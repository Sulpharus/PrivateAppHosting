import { expect, test } from '@playwright/test';
import { cleanup, createApp, createUser, PASSWORD } from './seed.ts';

// App-Bibliothek (ADR 0011): the admin sees the curated programs with their links, installed
// ones with their address, and is told when installs are not set up yet (no API token here).
const run = `e2el${Date.now().toString(36)}`;
const adminEmail = `${run}-admin@example.com`;

test.beforeAll(async () => {
  await createUser(adminEmail, 'admin', 'Wolfram');
  await createApp(`${run}-kino`, 'Jellyfin', {
    kind: 'container',
    target: 'nucbox',
    manifest: { library: 'jellyfin' },
  });
});

test.afterAll(async () => {
  await cleanup(run);
});

test('the admin browses the App-Bibliothek', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(adminEmail);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /(Hallo|Guten \w+), / })).toBeVisible();

  await page.goto('/admin');
  await page
    .getByRole('navigation', { name: 'Verwaltung' })
    .getByRole('link', { name: 'App-Bibliothek' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'App-Bibliothek' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('noch nicht eingerichtet');

  // Installed: address, update and remove (disabled until installs are set up).
  const jellyfin = page.getByRole('region', { name: 'Jellyfin' });
  await expect(jellyfin.getByText('Installiert')).toBeVisible();
  await expect(jellyfin.getByRole('link', { name: new RegExp(`^${run}-kino\\.`) })).toBeVisible();
  await expect(jellyfin.getByRole('button', { name: 'Aktualisieren' })).toBeDisabled();
  await expect(jellyfin.getByRole('link', { name: 'Website' })).toHaveAttribute(
    'href',
    'https://jellyfin.org',
  );

  // Not installed: an address field with the entry id as default.
  const n8n = page.getByRole('region', { name: 'n8n' });
  await expect(n8n.getByLabel('Adresse')).toHaveValue('n8n');
  await expect(n8n.getByRole('button', { name: 'Installieren' })).toBeDisabled();
});
