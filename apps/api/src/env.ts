/** Bindings from wrangler.jsonc (generated `Env`) plus secrets set with `wrangler secret put`. */
export interface ApiEnv extends Env {
  /**
   * Cloudflare Email Sending (Workers Paid). Optional: without it invite and password links are
   * shown to the admin to share directly, and the Supabase Send Email hook stays unconfigured.
   */
  EMAIL?: SendEmail;
  SUPABASE_SECRET_KEY: string;
  /** Standard Webhooks secret of the Supabase "Send Email" hook (`v1,whsec_…`). */
  SEND_EMAIL_HOOK_SECRET?: string;
  /** 32 hex chars shared with Guacamole's json-auth extension. */
  GUACAMOLE_JSON_SECRET: string;
  NUCBOX_CONTROL_TOKEN: string;
  /** Cloudflare Access service token for control.mininode.app. */
  ACCESS_CLIENT_ID?: string;
  ACCESS_CLIENT_SECRET?: string;
  /** Google OAuth client (same as the Supabase Google provider) for Google services in apps. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Base64 of 32 random bytes; encrypts stored Google refresh tokens (ADR 0004). */
  GOOGLE_TOKEN_KEY?: string;
  /** Web Push (VAPID, ADR 0005): base64url P-256 public point and private scalar. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}
