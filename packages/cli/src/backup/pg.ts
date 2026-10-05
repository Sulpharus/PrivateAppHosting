// Runs the PostgreSQL client tools (pg_dump, pg_restore, psql) for backups. The tools must be
// at least as new as the server: a matching local install is used, otherwise a container
// (MININODE_PG_IMAGE, default postgres:17-alpine). The password never goes on a command line:
// the connection travels in the standard libpq variables.

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

export type PgTool = 'pg_dump' | 'pg_restore' | 'psql';

export interface Connection {
  env: Record<string, string>;
  /** Host the tools connect from (inside a container: the Docker host). */
  host: string;
}

export function connectionEnv(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  const env: Record<string, string> = {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    PGCONNECT_TIMEOUT: '30',
  };
  const ssl = url.searchParams.get('sslmode');
  if (ssl) env.PGSSLMODE = ssl;
  return env;
}

export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function localMajor(tool: PgTool): number | null {
  const probe = spawnSync(tool, ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) return null;
  const match = /(\d+)(?:\.\d+)?/.exec(probe.stdout);
  return match?.[1] ? Number(match[1]) : null;
}

export interface Runner {
  kind: 'local' | 'docker';
  /** Starts a tool. Data goes through stdin/stdout, so no folder has to be shared with a container. */
  start(
    tool: PgTool,
    args: string[],
    options?: { stdin?: boolean; stdout?: boolean },
  ): ChildProcess;
}

/** Chooses local tools when they are new enough for the server, a container otherwise. */
export function pickRunner(databaseUrl: string, serverMajor: number): Runner {
  const env = connectionEnv(databaseUrl);
  const forced = process.env.MININODE_PG_IMAGE;
  const usable = (tool: PgTool) => {
    const major = localMajor(tool);
    return major !== null && major >= serverMajor;
  };
  if (!forced && usable('pg_dump') && usable('pg_restore') && usable('psql')) {
    return {
      kind: 'local',
      start: (tool, args, options = {}) =>
        spawn(tool, args, {
          env: { ...process.env, ...env },
          stdio: [
            options.stdin ? 'pipe' : 'ignore',
            options.stdout ? 'pipe' : 'inherit',
            'inherit',
          ],
        }),
    };
  }
  const image = forced ?? `postgres:${serverMajor}-alpine`;
  const local = LOCAL_HOSTS.has(env.PGHOST ?? '');
  // A server on this machine is reached through the host network on Linux, through the special
  // host name elsewhere (Docker Desktop).
  const linux = platform() === 'linux';
  const containerEnv = { ...env, ...(local && !linux ? { PGHOST: 'host.docker.internal' } : {}) };
  return {
    kind: 'docker',
    start: (tool, args, options = {}) => {
      const names = Object.keys(containerEnv).flatMap((name) => ['-e', name]);
      return spawn(
        'docker',
        [
          'run',
          '--rm',
          '-i',
          ...(local && linux ? ['--network', 'host'] : []),
          ...names,
          image,
          tool,
          ...args,
        ],
        {
          env: { ...process.env, ...containerEnv },
          stdio: [
            options.stdin ? 'pipe' : 'ignore',
            options.stdout ? 'pipe' : 'inherit',
            'inherit',
          ],
        },
      );
    },
  };
}

/** Resolves when the process ends with exit code 0, rejects with its code otherwise. */
export function finished(child: ChildProcess, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`${name}: ${error.message}`)));
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} stopped with exit code ${code}`)),
    );
  });
}
