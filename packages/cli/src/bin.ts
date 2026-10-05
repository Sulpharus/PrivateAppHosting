#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createBackup, currentCommit, restoreBackup, verifyBackup } from './backup/index.ts';
import { changedApps } from './changed.ts';
import type { DeployEnv } from './deploy/environment.ts';
import { deployApp, devApp, readVersion } from './deploy/index.ts';
import { checkLibraryInstall, installLibraryApp, removeLibraryApp } from './deploy/library.ts';
import { hostedTargets, pruneApps } from './deploy/prune.ts';
import { dropExemptions, uninstallApp } from './deploy/uninstall.ts';
import { type DoctorReport, doctor, hostedApps } from './doctor.ts';
import { exportApp } from './export.ts';
import { integrate, reportMarkdown } from './integrate/index.ts';
import type { IntegrateResult } from './integrate/types.ts';
import { biomeSkip, lintExemption, tidy, verifyBuild } from './integrate/verify.ts';
import { fetchSubmission, type SubmissionStatus, setSubmissionStatus } from './submissions.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

const USAGE = `mininode <command>

  doctor <app-dir> | --all          Check hosted apps (manifest, secrets, SDK, RLS, CSP)
  dev <app-dir> [--port 8790]       Serve an app locally behind the gate (local Supabase)
  deploy <app-dir> [--env staging]  Build, migrate, deploy and register one app
  deploy --changed <base-ref>       Deploy every app changed since <base-ref>
  changed <base-ref>                List hosted apps changed since <base-ref>
  prune [--env staging] [--dry-run]  Delete Workers of apps removed from hosted/, disable them
  export <app-dir> --out <dir>      Copy one app as a shareable project (no data, no keys)
  integrate <zip|dir> [--slug x]    Turn an export into hosted/<slug> by script (exit 2: needs review)
                                    [--build] [--tidy] [--json file] [--report file]
  exempt <slug> [--skip|--remove]   Exempt an imported app from the linter, or from Biome entirely (publish step); --remove forgets it
  uninstall <slug> [--purge] [--env]  Take an app offline (Worker deleted); --purge also deletes its data, files and registry entry
  submission fetch <id> --out <file>  Download an uploaded ZIP (workflow)
  submission status <id> <status> [--result file] [--report file] [--pr url] [--review url] [--run url] [--only-if-pr url]
                                    Report the state of an upload (workflow)
  backup create --out <dir> [--no-files]   Copy the database and the stored files into a folder
  backup verify <dir>               Check a backup folder against its checksums
  backup restore <dir> [--yes] [--confirm <db host>] [--no-database] [--no-storage] [--force]
                                    Put a backup back (without --yes: show what would change;
                                    a remote database also needs --confirm <its host>)
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
    case 'exempt': {
      if (!target || !/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/.test(target)) break;
      const path = join(ROOT, 'biome.json');
      const change = args.includes('--remove')
        ? dropExemptions
        : args.includes('--skip')
          ? biomeSkip
          : lintExemption;
      writeFileSync(path, change(readFileSync(path, 'utf8'), target));
      return 0;
    }
    case 'uninstall': {
      if (!target) break;
      const known = new Set(['uninstall', target, '--purge', '--env']);
      const envValue = flag(args, '--env');
      const stray = args.filter((arg) => !known.has(arg) && arg !== envValue);
      if (stray.length > 0) throw new Error(`unknown option ${stray[0]} (use --purge or --env)`);
      const result = await uninstallApp(envFlag(args), target, { purge: args.includes('--purge') });
      console.log(JSON.stringify(result));
      return 0;
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
        const onlyIfPr = flag(args, '--only-if-pr');
        await setSubmissionStatus(env, id, status as SubmissionStatus, result, report, {
          ...(pr ? { pr } : {}),
          ...(review ? { review } : {}),
          ...(run ? { run } : {}),
          ...(onlyIfPr ? { onlyIfPr } : {}),
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
    case 'backup': {
      const [, , folder] = args;
      const databaseUrl = process.env.SUPABASE_DB_URL;
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SECRET_KEY;
      if (target === 'create') {
        const out = flag(args, '--out');
        if (!out) break;
        if (!databaseUrl || !supabaseUrl || !serviceKey)
          throw new Error('SUPABASE_DB_URL, SUPABASE_URL and SUPABASE_SECRET_KEY are required');
        const manifest = await createBackup({
          databaseUrl,
          supabaseUrl,
          serviceKey,
          out: resolve(process.cwd(), out),
          files: !args.includes('--no-files'),
          commit: process.env.GITHUB_SHA ?? currentCommit(),
          log: (message) => console.log(message),
        });
        const bytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
        console.log(`backup written to ${out}: ${manifest.files.length} files, ${bytes} bytes`);
        return 0;
      }
      if (target === 'verify' && folder) {
        const { manifest, problems } = await verifyBackup(resolve(process.cwd(), folder));
        if (!manifest || problems.length > 0) {
          for (const problem of problems) console.error(problem);
          return 1;
        }
        console.log(`ok: ${manifest.files.length} files, made ${manifest.createdAt}`);
        return 0;
      }
      if (target === 'restore' && folder) {
        const yes = args.includes('--yes');
        const plan = await restoreBackup({
          dir: resolve(process.cwd(), folder),
          ...(databaseUrl ? { databaseUrl } : {}),
          ...(supabaseUrl ? { supabaseUrl } : {}),
          ...(serviceKey ? { serviceKey } : {}),
          database: !args.includes('--no-database'),
          storage: !args.includes('--no-storage'),
          force: args.includes('--force'),
          ...(flag(args, '--confirm') ? { confirm: flag(args, '--confirm') as string } : {}),
          yes,
          log: (message) => console.log(message),
        });
        if (!yes) {
          if (plan.target)
            console.log(`Target database: ${plan.target.host} / ${plan.target.database}`);
          console.log('Nothing was changed. A restore would replace the rows of these tables:');
          for (const t of plan.tables)
            console.log(
              `  ${t.schema}.${t.table}: ${t.target ?? '?'} now, ${t.backup} in the backup`,
            );
          if (plan.dependents.length > 0)
            console.log(`and empty these tables that refer to them: ${plan.dependents.join(', ')}`);
          console.log(`and upload ${plan.objects} files into ${plan.buckets} buckets.`);
          console.log('Run again with --yes to do it.');
        } else console.log('restore done');
        return 0;
      }
      break;
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
