// Minimal Docker Engine API client over the local socket (only what Wine sessions need).

import { Client } from 'undici';

export interface ContainerInfo {
  name: string;
  running: boolean;
  labels: Record<string, string>;
}

export interface RunSpec {
  name: string;
  image: string;
  env: Record<string, string>;
  labels: Record<string, string>;
  network: string;
  memoryMb: number;
  /** Named volume → mount path. */
  volumes: Record<string, string>;
  cmd?: string[];
  /** Remove the container when it exits (one-off jobs such as installs). */
  autoRemove?: boolean;
}

export interface DockerEngine {
  list(label: string): Promise<ContainerInfo[]>;
  inspect(name: string): Promise<ContainerInfo | null>;
  /** Creates (if missing) and starts the container. */
  run(spec: RunSpec): Promise<void>;
  stop(name: string): Promise<void>;
  /** Waits for a container to exit and returns its exit code and log tail. */
  wait(name: string): Promise<{ exitCode: number; output: string }>;
}

export function dockerEngine(
  socketPath: string,
  client = new Client('http://docker', { socketPath }),
): DockerEngine {
  const request = async <T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T }> => {
    const response = await client.request({
      method,
      path: `/v1.47${path}`,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.body.text();
    if (response.statusCode >= 400 && response.statusCode !== 404 && response.statusCode !== 304) {
      throw new Error(`docker ${method} ${path}: ${response.statusCode} ${text}`);
    }
    return { status: response.statusCode, data: (text ? JSON.parse(text) : null) as T };
  };

  const toInfo = (
    name: string,
    running: boolean,
    labels: Record<string, string> | null,
  ): ContainerInfo => ({
    name: name.replace(/^\//, ''),
    running,
    labels: labels ?? {},
  });

  return {
    async list(label) {
      const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
      const { data } = await request<
        { Names: string[]; State: string; Labels: Record<string, string> }[]
      >('GET', `/containers/json?all=true&filters=${filters}`);
      return data.map((c) => toInfo(c.Names[0] ?? '', c.State === 'running', c.Labels));
    },
    async inspect(name) {
      const { status, data } = await request<{
        Name: string;
        State: { Running: boolean };
        Config: { Labels: Record<string, string> };
      }>('GET', `/containers/${encodeURIComponent(name)}/json`);
      if (status === 404) return null;
      return toInfo(data.Name, data.State.Running, data.Config.Labels);
    },
    async run(spec) {
      const existing = await this.inspect(spec.name);
      if (!existing) {
        const created = await request(
          'POST',
          `/containers/create?name=${encodeURIComponent(spec.name)}`,
          {
            Image: spec.image,
            Env: Object.entries(spec.env).map(([key, value]) => `${key}=${value}`),
            Labels: spec.labels,
            ...(spec.cmd ? { Cmd: spec.cmd } : {}),
            HostConfig: {
              NetworkMode: spec.network,
              Memory: spec.memoryMb * 1024 * 1024,
              MemorySwap: spec.memoryMb * 1024 * 1024,
              PidsLimit: 512,
              CapDrop: ['ALL'],
              SecurityOpt: ['no-new-privileges:true'],
              AutoRemove: spec.autoRemove ?? false,
              Mounts: Object.entries(spec.volumes).map(([source, target]) => ({
                Type: 'volume',
                Source: source,
                Target: target,
              })),
            },
          },
        );
        if (created.status === 404)
          throw new Error(`docker image ${spec.image} not found; pull it first`);
      } else if (existing.running) {
        return;
      }
      await request('POST', `/containers/${encodeURIComponent(spec.name)}/start`);
    },
    async stop(name) {
      await request('POST', `/containers/${encodeURIComponent(name)}/stop?t=20`);
    },
    async wait(name) {
      const logs = client.request({
        method: 'GET',
        path: `/v1.47/containers/${encodeURIComponent(name)}/logs?follow=true&stdout=true&stderr=true&tail=200`,
      });
      const { data } = await request<{ StatusCode: number }>(
        'POST',
        `/containers/${encodeURIComponent(name)}/wait`,
      );
      const raw = await logs
        .then(async (r) => Buffer.from(await r.body.arrayBuffer()))
        .catch(() => Buffer.alloc(0));
      return { exitCode: data.StatusCode, output: demuxLogs(raw).slice(-4000) };
    },
  };
}

/** Docker multiplexes stdout/stderr (without a TTY) as frames: 1 byte stream, 3 pad, 4 byte size. */
export function demuxLogs(raw: Buffer): string {
  const parts: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= raw.length) {
    const size = raw.readUInt32BE(offset + 4);
    parts.push(raw.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size;
  }
  return Buffer.concat(parts).toString('utf8');
}
