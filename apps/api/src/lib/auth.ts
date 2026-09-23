import { createVerifier, hasRecentAuth, type SessionClaims, type Verifier } from '@mininode/gate';
import type { MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../env.ts';

export type AppContext = { Bindings: ApiEnv; Variables: { claims: SessionClaims; token: string } };

let cached: { url: string; verifier: Verifier } | undefined;
function verifierFor(env: ApiEnv): Verifier {
  if (cached?.url !== env.SUPABASE_URL) {
    cached = { url: env.SUPABASE_URL, verifier: createVerifier(env.SUPABASE_URL) };
  }
  return cached.verifier;
}

/** Replaces the verifier (tests). */
export function setVerifierForTests(url: string, verifier: Verifier): void {
  cached = { url, verifier };
}

interface Requirements {
  role?: 'admin' | 'trusted';
  /** Seconds since the last sign-in (step-up). */
  recentAuth?: number;
}

export function problem(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}

/** Requires a valid Bearer access token; optionally a role and a recent sign-in. */
export function requireUser(requirements: Requirements = {}): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return problem(401, 'unauthenticated', 'Anmeldung erforderlich.');

    const result = await verifierFor(c.env).verify(token);
    if (result.status !== 'valid') return problem(401, 'unauthenticated', 'Sitzung abgelaufen.');

    const role = result.claims.mn_role ?? 'user';
    if (requirements.role === 'admin' && role !== 'admin') {
      return problem(403, 'forbidden', 'Nur für Admins.');
    }
    if (requirements.role === 'trusted' && role === 'user') {
      return problem(403, 'forbidden', 'Nur für vertrauenswürdige Nutzer.');
    }
    if (requirements.recentAuth && !hasRecentAuth(result.claims, requirements.recentAuth)) {
      return problem(403, 'reauth_required', 'Bitte bestätige kurz deine Identität.');
    }

    c.set('claims', result.claims);
    c.set('token', token);
    await next();
  };
}
