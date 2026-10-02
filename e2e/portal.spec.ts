import { createVerifier, readSession } from '@mininode/gate';
import { expect, test } from '@playwright/test';
import { admin, cleanup, createApp, createUser, grant, PASSWORD, url } from './seed.ts';

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
    ['Kategorien & Pakete', 'Kategorien & Pakete'],
    ['Nutzer & Rollen', 'Nutzer & Rollen'],
    ['Hardware-Server', 'Hardware-Server'],
    ['KI-Proxy', 'KI-Proxy'],
    ['KI-Werkstatt', 'KI-Werkstatt'],
  ]) {
    await page
      .getByRole('navigation', { name: 'Verwaltung' })
      .getByRole('link', { name: link, exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  // Remote-Apps and the App-Bibliothek live under Hardware-Server; Hochladen is a button in Apps.
  await page
    .getByRole('navigation', { name: 'Verwaltung' })
    .getByRole('link', { name: 'Hardware-Server', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Hardware-Server' })
    .getByRole('link', { name: 'Remote-Apps' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Remote-Apps' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Verwaltung' })
    .getByRole('link', { name: 'Apps', exact: true })
    .click();
  // Apps and games are separate views; the list sorts by name, category, drawer or status.
  await page.getByRole('button', { name: /^Gaming Hub/ }).click();
  await expect(page.getByRole('button', { name: /^Gaming Hub/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Sortieren nach').selectOption('drawer');
  await page.getByRole('button', { name: /^Apps/ }).click();
  await page.getByRole('link', { name: 'Hochladen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hochladen' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Verwaltung' })
    .getByRole('link', { name: 'Nutzer & Rollen' })
    .click();
  await expect(page.getByRole('cell', { name: /Lena/ })).toBeVisible();
});

test('API keys requested by apps are listed once for the admin', async ({ page }) => {
  const api = {
    id: `${run}-wetter`,
    name: 'Wetterdienst',
    baseUrl: 'https://api.weather.example/v1',
    auth: { type: 'query', param: 'appid' },
  };
  for (const [slug, reason] of [
    [`${run}-rezepte`, 'Saisonale Rezepte nach Wetter'],
    [`${run}-budget`, 'Heizkosten schätzen'],
  ]) {
    const { error } = await admin
      .schema('platform')
      .rpc('register_app_apis', { p_app_slug: slug, p_apis: [{ ...api, reason }] });
    if (error) throw error;
  }
  try {
    await signIn(page, adminEmail);
    await page.goto('/admin');
    const nav = page.getByRole('navigation', { name: 'Verwaltung' });
    await expect(nav.getByRole('link', { name: /API-Schlüssel\s*\d+ fehlen/ })).toBeVisible();
    await nav.getByRole('link', { name: /API-Schlüssel/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'API-Schlüssel' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Benötigt \(\d+\)/ })).toBeVisible();
    const entry = page.getByRole('region', { name: 'Wetterdienst' });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText('Saisonale Rezepte nach Wetter');
    await expect(entry).toContainText('Heizkosten schätzen');
    await expect(entry.getByLabel('API-Schlüssel für Wetterdienst')).toHaveAttribute(
      'type',
      'password',
    );
  } finally {
    // Requests first: an entry in use cannot be deleted (on delete restrict).
    await admin.schema('platform').from('app_api_services').delete().eq('service_id', api.id);
    await admin.schema('platform').from('api_services').delete().eq('id', api.id);
  }
});

test('the KI-Werkstatt composes a prompt for a new app', async ({ page }) => {
  await signIn(page, adminEmail);
  await page.goto('/admin/workshop');
  await expect(page.getByRole('heading', { name: 'Dateien für die KI' })).toBeVisible();
  await page.getByLabel('Name der App').fill('Bücherregal');
  await page.getByLabel('Was soll die App können?').fill('Gelesene Bücher mit Bewertung.');
  await page.getByRole('button', { name: 'Archiv und Sammlung' }).click();
  // Features sit in collapsible groups; the group opens with a click and counts what is chosen.
  await expect(page.getByRole('checkbox', { name: /Fotos und Dateien/ })).toBeHidden();
  await page.getByText('Daten und Inhalte', { exact: true }).click();
  await page.getByRole('checkbox', { name: /Fotos und Dateien/ }).check();
  await expect(page.getByText('1 gewählt')).toBeVisible();

  await page.getByLabel('Wo baust du sie?').selectOption({ label: 'Google AI Studio' });
  const prompt = page.getByLabel('Fertiger Prompt');
  await expect(prompt).toHaveValue(/# Build the MiniNode app "Bücherregal"/);
  await expect(prompt).toHaveValue(/data-accent="violet"/);
  await expect(prompt).toHaveValue(/## Feature: photos and files/);
  await expect(prompt).toHaveValue(/Vite \+ React \+ TypeScript/);
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
