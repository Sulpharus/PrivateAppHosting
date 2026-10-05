import { expect, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

// The map view of the Kalender: events with a place as numbered pins, the way between them and a
// warning when the time between two appointments is too short. The routing service is answered by
// the test (no internet needed), places come with their coordinates.
const run = `e2ek${Date.now().toString(36)}`;
const KALENDER = 'http://localhost:8799';
const email = `${run}@example.com`;
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

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

test('events with a place show on the map with the way between them', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/routed-car/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        routes: [
          {
            duration: 3600,
            distance: 62_000,
            geometry: {
              coordinates: [
                [11.575, 48.137],
                [10.898, 48.371],
              ],
            },
          },
        ],
      }),
    }),
  );
  await page.goto(`${KALENDER}/?view=day&date=${today}`);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Termin anlegen' }).first()).toBeVisible();

  // Two events: Munich 10:00-11:00, Augsburg 11:30-12:30 (an hour's drive: not possible).
  await page.evaluate(
    async ({ day }) => {
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
      await events.upsert({
        title: 'Besprechung München',
        starts_at: at(10, 0),
        ends_at: at(11, 0),
        place_name: 'Marienplatz, München',
        lat: 48.137,
        lon: 11.575,
      });
      await events.upsert({
        title: 'Kundentermin Augsburg',
        starts_at: at(11, 30),
        ends_at: at(12, 30),
        place_name: 'Rathausplatz, Augsburg',
        lat: 48.371,
        lon: 10.898,
      });
    },
    { day: today },
  );
  await page.reload();

  await page.getByRole('button', { name: 'Karte' }).first().click();
  await expect(page.locator('.cal-pin:not(.cal-pin--inline)')).toHaveCount(2, { timeout: 20_000 });
  await expect(page.locator('.cal-map-row', { hasText: 'Besprechung München' })).toBeVisible();
  await expect(page.locator('.cal-map-row', { hasText: 'Kundentermin Augsburg' })).toBeVisible();

  // The way between them: an hour by car, but only 30 minutes between the two events.
  await expect(
    page.getByText(/Nicht zu schaffen: 1 Std\. 0 Min\. Weg, nur 30 Min\. Zeit/),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: 'Navigation öffnen' }).first()).toHaveAttribute(
    'href',
    /openstreetmap\.org\/directions\?engine=fossgis_osrm_car/,
  );
  await expect(page.getByText(/Unterwegs insgesamt: 1 Std\. 0 Min\./)).toBeVisible();

  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/kalender-karte.png` });

  // With a bicycle the engine changes; the choice is kept.
  await page.getByLabel('Fortbewegung').selectOption('foot');
  await expect(page.getByLabel('Fortbewegung')).toHaveValue('foot');

  // Map style and period are chosen and kept.
  await page.getByLabel('Kartenstil').selectOption('topo');
  await page.getByRole('button', { name: '7 Wochen' }).click();
  await page.waitForTimeout(1500); // the choices are saved a moment after the click
  await page.reload();
  await expect(page.getByLabel('Kartenstil')).toHaveValue('topo');
  expect(errors).toEqual([]);
});
