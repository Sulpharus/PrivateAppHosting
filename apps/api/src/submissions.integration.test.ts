// Uploads from Verwaltung (ADR 0013) against the local Supabase stack. GitHub, R2 and the NucBox
// are stubbed; storage and the database are real.
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
const enabled = Boolean(url && publishableKey && secretKey && dbUrl);

interface Remote {
  runtime: string;
  program: string;
  installer: { sha256: string; silentArgs?: string };
}
const remoteOf = (row: Record<string, unknown> | undefined) =>
  (row?.manifest as { remote?: Remote } | undefined)?.remote;

describe.skipIf(!enabled)('uploads', () => {
  const run = Date.now().toString(36);
  const password = 'correct horse battery staple';
  const baseEnv = {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    PORTAL_URL: 'https://mininode.app',
    NUCBOX_CONTROL_URL: 'https://control.example',
  } as unknown as ApiEnv;
  const configured = {
    ...baseEnv,
    GITHUB_DISPATCH_TOKEN: 'ghp_test',
    GITHUB_REPO: 'owner/repo',
    NUCBOX_CONTROL_TOKEN: 'c'.repeat(40),
    R2_ENDPOINT: 'https://r2.example',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
  } as unknown as ApiEnv;
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} };
  const sql = postgres(dbUrl ?? '', { max: 1 });
  const admin = createClient(url ?? 'http://127.0.0.1', secretKey ?? 'unused', {
    auth: { persistSession: false },
  });
  const users: string[] = [];
  const tokens: Record<string, string> = {};
  const dispatched: { workflow: string; inputs: Record<string, string> }[] = [];
  const r2: { url: string; length: string | null }[] = [];
  const control: { path: string; body: unknown }[] = [];
  let controlJob: { status: string; step: string; output?: string } = {
    status: 'running',
    step: 'install',
  };

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target.startsWith('https://api.github.com/')) {
      const workflow = /workflows\/([^/]+)\/dispatches/.exec(target)?.[1] ?? '';
      dispatched.push({ workflow, inputs: JSON.parse(String(init?.body)).inputs });
      return new Response(null, { status: 204 });
    }
    if (target.startsWith('https://r2.example/')) {
      const request = input instanceof Request ? input : new Request(target, init);
      r2.push({ url: target, length: request.headers.get('Content-Length') });
      await request.arrayBuffer();
      return new Response(null, { status: 200 });
    }
    if (target.startsWith('https://control.example/installers')) {
      if (init?.method === 'POST') {
        control.push({ path: target, body: JSON.parse(String(init.body)) });
        return Response.json({ id: '11111111-1111-4111-8111-111111111111' }, { status: 202 });
      }
      return Response.json(controlJob);
    }
    return realFetch(input, init);
  });

  async function signUp(name: string, role: 'admin' | 'user') {
    const email = `up-${name}-${run}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    users.push(data.user.id);
    await admin.schema('platform').from('profiles').update({ role }).eq('user_id', data.user.id);
    const client = createClient(url ?? '', publishableKey ?? '', {
      auth: { persistSession: false },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    tokens[name] = session.data.session.access_token;
  }

  const upload = (
    name: string,
    filename: string,
    body: Uint8Array,
    env: ApiEnv = configured,
    headers: Record<string, string> = {},
  ) =>
    app.request(
      '/admin/submissions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens[name]}`,
          'X-Filename': encodeURIComponent(filename),
          'Content-Length': String(body.byteLength),
          ...headers,
        },
        body,
      },
      env,
      ctx,
    );

  const post = (name: string, path: string, body: unknown = {}) =>
    app.request(
      path,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens[name]}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      configured,
      ctx,
    );

  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
  const exe = new Uint8Array([0x4d, 0x5a, 1, 2, 3, 4]);
  const slug = `prog${run}`;

  beforeAll(async () => {
    await signUp('admin', 'admin');
    await signUp('anna', 'user');
  });

  afterAll(async () => {
    await sql`delete from platform.submissions where filename like ${`%${run}%`}`;
    await sql`delete from platform.apps where slug = ${slug}`;
    await sql`delete from platform.audit_log where action like 'submission.%'`;
    const { data } = await admin.storage.from('submissions').list();
    for (const folder of data ?? []) {
      const files = await admin.storage.from('submissions').list(folder.name);
      await admin.storage
        .from('submissions')
        .remove((files.data ?? []).map((f) => `${folder.name}/${f.name}`));
    }
    for (const id of users) await admin.auth.admin.deleteUser(id);
    await sql.end();
    vi.restoreAllMocks();
  });

  it('is for admins, and only for known file types', async () => {
    expect((await upload('anna', `x-${run}.zip`, zip)).status).toBe(403);
    expect((await upload('admin', `x-${run}.tar.gz`, zip)).status).toBe(415);
    expect((await upload('admin', `x-${run}.zip`, new Uint8Array([1, 2, 3, 4]))).status).toBe(400);
    const noLength = await app.request(
      '/admin/submissions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.admin}`, 'X-Filename': `x-${run}.zip` },
      },
      configured,
      ctx,
    );
    expect(noLength.status).toBe(411);
  });

  it('stores a ZIP and starts the integration workflow', async () => {
    const filename = `sentinel-${run}.zip`;
    const res = await upload('admin', filename, zip);
    expect(res.status).toBe(202);
    const row = (await res.json()) as { id: string; status: string; kind: string };
    expect(row).toMatchObject({ status: 'queued', kind: 'webapp' });
    expect(dispatched.at(-1)?.workflow).toBe('integrate.yml');
    expect(dispatched.at(-1)?.inputs.submission).toBe(row.id);
    const file = await admin.storage.from('submissions').download(`${row.id}/${filename}`);
    expect(file.error).toBeNull();
    const [audit] = await sql`select count(*)::int as n from platform.audit_log
      where action = 'submission.upload' and detail ->> 'id' = ${row.id}`;
    expect(audit?.n).toBe(1);

    // Retrying starts it again; dismissing takes it off the list.
    const before = dispatched.length;
    expect((await post('admin', `/admin/submissions/${row.id}/retry`)).status).toBe(202);
    expect(dispatched).toHaveLength(before + 1);
    const dismissed = await post('admin', `/admin/submissions/${row.id}/dismiss`);
    expect(((await dismissed.json()) as { status: string }).status).toBe('dismissed');
  });

  it('needs the dispatch token for ZIPs', async () => {
    const res = await upload('admin', `nokey-${run}.zip`, zip, baseEnv);
    expect(res.status).toBe(503);
  });

  it('installs a program: R2, a remote app, the NucBox, then the found path', async () => {
    const filename = `Prog${run}-Setup-1.0.exe`;
    const res = await upload('admin', filename, exe, configured, { 'X-Slug': slug });
    expect(res.status).toBe(202);
    const row = (await res.json()) as { id: string; status: string; sha256: string };
    expect(row.status).toBe('installing');
    expect(row.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(r2.at(-1)?.url).toContain(`/installers/${slug}/`);

    const [app1] = await sql`select kind, target, manifest from platform.apps where slug = ${slug}`;
    expect(app1).toMatchObject({ kind: 'remote', target: 'remote' });
    const remote = remoteOf(app1);
    expect(remote?.runtime).toBe('windows');
    expect(remote?.installer.sha256).toBe(row.sha256);
    expect(control.at(-1)?.body).toMatchObject({ app: slug, runtime: 'windows' });
    // Nobody has access until the admin gives it.
    const [grants] =
      await sql`select count(*)::int as n from platform.app_grants where app_slug = ${slug}`;
    expect(grants?.n).toBe(0);

    // Still running: nothing changes.
    const running = await app.request(
      `/admin/submissions/${row.id}`,
      { headers: { Authorization: `Bearer ${tokens.admin}` } },
      configured,
      ctx,
    );
    expect(((await running.json()) as { status: string }).status).toBe('installing');

    // Done, and the script found the executable elsewhere: the app follows.
    controlJob = {
      status: 'succeeded',
      step: 'done',
      output: 'installed\nMININODE_PROGRAM=C:\\Program Files\\Real\\real.exe',
    };
    const done = await app.request(
      `/admin/submissions/${row.id}`,
      { headers: { Authorization: `Bearer ${tokens.admin}` } },
      configured,
      ctx,
    );
    expect(((await done.json()) as { status: string }).status).toBe('installed');
    const [app2] = await sql`select manifest from platform.apps where slug = ${slug}`;
    expect(remoteOf(app2)?.program).toBe('C:\\Program Files\\Real\\real.exe');
  });

  it('turns a failed install into a review with the output, and retries with new arguments', async () => {
    controlJob = { status: 'failed', step: 'install', output: 'installer exit code 5' };
    const first = await upload('admin', `Prog${run}-Setup-2.0.exe`, exe, configured, {
      'X-Slug': slug,
    });
    expect(first.status).toBe(202);
    const row = (await first.json()) as { id: string };
    const state = await app.request(
      `/admin/submissions/${row.id}`,
      { headers: { Authorization: `Bearer ${tokens.admin}` } },
      configured,
      ctx,
    );
    const review = (await state.json()) as {
      status: string;
      log: string;
      summary: { reasons: { code: string }[] };
    };
    expect(review.status).toBe('needs_review');
    expect(review.log).toContain('exit code 5');
    expect(review.summary.reasons[0]?.code).toBe('install_failed');

    controlJob = { status: 'running', step: 'install' };
    const retry = await post('admin', `/admin/submissions/${row.id}/retry`, {
      silentArgs: '/VERYSILENT /NORESTART',
      program: 'C:\\Apps\\prog.exe',
    });
    expect(retry.status).toBe(202);
    const [app3] = await sql`select manifest from platform.apps where slug = ${slug}`;
    const remote = remoteOf(app3);
    expect(remote?.program).toBe('C:\\Apps\\prog.exe');
    expect(remote?.installer.silentArgs).toBe('/VERYSILENT /NORESTART');
  });

  it('refuses addresses of apps that did not come from an upload', async () => {
    const taken = `hosted${run}`;
    await sql`insert into platform.apps (slug, name, description, kind, target, manifest, status)
      values (${taken}, 'Hosted', 'x', 'static', 'cloudflare', '{}', 'online')`;
    try {
      const res = await upload('admin', `Prog${run}.exe`, exe, configured, { 'X-Slug': taken });
      expect(res.status).toBe(409);
    } finally {
      await sql`delete from platform.apps where slug = ${taken}`;
    }
  });

  it('keeps programs off without R2 credentials', async () => {
    const res = await upload('admin', `NoR2${run}.exe`, exe, baseEnv);
    expect(res.status).toBe(503);
  });
});
