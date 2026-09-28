import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Stamps public/sw.js with a build version, so each deploy replaces the service worker. */
function serviceWorkerVersion(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mininode-sw-version',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const file = join(outDir, 'sw.js');
      const source = readFileSync(file, 'utf8');
      writeFileSync(
        file,
        source.replace("const VERSION = 'dev';", `const VERSION = '${Date.now().toString(36)}';`),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerVersion()],
  // fs.allow: the admin's KI-Werkstatt bundles docs/ai and packages/ui/kit from the repo root.
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] } },
  // supabase-js + React make up most of the main chunk (~170 kB gzipped).
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 700 },
});
