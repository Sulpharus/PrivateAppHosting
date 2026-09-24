import { createClient } from '@supabase/supabase-js';

export const url = process.env.SUPABASE_URL ?? '';
export const secretKey = process.env.SUPABASE_SECRET_KEY ?? '';
export const admin = createClient(url || 'http://127.0.0.1:54321', secretKey || 'unused', {
  auth: { persistSession: false },
});

export const PASSWORD = 'correct horse battery staple 42';

export async function createUser(email: string, role: 'admin' | 'trusted' | 'user', name: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) throw error;
  await admin.schema('platform').from('profiles').update({ role }).eq('user_id', data.user.id);
  return data.user.id;
}

export async function createApp(slug: string, name: string, extra: Record<string, unknown> = {}) {
  const { error } = await admin
    .schema('platform')
    .from('apps')
    .upsert({
      slug,
      name,
      description: `${name} (Test)`,
      kind: 'spa',
      target: 'cloudflare',
      manifest: {},
      status: 'online',
      ...extra,
    });
  if (error) throw error;
}

export async function grant(userId: string, slug: string) {
  await admin.schema('platform').from('app_grants').upsert({ user_id: userId, app_slug: slug });
}

export async function cleanup(prefix: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data.users) {
    if (user.email?.startsWith(prefix)) await admin.auth.admin.deleteUser(user.id);
  }
  await admin.schema('platform').from('apps').delete().like('slug', `${prefix}%`);
}
