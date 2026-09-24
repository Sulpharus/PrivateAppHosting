import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://localhost:5173/' } },
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts'],
  },
});
