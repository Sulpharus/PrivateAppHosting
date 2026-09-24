import { z } from 'zod';

/** Subdomains the platform itself uses; hosted apps may not claim them. */
export const RESERVED_SLUGS = [
  'admin',
  'ai',
  'api',
  'auth',
  'guac',
  'login',
  'mail',
  'proxmox',
  'remote',
  'ssh',
  'staging',
  'status',
  'www',
] as const;

export const CURRENT_SPEC_VERSION = 1;

export const slugSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/,
    'slug must be 2–32 chars: lowercase letters, digits and dashes, starting with a letter',
  )
  .refine((slug) => !slug.includes('--'), 'slug must not contain consecutive dashes')
  .refine(
    (slug) => !(RESERVED_SLUGS as readonly string[]).includes(slug),
    'slug is reserved by the platform',
  );

export const roleSchema = z.enum(['admin', 'trusted', 'user']);
export const kindSchema = z.enum(['static', 'spa', 'nextjs', 'container', 'remote']);
export const targetSchema = z.enum(['cloudflare', 'vercel', 'nucbox', 'remote']);
export const dataModeSchema = z.enum(['none', 'private', 'shared-account', 'group', 'readonly']);
export const aiModelSchema = z.enum([
  'gemini-flash',
  'gemini-pro',
  'claude-haiku',
  'claude-sonnet',
]);

const accessSchema = z
  .object({
    /** Granted to every new user automatically. */
    default: z.boolean().default(false),
    roles: z.array(roleSchema).min(1).default(['user', 'trusted', 'admin']),
  })
  .strict();

const dataSchema = z
  .object({
    mode: dataModeSchema.default('none'),
  })
  .strict();

const aiSchema = z
  .object({
    models: z.array(aiModelSchema).min(1),
    monthlyBudgetEur: z.number().positive().max(100).default(2),
    maxOutputTokens: z.number().int().positive().max(16_000).default(2_000),
  })
  .strict();

const buildSchema = z
  .object({
    command: z.string().min(1).optional(),
    output: z
      .string()
      .min(1)
      .refine((p) => !p.startsWith('/') && !p.includes('..'), 'output must be a relative path'),
  })
  .strict();

const containerSchema = z
  .object({
    port: z.number().int().min(1).max(65_535),
    memoryMb: z.number().int().min(64).max(4096).default(256),
    healthPath: z.string().startsWith('/').default('/health'),
  })
  .strict();

const remoteSchema = z
  .object({
    runtime: z.enum(['windows', 'wine', 'android']),
    /** Executable or package started for the user (e.g. `C:\\Program Files\\Foo\\foo.exe`). */
    program: z.string().min(1),
    installer: z
      .object({
        r2Key: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/, 'sha256 must be 64 lowercase hex chars'),
        /** Arguments for an unattended install. Defaults: `.msi` → `/qn /norestart`, `.exe` → `/S`. */
        silentArgs: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    wingetId: z.string().min(1).optional(),
  })
  .strict();

const TARGET_KINDS: Record<z.infer<typeof targetSchema>, readonly z.infer<typeof kindSchema>[]> = {
  cloudflare: ['static', 'spa', 'nextjs'],
  vercel: ['nextjs'],
  nucbox: ['container'],
  remote: ['remote'],
};

export const manifestSchema = z
  .object({
    $schema: z.string().optional(),
    specVersion: z.literal(CURRENT_SPEC_VERSION),
    slug: slugSchema,
    name: z.string().min(1).max(40),
    description: z.string().min(1).max(120),
    kind: kindSchema,
    target: targetSchema,
    access: accessSchema.default({ default: false, roles: ['user', 'trusted', 'admin'] }),
    data: dataSchema.default({ mode: 'none' }),
    ai: aiSchema.optional(),
    build: buildSchema.optional(),
    container: containerSchema.optional(),
    remote: remoteSchema.optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (!TARGET_KINDS[m.target].includes(m.kind)) {
      ctx.addIssue({
        code: 'custom',
        path: ['kind'],
        message: `kind "${m.kind}" cannot run on target "${m.target}" (allowed: ${TARGET_KINDS[m.target].join(', ')})`,
      });
    }
    if (m.kind === 'container' && !m.container) {
      ctx.addIssue({
        code: 'custom',
        path: ['container'],
        message: 'container apps need a container block',
      });
    }
    if (m.kind === 'remote') {
      if (!m.remote) {
        ctx.addIssue({
          code: 'custom',
          path: ['remote'],
          message: 'remote apps need a remote block',
        });
      } else if (!m.remote.installer && !m.remote.wingetId && m.remote.runtime !== 'android') {
        ctx.addIssue({
          code: 'custom',
          path: ['remote'],
          message: 'remote apps need an installer (r2Key + sha256) or a wingetId',
        });
      }
    }
    if (['spa', 'nextjs'].includes(m.kind) && !m.build) {
      ctx.addIssue({
        code: 'custom',
        path: ['build'],
        message: `${m.kind} apps need a build block`,
      });
    }
    if (m.kind !== 'container' && m.container) {
      ctx.addIssue({
        code: 'custom',
        path: ['container'],
        message: 'container block only allowed for container apps',
      });
    }
    if (m.kind !== 'remote' && m.remote) {
      ctx.addIssue({
        code: 'custom',
        path: ['remote'],
        message: 'remote block only allowed for remote apps',
      });
    }
    if (m.data.mode === 'shared-account' && !m.access.roles.includes('trusted')) {
      ctx.addIssue({
        code: 'custom',
        path: ['access', 'roles'],
        message: 'shared-account apps must allow the trusted role',
      });
    }
  });

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestInput = z.input<typeof manifestSchema>;
export type Role = z.infer<typeof roleSchema>;
export type DataMode = z.infer<typeof dataModeSchema>;
export type AiModel = z.infer<typeof aiModelSchema>;
