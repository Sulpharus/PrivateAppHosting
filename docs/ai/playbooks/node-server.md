# Playbook: Node server (runs on the NucBox)

For apps that need a long-running process: WebSockets, schedulers, heavy server logic.

1. `kind: "container"`, `target: "nucbox"`, `container: { port, memoryMb, healthPath }`.
2. **Dockerfile** (multi-stage, non-root user, `node:22-alpine`), `EXPOSE <port>`, a
   `GET /health` endpoint that returns 200 without auth.
3. **Auth:** requests reach the app only after the NucBox forward-auth accepted the session.
   It adds headers you can trust (they are stripped from client requests):
   `X-Mininode-User` (user id), `X-Mininode-Email`, `X-Mininode-Role`, `X-Mininode-Token`
   (the user's access token — use it as `Authorization: Bearer` when calling Supabase so RLS
   applies). Never accept these headers from anywhere else.
4. **Data:** call Supabase with the user's token (`@supabase/supabase-js`, anon/publishable key
   from env `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`, injected by the platform) and use app
   tables as in [common steps](common-steps.md). No service-role key in apps.
5. **Config:** environment variables only; document them in the README. Secrets are added by the
   admin to the NucBox (SOPS), never committed.
6. Continue with [common steps](common-steps.md) (local check: `docker build` + `docker run`).
