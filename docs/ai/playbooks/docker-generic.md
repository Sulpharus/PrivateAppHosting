# Playbook: any other stack with a Dockerfile

1. Keep the Dockerfile; make sure it runs as non-root, listens on one port and has a health path.
2. `kind: "container"`, `target: "nucbox"`, `container.memoryMb` realistic (the NucBox has
   ~6 GB for all containers).
3. Follow the auth/data contract of [node-server](node-server.md) (forward-auth headers,
   user token for Supabase).
4. If the app has its own user system, disable it or map it to `X-Mininode-User`.
5. Continue with [common steps](common-steps.md).
