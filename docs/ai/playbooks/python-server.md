# Playbook: Python server (runs on the NucBox)

Same contract as [node-server](node-server.md) — container, forward-auth headers, `/health`,
Supabase with the user's token — with Python specifics:

1. `python:3.13-slim` base, `uv` or `pip install --no-cache-dir -r requirements.txt`, pinned
   versions, non-root user, `gunicorn`/`uvicorn` as the entrypoint on `0.0.0.0:<port>`.
2. Read `X-Mininode-User`/`X-Mininode-Token` from the request headers (Flask: `request.headers`,
   FastAPI: `Header()` dependency).
3. Supabase: `supabase-py` client created per request with the user's token
   (`client.postgrest.auth(token)`).
4. Continue with [common steps](common-steps.md).
