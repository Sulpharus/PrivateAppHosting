#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { changedApps } from './changed.ts';
import type { DeployEnv } from './deploy/environment.ts';
import { deployApp, devApp, readVersion } from './deploy/index.ts';
import { type DoctorReport, doctor, hostedApps } from './doctor.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

const USAGE = `mininode <command>

  doctor <app-dir> | --all          Check hosted apps (manifest, secrets, SDK, RLS, CSP)
  dev <app-dir> [--port 8790]       Serve an app locally behind the gate (local Supabase)
  deploy <app-dir> [--env staging]  Build, migrate, deploy and register one app
  deploy --changed <base-ref>       Deploy every app changed since <base-ref>
  changed <base-ref>                List hosted apps changed since <base-ref>
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
    case 'deploy': {
      if (!target) break;
      const env = (flag(args, '--env') ?? 'production') as DeployEnv;
      const dryRun = args.includes('--dry-run');
      const base = flag(args, '--changed');
      const dirs = base
        ? changedApps(base, ROOT)
            .map((slug) => join(ROOT, 'hosted', slug))
            .filter((dir) => existsSync(join(dir, 'mininode.json')))
        : [resolve(process.cwd(), target)];
      const version = readVersion();
      for (const dir of dirs) await deployApp(dir, { env, version, dryRun });
      if (dirs.length === 0) console.log('nothing to deploy');
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
