// Supabase "Send Email" auth hook: every auth mail (confirmations, password reset, email change,
// re-authentication) is rendered here and sent through Cloudflare Email Sending.

import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthEmailAction, authEmail } from '../email/templates.ts';
import type { AppContext } from '../lib/auth.ts';
import { verify } from '../lib/standard-webhooks.ts';
import { confirmUrl } from './invites.ts';

const payloadSchema = z.object({
  user: z.object({ email: z.string(), new_email: z.string().optional() }).loose(),
  email_data: z.object({
    token: z.string().optional().default(''),
    token_hash: z.string().optional().default(''),
    redirect_to: z.string().optional().default(''),
    email_action_type: z.enum([
      'signup',
      'invite',
      'magiclink',
      'recovery',
      'email_change',
      'email',
      'reauthentication',
    ]),
    token_new: z.string().optional().default(''),
    token_hash_new: z.string().optional().default(''),
  }),
});

type Payload = z.infer<typeof payloadSchema>;

/** Keeps redirects on the platform domain; anything else falls back to the start page. */
export function safeNext(redirectTo: string, portalUrl: string): string {
  try {
    const target = new URL(redirectTo, portalUrl);
    const portal = new URL(portalUrl);
    const sameSite =
      target.hostname === portal.hostname || target.hostname.endsWith(`.${portal.hostname}`);
    return sameSite && target.protocol === portal.protocol ? target.toString() : '/';
  } catch {
    return '/';
  }
}

/** One or two messages per hook call (secure email change mails both addresses). */
export function buildMessages(payload: Payload, portalUrl: string) {
  const data = payload.email_data;
  const next = safeNext(data.redirect_to, portalUrl);
  const action: AuthEmailAction = data.email_action_type;

  if (action === 'email_change' && data.token_hash_new && payload.user.new_email) {
    // Supabase: token_hash_new confirms from the current address, token_hash from the new one.
    return [
      {
        to: payload.user.email,
        ...authEmail(action, {
          url: confirmUrl(portalUrl, data.token_hash_new, 'email_change', next),
        }),
      },
      {
        to: payload.user.new_email,
        ...authEmail(action, { url: confirmUrl(portalUrl, data.token_hash, 'email_change', next) }),
      },
    ];
  }

  const to =
    action === 'email_change' && payload.user.new_email
      ? payload.user.new_email
      : payload.user.email;
  const verifyType =
    action === 'signup' ? 'email' : action === 'reauthentication' ? 'email' : action;
  const url = data.token_hash
    ? confirmUrl(portalUrl, data.token_hash, verifyType, next)
    : portalUrl;
  return [{ to, ...authEmail(action, data.token ? { url, code: data.token } : { url }) }];
}

export const hooks = new Hono<AppContext>();

hooks.post('/send-email', async (c) => {
  // Only active once Email Sending is bound and the hook is configured in Supabase.
  const mailer = c.env.EMAIL;
  if (!mailer || !c.env.SEND_EMAIL_HOOK_SECRET) {
    return c.json({ error: { http_code: 503, message: 'email sending is not configured' } }, 503);
  }
  const body = await c.req.text();
  if (!(await verify(c.env.SEND_EMAIL_HOOK_SECRET, c.req.raw.headers, body))) {
    return c.json({ error: { http_code: 401, message: 'invalid signature' } }, 401);
  }
  const parsed = payloadSchema.safeParse(JSON.parse(body));
  if (!parsed.success) {
    return c.json({ error: { http_code: 400, message: 'unexpected payload' } }, 400);
  }

  try {
    for (const message of buildMessages(parsed.data, c.env.PORTAL_URL)) {
      await mailer.send({ from: { email: c.env.MAIL_FROM, name: 'MiniNode' }, ...message });
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'auth_email_failed',
        action: parsed.data.email_data.email_action_type,
        error: String(error),
      }),
    );
    return c.json({ error: { http_code: 500, message: 'email delivery failed' } }, 500);
  }
  return c.json({});
});
