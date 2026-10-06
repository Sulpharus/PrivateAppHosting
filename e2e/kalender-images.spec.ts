import { expect, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

// Pictures of entries in the Kalender: in the list and (for entries longer than an hour) in the
// day, each with its own switch; on the map several entries at one place become one numbered pin
// with a list, a single entry with a picture is its own pin.
const run = `e2ei${Date.now().toString(36)}`;
const KALENDER = 'http://localhost:8799';
const email = `${run}@example.com`;
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeAll(async () => {
  await createUser(email, 'user', 'Mona');
  const db = admin.schema('platform');
  const { data: requests } = await db
    .from('app_type_requests')
    .select('app_slug, type, access')
    .eq('app_slug', 'kalender');
  await db.from('app_type_grants').upsert(requests ?? []);
});

test.afterAll(async () => {
  await cleanup(run);
});

test('pictures in list and day with switches, clusters and picture pins on the map', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${KALENDER}/?view=day&date=${today}`);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Termin anlegen' }).first()).toBeVisible();

  await page.evaluate(
    async ({ day, png }) => {
      const mn = await (
        window as unknown as {
          mininode: {
            mininode(): Promise<{
              suite: {
                type(t: string): { upsert(fields: Record<string, unknown>): Promise<unknown> };
              };
            }>;
          };
        }
      ).mininode.mininode();
      const at = (h: number, m: number) =>
        new Date(
          `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
        ).toISOString();
      const events = mn.suite.type('event');
      // two entries at the same address (one long, one short), both with a picture
      await events.upsert({
        title: 'Lange Besprechung',
        starts_at: at(10, 0),
        ends_at: at(12, 0),
        place_name: 'Marienplatz, München',
        lat: 48.137,
        lon: 11.575,
        data: { image: png },
      });
      await events.upsert({
        title: 'Kurzer Anruf',
        starts_at: at(12, 0),
        ends_at: at(12, 30),
        place_name: 'Marienplatz, München',
        lat: 48.137,
        lon: 11.575,
        data: { image: png },
      });
      // one entry alone at its place, with a picture, longer than an hour
      await events.upsert({
        title: 'Workshop Augsburg',
        starts_at: at(14, 0),
        ends_at: at(16, 0),
        place_name: 'Rathausplatz, Augsburg',
        lat: 48.371,
        lon: 10.898,
        data: { image: png },
      });
      // no picture
      await events.upsert({
        title: 'Abendessen Nürnberg',
        starts_at: at(18, 0),
        ends_at: at(19, 0),
        place_name: 'Hauptmarkt, Nürnberg',
        lat: 49.454,
        lon: 11.077,
      });
    },
    { day: today, png: PNG },
  );
  await page.reload();

  // day: pictures only for entries longer than an hour (two of the three with a picture)
  await expect(page.locator('.cal-ev-img')).toHaveCount(2, { timeout: 20_000 });
  await expect(
    page.locator('.cal-ev', { hasText: 'Kurzer Anruf' }).locator('.cal-ev-img'),
  ).toHaveCount(0);
  const daySwitch = page.getByRole('switch', { name: 'Bilder' });
  await expect(daySwitch).toHaveAttribute('aria-checked', 'true');
  await daySwitch.click();
  await expect(page.locator('.cal-ev-img')).toHaveCount(0);
  await expect(daySwitch).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(1500); // the choice is saved a moment after the click
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Bilder' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.locator('.cal-ev-img')).toHaveCount(0);

  // list: its own switch, still on, every entry with a picture shows it
  await page.goto(`${KALENDER}/?view=list&date=${today}`);
  await expect(page.locator('.cal-row-img')).toHaveCount(3, { timeout: 20_000 });
  const listSwitch = page.getByRole('switch', { name: 'Bilder' });
  await expect(listSwitch).toHaveAttribute('aria-checked', 'true');
  await listSwitch.click();
  await expect(page.locator('.cal-row-img')).toHaveCount(0);

  // map: the two at the same address are one pin with their number and a list
  await page.goto(`${KALENDER}/?view=map&date=${today}`);
  const cluster = page.locator('.cal-pin--cluster');
  await expect(cluster).toHaveCount(1, { timeout: 30_000 });
  await expect(cluster).toHaveText('2');
  // alone with a picture: the picture is the pin; without: the numbered pin
  await expect(page.locator('.cal-pin--img img')).toHaveCount(1);
  await expect(
    page.locator('.cal-pin:not(.cal-pin--inline):not(.cal-pin--cluster):not(.cal-pin--img)'),
  ).toHaveCount(1);
  await cluster.click();
  await expect(page.locator('.cal-map-cl-row')).toHaveCount(2);
  await expect(page.locator('.cal-map-cl-row', { hasText: 'Lange Besprechung' })).toBeVisible();
  await expect(page.locator('.cal-map-cl-row', { hasText: 'Kurzer Anruf' })).toBeVisible();
  await page.locator('.cal-map-cl-row', { hasText: 'Kurzer Anruf' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/kalender-bilder.png` });
  expect(errors).toEqual([]);
});
