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
  PORTAL_URL: z.url(),

  /** Only with a Proxmox host: Windows programs (VM power, snapshots). Without it Docker apps still work. */
  PROXMOX_URL: z.url().optional(),
  PROXMOX_NODE: z.string().default('nucbox'),
  /** API token `user@realm!tokenid=secret` with VM.PowerMgmt, VM.Snapshot, VM.Monitor, VM.GuestAgent.* */
  PROXMOX_TOKEN: z.string().min(1).optional(),
  /** PEM file of the Proxmox CA (self-signed certificate); pinned instead of disabling TLS checks. */
  PROXMOX_CA_FILE: z.string().optional(),

  WINDOWS_VMID: z.coerce.number().int().default(200),
  WINDOWS_HOST: z.string().default('10.10.0.20'),
  WINDOWS_RDP_USER: z.string().default('mininode'),
  WINDOWS_RDP_PASSWORD: z.string().min(1).optional(),
  WINDOWS_IDLE_MINUTES: z.coerce.number().int().min(1).default(15),
  WINDOWS_BOOT_SECONDS: z.coerce.number().int().default(35),

  DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
  DOCKER_NETWORK: z.string().default('mininode'),
  WINE_ENABLED: bool,
  WINE_IMAGE: z.string().default('mininode-wine:current'),
  WINE_IDLE_MINUTES: z.coerce.number().int().min(1).default(10),

  /** Presigned-URL signer for installers in R2 (S3 API). */
  R2_ENDPOINT: z.url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('mininode-installers'),
});

/** With a Proxmox URL the Windows VM needs its token and RDP password. */
const checked = schema.superRefine((value, ctx) => {
  if (!value.PROXMOX_URL) return;
  for (const key of ['PROXMOX_TOKEN', 'WINDOWS_RDP_PASSWORD'] as const)
    if (!value[key])
      ctx.addIssue({ code: 'custom', path: [key], message: 'required with PROXMOX_URL' });
});

export type Config = z.infer<typeof checked> & {
  /** `<slug>.<PLATFORM_DOMAIN>` are the apps' addresses: the portal's host name. */
  PLATFORM_DOMAIN: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = checked.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  return { ...parsed.data, PLATFORM_DOMAIN: new URL(parsed.data.PORTAL_URL).hostname };
}
