// Uploads in Verwaltung → Hochladen (ADR 0013). One box takes both kinds:
//   .zip        a web app: stored, then integrated by script in a GitHub workflow (integrate.yml);
//               what the script cannot do is marked for AI review
//   .exe .msi   a program for the PC/server: stored in R2, registered as a remote app and
//               installed by nucbox-control (snapshot, hash check, silent install)
//   GET  /admin/submissions/config      what can be uploaded right now
//   POST /admin/submissions             raw body + X-Filename (+ X-Runtime, X-Silent-Args, X-Program, X-Slug)
//   GET  /admin/submissions/:id         the upload; refreshes a running program install first
//   POST /admin/submissions/:id/retry   again (programs: optionally with another program path or arguments)
//   POST /admin/submissions/:id/dismiss take it off the list

import {
  parseManifest,
  programName,
  RESERVED_SLUGS,
  slugify,
  slugSchema,
  type UploadKind,
  uploadKind,
} from '@mininode/manifest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiEnv } from '../env.ts';
import { type AppContext, problem, requireUser } from '../lib/auth.ts';
import { readCapped, sha256Hex } from '../lib/body.ts';
import { dispatchWorkflow } from '../lib/github.ts';
import { putInstaller, r2Configured } from '../lib/r2.ts';
import { adminClient } from '../lib/supabase.ts';
import { controlHeaders } from './remote.ts';

export const submissions = new Hono<AppContext>();

export const WEBAPP_MAX = 40 * 1024 * 1024;
/** What streams through a Worker request comfortably; bigger installers go to R2 by hand. */
export const PROGRAM_MAX = 95 * 1024 * 1024;

const BUCKET = 'submissions';
const idSchema = z.uuid();

/** A file name that is safe in a storage path and in a PowerShell command line. */
export function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._+-]+/g, '_').replace(/^\.+/, '');
  return cleaned.slice(-100) || 'upload';
}

/** Where a program is expected after the install: the usual Program Files folder. */
export function guessProgramPath(name: string): string {
  const folder = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Programm';
  return `C:\\Program Files\\${folder}\\${folder}.exe`;
}

/** A Windows path for the RemoteApp entry: printable, no quotes or line breaks (also no smart quotes). */
export function validProgramPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 260 &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused
    !/[\u0000-\u001f"\u2018-\u201f]/.test(path)
  );
}

const argsSchema = z
  .string()
  .max(200)
  .regex(/^[ -~]*$/);

interface SubmissionRow {
  id: string;
  kind: UploadKind;
  filename: string;
  size_bytes: number;
  sha256: string | null;
  storage_path: string;
  status: string;
  slug: string | null;
  name: string | null;
  summary: Record<string, unknown>;
  log: string | null;
  created_at: string;
}

const environmentOf = (env: ApiEnv) =>
  new URL(env.PORTAL_URL).hostname === 'mininode.app' ? 'production' : 'staging';

async function audit(db: SupabaseClient, actor: string, action: string, detail: object) {
  const { error } = await db
    .schema('platform')
    .from('audit_log')
    .insert({ actor_id: actor, action, detail });
  if (error) console.error(`audit of ${action} failed: ${error.message}`);
}

async function updateRow(db: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await db
    .schema('platform')
    .from('submissions')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle<SubmissionRow>();
  if (error) throw new Error(error.message);
  return data;
}

submissions.get('/admin/submissions/config', requireUser({ role: 'admin' }), (c) =>
  c.json(
    {
      webapp: Boolean(c.env.GITHUB_DISPATCH_TOKEN),
      program: r2Configured(c.env) && Boolean(c.env.NUCBOX_CONTROL_TOKEN),
      webappMaxMb: WEBAPP_MAX / 1024 / 1024,
      programMaxMb: PROGRAM_MAX / 1024 / 1024,
    },
    200,
    { 'Cache-Control': 'no-store' },
  ),
);

submissions.post(
  '/admin/submissions',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    let filename = '';
    try {
      filename = safeFilename(decodeURIComponent(c.req.header('X-Filename') ?? ''));
    } catch {
      return problem(400, 'invalid_request', 'Der Dateiname ist ungültig.');
    }
    const kind = uploadKind(filename);
    if (!kind)
      return problem(
        415,
        'unsupported_type',
        'Erlaubt sind ZIP-Dateien (Web-Apps) und .exe/.msi (Programme).',
      );
    const length = Number(c.req.header('Content-Length') ?? Number.NaN);
    if (!Number.isFinite(length) || length <= 0)
      return problem(411, 'length_required', 'Die Dateigröße fehlt.');
    const actor = c.get('claims').sub;
    return kind === 'webapp'
      ? uploadWebapp(c.env, filename, length, c.req.raw.body, actor)
      : uploadProgram(c.env, filename, length, c.req.raw.body, actor, {
          runtime: c.req.header('X-Runtime'),
          silentArgs: c.req.header('X-Silent-Args'),
          program: c.req.header('X-Program'),
          slug: c.req.header('X-Slug'),
        });
  },
);

async function uploadWebapp(
  env: ApiEnv,
  filename: string,
  length: number,
  body: ReadableStream<Uint8Array> | null,
  actor: string,
): Promise<Response> {
  if (!env.GITHUB_DISPATCH_TOKEN)
    return problem(
      503,
      'not_configured',
      'Der automatische Einbau ist noch nicht eingerichtet: der Schlüssel LIBRARY_DISPATCH_TOKEN fehlt.',
    );
  if (length > WEBAPP_MAX)
    return problem(
      413,
      'too_large',
      `ZIP-Dateien dürfen höchstens ${WEBAPP_MAX / 1024 / 1024} MB groß sein.`,
    );
  const bytes = await readCapped(body, WEBAPP_MAX);
  if (!bytes) return problem(413, 'too_large', 'Die Datei ist zu groß.');
  // "PK" + a local file header (or an empty archive): anything else is no ZIP, whatever its name.
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && [3, 5].includes(bytes[2] ?? 0)))
    return problem(400, 'not_a_zip', 'Das ist keine gültige ZIP-Datei.');

  const db = adminClient(env);
  const id = crypto.randomUUID();
  const path = `${id}/${filename}`;
  const stored = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'application/zip', upsert: false });
  if (stored.error) return problem(500, 'storage_error', 'Die Datei konnte nicht abgelegt werden.');
  const { data: row, error } = await db
    .schema('platform')
    .from('submissions')
    .insert({
      id,
      kind: 'webapp',
      filename,
      size_bytes: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      storage_path: path,
      created_by: actor,
    })
    .select('*')
    .single<SubmissionRow>();
  if (error || !row) {
    await db.storage.from(BUCKET).remove([path]);
    return problem(500, 'db_error', 'Der Upload konnte nicht gespeichert werden.');
  }
  await audit(db, actor, 'submission.upload', { id, kind: 'webapp', filename });
  return startIntegration(env, db, row);
}

/** Starts (or restarts) the workflow for a stored ZIP. */
async function startIntegration(env: ApiEnv, db: SupabaseClient, row: SubmissionRow) {
  const started = await dispatchWorkflow(env, 'integrate.yml', {
    submission: row.id,
    environment: environmentOf(env),
  });
  if (started instanceof Response) {
    const failed = await updateRow(db, row.id, {
      status: 'failed',
      log: 'Der Einbau konnte nicht gestartet werden (GitHub hat den Start abgelehnt).',
    });
    return Response.json(
      {
        ...(failed ?? row),
        error: 'github_unavailable',
        message:
          'GitHub hat den Start des Einbaus abgelehnt. Der Upload ist gespeichert; versuche es erneut.',
      },
      { status: 502 },
    );
  }
  const queued = await updateRow(db, row.id, {
    status: 'queued',
    log: null,
    run_url: started.runs,
  });
  return Response.json(queued ?? row, { status: 202 });
}

async function uploadProgram(
  env: ApiEnv,
  filename: string,
  length: number,
  body: ReadableStream<Uint8Array> | null,
  actor: string,
  options: {
    runtime: string | undefined;
    silentArgs: string | undefined;
    program: string | undefined;
    slug: string | undefined;
  },
): Promise<Response> {
  if (!r2Configured(env) || !env.NUCBOX_CONTROL_TOKEN)
    return problem(
      503,
      'not_configured',
      'Programme brauchen die R2-Zugangsdaten der API (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) und die NucBox.',
    );
  if (length > PROGRAM_MAX)
    return problem(
      413,
      'too_large',
      `Installer über ${PROGRAM_MAX / 1024 / 1024} MB legst du per Hand in R2 ab (docs/runbooks/programs.md).`,
    );
  if (!body) return problem(400, 'invalid_request', 'Die Datei fehlt.');
  const runtime = options.runtime === 'wine' ? 'wine' : 'windows';
  if (runtime === 'wine' && filename.toLowerCase().endsWith('.msi'))
    return problem(400, 'invalid_request', 'MSI-Installer laufen nur unter Windows.');
  const silentArgs = argsSchema.safeParse(options.silentArgs ?? '');
  if (!silentArgs.success)
    return problem(400, 'invalid_request', 'Die Installations-Argumente sind ungültig.');

  const name = programName(filename);
  const slug = options.slug?.trim() || slugify(name);
  const slugCheck = slugSchema.safeParse(slug);
  if (!slugCheck.success || (RESERVED_SLUGS as readonly string[]).includes(slug))
    return problem(
      400,
      'invalid_slug',
      `Aus „${name}“ ergibt sich keine gültige Adresse. Gib sie an (Kleinbuchstaben, Ziffern, Bindestriche).`,
    );
  const program = options.program?.trim() || guessProgramPath(name);
  if (!validProgramPath(program))
    return problem(400, 'invalid_request', 'Der Programmpfad ist ungültig.');

  const db = adminClient(env);
  const { data: existing, error: lookup } = await db
    .schema('platform')
    .from('apps')
    .select('slug, kind, deployed_version')
    .eq('slug', slug)
    .maybeSingle<{ slug: string; kind: string; deployed_version: string | null }>();
  if (lookup) return problem(500, 'db_error', 'Die Adresse konnte nicht geprüft werden.');
  // A new version of an earlier upload may replace it; apps from hosted/ or the library may not.
  if (existing && !(existing.kind === 'remote' && existing.deployed_version === 'upload'))
    return problem(409, 'slug_taken', `${slug} ist schon vergeben. Wähle eine andere Adresse.`);

  const r2Key = `installers/${slug}/${filename}`;
  const put = await putInstaller(env, r2Key, body, length);
  if ('error' in put) return problem(502, 'storage_error', put.error);

  const manifest = {
    specVersion: 1,
    slug,
    name,
    description: `${name}, ein Programm auf dem PC/Server`,
    kind: 'remote',
    target: 'remote',
    access: { default: false, roles: ['user', 'trusted', 'admin'] },
    data: { mode: 'private' },
    remote: {
      runtime,
      program,
      installer: {
        r2Key,
        sha256: put.sha256,
        ...(silentArgs.data ? { silentArgs: silentArgs.data } : {}),
      },
    },
  };
  const parsed = parseManifest(manifest);
  if (!parsed.ok) return problem(400, 'invalid_request', parsed.errors.join('; '));

  // A re-upload replaces the program, not what the admin decided about the app (roles, status).
  const appFields = {
    slug,
    name,
    description: manifest.description,
    manifest,
    deployed_version: 'upload',
    deployed_at: new Date().toISOString(),
  };
  const { error: appError } = existing
    ? await db.schema('platform').from('apps').update(appFields).eq('slug', slug)
    : await db
        .schema('platform')
        .from('apps')
        .insert({
          ...appFields,
          kind: 'remote',
          target: 'remote',
          data_mode: 'private',
          allowed_roles: manifest.access.roles,
          // Nobody has a grant yet; the admin gives access after the install worked.
          status: 'online',
        });
  if (appError) return problem(500, 'db_error', 'Die App konnte nicht angelegt werden.');

  const { data: row, error } = await db
    .schema('platform')
    .from('submissions')
    .insert({
      kind: 'program',
      filename,
      size_bytes: length,
      sha256: put.sha256,
      storage_path: r2Key,
      slug,
      name,
      status: 'queued',
      summary: { runtime, program },
      created_by: actor,
    })
    .select('*')
    .single<SubmissionRow>();
  if (error || !row) return problem(500, 'db_error', 'Der Upload konnte nicht gespeichert werden.');
  await audit(db, actor, 'submission.upload', { id: row.id, kind: 'program', filename, slug });
  return startInstall(env, db, row);
}

interface RemoteManifest {
  runtime: 'windows' | 'wine';
  program: string;
  installer: { r2Key: string; sha256: string; silentArgs?: string };
}

/** Asks nucbox-control to install the program of a submission. */
async function startInstall(env: ApiEnv, db: SupabaseClient, row: SubmissionRow) {
  const { data: app } = await db
    .schema('platform')
    .from('apps')
    .select('manifest')
    .eq('slug', row.slug ?? '')
    .maybeSingle<{ manifest: { remote?: RemoteManifest } }>();
  const remote = app?.manifest.remote;
  if (!remote) return problem(404, 'not_found', 'Die App zu diesem Upload fehlt.');
  const response = await fetch(`${env.NUCBOX_CONTROL_URL}/installers`, {
    method: 'POST',
    headers: controlHeaders(env),
    body: JSON.stringify({
      app: row.slug,
      runtime: remote.runtime,
      program: remote.program,
      installer: remote.installer,
    }),
  }).catch(() => null);
  if (!response || !response.ok) {
    const busy = response?.status === 409;
    const waiting = await updateRow(db, row.id, {
      status: 'queued',
      log: busy
        ? 'Für dieses Programm läuft schon eine Installation.'
        : 'Die NucBox ist gerade nicht erreichbar. Der Upload ist gespeichert; versuche es später erneut.',
    });
    return Response.json(
      {
        ...(waiting ?? row),
        error: busy ? 'busy' : 'host_unavailable',
        message: waiting?.log ?? 'Die Installation konnte nicht gestartet werden.',
      },
      { status: busy ? 409 : 502 },
    );
  }
  const job = (await response.json()) as { id: string };
  const running = await updateRow(db, row.id, {
    status: 'installing',
    log: null,
    summary: { ...row.summary, job: job.id },
  });
  return Response.json(running ?? row, { status: 202 });
}

const PROGRAM_LINE = /^MININODE_PROGRAM=(.+)$/m;

/** Brings a running install up to date: finished jobs end as installed or as needs_review. */
async function refreshInstall(env: ApiEnv, db: SupabaseClient, row: SubmissionRow) {
  const job = row.summary.job;
  if (row.kind !== 'program' || row.status !== 'installing' || typeof job !== 'string') return row;
  const response = await fetch(`${env.NUCBOX_CONTROL_URL}/installers/${job}`, {
    headers: controlHeaders(env),
  }).catch(() => null);
  if (response?.status === 404)
    return (
      (await updateRow(db, row.id, {
        status: 'needs_review',
        log: 'Die NucBox kennt die Installation nicht mehr (Neustart?). Starte sie erneut.',
        summary: {
          ...row.summary,
          reasons: [
            { code: 'install_lost', message: 'Installation verloren (Neustart der NucBox).' },
          ],
        },
      })) ?? row
    );
  if (!response?.ok) return row;
  const state = (await response.json()) as { status: string; step: string; output?: string };
  if (state.status === 'running') return row;
  const output = (state.output ?? '').slice(-8000);
  if (state.status === 'succeeded') {
    // The script finds the real executable when the guessed path was wrong (see install.ts).
    const found = PROGRAM_LINE.exec(output)?.[1]?.trim();
    if (found && row.slug) await setProgramPath(db, row.slug, found);
    return (
      (await updateRow(db, row.id, {
        status: 'installed',
        log: output || null,
        summary: { ...row.summary, ...(found ? { program: found } : {}) },
      })) ?? row
    );
  }
  return (
    (await updateRow(db, row.id, {
      status: 'needs_review',
      log: output || 'Die Installation ist fehlgeschlagen.',
      summary: {
        ...row.summary,
        reasons: [
          {
            code: 'install_failed',
            message: `Die Installation ist im Schritt „${state.step}“ fehlgeschlagen. Prüfe das Protokoll, passe Programmpfad oder Argumente an und versuche es erneut.`,
          },
        ],
      },
    })) ?? row
  );
}

async function setProgramPath(db: SupabaseClient, slug: string, program: string) {
  const { data } = await db
    .schema('platform')
    .from('apps')
    .select('manifest')
    .eq('slug', slug)
    .maybeSingle<{ manifest: { remote?: RemoteManifest } }>();
  // The path comes out of the guest's output: it gets the same check as one typed by the admin.
  if (!validProgramPath(program)) return;
  if (!data?.manifest.remote || data.manifest.remote.program === program) return;
  await db
    .schema('platform')
    .from('apps')
    .update({ manifest: { ...data.manifest, remote: { ...data.manifest.remote, program } } })
    .eq('slug', slug);
}

submissions.get('/admin/submissions/:id', requireUser({ role: 'admin' }), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return problem(400, 'invalid_request', 'Ungültige ID.');
  const db = adminClient(c.env);
  const { data: row } = await db
    .schema('platform')
    .from('submissions')
    .select('*')
    .eq('id', id.data)
    .maybeSingle<SubmissionRow>();
  if (!row) return problem(404, 'not_found', 'Diesen Upload gibt es nicht.');
  return c.json(await refreshInstall(c.env, db, row), 200, { 'Cache-Control': 'no-store' });
});

const retrySchema = z
  .object({ program: z.string().max(260).optional(), silentArgs: argsSchema.optional() })
  .strict();

submissions.post(
  '/admin/submissions/:id/retry',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const body = retrySchema.safeParse((await c.req.json().catch(() => ({}))) ?? {});
    if (!id.success || !body.success) return problem(400, 'invalid_request', 'Ungültige Anfrage.');
    const db = adminClient(c.env);
    const { data: row } = await db
      .schema('platform')
      .from('submissions')
      .select('*')
      .eq('id', id.data)
      .maybeSingle<SubmissionRow>();
    if (!row) return problem(404, 'not_found', 'Diesen Upload gibt es nicht.');
    if (['installing', 'integrating'].includes(row.status))
      return problem(409, 'busy', 'Das läuft gerade noch.');
    await audit(db, c.get('claims').sub, 'submission.retry', { id: row.id, kind: row.kind });

    if (row.kind === 'webapp') {
      if (!c.env.GITHUB_DISPATCH_TOKEN)
        return problem(503, 'not_configured', 'Der automatische Einbau ist nicht eingerichtet.');
      return startIntegration(c.env, db, row);
    }
    if (!c.env.NUCBOX_CONTROL_TOKEN)
      return problem(503, 'not_configured', 'Die NucBox ist nicht eingerichtet.');
    const { program, silentArgs } = body.data;
    if (program !== undefined && !validProgramPath(program.trim()))
      return problem(400, 'invalid_request', 'Der Programmpfad ist ungültig.');
    if (row.slug && (program !== undefined || silentArgs !== undefined)) {
      const { data: app } = await db
        .schema('platform')
        .from('apps')
        .select('manifest')
        .eq('slug', row.slug)
        .maybeSingle<{ manifest: { remote?: RemoteManifest } }>();
      const remote = app?.manifest.remote;
      if (remote) {
        const installer = { ...remote.installer };
        if (silentArgs !== undefined) {
          if (silentArgs) installer.silentArgs = silentArgs;
          else delete installer.silentArgs;
        }
        await db
          .schema('platform')
          .from('apps')
          .update({
            manifest: {
              ...app.manifest,
              remote: { ...remote, program: program?.trim() ?? remote.program, installer },
            },
          })
          .eq('slug', row.slug);
      }
    }
    return startInstall(c.env, db, row);
  },
);

submissions.post(
  '/admin/submissions/:id/dismiss',
  requireUser({ role: 'admin', recentAuth: 600 }),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return problem(400, 'invalid_request', 'Ungültige ID.');
    const db = adminClient(c.env);
    const row = await updateRow(db, id.data, { status: 'dismissed' });
    if (!row) return problem(404, 'not_found', 'Diesen Upload gibt es nicht.');
    await audit(db, c.get('claims').sub, 'submission.dismiss', { id: id.data });
    return c.json(row);
  },
);
