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
}
