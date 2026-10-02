import { expect, type Page, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// The other Gaming Hub games (Minensucher, Sudoku, Solitär, 2048, Codeknacker): each is opened,
// played far enough to produce a result, and the round shows up in the hub.
const run = `e2em${Date.now().toString(36)}`;
const email = `${run}-nora@example.com`;
const username = `N_${run}`.slice(0, 20);
const shots = process.env.SCREENSHOT_DIR;
const BASE = 'http://localhost';
const PORTS = { minensucher: 8800, sudoku: 8801, solitaer: 8802, n2048: 8803, codeknacker: 8804 };

test.afterAll(async () => {
  await cleanup(run);
});

async function open(page: Page, slug: keyof typeof PORTS) {
  await page.goto(`${BASE}:${PORTS[slug]}`);
  await expect(page.getByText(`Du spielst als ${username}.`)).toBeVisible();
}

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

/** All 1296 codes of the Codeknacker, narrowed down by each answer. */
function feedback(code: number[], guess: number[]) {
  let exact = 0;
  const left = new Array(6).fill(0);
  const open = new Array(6).fill(0);
  for (let i = 0; i < 4; i++) {
    if (code[i] === guess[i]) exact++;
    else {
      left[code[i]]++;
      open[guess[i]]++;
    }
  }
  let near = 0;
  for (let s = 0; s < 6; s++) near += Math.min(left[s], open[s]);
  return { exact, near };
}

test('gaming hub: five more games produce results', async ({ browser }) => {
  test.setTimeout(180_000);
  await createUser(email, 'user', 'Nora');
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.getByRole('link', { name: /^Gaming Hub/ }).click();
  await page.getByLabel('Name', { exact: true }).fill(username);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('status')).toContainText(`Du spielst jetzt als ${username}`);

  // Minensucher: uncover cell after cell until the round ends (a win or a mine).
  await open(page, 'minensucher');
  await expect(page.locator('.ms-cell')).toHaveCount(81);
  for (let i = 0; i < 81 && (await page.locator('#end').isHidden()); i++) {
    const cell = page.locator('.ms-cell').nth(i);
    if (!(await cell.evaluate((el) => el.classList.contains('open')))) await cell.click();
  }
  await expect(page.locator('#end')).toBeVisible();
  await shot(page, 'minensucher');

  // Sudoku: Sehr leicht, every empty cell filled with a hint.
  await open(page, 'sudoku');
  await page.getByRole('button', { name: 'Sehr leicht' }).click();
  await expect(page.locator('.su-cell.given').first()).toBeVisible();
  await shot(page, 'sudoku');
  for (let i = 0; i < 81 && (await page.locator('#end').isHidden()); i++) {
    const cell = page.locator('.su-cell').nth(i);
    if (await cell.evaluate((el) => !el.classList.contains('given') && !el.textContent)) {
      await cell.click();
      await page.getByRole('button', { name: 'Tipp' }).click();
    }
  }
  await expect(page.getByRole('heading', { name: 'Geschafft!' })).toBeVisible();

  // Solitär: draw a few cards, then give up (a lost round).
  await open(page, 'solitaer');
  await expect(page.locator('.sol-card[data-pile="t"]')).not.toHaveCount(0);
  for (let i = 0; i < 3; i++) await page.locator('[data-pile="s"]').click();
  await shot(page, 'solitaer');
  await page.getByRole('button', { name: 'Aufgeben' }).click();
  await expect(page.getByRole('heading', { name: 'Aufgegeben' })).toBeVisible();

  // 2048: move around until something merged, then end the round.
  await open(page, 'n2048');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 30; i++) await page.keyboard.press(['ArrowLeft', 'ArrowUp'][i % 2]);
  await expect(page.locator('.g-tile.t')).not.toHaveCount(0);
  await shot(page, 'n2048');
  await page.getByRole('button', { name: 'Beenden' }).click();
  await expect(page.locator('#end')).toBeVisible();

  // Codeknacker: guess the first code that fits every answer so far.
  await open(page, 'codeknacker');
  const codes: number[][] = [];
  for (let n = 0; n < 1296; n++) {
    codes.push([Math.floor(n / 216) % 6, Math.floor(n / 36) % 6, Math.floor(n / 6) % 6, n % 6]);
  }
  let candidates = codes;
  for (let turn = 0; turn < 10 && (await page.locator('#end').isHidden()); turn++) {
    const guess = candidates[0] ?? codes[0];
    for (const s of guess) await page.keyboard.press(String(s + 1));
    await page.getByRole('button', { name: 'Raten' }).click();
    const rows = page.locator('.ck-row .fb');
    await expect(rows).toHaveCount(turn + 1);
    const text = (await rows.nth(turn).textContent()) ?? '';
    const exact = Number(/(\d+) genau/.exec(text)?.[1] ?? 0);
    const near = Number(/(\d+) nah/.exec(text)?.[1] ?? 0);
    candidates = candidates.filter((c) => {
      const f = feedback(c, guess);
      return f.exact === exact && f.near === near;
    });
  }
  await expect(page.getByRole('heading', { name: 'Code geknackt!' })).toBeVisible();
  await shot(page, 'codeknacker');

  // The hub lists a round for every game.
  await page.goto('/games');
  for (const name of ['Minensucher', 'Sudoku', 'Solitär', '2048', 'Codeknacker']) {
    const card = page.locator('.game-tile', { hasText: name });
    await expect(card.getByText('Runden')).toBeVisible();
    await expect(card.locator('dd').nth(1)).toHaveText('1');
  }
  expect(errors).toEqual([]);
});
