// Runtime scheduling: wakes the Windows VM or starts a Wine container for a session, and frees
// the resources again once no session has used them for the configured idle time.

import { randomBytes } from 'node:crypto';
import type { Config } from './config.ts';
import type { DockerEngine } from './docker.ts';
import type { Hypervisor } from './proxmox.ts';

export type RuntimeName = 'windows' | 'wine' | 'android';

export interface PrepareRequest {
  app: string;
  runtime: RuntimeName;
  program: string;
}

export interface GuacConnection {
  protocol: 'rdp' | 'vnc';
  parameters: Record<string, string>;
}

export type PrepareResult =
  | { ready: false; etaSeconds: number }
  | { ready: true; connection: GuacConnection };

export class RuntimeUnavailable extends Error {}

const WINE_LABEL = 'app.mininode.runtime=wine';
export const wineContainer = (slug: string) => `mn-wine-${slug}`;
export const wineVolume = (slug: string) => `mn-wine-${slug}`;

type RuntimeConfig = Pick<
  Config,
  | 'WINDOWS_VMID'
  | 'WINDOWS_HOST'
  | 'WINDOWS_RDP_USER'
  | 'WINDOWS_RDP_PASSWORD'
  | 'WINDOWS_IDLE_MINUTES'
  | 'WINDOWS_BOOT_SECONDS'
  | 'WINE_ENABLED'
  | 'WINE_IMAGE'
  | 'WINE_IDLE_MINUTES'
  | 'DOCKER_NETWORK'
>;

export interface Scheduler {
  prepare(request: PrepareRequest): Promise<PrepareResult>;
  /** Called by the platform API (every 5 min) with the apps that still have live sessions. */
  sync(activeApps: string[]): void;
  /** Hibernates / stops whatever has been idle for too long. Runs on a timer. */
  reap(): Promise<string[]>;
}

export function createScheduler(options: {
  config: RuntimeConfig;
  hypervisor: Hypervisor;
  docker: DockerEngine;
  now?: () => number;
}): Scheduler {
  const { config, hypervisor, docker } = options;
  const now = options.now ?? Date.now;
  // Runtime of every app we have prepared, and when each was last used. Kept in memory: after a
  // restart everything counts as freshly used, so nothing is torn down under a live session.
  const runtimeOf = new Map<string, RuntimeName>();
  const lastUsed = new Map<string, number>();
  const startedAt = now();
  let windowsLastUsed = startedAt;

  const touch = (app: string) => {
    lastUsed.set(app, now());
    if (runtimeOf.get(app) === 'windows') windowsLastUsed = now();
  };

  async function prepareWindows(request: PrepareRequest): Promise<PrepareResult> {
    const vmid = config.WINDOWS_VMID;
    const state = await hypervisor.state(vmid);
    if (state !== 'running') {
      await hypervisor.wake(vmid);
      return { ready: false, etaSeconds: state === 'suspended' ? 15 : config.WINDOWS_BOOT_SECONDS };
    }
    if (!(await hypervisor.guestReady(vmid))) return { ready: false, etaSeconds: 10 };
    return {
      ready: true,
      connection: {
        protocol: 'rdp',
        parameters: {
          hostname: config.WINDOWS_HOST,
          port: '3389',
          username: config.WINDOWS_RDP_USER,
          password: config.WINDOWS_RDP_PASSWORD,
          security: 'nla',
          'ignore-cert': 'true',
          // The alias is registered in TSAppAllowList by the installer (install.ts).
          'remote-app': `||${request.app}`,
          'resize-method': 'display-update',
          'server-layout': 'de-de-qwertz',
          'enable-font-smoothing': 'true',
        },
      },
    };
  }

  async function prepareWine(request: PrepareRequest): Promise<PrepareResult> {
    if (!config.WINE_ENABLED)
      throw new RuntimeUnavailable('Wine ist auf dieser NucBox deaktiviert.');
    const name = wineContainer(request.app);
    let info = await docker.inspect(name);
    if (!info?.running) {
      const password =
        info?.labels['app.mininode.vnc-password'] ?? randomBytes(12).toString('base64url');
      await docker.run({
        name,
        image: config.WINE_IMAGE,
        env: { PROGRAM: request.program, VNC_PASSWORD: password, LANG: 'de_DE.UTF-8' },
        labels: {
          'app.mininode.runtime': 'wine',
          'app.mininode.app': request.app,
          'app.mininode.vnc-password': password,
        },
        network: config.DOCKER_NETWORK,
        memoryMb: 1536,
        volumes: { [wineVolume(request.app)]: '/wine' },
      });
      info = await docker.inspect(name);
      if (!info?.running) return { ready: false, etaSeconds: 5 };
    }
    return {
      ready: true,
      connection: {
        protocol: 'vnc',
        parameters: {
          hostname: name,
          port: '5900',
          password: info.labels['app.mininode.vnc-password'] ?? '',
          'color-depth': '24',
        },
      },
    };
  }

  return {
    async prepare(request) {
      runtimeOf.set(request.app, request.runtime);
      touch(request.app);
      switch (request.runtime) {
        case 'windows':
          return prepareWindows(request);
        case 'wine':
          return prepareWine(request);
        case 'android':
          throw new RuntimeUnavailable('Android-Apps sind noch nicht verfügbar.');
      }
    },

    sync(activeApps) {
      for (const app of activeApps) touch(app);
      // An active app whose runtime we don't know (e.g. after a restart) might be on Windows.
      if (activeApps.some((app) => !runtimeOf.has(app))) windowsLastUsed = now();
    },

    async reap() {
      const actions: string[] = [];
      const t = now();
      if (t - windowsLastUsed > config.WINDOWS_IDLE_MINUTES * 60_000) {
        if ((await hypervisor.state(config.WINDOWS_VMID)) === 'running') {
          await hypervisor.hibernate(config.WINDOWS_VMID);
          actions.push('windows:hibernate');
        }
      }
      for (const container of await docker.list(WINE_LABEL)) {
        if (!container.running) continue;
        const app = container.labels['app.mininode.app'] ?? '';
        const used = lastUsed.get(app) ?? startedAt;
        if (t - used > config.WINE_IDLE_MINUTES * 60_000) {
          await docker.stop(container.name);
          actions.push(`wine:${app}:stop`);
        }
      }
      return actions;
    },
  };
}
