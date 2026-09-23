# infra

| Path | What |
|---|---|
| `cloudflare/bootstrap.sh` | One-time, idempotent account setup: zone hardening, AI Gateway, R2 buckets, tunnel + ingress, DNS for tunnel hosts, Access apps and service tokens |
| `cloudflare/dns-upsert.sh` | Per-app CNAME to the tunnel (used by the deploy workflow) |
| `nucbox/compose.yml` | Platform stack on the Linux VM: cloudflared, Traefik, nucbox-control, guacd, Guacamole |
| `nucbox/traefik/dynamic.yml` | Header stripping + forward-auth middlewares for container apps |
| `nucbox/deploy/nucbox-deploy` | Forced-command rollout of container apps and platform images (provenance check, health check, rollback) |
| `nucbox/backup/` | restic backups to NVMe + R2 (7/4/6), monthly restore drill, systemd units |
| `nucbox/wine/` | Wine runtime image (Xvfb + VNC) for `runtime: wine` apps |
| `nucbox/windows/` | Windows 11 VM setup and RemoteApp account lockdown |
| `nucbox/*.example.env` | Templates for secrets (`secrets.sops.env` is the encrypted, committed form) |

Runbooks: `docs/runbooks/` (start with `first-setup.md`, then `nucbox-install.md`).
