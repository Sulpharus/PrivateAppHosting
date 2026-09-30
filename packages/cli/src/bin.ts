#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { changedApps } from './changed.ts';
import type { DeployEnv } from './deploy/environment.ts';
import { deployApp, devApp, readVersion } from './deploy/index.ts';
import { checkLibraryInstall, installLibraryApp, removeLibraryApp } from './deploy/library.ts';
import { hostedTargets, pruneApps } from './deploy/prune.ts';
import { type DoctorReport, doctor, hostedApps } from './doctor.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

const USAGE = `mininode <command>

  doctor <app-dir> | --all          Check hosted apps (manifest, secrets, SDK, RLS, CSP)
  dev <app-dir> [--port 8790]       Serve an app locally behind the gate (local Supabase)
  deploy <app-dir> [--env staging]  Build, migrate, deploy and register one app
  deploy --changed <base-ref>       Deploy every app changed since <base-ref>
  changed <base-ref>                List hosted apps changed since <base-ref>
  prune [--env staging] [--dry-run] Delete Workers of apps removed from hosted/, disable them
  library check <entry> <slug>      App-Bibliothek: check an install before the rollout
  library install <entry> <slug>    App-Bibliothek: register an installed program
  library remove <slug>             App-Bibliothek: disable a removed program
`;

function print(report: DoctorReport): boolean {
  const errors = report.findings.filter((f) => f.severity === 'error');
  const warnings = report.findings.filter((f) => f.severity === 'warning');
  console.log(`${(errors.length > 0 ? 'FAIL' : 'ok').padEnd(4)} ${report.app}`);
  for (const finding of report.findings) {
    const where = finding.file ? ` ${finding.file}:` : '';
    const level = finding.severity === 'error' ? 'error' : 'warn ';
    console.log(`     ${level} [${finding.rule}]${where} ${finding.message}`);
  }
  if (warnings.length > 0 && errors.length === 0) console.log(`     ${warnings.length} warning(s)`);
  return errors.length === 0;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function envFlag(args: string[]): DeployEnv {
  const env = flag(args, '--env') ?? 'production';
  if (env === 'production' || env === 'staging' || env === 'local') return env;
  throw new Error(`unknown --env ${env} (production, staging or local)`);
}

async function main(args: string[]): Promise<number> {
  const [command, target] = args;
  switch (command) {
    case 'doctor': {
      if (!target) break;
      const dirs = target === '--all' ? hostedApps(ROOT) : [resolve(process.cwd(), target)];
      if (dirs.length === 0) {
        console.log('no hosted apps yet');
        return 0;
      }
      return dirs.map((dir) => print(doctor(dir))).every(Boolean) ? 0 : 1;
    }
    case 'prune': {
      const dirs = existsSync(join(ROOT, 'hosted')) ? readdirSync(join(ROOT, 'hosted')) : [];
      await pruneApps(envFlag(args), hostedTargets(ROOT, dirs), {
        dryRun: args.includes('--dry-run'),
        force: args.includes('--force'),
      });
      return 0;
    }
    case 'changed': {
      if (!target) break;
      for (const slug of changedApps(target, ROOT)) console.log(slug);
      return 0;
    }
    case 'dev': {
      if (!target) break;
      await devApp(resolve(process.cwd(), target), Number(flag(args, '--port') ?? 8790));
      return 0;
    }
    case 'library': {
      const [, , first, second] = args;
      const env = envFlag(args);
      if (target === 'check' && first && second) {
        await checkLibraryInstall(env, first, second);
        console.log(`ok ${first} → ${second}`);
        return 0;
      }
      if (target === 'install' && first && second) {
        await installLibraryApp(env, first, second, readVersion());
        console.log(`registered ${second} (${first})`);
        return 0;
      }
      if (target === 'remove' && first) {
        await removeLibraryApp(env, first);
        console.log(`disabled ${first}`);
        return 0;
      }
      break;
    }
    case 'deploy': {
      if (!target) break;
      const env = envFlag(args);
      const dryRun = args.includes('--dry-run');
      const base = flag(args, '--changed');
      const dirs = base
        ? changedApps(base, ROOT)
            .map((slug) => join(ROOT, 'hosted', slug))
            .filter((dir) => existsSync(join(dir, 'mininode.json')))
        : [resolve(process.cwd(), target)];
      const version = readVersion();
      // One broken app must not keep the others from shipping: deploy them all, then fail.
      const failed: string[] = [];
      for (const dir of dirs) {
        try {
          await deployApp(dir, { env, version, dryRun });
        } catch (error) {
          console.error(error instanceof Error ? error.message : error);
          failed.push(basename(dir));
        }
      }
      if (dirs.length === 0) console.log('nothing to deploy');
      if (failed.length > 0) {
        console.error(`failed: ${failed.join(', ')}`);
        return 1;
      }
      return 0;
    }
  }
  console.log(USAGE);
  return command ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
