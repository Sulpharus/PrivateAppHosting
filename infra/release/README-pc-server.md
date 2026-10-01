# MiniNode · PC/server edition (NucBox)

Everything that runs on the home server: the compose stack (Traefik, cloudflared, Guacamole,
nucbox-control), the deploy forced command, backups, the Windows and Wine setup, and the
App-Bibliothek catalog. It is the other half of the Cloud edition: the portal, API and database
stay in the cloud, so install the Cloud edition first.

## Which operating system is this for?

- **Host: Proxmox VE 9** (Debian based), installed on the PC. It is required: nucbox-control
  starts, snapshots and hibernates the Windows VM through the Proxmox API.
- **Linux VM** (Debian or Ubuntu) on that host: Docker, the compose stack, container apps,
  Wine sessions. The scripts are bash and assume Linux and systemd.
- **Windows 11 Pro VM**, only for Windows programs (RemoteApp over Guacamole).

### Other operating systems

- **Any Linux machine with Docker** can run the Linux VM part (compose stack, container apps,
  Wine sessions, App-Bibliothek). nucbox-control still wants a Proxmox URL, so Windows programs
  and VM power control are not available without Proxmox. Not tested on hardware.
- **Windows or macOS** as the host are not supported. Docker Desktop could run single
  containers, but the deploy script, the compose paths and the VM control assume Linux.
- Using the platform from any device needs nothing installed: it is a web app (Windows, macOS,
  Linux, Android, iOS).

Setup: `docs/runbooks/nucbox-install.md`. Update the box by installing the next release of this
edition, then run the deploy script as described in `infra/nucbox/README.md`.
