# AI instructions

| File | For | Purpose |
|---|---|---|
| [`NEW-APP-SPEC.md`](NEW-APP-SPEC.md) | any AI that builds an app | Paste-ready spec: stack, SDK, data, manifest |
| [`NEW-APP-SPEC.short.md`](NEW-APP-SPEC.short.md) | tools with small prompt limits | Generated from the long spec (`pnpm spec:short`) |
| [`LANGUAGE-PACKAGES.md`](LANGUAGE-PACKAGES.md) | any AI that builds an app | German and English language packages: files, use, style rules, glossary, checks |
| [`RETROFIT-LANGUAGE.md`](RETROFIT-LANGUAGE.md) | any AI | Task prompt: add the language packages to an app that already exists (in the KI-Werkstatt with the full guide attached) |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | any AI that builds an app | The MiniNode App Kit: tokens (light and dark), shell, components, copy rules |
| [`prompts/`](prompts/) | the prompt composer | App types and feature modules, composed into one full prompt in *Verwaltung → KI-Werkstatt* |
| [`playbooks/`](playbooks/) | the integration agent | Step-by-step conversion per source type |
| `mininode doctor` | agent, CI, humans | The deterministic definition of done |
| [`.claude/skills/integrate-app`](../../.claude/skills/integrate-app/SKILL.md) | Claude Code | Orchestrates classify → playbook → test → doctor |

The easiest start is *Verwaltung → KI-Werkstatt* in the portal: it offers every file above for
copying or download and composes a complete prompt from the app idea, its type and features.

Workflow: build the app with the spec → drop the ZIP into `inbox/` → run `/integrate-app` in
Claude Code → review the PR → merge → deployed.

When the spec changes in a way that old apps would violate, bump `CURRENT_SPEC_VERSION` in
`packages/manifest` and `specVersion` here together.
