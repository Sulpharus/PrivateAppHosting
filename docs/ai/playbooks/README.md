# Integration playbooks

Pick the playbook by what the export contains (first match wins):

| Signal in the export | Playbook |
|---|---|
| Single `.jsx`/`.tsx`/`.html` using `window.claude` or `window.storage`, no `package.json` | [claude-artifact](claude-artifact.md) |
| `metadata.json` from AI Studio, `@google/genai`, `process.env.API_KEY`, import map with `esm.sh` | [ai-studio](ai-studio.md) |
| `next.config.*` or `next` in dependencies | [nextjs](nextjs.md) |
| `vite.config.*` or a React/Vue/Svelte SPA with `package.json` | [vite-react](vite-react.md) |
| Only `.html`/`.css`/`.js` files | [static-html](static-html.md) |
| Node server (`express`, `fastify`, `hono` with `listen`, WebSockets) | [node-server](node-server.md) |
| Python server (`flask`, `fastapi`, `django`, `requirements.txt`) | [python-server](python-server.md) |
| A `Dockerfile` of any other stack | [docker-generic](docker-generic.md) |
| `.exe`, `.msi`, `.apk` | [native-installer](native-installer.md) |

Every playbook ends the same way — see [common-steps.md](common-steps.md).
