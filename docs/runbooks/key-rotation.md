# Key rotation

Rotate once a year (calendar reminder) and immediately when a device or account may be
compromised. Each row can be rotated on its own.

| Secret | Where it lives | Rotate |
|---|---|---|
| Cloudflare API token `mininode-ci` | GitHub secret `CLOUDFLARE_API_TOKEN` | Dashboard → API Tokens → *Roll*; update the secret |
| Access service token `github-deploy` | GitHub secrets `CF_ACCESS_CLIENT_*` | Zero Trust → Access → Service Auth → *Refresh*; update secrets |
| Access service token `mininode-api` | API Worker secrets `ACCESS_CLIENT_*` | as above; `wrangler secret put` in `apps/api` |
| `NUCBOX_CONTROL_TOKEN` / `CONTROL_TOKEN` | API Worker + `secrets.env` | `openssl rand -hex 32`; set on the NucBox first (`docker compose up -d nucbox-control`), then the Worker — sessions fail for a minute in between |
| `GUACAMOLE_JSON_SECRET` | API Worker + `platform.env` | `openssl rand -hex 16`; same order as above |
| Deploy SSH key | GitHub `NUCBOX_DEPLOY_SSH_KEY` + `/home/deploy/.ssh/authorized_keys` | new key pair (see `nucbox-install.md` §2.3), replace both |
| Supabase secret key | GitHub `SUPABASE_SECRET_KEY`, API + AI proxy Worker secrets | Dashboard → API Keys → create new secret key, update all three, then delete the old key |
| `SEND_EMAIL_HOOK_SECRET` | Supabase hook + API Worker | Auth → Hooks → regenerate; update the Worker |
| Supabase DB password | GitHub `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`, `backup.env` | Dashboard → Database → Reset password; update all three |
| Supabase JWT signing key | Supabase | Auth → Signing Keys → create standby key, *rotate*; the gates pick it up from JWKS within 10 min. Revoke the old key after 1 h (session lifetime) |
| AI Gateway token / provider keys | AI proxy Worker secrets | gateway settings / provider consoles; `wrangler secret put` |
| R2 tokens (installers, backups) | `secrets.env`, `backup.env` | R2 → Manage API tokens; create new, update, delete old |
| Proxmox API token | `secrets.env` | `pveum user token remove mininode@pve control` + add again |
| Windows RDP password | Windows VM + `secrets.env` | change in the VM (`net user mininode *`), then `secrets.env` |
| `RESTIC_PASSWORD` | `backup.env`, password manager | `restic key add` then `restic key remove <old>` for both repos |
| SOPS age keys | NucBox + admin PC | new key, add to `.sops.yaml`, `sops updatekeys infra/nucbox/secrets.sops.env`, remove old |

After rotating Worker secrets no redeploy is needed; GitHub secrets apply to the next run.
