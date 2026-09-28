import { expect, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/sportplaner behind its local gate: private activities in mn.kv, photos in mn.files.
const run = `e2es${Date.now().toString(36)}`;
const APP = 'http://localhost:8794';
// A 2×2 red PNG, enough for the resize-and-upload path.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==',
  'base64',
);

test.afterAll(async () => {
  await cleanup(run);
});

test('sportplaner stores activities with photos per user', async ({ browser }) => {
  const fiona = `${run}-fiona@example.com`;
  const gus = `${run}-gus@example.com`;
  await createUser(fiona, 'user', 'Fiona');
  await createUser(gus, 'user', 'Gus');

  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(fiona);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(`${APP}/`);
  await expect(page.getByText('Deine Bibliothek ist leer')).toBeVisible();

  await page.getByRole('button', { name: 'Aktivität hinzufügen' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Bouldern');
  await dialog.getByLabel('Sportart').fill('Klettern');
  // Every weekday, so it shows up on today's tiles whatever day the test runs.
  const row = dialog.locator('.trow').first();
  for (const day of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
    const button = row.getByRole('button', { name: day, exact: true });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  }
  await dialog
    .locator('#file')
    .setInputFiles({ name: 'wand.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByText('Titelbild', { exact: true })).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Aktivität anlegen' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Bouldern' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  const tile = page.getByRole('button', { name: /Bouldern/ }).first();
  await expect(tile).toBeVisible();
  // The photo comes back from mn.files as a blob: URL.
  await expect(page.locator('.tile img')).toHaveAttribute('src', /^blob:/);

  await page.getByRole('button', { name: 'Statistik' }).click();
  await expect(page.getByRole('heading', { name: 'Tarife und Mitgliedschaften' })).toBeVisible();
  expect(errors).toEqual([]);

  const other = await (await browser.newContext()).newPage();
  await other.goto(APP);
  await other.getByLabel('E-Mail').fill(gus);
  await other.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await other.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(other.getByText('Deine Bibliothek ist leer')).toBeVisible();

  // A hostile or broken backup: fractional weekday, numeric name, script URL, bad dates, an
  // unknown tariff unit. It must import cleanly and keep rendering after a reload.
  const otherErrors: string[] = [];
  other.on('pageerror', (error) => otherErrors.push(error.message));
  const backup = {
    app: 'sport-planner',
    version: 2,
    activities: [
      {
        id: 'bad-1',
        name: 42,
        provider: 7,
        website: 'javascript:alert(1)',
        slots: [{ kind: 'weekly', days: [2.5, 3], start: '18:00' }],
        done: ['2026-01-05', '"><img src=x onerror=alert(1)>'],
        planned: { mode: 'weekly', days: ['x', 1.5], every: 9 },
      },
    ],
    plans: [
      {
        id: 'plan-1',
        name: 'Karte',
        type: 'recurring',
        unit: 'fortnight',
        every: 2,
        amount: 'x',
        activities: ['bad-1'],
      },
    ],
    photos: {},
  };
  await other.getByRole('button', { name: 'Bibliothek' }).click();
  await other.locator('#importfile').setInputFiles({
    name: 'sicherung.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(other.getByText('1 Aktivität und 1 Tarif importiert.')).toBeVisible();
  await other.reload();
  await other.getByRole('button', { name: 'Bibliothek' }).click();
  await expect(other.getByRole('heading', { name: '42', exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Statistik' }).click();
  await expect(other.getByRole('button', { name: /Karte/ })).toBeVisible();
  expect(otherErrors).toEqual([]);
});
