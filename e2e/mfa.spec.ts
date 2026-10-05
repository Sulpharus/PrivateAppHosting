import { createHmac } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { cleanup, createApp, createUser, grant, PASSWORD, url } from './seed.ts';

// Authenticator app (TOTP) as a second factor: set up under "Dein Konto", asked for after a
// password sign-in, enforced by the database, and not needed after a passkey sign-in.

const run = `e2emfa${Date.now().toString(36)}`;
const email = `${run}-user@example.com`;

test.beforeAll(async () => {
  const userId = await createUser(email, 'user', 'Mara');
  await createApp(`${run}-rezepte`, 'Rezepte');
  await grant(userId, `${run}-rezepte`);
});

test.afterAll(async () => {
  await cleanup(run);
});

function base32(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of text.replace(/[\s=]/g, '').toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** RFC 6238 code (SHA-1, 30 s, 6 digits), like every authenticator app. */
function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hash = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = (hash.at(-1) ?? 0) & 0xf;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** A code from a later 30-second window than `used` (a code is only accepted once). */
async function freshCode(secret: string, used: string): Promise<string> {
  for (;;) {
    const code = totp(secret);
    if (code !== used) return code;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function passwordSignIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

const home = (page: Page) =>
  expect(page.getByRole('heading', { level: 1, name: /(Hallo|Guten \w+), / })).toBeVisible();

test('authenticator app: set up, then required after a password sign-in', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await passwordSignIn(page);
  await home(page);

  await page.goto('/account');
  await page.getByRole('button', { name: 'Einrichten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Authenticator-App einrichten' });
  await expect(dialog.getByRole('img', { name: /QR-Code/ })).toBeVisible();
  const secret = (await dialog.locator('.totp-secret').textContent()) ?? '';
  let used = totp(secret);
  await dialog.getByLabel(/sechsstelligen Code/).fill(used);
  await dialog.getByRole('button', { name: 'Einrichten' }).click();
  await expect(page.getByRole('status')).toContainText('Authenticator-App eingerichtet');

  // The database hides everything from a password-only session of this account.
  const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const { data: apps } = await client.schema('platform').from('apps').select('slug');
  expect(apps ?? []).toHaveLength(0);
  used = await freshCode(secret, used);
  await client.auth.mfa.challengeAndVerify({
    factorId: (await client.auth.mfa.listFactors()).data?.totp[0]?.id ?? '',
    code: used,
  });
  const { data: after } = await client.schema('platform').from('apps').select('slug');
  expect(after?.map((app) => app.slug)).toContain(`${run}-rezepte`);

  // In the portal: sign out, password again, then the code step.
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByLabel('E-Mail')).toBeVisible();
  await passwordSignIn(page);
  await expect(page.getByRole('heading', { name: 'Zweiter Schritt' })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Zweiter Schritt' })).toBeVisible();
  await page.getByLabel('Code aus deiner Authenticator-App').fill('000000');
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(page.getByRole('alert')).toContainText('Der Code stimmt nicht');
  used = await freshCode(secret, used);
  await page.getByLabel('Code aus deiner Authenticator-App').fill(used);
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(page.getByRole('heading', { name: 'Dein Konto' })).toBeVisible();

  // A passkey sign-in needs no code.
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
  await page.getByRole('button', { name: 'Dieses Gerät hinzufügen' }).click();
  await expect(page.getByRole('status')).toContainText('Passkey hinzugefügt');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: 'Mit Passkey anmelden' }).click();
  await home(page);
  await expect(page.getByRole('link', { name: /Rezepte/ })).toBeVisible();

  // Removing the authenticator app from a passkey session asks for a code first.
  await page.goto('/account');
  page.once('dialog', (confirm) => void confirm.accept());
  // The authenticator section loads its factor after the passkey list: pick its own button, not
  // whichever "Entfernen" happens to be last on the page yet (that was a passkey, sometimes).
  await page
    .getByRole('region', { name: 'Authenticator-App' })
    .getByRole('button', { name: 'Entfernen' })
    .click();
  const confirmDialog = page.getByRole('dialog', { name: 'Kurz bestätigen' });
  await expect(confirmDialog).toBeVisible();
  used = await freshCode(secret, used);
  await confirmDialog.getByLabel('Code aus deiner Authenticator-App').fill(used);
  await confirmDialog.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(page.getByRole('status')).toContainText('Authenticator-App entfernt');
});
