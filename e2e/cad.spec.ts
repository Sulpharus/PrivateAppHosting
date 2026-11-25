import { expect, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// hosted/cad behind its local gate: draw a plate with typed sizes, extrude it to 3D, cut a hole,
// export STL, make views from the model, and find everything again after a reload.
const run = `e2ecad${Date.now().toString(36)}`;
const APP = 'http://localhost:8808';
const shots = process.env.SCREENSHOT_DIR;
const email = `${run}@example.com`;

test.beforeAll(async () => {
  await createUser(email, 'user', `Cad ${run}`);
});

test.afterAll(async () => {
  await cleanup(run);
});

test('cad: drawing, 3D with a hole, export and views', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
  await expect(page.getByText('Noch keine Projekte')).toBeVisible();

  // A new drawing project.
  await page.getByRole('button', { name: 'Erstes Projekt anlegen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neues Projekt' });
  await dialog.getByLabel('Name').fill('Platte');
  await dialog.getByRole('button', { name: 'Zeichnung', exact: true }).click();
  await dialog.getByRole('button', { name: 'Projekt anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Platte' })).toBeVisible();

  // A rectangle 80 × 40 by typed coordinates.
  await page.getByRole('button', { name: 'Rechteck' }).first().click();
  const coord = page.getByLabel('Koordinate oder Maß eingeben');
  await coord.fill('0,0');
  await coord.press('Enter');
  await coord.fill('@80,40');
  await coord.press('Enter');
  await expect(page.locator('#subtitle')).toHaveText('1 Zeichenelement · 0 Körper');
  await expect(page.locator('.cad-panel')).toContainText('80 × 40 mm');

  // Extrude it, add a hole, read the volume.
  await page.getByRole('button', { name: '3D-Modell' }).click();
  await page.getByRole('button', { name: 'Extrudieren' }).first().click();
  await page.getByRole('dialog').getByLabel('Höhe (mm)').fill('5');
  await page.getByRole('button', { name: 'Körper erzeugen' }).click();
  await page.getByRole('button', { name: 'Bohrung' }).first().click();
  await expect(page.locator('.cad-panel').getByLabel('Radius (mm)')).toBeVisible();
  await expect(page.locator('#subtitle')).toHaveText('1 Zeichenelement · 2 Körper');
  // Escape clears the selection: the panel shows the whole model.
  await page.keyboard.press('Escape');
  await expect(page.locator('.cad-panel')).toContainText('80 × 40 × 5 mm');
  if (shots) await page.screenshot({ path: `${shots}/cad-3d.png`, fullPage: true });

  // A true ISO thread (M6 bolt) next to the plate, in steel, shown in the realistic view.
  await page.getByRole('button', { name: 'Gewinde' }).first().click();
  const threadDialog = page.getByRole('dialog', { name: 'Gewinde' });
  await threadDialog.getByRole('button', { name: 'Außengewinde' }).click();
  await threadDialog.getByLabel('Größe (ISO metrisch)').selectOption('6');
  await threadDialog.getByRole('button', { name: 'Gewinde erzeugen' }).click();
  await expect(page.locator('#subtitle')).toHaveText('1 Zeichenelement · 3 Körper');
  await expect(page.locator('.cad-panel')).toContainText('M6×1');
  await page.locator('.cad-panel').getByLabel('Material').selectOption('steel');
  await page.getByRole('button', { name: 'Realistisch' }).click();
  await expect(page.getByRole('button', { name: 'Realistisch' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // STL export of the combined model.
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /STL für den 3D-Drucker/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Platte.stl');

  // Views from the 3D model land in the drawing.
  await page.getByRole('button', { name: 'Zeichnung aus 3D' }).click();
  await page.getByRole('button', { name: 'Ansichten erzeugen' }).click();
  await expect(page.getByText('Ansichten erzeugt')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Zeichnung', exact: true }).first(),
  ).toHaveAttribute('aria-pressed', 'true');

  // Everything is still there after a reload.
  await expect(page.locator('.cad-save')).toHaveText('Gespeichert');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Platte' })).toBeVisible();
  await expect(page.locator('#subtitle')).toContainText('3 Körper');

  // The print view shows the sheet.
  await page.getByRole('button', { name: 'Drucken' }).first().click();
  await expect(page.getByRole('img', { name: 'Vorschau des Zeichenblatts' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/cad-print.png`, fullPage: true });
});
