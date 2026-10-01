import { expect, type Page, test } from '@playwright/test';
import { admin, cleanup, createApp, createUser, grant, PASSWORD } from './seed.ts';

// Own drawers and order (ADR 0015), personal API keys on the account page (ADR 0014) and the
// upload page in Verwaltung (ADR 0013). The API Worker is not part of the e2e stack, so what
// needs it (saving a key, starting an upload) is covered by unit and database tests instead.
const run = `e2ea${Date.now().toString(36)}`;
const adminEmail = `${run}-admin@example.com`;
const annaEmail = `${run}-anna@example.com`;
const benEmail = `${run}-ben@example.com`;
const names = { a: `Anker ${run}`, b: `Brise ${run}`, c: `Clou ${run}` };

test.beforeAll(async () => {
  await createUser(adminEmail, 'admin', 'Wolfram');
  const anna = await createUser(annaEmail, 'user', 'Anna');
  const ben = await createUser(benEmail, 'user', 'Ben');
  for (const [key, name] of Object.entries(names)) {
    await createApp(`${run}-${key}`, name);
    await grant(anna, `${run}-${key}`);
    await grant(ben, `${run}-${key}`);
  }
  // Two games for the Gaming Hub.
  for (const key of ['g1', 'g2']) {
    await createApp(`${run}-${key}`, `Spiel ${key} ${run}`, {
      manifest: { game: { genre: 'puzzle', players: 'solo', stats: [] } },
    });
    await grant(anna, `${run}-${key}`);
  }
  // A personal-key API used by app a.
  await admin
    .schema('platform')
    .from('api_services')
    .upsert({
      id: `${run}-wetter`,
      name: `Wetterdienst ${run}`,
      base_url: 'https://api.wetter.example.com/v1',
      auth: { type: 'query', param: 'appid' },
      docs_url: 'https://wetter.example.com/keys',
      key_mode: 'personal',
    });
  await admin
    .schema('platform')
    .from('app_api_services')
    .upsert({ app_slug: `${run}-a`, service_id: `${run}-wetter`, reason: 'Wetter anzeigen' });
});

test.afterAll(async () => {
  await admin.schema('platform').from('submissions').delete().like('filename', `${run}%`);
  await admin
    .schema('platform')
    .from('app_api_services')
    .delete()
    .eq('service_id', `${run}-wetter`);
  await admin.schema('platform').from('api_services').delete().eq('id', `${run}-wetter`);
  await cleanup(run);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /(Hallo|Guten \w+), / })).toBeVisible();
}

const tileNames = (page: Page) => page.locator('.tile .tile-title strong');

test('drawers and an own order stay with the account', async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(page, annaEmail);
  const search = page.getByRole('searchbox').or(page.getByPlaceholder(/such/i)).first();
  await search.fill(run).catch(() => undefined);

  // A new drawer from an app's drawer button; the app goes into it.
  await page.getByRole('button', { name: `${names.a} in Schubladen` }).click();
  const dialog = page.getByRole('dialog', { name: `${names.a} in Schubladen` });
  await dialog.getByLabel('Neue Schublade').fill('Alltag');
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Alltag' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Fertig' }).click();

  // The drawer is a filter with its apps; the toolbar fills it with a second one.
  await page.getByRole('button', { name: /^Alltag/ }).click();
  await expect(tileNames(page)).toHaveText([names.a]);
  await page.getByRole('button', { name: 'Apps wählen' }).click();
  await page.getByRole('dialog').getByLabel(names.b).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(tileNames(page)).toHaveCount(2);

  // Own order: move the second app to the front, in this drawer only.
  await page.getByLabel('Sortieren').selectOption({ label: 'Eigene Reihenfolge' });
  await page.getByRole('button', { name: 'Anordnen' }).click();
  await page.getByRole('button', { name: `${names.b} nach vorn` }).click();
  await expect(
    page.locator('[aria-live=polite]').filter({ hasText: 'Position 1 von 2' }),
  ).toBeAttached();
  await page.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(tileNames(page).first()).toHaveText(names.b);

  // After a reload the order, the drawer and its apps are still there.
  await page.reload();
  await page.getByRole('button', { name: /^Alltag/ }).click();
  await expect(tileNames(page).first()).toHaveText(names.b);
  // The "Alle" screen has its own order: untouched.
  await page.getByRole('button', { name: /^Alle/ }).click();
  await expect(tileNames(page).filter({ hasText: run }).first()).toHaveText(names.a);

  // Another account sees none of it.
  await context.clearCookies();
  await signIn(page, benEmail);
  await expect(page.getByRole('button', { name: /^Alltag/ })).toHaveCount(0);
});

test('a personal key is explained on the account page', async ({ page }) => {
  await signIn(page, annaEmail);
  await page.goto(`/account/keys?service=${run}-wetter`);
  const card = page.getByRole('region', { name: `Wetterdienst ${run}` });
  await expect(card).toContainText('Fehlt noch');
  await expect(card).toContainText('Wetter anzeigen');
  await expect(card.getByRole('link', { name: 'wetter.example.com' })).toHaveAttribute(
    'href',
    'https://wetter.example.com/keys',
  );
  await expect(card.getByLabel(`API-Schlüssel für Wetterdienst ${run}`)).toBeVisible();
});

test('the upload page lists uploads and says what is missing', async ({ page }) => {
  await admin
    .schema('platform')
    .from('submissions')
    .insert({
      kind: 'webapp',
      filename: `${run}-sentinel.zip`,
      size_bytes: 123456,
      storage_path: 'x/sentinel.zip',
      status: 'needs_review',
      name: 'Sentinel',
      slug: 'sentinel',
      summary: {
        framework: 'vite',
        reasons: [{ code: 'own_backend', message: 'Der Server beantwortet eigene Anfragen.' }],
      },
    });
  await signIn(page, adminEmail);
  await page.goto('/admin/upload');
  await expect(page.getByRole('heading', { level: 1, name: 'Hochladen' })).toBeVisible();
  const row = page.getByRole('region', { name: `${run}-sentinel.zip` });
  await expect(row).toContainText('Braucht Prüfung');
  await expect(row).toContainText('Der Server beantwortet eigene Anfragen.');
  await expect(row.getByRole('button', { name: 'Prüfauftrag kopieren' })).toBeVisible();

  // The API is not running here: the page says the automatic integration is not set up.
  await page.locator('input[type=file]').setInputFiles({
    name: 'neu.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('PK\u0003\u0004'),
  });
  await expect(page.getByText('noch nicht eingerichtet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hochladen', exact: true })).toBeDisabled();
  // Files of another kind are refused with the allowed types.
  await page.locator('input[type=file]').setInputFiles({
    name: 'notiz.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x'),
  });
  await expect(page.getByRole('alert')).toContainText('ZIP-Dateien');
});

test('the Gaming Hub has its own drawers and order', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, annaEmail);
  await page.goto('/games');
  const game = (key: string) => `Spiel ${key} ${run}`;
  await expect(page.getByRole('link', { name: new RegExp(game('g1')) })).toBeVisible();

  // A drawer with one game, from the game's drawer button.
  await page.getByRole('button', { name: `${game('g1')} in Schubladen` }).click();
  const dialog = page.getByRole('dialog', { name: `${game('g1')} in Schubladen` });
  await dialog.getByLabel('Neue Schublade').fill('Feierabend');
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await dialog.getByRole('button', { name: 'Fertig' }).click();
  await page.getByRole('button', { name: /^Feierabend/ }).click();
  await expect(page.locator('.game-tile .tile-title strong')).toHaveText([game('g1')]);

  // Own order of the genre section: the second game first, kept after a reload.
  await page.getByRole('button', { name: /^Alle/ }).click();
  await page.getByRole('button', { name: 'Anordnen' }).click();
  await page.getByRole('button', { name: `${game('g2')} nach vorn` }).click();
  await page.getByRole('button', { name: 'Fertig', exact: true }).click();
  await page.reload();
  const titles = page.locator('.game-tile .tile-title strong').filter({ hasText: run });
  await expect(titles.first()).toHaveText(game('g2'));
});
