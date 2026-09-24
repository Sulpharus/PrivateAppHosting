# Restore

Backups: restic repositories on the NucBox (`/mnt/backup/restic`) and in R2
(`mininode-backups/restic`), both encrypted with `RESTIC_PASSWORD` (keep it in your password
manager: without it the backups are unreadable). Retention 7 daily, 4 weekly, 6 monthly.
The monthly restore drill (`mininode-restore-drill.timer`) proves the R2 copy works.

```bash
. /etc/mininode/backup.env && export RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
restic -r "$RESTIC_R2_REPO" snapshots            # or $RESTIC_LOCAL_REPO (faster)
restic -r "$RESTIC_R2_REPO" restore <id|latest> --target /var/tmp/restore
```

## One app's data on the NucBox

```bash
docker compose -f /srv/mininode/apps/<slug>/compose.yml stop
rsync -a --delete /var/tmp/restore/srv/mininode/apps/<slug>/data/ /srv/mininode/apps/<slug>/data/
docker compose -f /srv/mininode/apps/<slug>/compose.yml start
```

## Database (Supabase)

Supabase keeps its own daily backups (Dashboard → Database → Backups); use those first for a
full rollback. For a partial restore from our dump (for example one app schema):

```bash
dump=$(find /var/tmp/restore -name supabase.dump)
docker run --rm -v "$dump:/in.dump:ro" postgres:17-alpine \
  pg_restore --list /in.dump | grep app_<slug>                  # inspect
docker run --rm --network host -v "$dump:/in.dump:ro" postgres:17-alpine \
  pg_restore --no-owner --no-privileges --clean --if-exists --schema=app_<slug> \
  -d "$SUPABASE_DB_URL" /in.dump
```
`--clean` drops the schema's objects first: take a fresh backup (`systemctl start
mininode-backup`) before running it.

## Wine prefix of a remote app

```bash
docker stop mn-wine-<slug> 2>/dev/null
docker run --rm -v mn-wine-<slug>:/v -v /var/tmp/restore:/r alpine:3 \
  sh -c 'rm -rf /v/* && tar -C /v -xzf /r/var/tmp/mininode-backup.*/wine/mn-wine-<slug>.tar.gz'
```

## Windows VM

Proxmox: *VM 200 → Snapshots* (every install creates `pre-<slug>-<timestamp>`; `base` is the
clean install) or *Backup* (vzdump, last 3 days) → *Restore*.

## Whole NucBox lost

1. New hardware: follow `nucbox-install.md` sections 1–2.
2. Restore `/srv/mininode/apps` and `/srv/mininode/platform` from R2 (secrets.env is not in the
   backup: decrypt `infra/nucbox/secrets.sops.env` with your admin age key instead).
3. `docker compose --env-file platform.env up -d`, then re-run the deploy workflow with
   *all apps* to pull every container image again.
4. Windows VM: restore the latest vzdump from R2 if you copied it there, otherwise reinstall
   (section 3) and click *Installieren* for each remote app.
