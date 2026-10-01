#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { changedApps } from './changed.ts';
import type { DeployEnv } from './deploy/environment.ts';
import { deployApp, devApp, readVersion } from './deploy/index.ts';
import { checkLibraryInstall, installLibraryApp, removeLibraryApp } from './deploy/library.ts';
import { hostedTargets, pruneApps } from './deploy/prune.ts';
import { type DoctorReport, doctor, hostedApps } from './doctor.ts';
import { exportApp } from './export.ts';
import { integrate, reportMarkdown } from './integrate/index.ts';
import type { IntegrateResult } from './integrate/types.ts';
import { tidy, verifyBuild } from './integrate/verify.ts';
import { fetchSubmission, type SubmissionStatus, setSubmissionStatus } from './submissions.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

const USAGE = `mininode <command>

  doctor <app-dir> | --all          Check hosted apps (manifest, secrets, SDK, RLS, CSP)
  dev <app-dir> [--port 8790]       Serve an app locally behind the gate (local Supabase)
  deploy <app-dir> [--env staging]  Build, migrate, deploy and register one app
  deploy --changed <base-ref>       Deploy every app changed since <base-ref>
  changed <base-ref>                List hosted apps changed since <base-ref>
  prune [--env staging] [--dry-run] Delete Workers of apps removed from hosted/, disable them
  export <app-dir> --out <dir>      Copy one app as a shareable project (no data, no keys)
  integrate <zip|dir> [--slug x]    Turn an export into hosted/<slug> by script (exit 2: needs review)
                                    [--build] [--tidy] [--json file] [--report file]
  submission fetch <id> --out <file>  Download an uploaded ZIP (workflow)
  submission status <id> <status> [--result file] [--report file] [--pr url] [--review url] [--run url]
  library check <entry> <slug>      App-Bibliothek: check an install before the rollout
  library install <entry> <slug>    App-Bibliothek: register an installed program
  library remove <slug> <entry>     App-Bibliothek: disable a removed program
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
    case 'integrate': {
      if (!target) break;
      const input = resolve(process.cwd(), target);
      const slug = flag(args, '--slug');
      let result = integrate({ input, root: ROOT, ...(slug ? { slug } : {}) });
      if (args.includes('--build')) result = verifyBuild(ROOT, result);
      if (args.includes('--tidy')) result = tidy(ROOT, result);
      const report = reportMarkdown(result, basename(input));
      const jsonOut = flag(args, '--json');
      const reportOut = flag(args, '--report');
      if (jsonOut)
        writeFileSync(resolve(process.cwd(), jsonOut), `${JSON.stringify(result, null, 2)}\n`);
      if (reportOut) writeFileSync(resolve(process.cwd(), reportOut), report);
      console.log(report);
      return result.status === 'integrated' ? 0 : 2;
    }
    case 'submission': {
      const [, , id, status] = args;
      const env = envFlag(args);
      if (target === 'fetch' && id) {
        const out = flag(args, '--out');
        if (!out) break;
        console.log(await fetchSubmission(env, id, resolve(process.cwd(), out)));
        return 0;
      }
      if (target === 'status' && id && status) {
        const resultFile = flag(args, '--result');
        const reportFile = flag(args, '--report');
        const result = resultFile
          ? (JSON.parse(
              readFileSync(resolve(process.cwd(), resultFile), 'utf8'),
            ) as IntegrateResult)
          : null;
        const report = reportFile ? readFileSync(resolve(process.cwd(), reportFile), 'utf8') : null;
        const pr = flag(args, '--pr');
        const review = flag(args, '--review');
        const run = flag(args, '--run');
        await setSubmissionStatus(env, id, status as SubmissionStatus, result, report, {
          ...(pr ? { pr } : {}),
          ...(review ? { review } : {}),
          ...(run ? { run } : {}),
        });
        return 0;
      }
      break;
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
    case 'export': {
      const out = flag(args, '--out');
      if (!target || !out) break;
      const result = exportApp(ROOT, resolve(process.cwd(), target), resolve(process.cwd(), out));
      if (result.findings.length > 0) {
        console.error(`not exported: ${result.findings.length} finding(s) in ${result.slug}`);
        for (const f of result.findings) console.error(`  ${f.file}:${f.line} ${f.rule}`);
        return 1;
      }
      console.log(`exported ${result.slug} (${result.files.length} files) to ${out}`);
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
      if (target === 'remove' && first && second) {
        await removeLibraryApp(env, first, second);
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
