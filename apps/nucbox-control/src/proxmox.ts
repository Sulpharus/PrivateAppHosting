// Minimal Proxmox VE API client for the Windows VM: power, snapshots and guest-agent commands.

import { readFileSync } from 'node:fs';
import { Agent, type Dispatcher } from 'undici';

export type VmState = 'running' | 'stopped' | 'suspended' | 'paused' | 'unknown';

export interface Hypervisor {
  state(vmid: number): Promise<VmState>;
  /** Starts a stopped VM or resumes one that was hibernated to disk. */
  wake(vmid: number): Promise<void>;
  /** Hibernates to disk: frees RAM, resumes in seconds with open programs. */
  hibernate(vmid: number): Promise<void>;
  /** True once the QEMU guest agent answers (Windows has finished booting). */
  guestReady(vmid: number): Promise<boolean>;
  snapshot(vmid: number, name: string, description: string): Promise<void>;
  /** Runs a command in the guest; resolves with exit code and output. */
  guestExec(
    vmid: number,
    command: string[],
    timeoutMs?: number,
  ): Promise<{ exitCode: number; output: string }>;
}

export function proxmoxClient(options: {
  url: string;
  node: string;
  token: string;
  caFile?: string | undefined;
  dispatcher?: Dispatcher;
}): Hypervisor {
  const dispatcher =
    options.dispatcher ??
    new Agent({ connect: options.caFile ? { ca: readFileSync(options.caFile, 'utf8') } : {} });
  const base = `${options.url.replace(/\/$/, '')}/api2/json/nodes/${options.node}/qemu`;

  const call = async <T>(
    method: string,
    path: string,
    form?: Record<string, string> | URLSearchParams,
  ): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `PVEAPIToken=${options.token}`,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(form ? { body: form instanceof URLSearchParams ? form : new URLSearchParams(form) } : {}),
      // @ts-expect-error undici dispatcher is supported by Node's fetch
      dispatcher,
    });
    if (!response.ok)
      throw new Error(`proxmox ${method} ${path}: ${response.status} ${await response.text()}`);
    return ((await response.json()) as { data: T }).data;
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async state(vmid) {
      const status = await call<{ status: string; qmpstatus?: string; lock?: string }>(
        'GET',
        `/${vmid}/status/current`,
      );
      if (status.lock === 'suspended' || status.qmpstatus === 'suspended') return 'suspended';
      if (status.qmpstatus === 'paused') return 'paused';
      if (status.status === 'running') return 'running';
      if (status.status === 'stopped') return 'stopped';
      return 'unknown';
    },
    async wake(vmid) {
      const state = await this.state(vmid);
      if (state === 'running') return;
      if (state === 'paused') await call('POST', `/${vmid}/status/resume`, {});
      else await call('POST', `/${vmid}/status/start`, {});
    },
    async hibernate(vmid) {
      if ((await this.state(vmid)) !== 'running') return;
      await call('POST', `/${vmid}/status/suspend`, { todisk: '1' });
    },
    async guestReady(vmid) {
      try {
        await call('POST', `/${vmid}/agent/ping`, {});
        return true;
      } catch {
        return false;
      }
    },
    async snapshot(vmid, name, description) {
      await call('POST', `/${vmid}/snapshot`, { snapname: name, description });
    },
    async guestExec(vmid, command, timeoutMs = 15 * 60_000) {
      // Proxmox expects the argv as repeated `command` fields.
      const params = new URLSearchParams();
      for (const part of command) params.append('command', part);
      const { pid } = await call<{ pid: number }>('POST', `/${vmid}/agent/exec`, params);
      const started = Date.now();
      for (;;) {
        const status = await call<{
          exited: number;
          exitcode?: number;
          'out-data'?: string;
          'err-data'?: string;
        }>('GET', `/${vmid}/agent/exec-status?pid=${pid}`);
        if (status.exited) {
          return {
            exitCode: status.exitcode ?? -1,
            output: `${status['out-data'] ?? ''}${status['err-data'] ?? ''}`,
          };
        }
        if (Date.now() - started > timeoutMs) throw new Error('guest command timed out');
        await sleep(3000);
      }
    },
  };
}
