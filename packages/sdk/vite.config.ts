import { defineConfig } from 'vite';

// Two outputs: an ES module for bundled apps and an IIFE (`window.mininode`) for plain HTML apps
// that load `/_mininode/sdk.js` with a single <script> tag.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/browser.ts',
      name: 'mininode',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'mininode.js' : 'mininode.iife.js'),
    },
    target: 'es2022',
    sourcemap: true,
  },
});
