import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// Gaming Hub (ADR 0009) with hosted/memory: pick a username in the portal, play a round,
// and find the playtime, the result and the leaderboard entry in the hub.
const run = `e2eg${Date.now().toString(36)}`;
const GAME = 'http://localhost:8798';
const shots = process.env.SCREENSHOT_DIR;
const email = `${run}-lena@example.com`;
const username = `L_${run}`.slice(0, 20);

test.afterAll(async () => {
  await cleanup(run);
});

/** Plays one round: remembers every shape it has seen, and matches as soon as it can. */
async function solve(page: Page) {
  const cards = page.locator('.mem-card');
  const seen = new Map<number, string>();
  const shapeOf = async (i: number) => {
    const label = (await cards.nth(i).getAttribute('aria-label')) ?? '';
    return label.split(': ')[1]?.split(',')[0] ?? '';
  };
  const found = async (i: number) =>
    ((await cards.nth(i).getAttribute('aria-label')) ?? '').endsWith('gefunden');
  const partner = (i: number) =>
    [...seen].find(([j, s]) => j !== i && s === seen.get(i))?.[0] ?? -1;
  for (let guard = 0; guard < 64 && !(await page.locator('#won').isVisible()); guard++) {
    // A known pair first.
    const known = [...seen.keys()].find((i) => partner(i) >= 0);
    if (known !== undefined) {
      const other = partner(known);
      await cards.nth(known).click();
      await cards.nth(other).click();
      seen.delete(known);
      seen.delete(other);
      continue;
    }
    let first = -1;
    for (let i = 0; i < 16; i++)
      if (!seen.has(i) && !(await found(i))) {
        first = i;
        break;
      }
    if (first < 0) break;
    await cards.nth(first).click();
    seen.set(first, await shapeOf(first));
    const match = partner(first);
    if (match >= 0) {
      await cards.nth(match).click();
      seen.delete(first);
      seen.delete(match);
      continue;
    }
    let second = -1;
    for (let i = 0; i < 16; i++)
      if (i !== first && !seen.has(i) && !(await found(i))) {
        second = i;
        break;
      }
    if (second < 0) break;
    await cards.nth(second).click();
    seen.set(second, await shapeOf(second));
    if (await found(second)) {
      seen.delete(first);
      seen.delete(second);
    }
  }
}

test('gaming hub: username, a round of Memory, stats and leaderboard', async ({ browser }) => {
  test.setTimeout(120_000);
  await createUser(email, 'user', 'Lena');
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  // Games are not among the apps on the start page; the Gaming Hub button leads to them.
  await expect(page.getByRole('link', { name: /^Gaming Hub/ })).toBeVisible();
  await expect(page.locator('.tile').filter({ hasText: 'Memory' })).toHaveCount(0);
  await page.getByRole('link', { name: /^Gaming Hub/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Gaming Hub' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rätsel & Puzzle' })).toBeVisible();

  // One name for all games; invalid names are explained.
  await page.getByLabel('Name', { exact: true }).fill('a b');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('alert')).toContainText('3 bis 20 Zeichen');
  await page.getByLabel('Name', { exact: true }).fill(username);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('status')).toContainText(`Du spielst jetzt als ${username}`);

  // Play a round; the game greets the player by that name.
  await page.goto(GAME);
  await expect(page.getByText(`Du spielst als ${username}.`)).toBeVisible();
  await solve(page);
  await expect(page.getByRole('heading', { name: 'Geschafft!' })).toBeVisible();
  await expect(page.locator('.mem-list .mine')).toContainText(username);
  if (shots) await page.screenshot({ path: `${shots}/memory.png`, fullPage: true });

  // Back in the hub: the round, the record and the leaderboard.
  await page.goto('/games');
  const card = page.locator('.game-tile', { hasText: 'Memory' });
  await expect(card.getByText('Runden')).toBeVisible();
  await expect(card.locator('dd').nth(1)).toHaveText('1');
  await expect(page.getByText('Erste Runde')).toBeVisible();
  await card.getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Memory' })).toBeVisible();
  await expect(page.locator('.leaderboard .mine')).toContainText(username);
  await expect(page.getByRole('cell', { name: 'Gewonnen' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/gaming-hub-memory.png`, fullPage: true });
  expect(errors).toEqual([]);
});
