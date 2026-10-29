// Bundles the platform Workers (portal, API, AI proxy, app gate) into single modules that
// workerd runs unchanged. Run at image build time; the host starts from the result.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const REPO = resolve(import.meta.dirname, '../../..');

export const ENTRIES: Record<string, string> = {
  portal: 'apps/portal/worker/index.ts',
  api: 'apps/api/src/index.ts',
  ai: 'apps/ai-proxy/src/index.ts',
  gate: 'packages/gate/src/worker.ts',
};

export async function bundleWorkers(outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  await Promise.all(
    Object.entries(ENTRIES).map(([name, entry]) =>
      build({
        entryPoints: [join(REPO, entry)],
        outfile: join(outDir, `${name}.mjs`),
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        target: 'es2022',
        conditions: ['workerd', 'worker', 'browser'],
        mainFields: ['module', 'main'],
        external: ['node:*', 'cloudflare:*'],
        logLevel: 'warning',
      }),
    ),
  );
}

if (import.meta.main) {
  const out = process.argv[2] ?? join(REPO, 'dist-workers');
  await bundleWorkers(out);
  console.log(`workers bundled into ${out}`);
}
