import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The look comes from the App Kit, which the gate serves at /_mininode/ui.css.
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022' },
  // The tests run in German, with the language package as the page would load it.
  test: { setupFiles: ['./test/setup.ts'] },
});
