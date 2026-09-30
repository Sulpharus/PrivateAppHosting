import { defineConfig } from 'vitest/config';

// The rules keep local wall-clock time; tests pin the zone the app is used in.
export default defineConfig({ test: { env: { TZ: 'Europe/Berlin' } } });
