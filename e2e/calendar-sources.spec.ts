import { type Browser, expect, type Page, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

// Other apps' dates in the Kalender: the Sportplaner writes planned sessions, the Haushalt the
// coming payments of fixed costs (shared suite records, ADR 0002).
const run = `e2ec${Date.now().toString(36)}`;
const KALENDER = 'http://localhost:8799';
const SPORT = 'http://localhost:8794';
const HAUSHALT = 'http://localhost:8795';
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const today = `${month}-${pad(now.getDate())}`;
let userId = '';

test.beforeAll(async () => {
  userId = await createUser(`${run}-ida@example.com`, 'user', 'Ida');
  // The admin approves what the three apps asked for (registered by `mininode dev`).
  const db = admin.schema('platform');
  const { data: requests, error } = await db
    .from('app_type_requests')
    .select('app_slug, type, access')
    .in('app_slug', ['kalender', 'sportplaner', 'haushalt']);
  if (error) throw error;
  await db.from('app_type_grants').upsert(requests ?? []);
  // A weekly Sportplaner offer, planned every day at 18:00.
  const { error: kvError } = await db.from('app_kv').insert({
    app_slug: 'sportplaner',
    owner_id: userId,
    key: `act:${run}`,
    value: {
      id: run,
      name: 'Schwimmen',
      category: 'Schwimmen',
      slots: [{ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '19:00' }],
      planned: { mode: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], every: 1 },
    },
  });
  if (kvError) throw kvError;
});

test.afterAll(async () => {
  await cleanup(run);
});

async function open(browser: Browser, url: string): Promise<Page> {
  const page = await (await browser.newContext({ timezoneId: 'Europe/Berlin' })).newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto(url);
  await page.getByLabel('E-Mail').fill(`${run}-ida@example.com`);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${new URL(url).origin}/`));
  return page;
}

/** Waits until a record written in the background by an app exists. */
async function recordFrom(app: string, title: string) {
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .schema('platform')
          .from('records')
          .select('id')
          .eq('created_by', userId)
          .eq('source_app', app)
          .eq('title', title)
          .is('deleted_at', null);
        return data?.length ?? 0;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
}

test('the Kalender shows the Sportplaner and Haushalt dates', async ({ browser }) => {
  test.setTimeout(150_000);

  // Sportplaner: opening it is enough, planned sessions are written in the background.
  const sport = await open(browser, SPORT);
  await expect(sport.getByText('Schwimmen').first()).toBeVisible();
  await recordFrom('sportplaner', 'Schwimmen');

  // Haushalt: a fixed cost due on the 1st of every month.
  const hh = await open(browser, HAUSHALT);
  await hh.getByRole('button', { name: 'Planung' }).first().click();
  await hh.getByRole('button', { name: 'Fixkosten hinzufügen' }).first().click();
  const dialog = hh.getByRole('dialog');
  await dialog.getByLabel('Beschreibung', { exact: true }).fill('Miete');
  await dialog.getByLabel('Betrag in €').fill('950');
  await dialog.getByLabel('Erste Buchung').fill(month);
  await dialog.getByLabel('Am Tag').fill('1');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  await recordFrom('haushalt', 'Miete');

  // The Kalender: both apps appear as sources, with their dates.
  const cal = await open(browser, `${KALENDER}/?view=list&date=${today}`);
  await expect(cal.getByRole('button', { name: /^Schwimmen/ }).first()).toBeVisible();
  await expect(cal.getByRole('button', { name: /^Miete/ }).first()).toBeVisible();
  await expect(
    cal.getByRole('button', { name: /Sportplaner · Sporteinheit/ }).first(),
  ).toBeVisible();
  await expect(cal.getByRole('button', { name: /Haushalt · Vertrag/ }).first()).toBeVisible();
  await cal
    .getByRole('button', { name: /^Miete/ })
    .first()
    .click();
  const detail = cal.getByRole('dialog', { name: 'Miete' });
  await expect(detail.getByText(/950,00/)).toBeVisible();
  await expect(detail.getByRole('link', { name: 'In Haushalt öffnen' })).toBeVisible();
});
