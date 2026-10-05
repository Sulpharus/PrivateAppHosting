import { expect, test } from '@playwright/test';
import { cleanup, createUser, PASSWORD } from './seed.ts';

// Verwaltung → Sicherung (ADR 0019). The e2e stack has no API Worker and no GitHub, so the
// API is answered here; what is checked is the page: the list, starting, and the download.
const run = `e2ebackup${Date.now().toString(36)}`;
const email = `${run}-admin@example.com`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

test.afterAll(async () => {
  await cleanup(run);
});

test('an admin starts a backup and downloads a finished one', async ({ page }) => {
  await createUser(email, 'admin', 'Wolfram');
  let started: unknown = null;
  let state: 'ready' | 'running' = 'ready';

  await page.route('**/admin/backups**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/download'))
      return route.fulfill({
        headers: CORS,
        json: { url: 'http://localhost:9/fake-backup.zip', name: 'mininode-backup-1.zip' },
      });
    if (request.method() === 'POST') {
      started = request.postDataJSON();
      state = 'running';
      return route.fulfill({ status: 202, headers: CORS, json: { started: true } });
    }
    return route.fulfill({
      headers: CORS,
      json: {
        configured: true,
        runs: [
          {
            runId: 2,
            startedAt: '2026-10-05T08:00:00Z',
            state,
            runUrl: 'https://github.com/o/r/actions/runs/2',
            withFiles: true,
            artifact: null,
          },
          {
            runId: 1,
            startedAt: '2026-10-04T08:00:00Z',
            state: 'ready',
            runUrl: 'https://github.com/o/r/actions/runs/1',
            withFiles: false,
            artifact: {
              id: 10,
              name: 'mininode-backup-20261004-080000-nofiles',
              sizeBytes: 3_400_000,
              expiresAt: '2026-11-03T08:00:00Z',
            },
          },
        ],
      },
    });
  });
  await page.route('http://localhost:9/fake-backup.zip', (route) =>
    route.fulfill({
      headers: {
        'content-type': 'application/zip',
        'content-disposition': 'attachment; filename="x.zip"',
      },
      body: 'zip',
    }),
  );

  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wolfram');

  await page.goto('/admin');
  await page.getByRole('link', { name: 'Sicherung', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sicherung' })).toBeVisible();
  await expect(page.getByText('ohne Dateien')).toBeVisible();
  await expect(page.getByText(/3,2 MB/)).toBeVisible();
  // Download: the API answers with a short-lived address, the browser follows it.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Herunterladen' }).click();
  expect((await download).suggestedFilename()).toBe('x.zip');
  await page.goto('/admin/backups');

  // Start: the files box is sent as chosen.
  await page.getByLabel('Gespeicherte Dateien einschließen').uncheck();
  await page.getByRole('button', { name: 'Sicherung erstellen' }).click();
  await expect(page.getByText('Die Sicherung läuft.')).toBeVisible();
  expect(started).toEqual({ files: false });
  await expect(page.getByRole('button', { name: 'Sicherung erstellen' })).toBeDisabled();
});
