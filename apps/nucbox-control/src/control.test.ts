import { createVerifier, type Verifier } from '@mininode/gate';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedGrants, slugFromHost } from './auth.ts';
import type { ContainerInfo, DockerEngine, RunSpec } from './docker.ts';
import {
  createInstaller,
  encodePowerShell,
  psQuote,
  snapshotName,
  windowsInstallScript,
} from './install.ts';
import type { Hypervisor, VmState } from './proxmox.ts';
import { createScheduler } from './runtimes.ts';
import { createServer } from './server.ts';

const TOKEN = 'c'.repeat(40);
const SUPABASE_URL = 'https://proj.supabase.co';

function fakeHypervisor(initial: VmState = 'suspended') {
  let state: VmState = initial;
  let agent = initial === 'running';
  const calls: string[] = [];
  const hv: Hypervisor & { calls: string[]; boot(): void } = {
    calls,
    boot() {
      state = 'running';
      agent = true;
    },
    async state() {
      return state;
    },
    async wake() {
      calls.push('wake');
      if (state !== 'running') state = 'running';
    },
    async hibernate() {
      calls.push('hibernate');
      state = 'suspended';
      agent = false;
    },
    async guestReady() {
      return agent;
    },
    async snapshot(_vmid, name) {
      calls.push(`snapshot:${name}`);
    },
    async guestExec(_vmid, command) {
      calls.push(`exec:${command[0]}`);
      return { exitCode: 0, output: 'installed' };
    },
  };
  return hv;
}

function fakeDocker() {
  const containers = new Map<string, ContainerInfo>();
  const runs: RunSpec[] = [];
  const docker: DockerEngine & { containers: typeof containers; runs: RunSpec[] } = {
    containers,
    runs,
    async list(label) {
      const [key, value] = label.split('=');
      return [...containers.values()].filter((c) => c.labels[key ?? ''] === value);
    },
    async inspect(name) {
      return containers.get(name) ?? null;
    },
    async run(spec) {
      runs.push(spec);
      containers.set(spec.name, { name: spec.name, running: true, labels: spec.labels });
    },
    async stop(name) {
      const c = containers.get(name);
      if (c) c.running = false;
    },
    async wait() {
      return { exitCode: 0, output: 'ok' };
    },
  };
  return docker;
}

const config = {
  WINDOWS_VMID: 200,
  WINDOWS_HOST: '10.10.0.20',
  WINDOWS_RDP_USER: 'mininode',
  WINDOWS_RDP_PASSWORD: 'secret',
  WINDOWS_IDLE_MINUTES: 15,
  WINDOWS_BOOT_SECONDS: 35,
  WINE_ENABLED: true,
  WINE_IMAGE: 'wine:test',
  WINE_IDLE_MINUTES: 10,
  DOCKER_NETWORK: 'mininode',
};

describe('scheduler', () => {
  let clock = 0;
  const now = () => clock;
  beforeEach(() => {
    clock = 1_000_000;
  });

  it('wakes a hibernated Windows VM and hands out an RDP RemoteApp connection once ready', async () => {
    const hv = fakeHypervisor('suspended');
    const scheduler = createScheduler({ config, hypervisor: hv, docker: fakeDocker(), now });
    const request = { app: 'buchhaltung', runtime: 'windows' as const, program: 'C:\\app.exe' };

    expect(await scheduler.prepare(request)).toEqual({ ready: false, etaSeconds: 15 });
    expect(hv.calls).toEqual(['wake']);
    hv.boot();
    const ready = await scheduler.prepare(request);
    expect(ready).toMatchObject({
      ready: true,
      connection: {
        protocol: 'rdp',
        parameters: { 'remote-app': '||buchhaltung', hostname: '10.10.0.20' },
      },
    });
  });

  it('hibernates Windows only after the idle timeout since the last use', async () => {
    const hv = fakeHypervisor('running');
    const scheduler = createScheduler({ config, hypervisor: hv, docker: fakeDocker(), now });
    await scheduler.prepare({ app: 'a1', runtime: 'windows', program: 'x' });

    clock += 10 * 60_000;
    scheduler.sync(['a1']);
    clock += 14 * 60_000;
    expect(await scheduler.reap()).toEqual([]);
    clock += 2 * 60_000;
    expect(await scheduler.reap()).toEqual(['windows:hibernate']);
    expect(hv.calls).toContain('hibernate');
  });

  it('keeps Windows awake for active apps of unknown runtime (after a restart)', async () => {
    const hv = fakeHypervisor('running');
    const scheduler = createScheduler({ config, hypervisor: hv, docker: fakeDocker(), now });
    clock += 14 * 60_000;
    scheduler.sync(['unknown-app']);
    clock += 14 * 60_000;
    expect(await scheduler.reap()).toEqual([]);
  });

  it('starts one Wine container per app and stops it when idle', async () => {
    const docker = fakeDocker();
    const scheduler = createScheduler({ config, hypervisor: fakeHypervisor(), docker, now });
    const first = await scheduler.prepare({ app: 'paint', runtime: 'wine', program: 'paint.exe' });
    expect(first).toMatchObject({
      ready: true,
      connection: { protocol: 'vnc', parameters: { hostname: 'mn-wine-paint' } },
    });
    const again = await scheduler.prepare({ app: 'paint', runtime: 'wine', program: 'paint.exe' });
    expect(docker.runs).toHaveLength(1);
    // Password stays stable for a running container.
    expect(again).toEqual(first);

    clock += 11 * 60_000;
    expect(await scheduler.reap()).toEqual(['wine:paint:stop']);
    expect(docker.containers.get('mn-wine-paint')?.running).toBe(false);
  });

  it('rejects disabled runtimes', async () => {
    const scheduler = createScheduler({
      config: { ...config, WINE_ENABLED: false },
      hypervisor: fakeHypervisor(),
      docker: fakeDocker(),
      now,
    });
    await expect(scheduler.prepare({ app: 'x1', runtime: 'wine', program: 'x' })).rejects.toThrow(
      'deaktiviert',
    );
    await expect(
      scheduler.prepare({ app: 'x1', runtime: 'android', program: 'x' }),
    ).rejects.toThrow();
  });
});

describe('install script', () => {
  const request = {
    app: 'kasse',
    runtime: 'windows' as const,
    program: "C:\\Program Files\\O'Kasse\\kasse.exe",
    installer: { r2Key: 'installers/kasse/Setup.msi', sha256: 'a'.repeat(64) },
  };

  it('verifies the hash, installs silently and registers the RemoteApp alias', () => {
    const script = windowsInstallScript(request, 'https://r2.example/signed?x=1');
    expect(script).toContain('Get-FileHash -Algorithm SHA256');
    expect(script).toContain(`if ($hash -ne '${'a'.repeat(64)}')`);
    expect(script).toContain('msiexec.exe');
    expect(script).toContain("'/qn /norestart'");
    expect(script).toContain('TSAppAllowList\\Applications\\kasse');
    // Quotes in paths are escaped for PowerShell.
    expect(script).toContain("'C:\\Program Files\\O''Kasse\\kasse.exe'");
  });

  it('supports winget and encodes for -EncodedCommand', () => {
    const script = windowsInstallScript(
      { ...request, installer: undefined, wingetId: 'Mozilla.Firefox' },
      null,
    );
    expect(script).toContain("winget install --id 'Mozilla.Firefox'");
    expect(Buffer.from(encodePowerShell('Write-Output 1'), 'base64').toString('utf16le')).toBe(
      'Write-Output 1',
    );
    expect(psQuote("a'b")).toBe("'a''b'");
  });

  it('creates valid Proxmox snapshot names', () => {
    const name = snapshotName(
      'a-very-long-app-name-that-keeps-going',
      new Date('2026-09-23T10:20:30Z'),
    );
    expect(name).toMatch(/^pre-[a-z0-9-]+$/);
    expect(name.length).toBeLessThanOrEqual(40);
    expect(snapshotName('kasse', new Date('2026-09-23T10:20:30Z'))).toBe('pre-kasse-202609231020');
  });

  it('runs snapshot before install and reports the job', async () => {
    const hv = fakeHypervisor('suspended');
    hv.boot();
    const installer = createInstaller({
      hypervisor: hv,
      docker: fakeDocker(),
      windowsVmid: 200,
      wineImage: 'wine:test',
      dockerNetwork: 'mininode',
      sign: async (key) => `https://signed/${key}`,
    });
    const job = installer.start(request);
    expect(() => installer.start(request)).toThrow('already running');
    await vi.waitFor(() => expect(installer.get(job.id)?.status).toBe('succeeded'));
    expect(hv.calls.findIndex((c) => c.startsWith('snapshot:'))).toBeLessThan(
      hv.calls.indexOf('exec:powershell.exe'),
    );
  });
});

describe('forward auth helpers', () => {
  it('extracts app slugs only from direct subdomains', () => {
    expect(slugFromHost('rezepte.mininode.app', 'mininode.app')).toBe('rezepte');
    expect(slugFromHost('Rezepte.mininode.app:443', 'mininode.app')).toBe('rezepte');
    expect(slugFromHost('mininode.app', 'mininode.app')).toBeNull();
    expect(slugFromHost('a.b.mininode.app', 'mininode.app')).toBeNull();
    expect(slugFromHost('rezepte.evil.app', 'mininode.app')).toBeNull();
  });

  it('caches grant answers for the TTL', async () => {
    let t = 0;
    const check = vi.fn(async () => true);
    const cached = cachedGrants(check, 1000, () => t);
    await cached('tok', 'app1');
    await cached('tok', 'app1');
    expect(check).toHaveBeenCalledTimes(1);
    t = 2000;
    await cached('tok', 'app1');
    expect(check).toHaveBeenCalledTimes(2);
  });
});

describe('server', () => {
  let verifier: Verifier;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
    verifier = createVerifier(SUPABASE_URL, createLocalJWKSet({ keys: [jwk] }));
  });

  const sessionCookie = async () => {
    const jwt = await new SignJWT({
      role: 'authenticated',
      mn_role: 'trusted',
      email: 'a@example.com',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('11111111-1111-1111-1111-111111111111')
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const value = Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: 'r' })).toString(
      'base64url',
    );
    return { jwt, cookie: `mn-auth=base64-${value}` };
  };

  const build = (granted: boolean) =>
    createServer({
      controlToken: TOKEN,
      scheduler: createScheduler({
        config,
        hypervisor: fakeHypervisor('running'),
        docker: fakeDocker(),
      }),
      installer: createInstaller({
        hypervisor: fakeHypervisor('running'),
        docker: fakeDocker(),
        windowsVmid: 200,
        wineImage: 'w',
        dockerNetwork: 'n',
        sign: null,
      }),
      auth: {
        platformDomain: 'mininode.app',
        portalUrl: 'https://mininode.app',
        verifier,
        checkGrant: async () => granted,
      },
    });

  const forwarded = (cookie?: string, mode = 'navigate') =>
    new Headers({
      'X-Forwarded-Host': 'rechner.mininode.app',
      'X-Forwarded-Uri': '/seite?x=1',
      'X-Forwarded-Proto': 'https',
      'Sec-Fetch-Mode': mode,
      ...(cookie ? { Cookie: cookie } : {}),
    });

  it('allows granted users and passes identity headers', async () => {
    const { jwt, cookie } = await sessionCookie();
    const res = await build(true).request('/auth', { headers: forwarded(cookie) });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Mininode-User')).toBe('11111111-1111-1111-1111-111111111111');
    expect(res.headers.get('X-Mininode-Role')).toBe('trusted');
    expect(res.headers.get('X-Mininode-Email')).toBe('a@example.com');
    expect(res.headers.get('X-Mininode-Token')).toBe(jwt);
  });

  it('redirects anonymous navigations to the central login, 401 for fetches', async () => {
    const nav = await build(true).request('/auth', { headers: forwarded() });
    expect(nav.status).toBe(302);
    expect(nav.headers.get('Location')).toBe(
      `https://mininode.app/login?next=${encodeURIComponent('https://rechner.mininode.app/seite?x=1')}`,
    );
    const api = await build(true).request('/auth', { headers: forwarded(undefined, 'cors') });
    expect(api.status).toBe(401);
  });

  it('answers 403 without a grant', async () => {
    const { cookie } = await sessionCookie();
    const res = await build(false).request('/auth', { headers: forwarded(cookie) });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('Kein Zugriff');
  });

  it('protects control endpoints with the bearer token', async () => {
    const server = build(true);
    const body = JSON.stringify({ app: 'kasse', runtime: 'windows', program: 'C:\\k.exe' });
    const denied = await server.request('/sessions/prepare', { method: 'POST', body });
    expect(denied.status).toBe(401);
    const wrong = await server.request('/sessions/prepare', {
      method: 'POST',
      body,
      headers: { Authorization: `Bearer ${'x'.repeat(40)}` },
    });
    expect(wrong.status).toBe(401);
    const ok = await server.request('/sessions/prepare', {
      method: 'POST',
      body,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ready: true });

    const android = await server.request('/sessions/prepare', {
      method: 'POST',
      body: JSON.stringify({ app: 'kasse', runtime: 'android', program: 'x' }),
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(android.status).toBe(501);

    const sync = await server.request('/sessions/sync', {
      method: 'POST',
      body: JSON.stringify({ activeApps: ['kasse'] }),
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(await sync.json()).toEqual({ ok: true, actions: [] });
  });
});

describe('docker log demux', () => {
  it('joins stdout and stderr frames', async () => {
    const { demuxLogs } = await import('./docker.ts');
    const frame = (stream: number, text: string) => {
      const header = Buffer.alloc(8);
      header[0] = stream;
      header.writeUInt32BE(Buffer.byteLength(text), 4);
      return Buffer.concat([header, Buffer.from(text)]);
    };
    expect(demuxLogs(Buffer.concat([frame(1, 'hallo '), frame(2, 'welt')]))).toBe('hallo welt');
  });
});
