// NucBox resources for Verwaltung → NucBox.
//   GET /admin/nucbox/resources   admin → CPU, memory and disk of host, VMs and containers

import { Hono } from 'hono';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { controlHeaders } from './remote.ts';

export const nucbox = new Hono<AppContext>();

nucbox.get('/admin/nucbox/resources', requireUser({ role: 'admin' }), async (c) => {
  const response = await fetch(`${c.env.NUCBOX_CONTROL_URL}/resources`, {
    headers: controlHeaders(c.env),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response) return problem(502, 'host_unavailable', 'Die NucBox ist gerade nicht erreichbar.');
  if (!response.ok)
    return problem(
      502,
      'host_error',
      `Die NucBox antwortet nicht wie erwartet (${response.status}).`,
    );
  return c.json(await response.json(), 200, { 'Cache-Control': 'no-store' });
});
