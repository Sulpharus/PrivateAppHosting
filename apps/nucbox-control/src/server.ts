// HTTP surface of nucbox-control.
//   GET  /health              liveness (compose health check)
//   GET  /auth                Traefik forward-auth for container apps (public, cookie based)
//   POST /sessions/prepare    platform API → wake a runtime, get Guacamole connection params
//   POST /sessions/sync       platform API cron → apps with live sessions (idle tracking)
//   POST /installers          platform API → start an install job
//   GET  /installers/:id      platform API → job status
// Everything except /health and /auth requires `Authorization: Bearer <CONTROL_TOKEN>`; the
// hostname control.mininode.app additionally sits behind Cloudflare Access.

import { timingSafeEqual } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { type ForwardAuthOptions, forwardAuth } from './auth.ts';
import type { Installer } from './install.ts';
import { RuntimeUnavailable, type Scheduler } from './runtimes.ts';

const slug = z.string().regex(/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/);

const prepareSchema = z.object({
  app: slug,
  runtime: z.enum(['windows', 'wine', 'android']),
  program: z.string().min(1).max(400),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
});

const syncSchema = z.object({ activeApps: z.array(slug).max(500) });

const installSchema = z.object({
  app: slug,
  runtime: z.enum(['windows', 'wine']),
  program: z.string().min(1).max(400),
  installer: z
    .object({
      r2Key: z.string().min(1).max(400),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      silentArgs: z.string().max(200).optional(),
    })
    .optional(),
  wingetId: z
    .string()
    .regex(/^[\w.+-]{1,120}$/)
    .optional(),
});

export interface ServerDeps {
  controlToken: string;
  scheduler: Scheduler;
  installer: Installer;
  auth: ForwardAuthOptions;
}

function bearer(token: string): MiddlewareHandler {
  const expected = Buffer.from(`Bearer ${token}`);
  return async (c, next) => {
    const given = Buffer.from(c.req.header('Authorization') ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  };
}

export function createServer(deps: ServerDeps) {
  const app = new Hono();
  const guard = bearer(deps.controlToken);

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/auth', (c) => forwardAuth(c.req.raw, deps.auth));

  app.post('/sessions/prepare', guard, async (c) => {
    const parsed = prepareSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
    try {
      return c.json(await deps.scheduler.prepare(parsed.data));
    } catch (error) {
      if (error instanceof RuntimeUnavailable)
        return c.json({ error: 'runtime_unavailable', message: error.message }, 501);
      throw error;
    }
  });

  app.post('/sessions/sync', guard, async (c) => {
    const parsed = syncSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    deps.scheduler.sync(parsed.data.activeApps);
    return c.json({ ok: true, actions: await deps.scheduler.reap() });
  });

  app.post('/installers', guard, async (c) => {
    const parsed = installSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
    try {
      return c.json(deps.installer.start(parsed.data), 202);
    } catch (error) {
      return c.json(
        { error: 'conflict', message: error instanceof Error ? error.message : String(error) },
        409,
      );
    }
  });

  app.get('/installers/:id', guard, (c) => {
    const job = deps.installer.get(c.req.param('id'));
    return job ? c.json(job) : c.json({ error: 'not_found' }, 404);
  });

  app.onError((error, c) => {
    console.error(JSON.stringify({ event: 'error', path: c.req.path, error: String(error) }));
    return c.json({ error: 'internal' }, 500);
  });

  return app;
}
