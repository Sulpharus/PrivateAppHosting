# AI instructions

| File | For | Purpose |
|---|---|---|
| [`NEW-APP-SPEC.md`](NEW-APP-SPEC.md) | any AI that builds an app | Paste-ready spec: stack, SDK, data, manifest |
| [`NEW-APP-SPEC.short.md`](NEW-APP-SPEC.short.md) | tools with small prompt limits | Generated from the long spec (`pnpm spec:short`) |
| [`playbooks/`](playbooks/) | the integration agent | Step-by-step conversion per source type |
| `mininode doctor` | agent, CI, humans | The deterministic definition of done |
| [`.claude/skills/integrate-app`](../../.claude/skills/integrate-app/SKILL.md) | Claude Code | Orchestrates classify → playbook → test → doctor |

Workflow: build the app with the spec → drop the ZIP into `inbox/` → run `/integrate-app` in
Claude Code → review the PR → merge → deployed.

When the spec changes in a way that old apps would violate, bump `CURRENT_SPEC_VERSION` in
`packages/manifest` and `specVersion` here together.
