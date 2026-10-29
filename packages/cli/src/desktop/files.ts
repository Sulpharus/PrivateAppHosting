import { publicOrigin } from '@mininode/manifest';
import { kongConfig } from './kong.ts';
import type { DesktopSecrets } from './secrets.ts';

export interface DesktopSettings {
  domain: string;
  scheme: 'http' | 'https';
  /** The port people type in the browser (443 behind an HTTPS tunnel). */
  port: number;
  /** The port this computer listens on; differs from `port` behind a tunnel or reverse proxy. */
  hostPort?: number;
  /** 127.0.0.1 = this computer only; 0.0.0.0 = the whole network. */
  bind: '127.0.0.1' | '0.0.0.0';
}

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/** The `.env` file Docker Compose reads: settings, then secrets. JSON values are single-quoted. */
export function envFile(settings: DesktopSettings, secrets: DesktopSecrets): string {
  const where = { domain: settings.domain, scheme: settings.scheme, port: settings.port };
  const lines: [string, string][] = [
    ['MININODE_DOMAIN', settings.domain],
    ['MININODE_SCHEME', settings.scheme],
    ['MININODE_PORT', String(settings.port)],
    ['BIND_ADDRESS', settings.bind],
    ['HOST_PORT', String(settings.hostPort ?? settings.port)],
    ['PORTAL_PUBLIC_URL', publicOrigin(where)],
    ['SUPABASE_PUBLIC_URL', publicOrigin(where, 'supabase')],
    ['APPS_PUBLIC_PATTERN', publicOrigin(where, '*') + '/**'],
    ['POSTGRES_PASSWORD', secrets.postgresPassword],
    ['JWT_SECRET', secrets.jwtSecret],
    ['JWT_KEYS', JSON.stringify([secrets.signingKey])],
    ['JWT_JWKS', JSON.stringify(secrets.jwks)],
    ['ANON_KEY', secrets.anonJwt],
    ['SERVICE_ROLE_KEY', secrets.serviceRoleJwt],
    ['SUPABASE_PUBLISHABLE_KEY', secrets.publishableKey],
    ['SUPABASE_SECRET_KEY', secrets.secretKey],
    ['VAULT_KEY', secrets.vaultKey],
    ['GUACAMOLE_JSON_SECRET', secrets.guacamoleJsonSecret],
    ['NUCBOX_CONTROL_TOKEN', secrets.nucboxControlToken],
  ];
  return `${lines.map(([key, value]) => `${key}=${quote(value)}`).join('\n')}\n`;
}

/** Gives the database roles of the Supabase services the generated password (the official self-hosting step). */
const ROLES_SQL = `\\set pgpass \`echo "$POSTGRES_PASSWORD"\`
ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
`;

export function desktopFiles(settings: DesktopSettings, secrets: DesktopSecrets) {
  return {
    '.env': envFile(settings, secrets),
    'kong.yml': kongConfig(secrets),
    'roles.sql': ROLES_SQL,
  };
}
