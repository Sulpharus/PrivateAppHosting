// Drives the editor like a person: steps from argv as JSON [{click:[x,y]}|{key:"Control+s"}|{wait:ms}|{shot:"name"}|{eval:"js"}].
// Usage: node flow.cjs <output folder> … (server.mjs on :8791). Screenshots and logs go to the output folder.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2];
const steps = JSON.parse(process.argv[3]);
(async () => {
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const log = [];
  page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`.slice(0, 600)));
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}\n${e.stack}`.slice(0, 3000)));
  if (process.env.SOUNDS_DIR) {
    const seed = [['sounds/Effekte/.folder', '']].concat(
      fs
        .readdirSync(process.env.SOUNDS_DIR)
        .map((f) => [
          `sounds/Effekte/${f}`,
          fs.readFileSync(`${process.env.SOUNDS_DIR}/${f}`).toString('base64'),
        ]),
    );
    await page.addInitScript((s) => {
      window.__mnSeed = s;
    }, seed);
  }
  await page.goto('http://localhost:8791/');
  for (let i = 0; i < 120 && !(await page.evaluate(() => window.__mnReady)); i++)
    await page.waitForTimeout(1000);
  await page.waitForTimeout(6000);
  for (const step of steps) {
    if (step.click) await page.mouse.click(step.click[0], step.click[1]);
    if (step.dblclick) await page.mouse.dblclick(step.dblclick[0], step.dblclick[1]);
    if (step.key) await page.keyboard.press(step.key);
    if (step.type) await page.keyboard.type(step.type);
    if (step.wait) await page.waitForTimeout(step.wait);
    if (step.shot) await page.screenshot({ path: `${out}/${step.shot}.png` });
    if (step.clickText) await page.getByText(step.clickText, { exact: false }).first().click();
    if (step.eval) log.push(`EVAL ${JSON.stringify(await page.evaluate(step.eval))}`);
  }
  fs.writeFileSync(`${out}/flow.log`, log.join('\n'));
  await browser.close();
})();
