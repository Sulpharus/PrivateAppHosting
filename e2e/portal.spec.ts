import { createVerifier, readSession } from '@mininode/gate';
import { expect, test } from '@playwright/test';
import { cleanup, createApp, createUser, grant, PASSWORD, url } from './seed.ts';

const run = `e2e${Date.now().toString(36)}`;
const adminEmail = `${run}-admin@example.com`;
const userEmail = `${run}-user@example.com`;

test.beforeAll(async () => {
  // The platform bootstraps the very first user as admin; make sure that is not us by accident.
  const adminId = await createUser(adminEmail, 'admin', 'Wolfram');
  const userId = await createUser(userEmail, 'user', 'Lena');
  await createApp(`${run}-rezepte`, 'Rezepte');
  await createApp(`${run}-budget`, 'Budget', { data_mode: 'shared-account', owner_id: adminId });
  await grant(userId, `${run}-rezepte`);
});

test.afterAll(async () => {
  await cleanup(run);
});

async function signIn(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /(Hallo|Guten \w+), / })).toBeVisible();
}

test('password sign-in shows only granted apps', async ({ page }) => {
  await signIn(page, userEmail);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lena');
  await expect(page.getByRole('link', { name: /Rezepte/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Budget/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Verwaltung' })).toHaveCount(0);
});

test('the session cookie is accepted by the app gate', async ({ page, context }) => {
  await signIn(page, userEmail);
  const cookies = await context.cookies();
  const header = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const session = readSession(header);
  expect(session).not.toBeNull();
  const result = await createVerifier(url).verify(session?.accessToken ?? '');
  expect(result.status).toBe('valid');
});

test('non-admins cannot open the Host Manager', async ({ page }) => {
  await signIn(page, userEmail);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/$/);
});

test('admins reach every Host Manager page', async ({ page }) => {
  await signIn(page, adminEmail);
  await page.getByRole('link', { name: 'Verwaltung' }).click();
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  for (const [link, heading] of [
    ['Apps', 'Apps'],
    ['Nutzer & Rollen', 'Nutzer & Rollen'],
    ['Remote-Apps', 'Remote-Apps'],
    ['KI-Proxy', 'KI-Proxy'],
  ]) {
    await page
      .getByRole('navigation', { name: 'Verwaltung' })
      .getByRole('link', { name: link, exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  await page
    .getByRole('navigation', { name: 'Verwaltung' })
    .getByRole('link', { name: 'Nutzer & Rollen' })
    .click();
  await expect(page.getByRole('cell', { name: /Lena/ })).toBeVisible();
});

test('passkey: register on the account page, then sign in with it', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await signIn(page, userEmail);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Dieses Gerät hinzufügen' }).click();
  await expect(page.getByRole('status')).toContainText('Passkey hinzugefügt');

  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: 'Mit Passkey anmelden' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lena');
});

test('open redirects are refused after sign-in', async ({ page }) => {
  await page.goto('/login?next=https://evil.example/phish');
  await page.getByLabel('E-Mail').fill(userEmail);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:5173/');
});
