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

export const googleAccessSchema = z.enum(['read', 'write']);

/**
 * Google services the app uses on behalf of the signed-in user (ADR 0004). `read` sees mails or
 * events; `write` also sends mails, changes labels and creates or edits events.
 */
const googleSchema = z
  .object({
    gmail: googleAccessSchema.optional(),
    calendar: googleAccessSchema.optional(),
  })
  .strict()
  .refine((g) => g.gmail || g.calendar, 'google needs at least one service (gmail, calendar)');

/** OAuth scope for each service and access level. */
export const GOOGLE_SCOPES = {
  gmail: {
    read: 'https://www.googleapis.com/auth/gmail.readonly',
    write: 'https://www.googleapis.com/auth/gmail.modify',
  },
  calendar: {
    read: 'https://www.googleapis.com/auth/calendar.readonly',
    write: 'https://www.googleapis.com/auth/calendar',
  },
} as const;

/** Every scope the portal asks Google for, so any app's subset can be issued later. */
export const ALL_GOOGLE_SCOPES = Object.values(GOOGLE_SCOPES).flatMap((levels) =>
  Object.values(levels),
);

/** The scopes one app may use, from its manifest `google` block. */
export function googleScopes(google: Manifest['google']): string[] {
  if (!google) return [];
  const scopes: string[] = [];
  if (google.gmail) scopes.push(GOOGLE_SCOPES.gmail[google.gmail]);
  if (google.calendar) scopes.push(GOOGLE_SCOPES.calendar[google.calendar]);
  return scopes;
}

/** Google API origins an app with a `google` block may call from the browser (CSP). */
export function googleConnectSrc(google: Manifest['google']): string[] {
  if (!google) return [];
  return [
    ...(google.gmail ? ['https://gmail.googleapis.com'] : []),
    ...(google.calendar ? ['https://www.googleapis.com'] : []),
  ];
}

/**
 * External APIs the app calls with a key the admin keeps on the host (ADR 0006). The app never
 * sees the key: it calls `mn.api(id).fetch(path)` and the platform adds the key. Apps that name
 * the same `id` share one entry and one key.
 */
/** Headers the proxy sets or forwards itself, or that would change the request's meaning. */
const RESERVED_HEADERS = [
  'host',
  'cookie',
  'content-type',
  'content-length',
  'transfer-encoding',
  'connection',
  'accept',
  'accept-language',
  'accept-encoding',
  'origin',
];

const apiAuthSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('header'),
      name: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9-]{0,40}$/)
        .refine((n) => !RESERVED_HEADERS.includes(n.toLowerCase()), 'reserved header name'),
      /** e.g. "Token " for `Authorization: Token <key>` */
      prefix: z
        .string()
        .regex(/^[ -~]{0,20}$/)
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal('bearer') }).strict(),
  /** Public APIs without a key that browsers cannot call directly (CSP, no CORS). */
  z.object({ type: z.literal('none') }).strict(),
  z
    .object({ type: z.literal('query'), param: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,40}$/) })
    .strict(),
]);

/** Public HTTPS hosts only: no IP literals, no localhost, nothing on the platform itself. */
export function isAllowedApiBase(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      host.includes('.') &&
      !host.endsWith('.') &&
      !/^[\d.]+$/.test(host) &&
      !host.startsWith('[') &&
      !['localhost', 'mininode.app', 'supabase.co', 'workers.dev', 'pages.dev'].some(
        (d) => host === d || host.endsWith(`.${d}`),
      )
    );
  } catch {
    return false;
  }
}

export const apiServiceSchema = z
  .object({
    /** Shared key name, e.g. "openweathermap"; the same id in two apps means the same key. */
    id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
    /** Shown to the admin, e.g. "OpenWeatherMap". */
    name: z.string().min(1).max(60),
    /** Every request goes below this URL, e.g. "https://api.openweathermap.org/data/2.5". */
    baseUrl: z.string().refine(isAllowedApiBase, 'baseUrl must be a public https URL'),
    auth: apiAuthSchema,
    /** Where the admin gets a key. */
    docs: z.url().optional(),
    /** Why the app needs it (German, shown to the admin). */
    reason: z.string().min(1).max(200),
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
    google: googleSchema.optional(),
    apis: z
      .array(apiServiceSchema)
      .max(10)
      .refine(
        (apis) => new Set(apis.map((a) => a.id)).size === apis.length,
        'api ids must be unique',
      )
      .optional(),
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
export type ApiService = z.infer<typeof apiServiceSchema>;
