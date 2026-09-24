import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the local Supabase stack (`pnpm db:start`) and the portal dev server.
// Run with `pnpm e2e` (scripts/with-local-supabase.sh provides the Supabase env).
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM ?? (process.env.CI ? undefined : '/opt/pw-browsers/chromium');

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'pnpm --filter @mininode/portal dev',
      url: 'http://localhost:5173/login',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: process.env.SUPABASE_URL ?? '',
        VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
      },
    },
    {
      // A fixture app served through the real gate Worker (wrangler dev), registered locally.
      command: 'pnpm mininode dev fixtures/static-html/expected/hallo --port 8790',
      url: 'http://localhost:8790/_mininode/config.json',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // The real hosted apps, each behind its own local gate.
    ...['notizen', 'einkauf', 'ideen'].map((slug, index) => ({
      command: `pnpm mininode dev hosted/${slug} --port ${8791 + index}`,
      url: `http://localhost:${8791 + index}/_mininode/config.json`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    })),
  ],
});
