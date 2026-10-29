# Releases and downloads

Each release has one package, the **Starter** (ADR 0016, ADR 0026): the whole platform without
apps and without anything of the building installation (see `scripts/make-starter.sh`). It holds the
Cloudflare setup, the desktop installer for Docker, the home-server side and every instruction.
The other editions (Cloud, PC/server, Complete) are cut from the whole repository, which holds the
owner's apps and settings, so the workflow no longer publishes them.

## Make a release

```bash
git tag -a v0.1.0-test -m "Title of the release" && git push origin v0.1.0-test
```

The workflow *Release* builds the starter with `scripts/package-release.sh`, checks the checksum and
attaches it to the GitHub release. The title is the subject of the annotated tag; a tag with a hyphen
(`v0.1.0-test`) becomes a pre-release. For an existing tag run the workflow by hand (Actions →
Release → *Run workflow*). Local test: `scripts/package-release.sh 0.0.0-test /tmp/out starter`.

## Download

GitHub → Releases → pick the version → `mininode-starter-<version>.zip`, then
`docs/runbooks/getting-started.md`.

Check a download with `sha256sum -c SHA256SUMS`.

## Which operating system?

See `README-EDITION.md` in the package: Proxmox VE 9 host, a Linux VM with Docker, an
optional Windows 11 VM. Using the platform needs no installation on any device (web app).
