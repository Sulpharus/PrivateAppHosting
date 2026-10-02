---
id: container
title: Server-Dienst als Container
summary: Dauerlaufender Prozess, Gesundheitspfad, Anmeldung über Header, Speicherbedarf
group: server
order: 110
---

## Feature: a server process as a container app

Use it only when the web app needs a long-running process (WebSockets, a scheduler, heavy server
work). Otherwise build a static or Vite app.

- Manifest: `kind: "container"`, `target: "nucbox"`,
  `container: { port, memoryMb, healthPath }`. Keep `memoryMb` realistic (the server has about
  6 GB for all containers).
- Dockerfile: multi-stage, non-root user, one `EXPOSE`d port, a `GET <healthPath>` that returns 200
  without login. An unhealthy start is rolled back by the platform.
- Login is done before the request reaches the app. Trust only the headers `X-Mininode-User`,
  `X-Mininode-Email`, `X-Mininode-Role` and `X-Mininode-Token`; never accept them from anywhere
  else and never build your own login.
- Data: call Supabase with the user's token (`Authorization: Bearer <X-Mininode-Token>`) so row
  level security applies. No service-role key in the app.
- Configuration through environment variables only; list them in the README. Secrets are added
  by the admin on the server, never committed.
- Log to stdout, one line per event, no personal data. Shut down cleanly on `SIGTERM`.
- Check locally with `docker build` and `docker run`, then `pnpm mininode doctor hosted/<slug>`.
