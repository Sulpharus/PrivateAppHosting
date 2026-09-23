import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  PORT: z.coerce.number().int().default(8080),
  /** Bearer token the platform API uses for /sessions and /installers. */
  CONTROL_TOKEN: z.string().min(32),

  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  PORTAL_URL: z.url().default('https://mininode.app'),
  PLATFORM_DOMAIN: z.string().default('mininode.app'),

  PROXMOX_URL: z.url(),
  PROXMOX_NODE: z.string().default('nucbox'),
  /** API token `user@realm!tokenid=secret` with VM.PowerMgmt, VM.Snapshot, VM.Monitor, VM.GuestAgent.* */
  PROXMOX_TOKEN: z.string().min(1),
  /** PEM file of the Proxmox CA (self-signed certificate); pinned instead of disabling TLS checks. */
  PROXMOX_CA_FILE: z.string().optional(),

  WINDOWS_VMID: z.coerce.number().int().default(200),
  WINDOWS_HOST: z.string().default('10.10.0.20'),
  WINDOWS_RDP_USER: z.string().default('mininode'),
  WINDOWS_RDP_PASSWORD: z.string().min(1),
  WINDOWS_IDLE_MINUTES: z.coerce.number().int().min(1).default(15),
  WINDOWS_BOOT_SECONDS: z.coerce.number().int().default(35),

  DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
  DOCKER_NETWORK: z.string().default('mininode'),
  WINE_ENABLED: bool,
  WINE_IMAGE: z.string().default('ghcr.io/sulpharus/mininode-wine:latest'),
  WINE_IDLE_MINUTES: z.coerce.number().int().min(1).default(10),

  /** Presigned-URL signer for installers in R2 (S3 API). */
  R2_ENDPOINT: z.url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('mininode-installers'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}
