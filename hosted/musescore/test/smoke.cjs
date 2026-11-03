// Opens the app, records console output and errors, waits for the editor, takes screenshots.
// Usage: node smoke.cjs <output folder> … (server.mjs on :8791). Screenshots and logs go to the output folder.
const { chromium } = require('playwright');
const out = process.argv[2];
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
  page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`.slice(0, 6000)));
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}\n${e.stack}`.slice(0, 4000)));
  page.on('requestfailed', (r) => log.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  if (process.env.PLUGIN_ZIP) {
    const b64 = require('fs').readFileSync(process.env.PLUGIN_ZIP).toString('base64');
    await page.addInitScript(
      (seed) => {
        window.__mnSeed = seed;
      },
      [[`plugins/NoteCount${'@'}0123456789ab.zip`, b64]],
    );
  }
  if (process.env.PLUGIN_DIR) {
    const fs = require('fs');
    const seed = fs
      .readdirSync(process.env.PLUGIN_DIR)
      .filter((f) => f.endsWith('.zip'))
      .map((f, i) => [
        `plugins/${f.replace(/\.zip$/, '')}@${String(i).padStart(12, '0')}.zip`,
        fs.readFileSync(`${process.env.PLUGIN_DIR}/${f}`).toString('base64'),
      ]);
    await page.addInitScript((s) => {
      window.__mnSeed = s;
    }, seed);
  }
  if (process.env.SOUNDS_DIR) {
    const fs = require('fs');
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
  const t0 = Date.now();
  await page.goto('http://localhost:8791/', { waitUntil: 'domcontentloaded' });
  let state = 'timeout';
  for (let i = 0; i < 240; i++) {
    const s = await page.evaluate(() => ({
      ready: Boolean(window.__mnReady),
      failed: document.getElementById('mn-status')?.classList.contains('mn-failed'),
      step: document.querySelector('#mn-status [data-step]')?.textContent,
    }));
    if (s.failed) {
      state = `failed: ${s.step}`;
      break;
    }
    if (s.ready) {
      state = 'ready';
      break;
    }
    await page.waitForTimeout(1000);
  }
  log.push(`STATE ${state} after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.waitForTimeout(8000);
  log.push(
    'DOM ' +
      JSON.stringify(
        await page.evaluate(() => {
          const screen = document.getElementById('screen');
          const r = screen.getBoundingClientRect();
          const canvases = [...document.querySelectorAll('canvas')].map(
            (c) => `${c.width}x${c.height}`,
          );
          const shadow = [...screen.querySelectorAll('*')].filter((e) => e.shadowRoot).length;
          const webgl = (() => {
            try {
              return Boolean(document.createElement('canvas').getContext('webgl2'));
            } catch {
              return false;
            }
          })();
          return {
            screen: `${r.width}x${r.height}`,
            children: screen.children.length,
            canvases,
            shadow,
            webgl,
          };
        }),
      ),
  );
  await page.screenshot({ path: `${out}/shot-1.png` });
  if (process.env.PLUGIN_ZIP || process.env.PLUGIN_DIR) {
    // Home → Plug-Ins in the editor's left column.
    await page.mouse.click(103, 176);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${out}/shot-2.png` });
  }
  require('fs').writeFileSync(`${out}/console.log`, log.join('\n'));
  await browser.close();
})();
