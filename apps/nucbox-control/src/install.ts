// Installs a native program for a remote app: snapshot first, then download from R2 inside the
// guest, verify the SHA-256, install silently and register the RemoteApp alias. Runs as a
// background job because installers take minutes.

import { randomUUID } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import type { DockerEngine } from './docker.ts';
import type { Hypervisor } from './proxmox.ts';
import { wineVolume } from './runtimes.ts';

export interface InstallRequest {
  app: string;
  runtime: 'windows' | 'wine';
  program: string;
  installer?: { r2Key: string; sha256: string; silentArgs?: string | undefined } | undefined;
  wingetId?: string | undefined;
}

export interface InstallJob {
  id: string;
  app: string;
  status: 'running' | 'succeeded' | 'failed';
  step: string;
  snapshot?: string;
  output?: string;
  startedAt: string;
  finishedAt?: string;
}

export type UrlSigner = (r2Key: string) => Promise<string>;

export function r2Signer(options: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): UrlSigner {
  const aws = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  return async (r2Key) => {
    const url = new URL(
      `${options.endpoint.replace(/\/$/, '')}/${options.bucket}/${r2Key.split('/').map(encodeURIComponent).join('/')}`,
    );
    url.searchParams.set('X-Amz-Expires', '900');
    const signed = await aws.sign(url, { aws: { signQuery: true } });
    return signed.url;
  };
}

/** Single-quoted PowerShell literal. */
export const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function defaultSilentArgs(r2Key: string): string {
  return r2Key.toLowerCase().endsWith('.msi') ? '/qn /norestart' : '/S';
}

/** The PowerShell run inside the Windows guest (as SYSTEM, via the QEMU guest agent). */
export function windowsInstallScript(request: InstallRequest, downloadUrl: string | null): string {
  const lines = ['$ErrorActionPreference = "Stop"', '$ProgressPreference = "SilentlyContinue"'];
  if (request.installer && downloadUrl) {
    const file = request.installer.r2Key.split('/').pop() ?? 'installer.exe';
    const args = request.installer.silentArgs ?? defaultSilentArgs(file);
    lines.push(
      `$file = Join-Path $env:TEMP ${psQuote(`mininode-${request.app}-${file}`)}`,
      `Invoke-WebRequest -UseBasicParsing -Uri ${psQuote(downloadUrl)} -OutFile $file`,
      '$hash = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLowerInvariant()',
      `if ($hash -ne ${psQuote(request.installer.sha256)}) { Remove-Item $file; throw "sha256 mismatch: $hash" }`,
      file.toLowerCase().endsWith('.msi')
        ? `$p = Start-Process msiexec.exe -ArgumentList ('/i "' + $file + '" ' + ${psQuote(args)}) -Wait -PassThru`
        : `$p = Start-Process $file -ArgumentList ${psQuote(args)} -Wait -PassThru`,
      'Remove-Item $file',
      // 3010 = success, reboot required.
      'if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "installer exit code $($p.ExitCode)" }',
    );
  } else if (request.wingetId) {
    lines.push(
      `winget install --id ${psQuote(request.wingetId)} --exact --silent --scope machine --accept-package-agreements --accept-source-agreements --disable-interactivity`,
      'if ($LASTEXITCODE -ne 0) { throw "winget exit code $LASTEXITCODE" }',
    );
  }
  // RemoteApp alias `||<slug>` → program. Only allow-listed programs can be started over RDP.
  const key = `HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Terminal Server\\TSAppAllowList\\Applications\\${request.app}`;
  lines.push(
    `if (-not (Test-Path ${psQuote(request.program)})) { throw "program not found after install" }`,
    `New-Item -Path ${psQuote(key)} -Force | Out-Null`,
    `Set-ItemProperty -Path ${psQuote(key)} -Name Name -Value ${psQuote(request.app)}`,
    `Set-ItemProperty -Path ${psQuote(key)} -Name Path -Value ${psQuote(request.program)}`,
    `Set-ItemProperty -Path ${psQuote(key)} -Name CommandLineSetting -Value 0 -Type DWord`,
    `Set-ItemProperty -Path ${psQuote(key)} -Name ShowInTSWA -Value 0 -Type DWord`,
    'Write-Output "installed"',
  );
  return lines.join('\n');
}

/** powershell.exe -EncodedCommand expects base64 of UTF-16LE. */
export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export function snapshotName(app: string, date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  return `pre-${app}-${stamp}`.slice(0, 40);
}

export interface Installer {
  start(request: InstallRequest): InstallJob;
  get(id: string): InstallJob | undefined;
}

export function createInstaller(options: {
  hypervisor: Hypervisor;
  docker: DockerEngine;
  windowsVmid: number;
  wineImage: string;
  dockerNetwork: string;
  sign: UrlSigner | null;
  waitForGuestMs?: number;
}): Installer {
  const jobs = new Map<string, InstallJob>();
  const busy = new Set<string>();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function runWindows(job: InstallJob, request: InstallRequest) {
    const vmid = options.windowsVmid;
    job.step = 'wake';
    await options.hypervisor.wake(vmid);
    const deadline = Date.now() + (options.waitForGuestMs ?? 180_000);
    while (!(await options.hypervisor.guestReady(vmid))) {
      if (Date.now() > deadline) throw new Error('Windows guest agent did not answer');
      await sleep(3000);
    }
    job.step = 'snapshot';
    job.snapshot = snapshotName(request.app);
    await options.hypervisor.snapshot(vmid, job.snapshot, `before installing ${request.app}`);
    job.step = 'install';
    const url = request.installer ? await signOrFail(request.installer.r2Key) : null;
    const script = windowsInstallScript(request, url);
    const result = await options.hypervisor.guestExec(vmid, [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodePowerShell(script),
    ]);
    job.output = result.output.slice(-4000);
    if (result.exitCode !== 0) throw new Error(`install script failed (${result.exitCode})`);
  }

  async function runWine(job: InstallJob, request: InstallRequest) {
    if (!request.installer) throw new Error('Wine installs need an installer in R2');
    job.step = 'install';
    const url = await signOrFail(request.installer.r2Key);
    const name = `mn-wine-install-${request.app}`;
    // The Wine image's entrypoint implements `install <url> <sha256> [args]` (infra/nucbox/wine).
    await options.docker.run({
      name,
      image: options.wineImage,
      env: {},
      labels: { 'app.mininode.job': 'install', 'app.mininode.app': request.app },
      network: options.dockerNetwork,
      memoryMb: 1536,
      volumes: { [wineVolume(request.app)]: '/wine' },
      cmd: [
        'install',
        url,
        request.installer.sha256,
        request.installer.silentArgs ?? defaultSilentArgs(request.installer.r2Key),
      ],
      autoRemove: true,
    });
    const result = await options.docker.wait(name);
    job.output = result.output;
    if (result.exitCode !== 0) throw new Error(`wine install failed (${result.exitCode})`);
  }

  async function signOrFail(r2Key: string) {
    if (!options.sign) throw new Error('R2 credentials are not configured');
    return options.sign(r2Key);
  }

  return {
    start(request) {
      if (busy.has(request.app))
        throw new Error(`an install for ${request.app} is already running`);
      if (!request.installer && !request.wingetId)
        throw new Error('installer or wingetId required');
      const job: InstallJob = {
        id: randomUUID(),
        app: request.app,
        status: 'running',
        step: 'queued',
        startedAt: new Date().toISOString(),
      };
      jobs.set(job.id, job);
      busy.add(request.app);
      const run = request.runtime === 'windows' ? runWindows : runWine;
      run(job, request)
        .then(() => {
          job.status = 'succeeded';
          job.step = 'done';
        })
        .catch((error: unknown) => {
          job.status = 'failed';
          job.output =
            `${job.output ?? ''}\n${error instanceof Error ? error.message : String(error)}`.trim();
        })
        .finally(() => {
          job.finishedAt = new Date().toISOString();
          busy.delete(request.app);
          console.log(
            JSON.stringify({
              event: 'install_finished',
              app: job.app,
              status: job.status,
              step: job.step,
            }),
          );
        });
      return job;
    },
    get(id) {
      return jobs.get(id);
    },
  };
}
