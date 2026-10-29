import { z } from 'zod';

/**
 * `mininode.config.json`: everything that makes one installation different from another. The
 * values are public identifiers (domain, project reference, publishable key); secrets never
 * belong in it. `mininode configure` writes them into the wrangler files and the Supabase config.
 */

const hostname = z
  .string()
  .toLowerCase()
  .regex(
    /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'a domain name such as example.com',
  );

const supabaseSchema = z
  .object({
    /** The 20-letter reference in the project's dashboard URL. */
    projectRef: z.string().regex(/^[a-z]{20}$/, 'the 20 letters of the project reference'),
    publishableKey: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]{16,}$/, 'sb_publishable_…'),
  })
  .strict();

const environmentSchema = z
  .object({
    /** The portal lives here; the API is api.<domain>, apps are <slug>.<domain>. */
    domain: hostname,
    supabase: supabaseSchema,
  })
  .strict();

/** A test installation can start as a database only; it gets a domain when it needs one. */
const stagingSchema = z.object({ domain: hostname.optional(), supabase: supabaseSchema }).strict();

export const instanceConfigSchema = z
  .object({
    $schema: z.string().optional(),
    /** Cloudflare zone when the platform domain is a subdomain of it (default: the domain). */
    zone: hostname.optional(),
    cloudflare: z
      .object({ accountId: z.string().regex(/^[0-9a-f]{32}$/, '32 hex characters') })
      .strict(),
    /** Name and address of the sender of platform mail (invites, password resets). */
    mailFrom: z.email().optional(),
    github: z
      .object({
        /** `owner/repo` of this installation: workflows, links in the admin area. */
        repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'owner/repo'),
      })
      .strict()
      .optional(),
    environments: z
      .object({ production: environmentSchema, staging: stagingSchema.optional() })
      .strict(),
  })
  .strict();

export type InstanceConfig = z.infer<typeof instanceConfigSchema>;
export type InstanceEnvironmentName = keyof InstanceConfig['environments'];

export const INSTANCE_CONFIG_FILENAME = 'mininode.config.json';

export type InstanceResult = { ok: true; config: InstanceConfig } | { ok: false; errors: string[] };

/** Validates untrusted config JSON and returns readable, path-prefixed errors. */
export function parseInstanceConfig(input: unknown): InstanceResult {
  const result = instanceConfigSchema.safeParse(input);
  if (result.success) return { ok: true, config: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    }),
  };
}

export interface ResolvedEnvironment {
  name: InstanceEnvironmentName;
  domain: string;
  zone: string;
  portalUrl: string;
  apiUrl: string;
  aiUrl: string;
  supabaseUrl: string;
  supabaseProjectRef: string;
  supabasePublishableKey: string;
  cloudflareAccountId: string;
  mailFrom: string;
}

/** The derived addresses of one environment: the single place that knows the naming scheme. */
export function resolveEnvironment(
  config: InstanceConfig,
  name: InstanceEnvironmentName = 'production',
): ResolvedEnvironment {
  const environment = config.environments[name];
  if (!environment) throw new Error(`mininode.config.json has no "${name}" environment`);
  const { domain } = environment;
  if (!domain) throw new Error(`the "${name}" environment in mininode.config.json has no domain`);
  return {
    name,
    domain,
    zone: config.zone ?? domain,
    portalUrl: `https://${domain}`,
    apiUrl: `https://api.${domain}`,
    aiUrl: `https://ai.${domain}`,
    supabaseUrl: `https://${environment.supabase.projectRef}.supabase.co`,
    supabaseProjectRef: environment.supabase.projectRef,
    supabasePublishableKey: environment.supabase.publishableKey,
    cloudflareAccountId: config.cloudflare.accountId,
    mailFrom: config.mailFrom ?? `hallo@${domain}`,
  };
}
