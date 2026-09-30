import { type Browser, expect, type Page, test } from '@playwright/test';
import { admin, cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/kalender behind its local gate: own events (single and recurring), a sport session
// from another app as a source, and a calendar shared with a second person who may only look.
const run = `e2ek${Date.now().toString(36)}`;
const APP = 'http://localhost:8799';
const shots = process.env.SCREENSHOT_DIR;
const WEEK = '2030-03-04'; // a Monday, far from real data
const people = {
  lena: { email: `${run}-lena@example.com`, name: `Lena ${run}` },
  tom: { email: `${run}-tom@example.com`, name: `Tom ${run}` },
};
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  for (const [key, p] of Object.entries(people))
    ids[key] = await createUser(p.email, 'user', p.name);
  const db = admin.schema('platform');
  // The admin approves what the calendar asked for (registered by `mininode dev`).
  const { data: requests, error } = await db
    .from('app_type_requests')
    .select('type, access')
    .eq('app_slug', 'kalender');
  if (error) throw error;
  await db
    .from('app_type_grants')
    .upsert(
      (requests ?? []).map((r) => ({ app_slug: 'kalender', type: r.type, access: r.access })),
    );
  // A session the Sportplaner wrote into Lena's sport collection.
  await db.from('apps').upsert({
    slug: 'sportplaner',
    name: 'Sportplaner',
    description: 'x',
    kind: 'static',
    target: 'cloudflare',
    manifest: {},
    status: 'online',
  });
  const { data: sport, error: sportError } = await db
    .from('collections')
    .insert({ name: 'Mein Sport', family: 'sport', owner_id: ids.lena, personal: true })
    .select('id')
    .single();
  if (sportError) throw sportError;
  await db
    .from('collection_members')
    .insert({ collection_id: sport.id, user_id: ids.lena, role: 'owner' });
  const { error: recordError } = await db.from('records').insert({
    type: 'activity',
    collection_id: sport.id,
    title: 'Bouldern',
    starts_at: '2030-03-06T17:00:00Z',
    ends_at: '2030-03-06T19:00:00Z',
    data: { sport: 'Klettern' },
    source_app: 'sportplaner',
    created_by_app: 'sportplaner',
    created_by: ids.lena,
  });
  if (recordError) throw recordError;
});

test.afterAll(async () => {
  await cleanup(run);
});

async function signedIn(browser: Browser, email: string, path: string): Promise<Page> {
  const page = await (await browser.newContext({ timezoneId: 'Europe/Berlin' })).newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto(`${APP}${path}`);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${APP}/`));
  return page;
}

async function newEvent(
  page: Page,
  event: { title: string; date: string; from: string; to: string; repeat?: string },
) {
  await page.getByRole('button', { name: 'Termin anlegen' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Neuer Termin' });
  await dialog.getByLabel('Titel').fill(event.title);
  await dialog.getByLabel('Beginn', { exact: true }).fill(event.date);
  await dialog.getByLabel('Uhrzeit Beginn').fill(event.from);
  await dialog.getByLabel('Ende', { exact: true }).fill(event.date);
  await dialog.getByLabel('Uhrzeit Ende').fill(event.to);
  if (event.repeat) await dialog.getByLabel('Wiederholen').selectOption({ label: event.repeat });
  await dialog.getByLabel('Erinnerung').selectOption({ label: '1 Stunde vorher' });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
}

test('calendar: own events, series, sources and a shared calendar', async ({ browser }) => {
  test.setTimeout(150_000);
  const lena = await signedIn(browser, people.lena.email, `/?view=week&date=${WEEK}`);
  await expect(lena.getByRole('heading', { level: 1, name: '4. März – 10. März' })).toBeVisible();

  // Another app's session shows up and can be hidden.
  const bouldern = lena.getByRole('button', { name: /^Bouldern, Mi\., 6\. März, 18:00–20:00/ });
  await expect(bouldern).toBeVisible();
  await bouldern.click();
  const detail = lena.getByRole('dialog', { name: 'Bouldern' });
  await expect(detail.getByRole('link', { name: 'In Sportplaner öffnen' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Schließen' }).click();
  await lena
    .getByRole('button', { name: /Sportplaner · Sporteinheit/ })
    .first()
    .click();
  await expect(bouldern).toBeHidden();
  await lena
    .getByRole('button', { name: /Sportplaner · Sporteinheit/ })
    .first()
    .click();
  await expect(bouldern).toBeVisible();

  // A single event and a weekly series.
  await newEvent(lena, { title: 'Zahnarzt', date: '2030-03-05', from: '10:00', to: '11:00' });
  await expect(
    lena.getByRole('button', { name: /^Zahnarzt, Di\., 5\. März, 10:00–11:00/ }),
  ).toBeVisible();
  await newEvent(lena, {
    title: 'Chor',
    date: '2030-03-07',
    from: '19:00',
    to: '21:00',
    repeat: 'Wöchentlich',
  });
  await lena.goto(`${APP}/?view=list&date=${WEEK}`);
  await expect(lena.getByRole('button', { name: /^Chor/ })).toHaveCount(6);
  if (shots) await lena.screenshot({ path: `${shots}/kalender-list.png`, fullPage: true });

  // Deleting one occurrence keeps the rest of the series.
  await lena.getByRole('button', { name: /^Chor/ }).nth(1).click();
  const chor = lena.getByRole('dialog', { name: 'Chor' });
  await chor.getByRole('button', { name: 'Löschen' }).click();
  await chor.getByRole('button', { name: 'Zum Löschen erneut tippen' }).click();
  await lena.getByRole('button', { name: 'Nur dieser Termin' }).click();
  await expect(lena.getByText('Termin gelöscht')).toBeVisible();
  await expect(lena.getByRole('button', { name: /^Chor/ })).toHaveCount(5);

  // A shared calendar: Tom may look, not edit.
  await lena.getByRole('button', { name: 'Kalender verwalten' }).click();
  await lena.getByRole('button', { name: 'Neuer Kalender' }).click();
  const create = lena.getByRole('dialog', { name: 'Neuer Kalender' });
  await create.getByLabel('Name').fill('Familie');
  await create.getByRole('button', { name: 'Anlegen' }).click();
  await expect(lena.getByText('Kalender angelegt')).toBeVisible();
  await lena.getByRole('button', { name: 'Kalender verwalten' }).click();
  const manage = lena.getByRole('dialog', { name: 'Kalender und Apps' });
  const family = manage.locator('.cal-src', { hasText: 'Familie' });
  await family.getByText('Anpassen').click();
  await family.getByRole('button', { name: 'Mitglieder' }).click();
  await lena.getByLabel(`Zugriff für ${people.tom.name}`).selectOption('viewer');
  await expect(lena.getByText(`${people.tom.name} hinzugefügt`)).toBeVisible();
  await lena.getByRole('button', { name: 'Fertig' }).click();

  await lena.goto(`${APP}/?view=week&date=${WEEK}`);
  await lena.getByRole('button', { name: 'Termin anlegen' }).first().click();
  const dialog = lena.getByRole('dialog', { name: 'Neuer Termin' });
  await dialog.getByLabel('Titel').fill('Oma besuchen');
  await dialog.getByLabel('Ganztägig').check();
  await dialog.getByLabel('Beginn', { exact: true }).fill('2030-03-09');
  await dialog.getByLabel('Ende', { exact: true }).fill('2030-03-09');
  await dialog
    .getByRole('combobox', { name: 'Kalender', exact: true })
    .selectOption({ label: 'Familie (geteilt)' });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(
    lena.getByRole('button', { name: /^Oma besuchen, Sa\., 9\. März, ganztägig/ }),
  ).toBeVisible();
  if (shots) {
    await lena.screenshot({ path: `${shots}/kalender-week.png` });
    await lena.goto(`${APP}/?view=month&date=${WEEK}`);
    await expect(lena.getByRole('grid', { name: 'März 2030' })).toBeVisible();
    await lena.screenshot({ path: `${shots}/kalender-month.png` });
    await lena.emulateMedia({ colorScheme: 'dark' });
    await lena.screenshot({ path: `${shots}/kalender-month-dark.png` });
    await lena.emulateMedia({ colorScheme: 'light' });
    await lena.setViewportSize({ width: 390, height: 844 });
    await lena.goto(`${APP}/?view=month&date=2030-03-07`);
    await expect(
      lena.getByRole('heading', { level: 2, name: /Donnerstag, 7\. März/ }),
    ).toBeVisible();
    await lena.screenshot({ path: `${shots}/kalender-phone-month.png`, fullPage: true });
    await lena.goto(`${APP}/?view=week&date=${WEEK}`);
    await lena.screenshot({ path: `${shots}/kalender-phone-week.png` });
    await lena.getByRole('button', { name: /^Chor/ }).first().click();
    await lena.screenshot({ path: `${shots}/kalender-phone-detail.png` });
  }

  const tom = await signedIn(browser, people.tom.email, `/?view=week&date=${WEEK}`);
  const oma = tom.getByRole('button', { name: /^Oma besuchen/ });
  await expect(oma).toBeVisible();
  await expect(tom.getByRole('button', { name: /^Zahnarzt/ })).toHaveCount(0);
  await oma.click();
  const visit = tom.getByRole('dialog', { name: 'Oma besuchen' });
  await expect(visit.getByText('Diesen Kalender kannst du nur ansehen.')).toBeVisible();
  await expect(visit.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
});
