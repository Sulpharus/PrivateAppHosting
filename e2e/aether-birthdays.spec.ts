import { expect, test } from '@playwright/test';
import { admin, cleanup, createUser, grant, PASSWORD } from './seed.ts';

// Aether Notes hands the birthdays of contacts and people to the Kalender as yearly all-day events
// ("birthday:c:<id>"), unless the person switches them off in the settings.
const run = `e2ebd${Date.now().toString(36)}`;
const AETHER = 'http://localhost:8806';
const email = `${run}@example.com`;
let userId = '';

const contact = (id: string, name: string, birthday?: string) => ({
  id,
  name,
  ...(birthday ? { birthday } : {}),
  tags: [],
  category: 'Freunde',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const records = async () =>
  (
    await admin
      .schema('platform')
      .from('records')
      .select('title, source_key, starts_at, data')
      .eq('created_by', userId)
      .eq('source_app', 'aether-notes')
      .like('source_key', 'birthday:%')
      .is('deleted_at', null)
      .order('source_key')
  ).data ?? [];

test.beforeAll(async () => {
  userId = await createUser(email, 'user', 'Birte');
  await grant(userId, 'aether-notes');
  const db = admin.schema('platform');
  const { data: requests } = await db
    .from('app_type_requests')
    .select('app_slug, type, access')
    .eq('app_slug', 'aether-notes');
  await db.from('app_type_grants').upsert(requests ?? []);
  const rows = [
    ['contacts:c1', contact('c1', 'Erika Muster', '1990-03-14')],
    ['contacts:c2', contact('c2', 'Max Beispiel', '02-29')],
    ['contacts:c3', contact('c3', 'Anna Probe', '02-30')],
    ['contacts:c4', contact('c4', 'Ohne Datum')],
    ['contacts:c5', { ...contact('c5', 'Nur Privat', '05-05'), birthdayShared: false }],
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

test('birthdays of contacts reach the Kalender, and leave it when switched off', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const page = await (await browser.newContext({ timezoneId: 'Europe/Berlin' })).newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(AETHER);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: /Birte/ })).toBeVisible({
    timeout: 30_000,
  });

  // Two valid ones; the 30 February, the contact without a date and the private one are left out.
  await expect
    .poll(async () => (await records()).map((r) => r.source_key), {
      timeout: 30_000,
    })
    .toEqual(['birthday:c:c1', 'birthday:c:c2']);
  const [erika] = await records();
  expect(erika).toMatchObject({
    title: 'Erika Muster',
    data: { all_day: true, recurrence: { rrule: 'FREQ=YEARLY' }, color: 'rose' },
  });
  // Local midnight of the person's time zone: in Berlin that is the evening before in UTC.
  expect(
    new Date(erika?.starts_at ?? '').toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }),
  ).toBe('1990-03-14');

  // Switched off in the settings: the records go again.
  await page.getByRole('button', { name: /^settings Bereichs-Einstellungen/ }).click();
  await page.getByLabel('Geburtstage im Kalender zeigen').uncheck();
  await expect.poll(async () => (await records()).length, { timeout: 30_000 }).toBe(0);
  expect(errors).toEqual([]);
});
