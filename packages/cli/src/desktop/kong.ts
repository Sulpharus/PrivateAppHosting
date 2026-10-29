// The Supabase gateway of a desktop installation: Kong with the same routes and the same key
// handling as `supabase start`. A request that carries only the project's publishable or secret
// key gets the matching role token, so PostgREST and Storage (which verify JWTs) accept it.

export interface KongKeys {
  publishableKey: string;
  secretKey: string;
  anonJwt: string;
  serviceRoleJwt: string;
}

/** Kong template: the user's own token wins; else the key header is swapped for a role token. */
function bearer(keys: KongKeys): string {
  return `$((headers.authorization ~= nil and headers.authorization:sub(1, 10) ~= 'Bearer sb_' and headers.authorization) or (headers.apikey == '${keys.secretKey}' and 'Bearer ${keys.serviceRoleJwt}') or (headers.apikey == '${keys.publishableKey}' and 'Bearer ${keys.anonJwt}') or headers.apikey)`;
}

export function kongConfig(keys: KongKeys): string {
  const token = bearer(keys);
  const withToken = `
    plugins:
      - name: cors
      - name: request-transformer
        config:
          add:
            headers:
              - "Authorization: ${token}"
          replace:
            headers:
              - "Authorization: ${token}"`;
  const open = (name: string, path: string) => `
  - name: ${name}
    url: http://auth:9999${path}
    routes:
      - name: ${name}
        strip_path: true
        paths:
          - /auth/v1${path}
    plugins:
      - name: cors`;
  return `_format_version: "1.1"
services:${open('auth-v1-open-verify', '/verify')}${open('auth-v1-open-callback', '/callback')}${open('auth-v1-open-authorize', '/authorize')}
  - name: auth-v1
    url: http://auth:9999/
    routes:
      - name: auth-v1-all
        strip_path: true
        paths:
          - /auth/v1/${withToken}
  - name: rest-v1
    url: http://rest:3000/
    routes:
      - name: rest-v1-all
        strip_path: true
        paths:
          - /rest/v1/${withToken}
  - name: storage-v1
    url: http://storage:5000/
    routes:
      - name: storage-v1-all
        strip_path: true
        paths:
          - /storage/v1/${withToken}
`;
}
