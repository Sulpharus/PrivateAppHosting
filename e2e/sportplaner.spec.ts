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
  await dialog
    .locator('#file')
    .setInputFiles({ name: 'wand.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByText('Titelbild', { exact: true })).toBeVisible({ timeout: 15_000 });
  // Step 2: every weekday, so it shows up on today's tiles whatever day the test runs.
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  const row = dialog.locator('.trow').first();
  for (const day of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
    const button = row.getByRole('button', { name: day, exact: true });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  }
  await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
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
  await expect(other.locator('.prow', { hasText: 'Karte' })).toBeVisible();
  expect(otherErrors).toEqual([]);
});

test('a course plans every session; cancelled sessions count nowhere', async ({ browser }) => {
  const hana = `${run}-hana@example.com`;
  await createUser(hana, 'user', 'Hana');
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(hana);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByText('Deine Bibliothek ist leer')).toBeVisible();

  // The course started two days ago and runs one week, every day.
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const start = day(-2);
  await page.getByRole('button', { name: 'Aktivität hinzufügen' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Yoga-Kurs');
  await dialog.getByRole('button', { name: 'Weiter', exact: true }).click();
  await dialog.getByRole('button', { name: 'Kurs', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Kurs', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByLabel('Kursbeginn').fill(start);
  await dialog.getByLabel('Kurslänge in Wochen').fill('2');
  await expect(dialog.getByLabel('Kursende')).toHaveValue(day(11));
  // Correcting the end afterwards wins over the length.
  await dialog.getByLabel('Kursende').fill(day(4));
  await expect(dialog.getByLabel('Kurslänge in Wochen')).toHaveValue('1');
  const row = dialog.locator('#coursebox .trow').first();
  for (const d of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
    const button = row.getByRole('button', { name: d, exact: true });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  }
  await row.getByLabel('Beginn').fill('18:00');
  await expect(dialog.getByText(/7 Termine vom .* Du bist für alle eingeplant\./)).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(
    dialog.getByText(/Kurs: Du bist automatisch für alle Termine eingeplant/),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Kurs: alle 7 Termine')).toBeVisible();

  // Editing and saving unchanged keeps the course as it was.
  await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Kursende')).toHaveValue(day(4));
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Kurs: alle 7 Termine')).toBeVisible();
  await page.keyboard.press('Escape');

  // Today's session was cancelled: not attended, not missed.
  await page
    .getByRole('button', { name: /Yoga-Kurs/ })
    .first()
    .click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: 'Ausgefallen' }).click();
  await expect(detail.getByRole('button', { name: 'Ausgefallen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(detail.getByText(/Nicht stattgefunden/)).toBeVisible();
  await expect(detail.getByText('Kurs: alle 7 Termine, 1 ausgefallen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tile-off')).toHaveText('Ausgefallen');

  // Planned so far this year: the days before today (today is cancelled).
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const past = [day(-2), day(-1)].filter((d) => d >= yearStart).length;
  await page.getByRole('button', { name: 'Statistik' }).click();
  await expect(
    page.getByText(
      past ? `Teilnahme: 0 von ${past} geplanten Terminen` : 'Teilnahme an geplanten Terminen',
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('addresses are checked and shown on the map', async ({ browser }) => {
  const nora = `${run}-nora@example.com`;
  await createUser(nora, 'user', 'Nora');
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Address search and map tiles are faked: the test needs no internet.
  await page.route('**/proxy/nominatim/**', (route) => {
    const cors = {
      'access-control-allow-origin': APP,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const hits = q.startsWith('Nirgendwo')
      ? []
      : [
          {
            lat: '48.1731',
            lon: '11.5465',
            display_name: 'Olympiapark, 80809 München, Deutschland',
          },
        ];
    return route.fulfill({ json: hits, headers: cors });
  });
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: PNG }),
  );
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(nora);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByText('Deine Bibliothek ist leer')).toBeVisible();

  await page.getByRole('button', { name: 'Aktivität hinzufügen' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Beachvolleyball');
  await dialog.getByRole('button', { name: '4 Details' }).click();
  // An address that does not exist blocks saving.
  await dialog.getByLabel('Adresse').fill('Nirgendwo 999');
  await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(
    dialog.getByText('Diese Adresse wurde nicht gefunden.', { exact: false }),
  ).toBeVisible();
  await dialog.getByLabel('Adresse').fill('Spiridon-Louis-Ring 21, München');
  await dialog.getByRole('button', { name: 'Adresse jetzt prüfen' }).click();
  await expect(dialog.getByText('Gefunden: Olympiapark, 80809 München')).toBeVisible();
  await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Beachvolleyball' }),
  ).toBeVisible();

  // From the detail view straight to its pin on the map.
  await page.getByRole('dialog').getByRole('button', { name: 'Auf der Karte zeigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Karte' })).toBeVisible();
  await expect(page.getByText('1 Angebot mit Adresse')).toBeVisible();
  await expect(page.locator('.pin')).toHaveCount(1);
  await expect(page.locator('.map-pop').getByText('Beachvolleyball')).toBeVisible();
  expect(errors).toEqual([]);
});
