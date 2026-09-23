// Deploy targets: production and staging share code but use separate Supabase projects,
// portal origins and Worker names.

export type DeployEnv = 'production' | 'staging' | 'local';

export interface EnvironmentSettings {
  name: DeployEnv;
  domain: string;
  portalUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  workerPrefix: string;
}

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (!value) throw new Error(`missing environment variable ${name}`);
  return value;
}

export function environmentSettings(
  name: DeployEnv,
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentSettings {
  if (name === 'local') {
    return {
      name,
      domain: 'localhost',
      portalUrl: 'http://localhost:5173',
      supabaseUrl: env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
      supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY', env),
      workerPrefix: 'mn-local-',
    };
  }
  const domain = name === 'production' ? 'mininode.app' : required('STAGING_DOMAIN', env);
  return {
    name,
    domain,
    portalUrl: `https://${domain}`,
    supabaseUrl: required('SUPABASE_URL', env),
    supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY', env),
    workerPrefix: name === 'production' ? 'mn-app-' : 'mn-stg-',
  };
}
