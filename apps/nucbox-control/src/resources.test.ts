import { describe, expect, it } from 'vitest';
import { collect, fromDockerStats } from './resources.ts';

describe('resources', () => {
  it('computes container CPU in cores and memory without page cache', () => {
    const usage = fromDockerStats({
      cpu_stats: { cpu_usage: { total_usage: 3_000 }, system_cpu_usage: 20_000, online_cpus: 4 },
      precpu_stats: { cpu_usage: { total_usage: 1_000 }, system_cpu_usage: 10_000 },
      memory_stats: { usage: 600, limit: 1_000, stats: { inactive_file: 100 } },
    });
    expect(usage.cpu).toBeCloseTo(0.8);
    expect(usage.memory).toEqual({ used: 500, total: 1_000 });
  });

  it('reports what it could read and names what failed', async () => {
    const report = await collect(
      {
        host: async () => {
          throw new Error('401');
        },
        vms: async () => [
          {
            vmid: 100,
            name: 'linux',
            status: 'running',
            cpu: 0.1,
            memory: { used: 1, total: 2 },
            disk: 3,
          },
        ],
        storage: async () => [],
      },
      { containers: async () => [] },
      () => new Date('2026-09-29T08:00:00Z'),
    );
    expect(report.host).toBeNull();
    expect(report.vms).toHaveLength(1);
    expect(report.errors).toEqual(['proxmox host: 401']);
    expect(report.at).toBe('2026-09-29T08:00:00.000Z');
  });
});
