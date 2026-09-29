// Resource report for Verwaltung → NucBox: what the Proxmox host, its VMs, its storage and the
// containers on the Linux VM use, and what is left. Read-only; every source may fail on its own.

import { readFileSync } from 'node:fs';
import { Agent, type Client, type Dispatcher } from 'undici';

export interface Usage {
  used: number;
  total: number;
}

export interface ResourceReport {
  at: string;
  host: {
    /** 0–1 over all cores. */
    cpu: number;
    cores: number;
    memory: Usage;
    rootfs: Usage;
    uptimeSeconds: number;
    load: number[];
  } | null;
  storage: ({ name: string; type: string } & Usage)[];
  vms: { vmid: number; name: string; status: string; cpu: number; memory: Usage; disk: number }[];
  containers: {
    name: string;
    /** The MiniNode app it serves (`app-<slug>`), or null for platform services. */
    app: string | null;
    running: boolean;
    /** 0–1 of one core × cores, i.e. comparable to `host.cpu` times cores. */
    cpu: number;
    memory: Usage;
  }[];
  /** Sources that could not be read, e.g. "proxmox: 401". */
  errors: string[];
}

export interface HostSource {
  host(): Promise<ResourceReport['host']>;
  vms(): Promise<ResourceReport['vms']>;
  storage(): Promise<ResourceReport['storage']>;
}

export interface ContainerSource {
  containers(): Promise<ResourceReport['containers']>;
}

export async function collect(
  host: HostSource,
  docker: ContainerSource,
  now = () => new Date(),
): Promise<ResourceReport> {
  const errors: string[] = [];
  const settle = async <T>(label: string, work: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await work;
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  };
  const [hostInfo, vms, storage, containers] = await Promise.all([
    settle('proxmox host', host.host(), null),
    settle('proxmox vms', host.vms(), []),
    settle('proxmox storage', host.storage(), []),
    settle('docker', docker.containers(), []),
  ]);
  return { at: now().toISOString(), host: hostInfo, storage, vms, containers, errors };
}

/** Proxmox VE node API (token needs Sys.Audit on the node and VM.Audit on the VMs). */
export function proxmoxResources(options: {
  url: string;
  node: string;
  token: string;
  caFile?: string | undefined;
  dispatcher?: Dispatcher;
}): HostSource {
  const dispatcher =
    options.dispatcher ??
    new Agent({ connect: options.caFile ? { ca: readFileSync(options.caFile, 'utf8') } : {} });
  const base = `${options.url.replace(/\/$/, '')}/api2/json/nodes/${options.node}`;
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      headers: { Authorization: `PVEAPIToken=${options.token}` },
      signal: AbortSignal.timeout(10_000),
      // @ts-expect-error undici dispatcher is supported by Node's fetch
      dispatcher,
    });
    if (!response.ok) throw new Error(String(response.status));
    return ((await response.json()) as { data: T }).data;
  };
  return {
    async host() {
      const s = await get<{
        cpu: number;
        cpuinfo: { cpus: number };
        memory: { used: number; total: number };
        rootfs: { used: number; total: number };
        uptime: number;
        loadavg: string[];
      }>('/status');
      return {
        cpu: s.cpu,
        cores: s.cpuinfo.cpus,
        memory: { used: s.memory.used, total: s.memory.total },
        rootfs: { used: s.rootfs.used, total: s.rootfs.total },
        uptimeSeconds: s.uptime,
        load: s.loadavg.map(Number),
      };
    },
    async vms() {
      const list =
        await get<
          {
            vmid: number;
            name?: string;
            status: string;
            cpu?: number;
            mem?: number;
            maxmem?: number;
            maxdisk?: number;
          }[]
        >('/qemu');
      return list
        .map((vm) => ({
          vmid: vm.vmid,
          name: vm.name ?? `VM ${vm.vmid}`,
          status: vm.status,
          cpu: vm.cpu ?? 0,
          memory: { used: vm.status === 'running' ? (vm.mem ?? 0) : 0, total: vm.maxmem ?? 0 },
          disk: vm.maxdisk ?? 0,
        }))
        .sort((a, b) => a.vmid - b.vmid);
    },
    async storage() {
      const list =
        await get<
          { storage: string; type: string; used?: number; total?: number; active?: number }[]
        >('/storage');
      return list
        .filter((s) => s.active !== 0 && (s.total ?? 0) > 0)
        .map((s) => ({ name: s.storage, type: s.type, used: s.used ?? 0, total: s.total ?? 0 }));
    },
  };
}

interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
  memory_stats: { usage?: number; limit?: number; stats?: { inactive_file?: number } };
}

/** CPU in cores (1 = one core busy) and memory without page cache, like `docker stats`. */
export function fromDockerStats(stats: DockerStats): { cpu: number; memory: Usage } {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
  const cores = stats.cpu_stats.online_cpus ?? 1;
  const cpu = cpuDelta > 0 && systemDelta > 0 ? (cpuDelta / systemDelta) * cores : 0;
  const usage = stats.memory_stats.usage ?? 0;
  const cache = stats.memory_stats.stats?.inactive_file ?? 0;
  return {
    cpu,
    memory: { used: Math.max(0, usage - cache), total: stats.memory_stats.limit ?? 0 },
  };
}

/** Containers on the Linux VM through the Docker socket. */
export function dockerResources(client: Client): ContainerSource {
  const get = async <T>(path: string): Promise<T> => {
    const response = await client.request({ method: 'GET', path: `/v1.47${path}` });
    const text = await response.body.text();
    if (response.statusCode >= 400) throw new Error(`${response.statusCode}`);
    return JSON.parse(text) as T;
  };
  return {
    async containers() {
      const list = await get<{ Id: string; Names: string[]; State: string }[]>(
        '/containers/json?all=true',
      );
      const rows = await Promise.all(
        list.map(async (c) => {
          const name = (c.Names[0] ?? c.Id).replace(/^\//, '');
          const running = c.State === 'running';
          const usage = running
            ? fromDockerStats(await get<DockerStats>(`/containers/${c.Id}/stats?stream=false`))
            : { cpu: 0, memory: { used: 0, total: 0 } };
          const app = /^app-([a-z][a-z0-9-]{0,30}[a-z0-9])$/.exec(name)?.[1] ?? null;
          return { name, app, running, ...usage };
        }),
      );
      return rows.sort((a, b) => b.memory.used - a.memory.used);
    },
  };
}
