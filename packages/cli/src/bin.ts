#!/usr/bin/env node
import { resolve } from 'node:path';
import { type DoctorReport, doctor, hostedApps } from './doctor.ts';

const USAGE = `mininode <command>

  doctor <app-dir>   Check one hosted app (manifest, secrets, SDK, RLS, CSP)
  doctor --all       Check every app in hosted/
`;

function print(report: DoctorReport): boolean {
  const errors = report.findings.filter((f) => f.severity === 'error');
  const warnings = report.findings.filter((f) => f.severity === 'warning');
  const status = errors.length > 0 ? 'FAIL' : 'ok';
  console.log(`${status.padEnd(4)} ${report.app}`);
  for (const finding of report.findings) {
    const where = finding.file ? ` ${finding.file}:` : '';
    console.log(
      `     ${finding.severity === 'error' ? 'error' : 'warn '} [${finding.rule}]${where} ${finding.message}`,
    );
  }
  if (warnings.length > 0 && errors.length === 0) console.log(`     ${warnings.length} warning(s)`);
  return errors.length === 0;
}

function main(args: string[]): number {
  const [command, target] = args;
  if (command !== 'doctor' || !target) {
    console.log(USAGE);
    return command ? 1 : 0;
  }
  const root = resolve(import.meta.dirname, '../../..');
  const dirs = target === '--all' ? hostedApps(root) : [resolve(process.cwd(), target)];
  if (dirs.length === 0) {
    console.log('no hosted apps yet');
    return 0;
  }
  const results = dirs.map((dir) => print(doctor(dir)));
  return results.every(Boolean) ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
