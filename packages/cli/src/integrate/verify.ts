import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { removeOutput } from './convert.ts';
import type { IntegrateResult } from './types.ts';

/**
 * Builds an integrated app like the deploy will. A build that fails turns the result into
 * `needs_review` (with the end of the log) and removes the folder again.
 */
export function verifyBuild(root: string, result: IntegrateResult): IntegrateResult {
  if (result.status !== 'integrated' || !result.outDir || !result.slug) return result;
  const run = (args: string[]) =>
    spawnSync('pnpm', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const install = run(['install', '--no-frozen-lockfile', '--ignore-scripts']);
  const hasBuild = result.actions.some((action) => action.startsWith('package.json'));
  const build =
    install.status === 0 && hasBuild ? run(['--filter', `./hosted/${result.slug}`, 'build']) : null;
  const failed = install.status !== 0 ? install : build?.status !== 0 ? build : null;
  if (!failed) return result;
  removeOutput(result.outDir);
  const tail = `${failed.stdout}\n${failed.stderr}`.trim().split('\n').slice(-25).join('\n');
  return {
    ...result,
    status: 'needs_review',
    outDir: null,
    reasons: [
      {
        code: install.status !== 0 ? 'install_failed' : 'build_failed',
        message: `${install.status !== 0 ? 'Die Abhängigkeiten lassen sich nicht installieren' : 'Der Build schlägt fehl'}:\n${tail}`,
      },
    ],
  };
}

interface BiomeOverride {
  includes?: string[];
  linter?: { enabled?: boolean };
}

/** Adds the app to the Biome override that turns linting off (formatting stays on). */
export function lintExemption(biomeJson: string, slug: string): string {
  const config = JSON.parse(biomeJson) as { overrides?: BiomeOverride[] };
  const overrides = config.overrides ?? [];
  config.overrides = overrides;
  const glob = `hosted/${slug}/**`;
  let entry = overrides.find((override) => override.linter?.enabled === false);
  if (!entry) {
    entry = { includes: [], linter: { enabled: false } };
    overrides.push(entry);
  }
  const includes = entry.includes ?? [];
  entry.includes = includes;
  if (!includes.includes(glob)) includes.push(glob);
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Formats the app like the rest of the repository so CI's `pnpm lint` passes. An export that
 * has lint findings of its own (accessibility hints, style) is exempted from linting: imported
 * code stays as its author wrote it, and the finding count goes into the warnings.
 */
export function tidy(root: string, result: IntegrateResult): IntegrateResult {
  if (result.status !== 'integrated' || !result.slug) return result;
  const target = `hosted/${result.slug}`;
  const biome = (args: string[]) =>
    spawnSync('pnpm', ['exec', 'biome', 'check', ...args, target], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  biome(['--write']);
  const after = biome([]);
  if (after.status === 0)
    return { ...result, actions: [...result.actions, 'Code mit Biome formatiert'] };
  const count = /Found (\d+) errors?/.exec(`${after.stdout}${after.stderr}`)?.[1] ?? 'mehrere';
  // The exemption is a change to a root file: the trusted publish step makes it (`mininode
  // exempt <slug>`), not this build. Locally the file is changed right away.
  if (!process.env.CI) {
    const path = join(root, 'biome.json');
    writeFileSync(path, lintExemption(readFileSync(path, 'utf8'), result.slug));
  }
  return {
    ...result,
    lintExempt: true,
    actions: [...result.actions, 'Code mit Biome formatiert'],
    warnings: [
      ...result.warnings,
      `Der Code hat ${count} Lint-Hinweise (Barrierefreiheit, Stil). Er bleibt, wie der Autor ihn geschrieben hat; die App ist vom Linter ausgenommen (biome.json).`,
    ],
  };
}
