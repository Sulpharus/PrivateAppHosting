import { expect, test } from '@playwright/test';
import { admin, cleanup, createUser, grant, PASSWORD } from './seed.ts';

// Aether Notes: the map of where people live (pins, heat map, towns, who lives near a meetup) and
// the meetup that is handed to the Kalender with its place. Places come from the stored lookup cache
// (no internet needed).
const run = `e2em${Date.now().toString(36)}`;
const AETHER = 'http://localhost:8806';
const KALENDER = 'http://localhost:8799';
const email = `${run}@example.com`;
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
let userId = '';

const contact = (id: string, name: string, address: string) => ({
  id,
  name,
  address,
  tags: [],
  category: 'Freunde',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

test.beforeAll(async () => {
  userId = await createUser(email, 'user', 'Nora');
  await grant(userId, 'aether-notes');
  const db = admin.schema('platform');
  const { data: requests } = await db
    .from('app_type_requests')
    .select('app_slug, type, access')
    .in('app_slug', ['aether-notes', 'kalender']);
  await db.from('app_type_grants').upsert(requests ?? []);
  const rows = [
    ['contacts:c1', contact('c1', 'Erika Muster', 'Marienplatz 1, München')],
    ['contacts:c2', contact('c2', 'Max Beispiel', 'Rathausplatz 1, Augsburg')],
    ['contacts:c3', contact('c3', 'Anna Probe', 'Leopoldstraße 10, München')],
    [
      'meetups:m1',
      {
        id: 'm1',
        contactId: 'c1',
        contactIds: ['c1'],
        title: 'Kaffee mit Erika',
        date: today,
        time: '15:00',
        location: 'Marienplatz 1, München',
        createdAt: Date.now(),
      },
    ],
    [
      'aether_geo',
      {
        'marienplatz 1, münchen': { lat: 48.1374, lon: 11.5755, city: 'München' },
        'leopoldstraße 10, münchen': { lat: 48.1503, lon: 11.5861, city: 'München' },
        'rathausplatz 1, augsburg': { lat: 48.3705, lon: 10.8978, city: 'Augsburg' },
      },
    ],
  ] as const;
  for (const [key, value] of rows) {
    const { error } = await db
      .from('app_kv')
      .insert({ app_slug: 'aether-notes', owner_id: userId, key, value });
    if (error) throw error;
  }
});

test.afterAll(async () => {
  await cleanup(run);
});

test('the map shows where people live, and the meetup reaches the Kalender with its place', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(AETHER);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: /Nora/ })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: /^map Karte/ }).click();
  await expect(page.getByText('3 von 3 Adressen sind auf der Karte.')).toBeVisible();
  await expect(page.locator('.aether-pin')).toHaveCount(3);

  await page.getByRole('button', { name: 'Heatmap' }).click();
  await expect(page.locator('.leaflet-heatmap-layer')).toHaveCount(1);
  await expect(page.locator('.aether-pin')).toHaveCount(0);

  await page.getByRole('button', { name: 'Orte' }).click();
  await expect(page.getByRole('button', { name: /^München\s*2$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Augsburg\s*1$/ })).toBeVisible();

  // Who lives near the meetup place: the two in Munich, not the one in Augsburg.
  await page
    .getByLabel('Mittelpunkt')
    .selectOption({ label: 'Treffen: Kaffee mit Erika (Marienplatz 1, München)' });
  await expect(page.getByText('2 Personen im Umkreis von Marienplatz 1, München')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Route' }).first()).toHaveAttribute(
    'href',
    /openstreetmap\.org\/directions\?engine=fossgis_osrm_car/,
  );
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/aether-karte.png` });

  // The meetup is a record in the Kalender, with the place's point.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .schema('platform')
          .from('records')
          .select('title, place_name, lat, lon')
          .eq('created_by', userId)
          .eq('source_app', 'aether-notes')
          .is('deleted_at', null);
        return data?.[0] ?? null;
      },
      { timeout: 30_000 },
    )
    .toMatchObject({ title: 'Kaffee mit Erika', place_name: 'Marienplatz 1, München' });

  const calendar = await context.newPage();
  await calendar.goto(`${KALENDER}/?view=map&date=${today}`);
  await expect(calendar.locator('.cal-pin:not(.cal-pin--inline)')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(calendar.locator('.cal-map-row', { hasText: 'Kaffee mit Erika' })).toBeVisible();
  expect(errors).toEqual([]);
});
