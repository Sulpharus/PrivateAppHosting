# Releases and downloads

Each release has up to three packages (ADR 0016): **Cloud**, **PC/server** and **Complete**,
with `SHA256SUMS`.

| Tag | Builds |
| --- | --- |
| `v1.2.0` | cloud, pc-server and complete, all 1.2.0 |
| `cloud-v1.2.0` | only the Cloud edition |
| `pc-server-v1.2.0` | only the PC/server edition |

## Make a release

```bash
git tag v1.2.0 && git push origin v1.2.0
```

The workflow *Release* builds the packages with `scripts/package-release.sh`, checks the
checksums and attaches them to the GitHub release. For an existing tag run the workflow by hand
(Actions → Release → *Run workflow*). Local test: `scripts/package-release.sh 0.0.0-test /tmp/out`.

## Download

GitHub → Releases → pick the version → the package you want:
- **PC/server only:** `mininode-pc-server-<version>.zip` (needs the Cloud edition running).
- **Cloud only:** `mininode-cloud-<version>.zip`.
- **Everything:** `mininode-complete-<version>.zip`.

Check a download with `sha256sum -c SHA256SUMS`.

## Which operating system?

See `README-EDITION.md` in the PC/server package: Proxmox VE 9 host, a Linux VM with Docker, an
optional Windows 11 VM. Using the platform needs no installation on any device (web app).
