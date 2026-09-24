# infra/cloudflare

- `bootstrap.sh`: run once (idempotent) with an API token; see `docs/runbooks/first-setup.md`.
  Secrets Cloudflare shows only once land in `./cloudflare-secrets/` (git-ignored).
- `dns-upsert.sh <host> <target>`: proxied CNAME upsert; refuses to overwrite non-CNAME records
  (Worker custom domains).

Hostnames: `mininode.app`, `api.`, `ai.` and Worker apps are custom domains created by
`wrangler deploy`. `remote.`, `control.`, `ssh.` and container apps point to the tunnel
`mininode-nucbox`. `control.` and `ssh.` are behind Access (owner email + service tokens).
