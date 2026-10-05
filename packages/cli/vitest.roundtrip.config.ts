// The backup round trip empties and refills the whole local database, so it runs on its own
// (never next to other integration tests): `pnpm test:roundtrip`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['src/**/*.roundtrip.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
