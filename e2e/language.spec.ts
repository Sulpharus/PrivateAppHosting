import { expect, type Page, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

// The language switch (ADR 0017): chosen once in the portal, mirrored into the mn-lang cookie, and
// followed by every hosted app that has a language package.
const run = `e2elang${Date.now().toString(36)}`;
const email = `${run}-user@example.com`;
let userId = '';

test.beforeAll(async () => {
  userId = await createUser(email, 'user', 'Lena');
});

test.afterAll(async () => {
  await cleanup(run);
});

async function setLanguage(id: string, language: 'de' | 'en') {
  await admin.schema('platform').from('profiles').update({ language }).eq('user_id', id);
}

async function languageOf(id: string): Promise<string | undefined> {
  const { data } = await admin
    .schema('platform')
    .from('profiles')
    .select('language')
    .eq('user_id', id)
    .maybeSingle<{ language: string }>();
  return data?.language;
}

test('the account page switches the language and keeps it in the profile and the cookie', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lena');

  await page.goto('/account');
  const english = page.getByRole('button', { name: 'English' });
  await expect(english).toHaveAttribute('aria-pressed', 'false');
  await english.click();
  await expect(english).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => languageOf(userId)).toBe('en');
  expect((await context.cookies()).find((c) => c.name === 'mn-lang')?.value).toBe('en');

  await page.getByRole('button', { name: 'Deutsch' }).click();
  await expect.poll(() => languageOf(userId)).toBe('de');
  expect((await context.cookies()).find((c) => c.name === 'mn-lang')?.value).toBe('de');
});

const APPS: [slug: string, port: number, shows: (page: Page) => ReturnType<Page['locator']>][] = [
  ['sportplaner', 8794, (p) => p.getByRole('button', { name: 'Library', exact: true })],
  ['haushalt', 8795, (p) => p.getByRole('button', { name: 'Transactions', exact: true })],
  ['wunschliste', 8796, (p) => p.getByRole('button', { name: 'My list', exact: true })],
  ['medialog', 8797, (p) => p.getByRole('button', { name: 'Collection', exact: true }).first()],
  ['memory', 8798, (p) => p.getByText('Find all eight pairs in as few moves as you can.')],
  ['kalender', 8799, (p) => p.getByRole('button', { name: 'Month', exact: true }).first()],
  ['minensucher', 8800, (p) => p.getByText('Uncover every safe square.')],
  [
    'sudoku',
    8801,
    (p) => p.getByText('Every puzzle is generated fresh and has exactly one solution.'),
  ],
  ['solitaer', 8802, (p) => p.getByText('Move every card to the four foundations.')],
  ['n2048', 8803, (p) => p.getByText('Merge matching tiles until you reach 2048.')],
  ['codeknacker', 8804, (p) => p.getByText('Work out the secret code of four symbols.')],
  [
    'haushalts-inventar',
    8805,
    (p) => p.getByRole('button', { name: 'Inventory', exact: true }).first(),
  ],
];

test('every hosted app follows the language of the profile', async ({ browser }) => {
  test.setTimeout(480_000);
  // The portal mirrors the profile into the cookie when the person signs in; the apps read that.
  await setLanguage(userId, 'en');
  const context = await browser.newContext();
  let signedIn = 0;
  for (const [slug, port, shows] of APPS) {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const app = `http://localhost:${port}`;
    await page.goto(app);
    // One sign-in is enough: the session cookie is shared by all the local gates.
    if (signedIn === 0) {
      await page.getByLabel('E-Mail').fill(email);
      await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
      signedIn++;
    }
    await expect(page).toHaveURL(new RegExp(`^${app}/`));
    await expect(shows(page), `${slug} shows English`).toBeVisible({ timeout: 45_000 });
    expect(errors, slug).toEqual([]);
    await page.close();
  }
  await context.close();
});

test('an app stays German with a German profile', async ({ browser }) => {
  await setLanguage(userId, 'de');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:8794');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bibliothek', exact: true })).toBeVisible();
  await context.close();
});
