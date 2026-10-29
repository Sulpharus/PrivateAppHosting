import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';
import { noHypervisor } from './proxmox.ts';
import { collect, localResources } from './resources.ts';

const base = {
  CONTROL_TOKEN: 'x'.repeat(32),
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'k',
  PORTAL_URL: 'https://apps.example.org',
} as NodeJS.ProcessEnv;

describe('a home server without Proxmox', () => {
  it('starts without any Proxmox or Windows settings', () => {
    const config = loadConfig(base);
    expect(config.PROXMOX_URL).toBeUndefined();
    expect(config.PLATFORM_DOMAIN).toBe('apps.example.org');
  });

  it('asks for the token and the RDP password once a Proxmox URL is given', () => {
    expect(() => loadConfig({ ...base, PROXMOX_URL: 'https://10.0.0.2:8006' })).toThrow(
      /PROXMOX_TOKEN[\s\S]*WINDOWS_RDP_PASSWORD/,
    );
    expect(
      loadConfig({
        ...base,
        PROXMOX_URL: 'https://10.0.0.2:8006',
        PROXMOX_TOKEN: 't',
        WINDOWS_RDP_PASSWORD: 'p',
      }).PROXMOX_URL,
    ).toBe('https://10.0.0.2:8006');
  });

  it('says why a Windows program cannot start, and has nothing to hibernate', async () => {
    const none = noHypervisor();
    expect(await none.state(200)).toBe('unknown');
    await expect(none.wake(200)).rejects.toThrow(/Proxmox/);
    expect(await none.guestReady(200)).toBe(false);
  });

  it('reports this computer instead of a Proxmox node', async () => {
    const containers = { containers: async () => [] };
    const report = await collect(localResources(), containers);
    expect(report.errors).toEqual([]);
    expect(report.host?.cores).toBeGreaterThan(0);
    expect(report.host?.memory.total).toBeGreaterThan(0);
    expect(report.vms).toEqual([]);
  });
});
