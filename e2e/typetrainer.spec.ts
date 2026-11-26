import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, grant, PASSWORD } from './seed.ts';

// hosted/typetrainer behind its local gate: the first lesson is typed to the end (with one
// mistake), the run lands in the statistics and unlocks level 2 in the learning tree, an own text
// is kept in its table, and the layout setting survives a reload.
const run = `e2ett${Date.now().toString(36)}`;
const APP = 'http://localhost:8808';

test.afterAll(async () => {
  await cleanup(run);
});

async function signIn(page: Page, email: string) {
  await page.goto(APP);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(`${APP}/`);
}

/** The text of the running lesson, as the person has to type it (indentation is filled in). */
async function lessonText(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.tt-text span')]
      .map((s) =>
        s.className.includes('s-auto') ? '' : s.classList.contains('nl') ? '\n' : s.textContent,
      )
      .join(''),
  );
}

test('typetrainer: a lesson, its statistics, an own text and the layout', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `${run}-tina@example.com`;
  await grant(await createUser(email, 'user', 'Tina'), 'typetrainer');
  await signIn(page, email);

  await expect(page.getByRole('heading', { name: 'Neue Tasten: F J' })).toBeVisible();
  await page.getByRole('button', { name: 'Lektion starten' }).click();
  await expect(page.locator('.tt-kbd .next')).toHaveCount(1);
  await expect(page.getByText('Nächste Taste: f · linker Zeigefinger')).toBeVisible();
  const text = await lessonText(page);
  await page.keyboard.type('x');
  await expect(page.locator('.tt-text .s-wrong')).toHaveCount(1);
  await page.keyboard.type(text, { delay: 15 });
  await expect(page.getByRole('heading', { name: 'Geschafft' })).toBeVisible();
  await expect(page.locator('.tt-result')).toContainText('1 Fehler');
  await page.getByRole('button', { name: 'Zur Übersicht' }).click();

  await page.getByRole('link', { name: 'Statistik' }).filter({ visible: true }).first().click();
  await expect(page.getByText('1 Übung in diesem Jahr')).toBeVisible();
  await expect(page.getByText('QWERTZ · Grundlagen · Stufe 1')).toBeVisible();

  // The learning tree: the basics first, the branches open after them.
  await page.getByRole('link', { name: 'Lernpfad' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Danach: dein Schwerpunkt' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chording' })).toBeVisible();
  await expect(
    page.getByText('Öffnet sich, sobald „Grundlagen“ geschafft ist.').first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Stufe 2 starten: Neue Tasten: D K' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Texte' }).filter({ visible: true }).first().click();
  await page.getByLabel('Neuen Text schnell hinzufügen').fill('Liebe Grüße und bis morgen');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Text gespeichert');

  await page.getByRole('link', { name: 'Einstellungen' }).filter({ visible: true }).first().click();
  await page.getByLabel('Tastaturlayout').selectOption('noted');
  await expect(page.getByRole('status')).toContainText('Layout gewechselt');

  await page.reload();
  await page.getByRole('link', { name: 'Texte' }).filter({ visible: true }).first().click();
  await expect(
    page.getByRole('button', { name: /^Liebe Grüße und bis morgen Text/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Üben' }).filter({ visible: true }).first().click();
  await expect(page.getByText(/^Layout Noted/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Neue Tasten: E T' })).toBeVisible();
  expect(errors).toEqual([]);
});
