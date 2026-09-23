# NucBox install (Proxmox, Linux VM, Windows VM)

Target: NucBox G9 (Intel N150, 16 GB, 2× NVMe). Time: about 2 hours, most of it waiting for
installers. Nothing on the box is reachable from the internet except through the Cloudflare
Tunnel; there are no port forwards on the router.

```
LAN (router)            vmbr0 ── Proxmox host 192.168.x.2 (web UI only on the LAN)
                                └─ Linux VM (DHCP on the LAN, outbound only)
internal 10.10.0.0/24   vmbr1 ── host 10.10.0.1 (NAT for the Windows VM)
                                ├─ Linux VM 10.10.0.10
                                └─ Windows VM 10.10.0.20 (no LAN access)
NVMe 1: Proxmox + VM disks      NVMe 2: /mnt/backup (restic, vzdump)
```

## 1. Proxmox VE

1. Install Proxmox VE 9 from USB onto NVMe 1 (ext4 or ZFS single disk). Hostname `nucbox`.
2. Web UI → *Updates*: switch to the no-subscription repository, then `apt full-upgrade`.
3. Second NVMe: *Disks → Directory → /dev/nvme1n1*, name `backup`, ext4, mount
   `/mnt/backup`, content *VZDump backup file*.
4. Internal bridge (`/etc/network/interfaces`), then `ifreload -a`:

   ```
   auto vmbr1
   iface vmbr1 inet static
       address 10.10.0.1/24
       bridge-ports none
       bridge-stp off
       bridge-fd 0
       post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
       post-up   iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -o vmbr0 -j MASQUERADE
       post-up   iptables -A FORWARD -s 10.10.0.20 -d 192.168.0.0/16 -j DROP
       post-down iptables -t nat -D POSTROUTING -s 10.10.0.0/24 -o vmbr0 -j MASQUERADE
       post-down iptables -D FORWARD -s 10.10.0.20 -d 192.168.0.0/16 -j DROP
   ```
   (Adjust `192.168.0.0/16` to your LAN; it stops the Windows VM from reaching it.)
5. API token for nucbox-control (least privilege, only VM 200):

   ```bash
   pveum role add MininodeControl -privs "VM.Audit VM.PowerMgmt VM.Snapshot VM.GuestAgent.Audit VM.GuestAgent.Unrestricted"
   pveum user add mininode@pve
   pveum acl modify /vms/200 -user mininode@pve -role MininodeControl
   pveum user token add mininode@pve control --privsep 0     # → PROXMOX_TOKEN=mininode@pve!control=<secret>
   cp /etc/pve/pve-root-ca.pem /root/proxmox-ca.pem          # → proxmox-ca.pem for compose
   ```
   On Proxmox VE 8 use `VM.Monitor` instead of the two `VM.GuestAgent.*` privileges.
6. Backup job for the Windows VM (*Datacenter → Backup → Add*): VM 200, storage `backup`,
   daily 02:30, mode *snapshot*, zstd, keep last 3. (App data and the database are covered by
   restic, see below.)

## 2. Linux VM (id 100)

1. Debian 13 netinst ISO. VM: 4 vCPU, 6 GB RAM with ballooning (min 3 GB), 64 GB disk on NVMe 1,
   NIC 1 on `vmbr0`, NIC 2 on `vmbr1` with static `10.10.0.10/24`. Enable the QEMU agent.
   *Options → Start at boot: yes*, order 1.
2. Inside the VM:

   ```bash
   apt install -y qemu-guest-agent docker.io docker-compose jq curl restic sops age gh git
   systemctl enable --now qemu-guest-agent docker
   mkdir -p /srv/mininode && git clone https://github.com/Sulpharus/PrivateAppHosting /srv/mininode/infra-src
   ln -s /srv/mininode/infra-src/infra /srv/mininode/infra
   mkdir -p /srv/mininode/platform /srv/mininode/apps /mnt/backup /etc/mininode
   ```
   Mount the backup disk into the VM: easiest is an NFS export of `/mnt/backup/restic` from the
   host, or a second virtual disk on NVMe 2 mounted at `/mnt/backup`.
3. Deploy user (forced command, no shell):

   ```bash
   install -m 755 /srv/mininode/infra/nucbox/deploy/nucbox-deploy /usr/local/bin/nucbox-deploy
   useradd --create-home --shell /bin/bash deploy
   echo 'deploy ALL=(root) NOPASSWD: /usr/local/bin/nucbox-deploy' > /etc/sudoers.d/mininode-deploy
   ssh-keygen -t ed25519 -N '' -C github-deploy -f /root/github-deploy   # private half → GitHub secret NUCBOX_DEPLOY_SSH_KEY
   install -d -m 700 -o deploy /home/deploy/.ssh
   printf 'restrict,command="sudo -n /usr/local/bin/nucbox-deploy \\"$SSH_ORIGINAL_COMMAND\\"" %s\n' \
     "$(cat /root/github-deploy.pub)" > /home/deploy/.ssh/authorized_keys
   chown deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
   shred -u /root/github-deploy   # after copying it to GitHub
   ```
   In `/etc/ssh/sshd_config`: `PasswordAuthentication no`, `PermitRootLogin no`.
4. GitHub token for pulls and attestation checks: a fine-grained token isn't supported for
   packages yet, so create a classic token with only `read:packages`, then
   `echo "GH_TOKEN=ghp_…" > /etc/mininode/deploy.env && chmod 600 /etc/mininode/deploy.env` and
   `echo "$GH_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin`.
5. Cloudflare resources: run `infra/cloudflare/bootstrap.sh` here (see `first-setup.md`).
6. Secrets (SOPS + age):

   ```bash
   age-keygen -o /root/.config/sops/age/keys.txt     # put the public key into .sops.yaml
   cd /srv/mininode/infra/nucbox
   cp secrets.example.env secrets.env && $EDITOR secrets.env
   sops -e secrets.env > secrets.sops.env            # commit this one from your PC
   mv secrets.env /srv/mininode/platform/ && chmod 600 /srv/mininode/platform/secrets.env
   cp platform.example.env /srv/mininode/platform/platform.env
   cp apps.example.env /srv/mininode/platform/apps.env
   cd /srv/mininode/platform && $EDITOR platform.env apps.env
   # Symlinks: `git -C /srv/mininode/infra-src pull` updates the stack definition.
   ln -s /srv/mininode/infra/nucbox/compose.yml /srv/mininode/infra/nucbox/traefik .
   scp root@10.10.0.1:/root/proxmox-ca.pem .
   echo "DOCKER_GID=$(getent group docker | cut -d: -f3)" >> platform.env
   ```
7. First start: the control image comes from the deploy workflow (job *NucBox platform image
   control*); put its digest into `platform.env`, then
   `docker compose --env-file platform.env up -d`. Check that the tunnel shows *Healthy* in
   Cloudflare Zero Trust → Networks → Tunnels.
8. Backups:

   ```bash
   cp /srv/mininode/infra/nucbox/backup.example.env /etc/mininode/backup.env && chmod 600 /etc/mininode/backup.env
   $EDITOR /etc/mininode/backup.env                  # R2 token: Object Read & Write on mininode-backups
   cp /srv/mininode/infra/nucbox/backup/*.{service,timer} /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now mininode-backup.timer mininode-restore-drill.timer
   systemctl start mininode-backup.service && journalctl -u mininode-backup -f
   ```
   Create two checks on healthchecks.io (free): *backup* (daily, grace 2 h) and *restore drill*
   (monthly, grace 1 day), and put their ping URLs into `backup.env`.

## 3. Windows 11 VM (id 200)

1. VM: 4 vCPU, 6 GB RAM (no ballooning), 64 GB disk (VirtIO SCSI, discard), UEFI + TPM 2.0,
   machine q35, NIC on `vmbr1` only, QEMU agent enabled, *Start at boot: no*. Attach the
   Windows ISO and `virtio-win.iso`. Hibernation needs a state storage:
   `qm set 200 --vmstatestorage local-lvm`.
2. Install Windows 11 Pro (load the VirtIO storage driver from the second ISO), local account.
   Static IP `10.10.0.20/24`, gateway and DNS `10.10.0.1` / `1.1.1.1`.
3. Install `virtio-win-guest-tools.exe` from the VirtIO ISO (drivers + QEMU guest agent).
4. Copy `infra/nucbox/windows/*.ps1` into the VM and run as Administrator:
   `powershell -ExecutionPolicy Bypass -File setup.ps1 -RdpPassword (Read-Host -AsSecureString)`.
   Use the same password as `WINDOWS_RDP_PASSWORD`.
5. Sign in once as `mininode` over RDP from the Linux VM (`xfreerdp /v:10.10.0.20`) so the
   profile exists, sign out, then run `lockdown.ps1`.
6. Proxmox snapshot `base` (*Snapshots → Take snapshot*), then hibernate it:
   `qm suspend 200 --todisk 1`. From now on nucbox-control wakes and hibernates it.

## 4. Verify

- `https://control.mininode.app/health` asks for Cloudflare Access, then shows `{"ok":true}`.
- Deploy a container fixture (`pnpm mininode deploy fixtures/…` via CI) and open it: login,
  403 without a grant, app with a grant.
- Admin → Remote-Apps → *Installieren* for a remote app; then open it from the phone. Close the
  tab; after 15 minutes `qm status 200` shows the VM suspended.
- `systemctl start mininode-restore-drill.service` passes.
