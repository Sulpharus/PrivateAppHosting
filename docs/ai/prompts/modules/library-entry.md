---
id: library-entry
title: Eintrag für die App-Bibliothek
summary: Selbst gehostetes Programm als fest verdrahteten Katalogeintrag aufnehmen
group: server
order: 112
---

## Feature: an App-Bibliothek catalog entry

Use it to make a known self-hostable program installable with one click. The deliverable is an
entry in `infra/nucbox/library.json`, not an app of your own.

- Fields: `id`, `name`, `description` (German, one line), `category`, `website`, `docs`, `image`,
  `port`, `memoryMb`, `healthPath`, `volumes` (name → path in the container), `env`, `readOnly`,
  `note` (what to do after installing).
- Pin the image by tag **and digest**: `image: "docker.io/vendor/app:1.2.3@sha256:…"`. For a
  multi-arch image take the index digest (`docker buildx imagetools inspect <image>:<tag>`).
  Never use `latest`.
- Prefer images that run as non-root; set `user` only to an unprivileged `uid:gid` the image
  expects. Set `readOnly: false` only when the program writes outside its volumes.
- The health path must answer without login within 60 seconds, or the install is rolled back.
- Put persistent data into volumes only. Say in `note` what cannot pass the MiniNode login
  (for example TV or phone apps and webhooks from outside).
- Validate with `pnpm --filter @mininode/manifest test`.
