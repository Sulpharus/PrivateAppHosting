# AI instructions

| File | For | Purpose |
|---|---|---|
| [`NEW-APP-SPEC.md`](NEW-APP-SPEC.md) | any AI that builds an app | Paste-ready spec: stack, SDK, data, manifest |
| [`NEW-APP-SPEC.short.md`](NEW-APP-SPEC.short.md) | tools with small prompt limits | Generated from the long spec (`pnpm spec:short`) |
| [`LANGUAGE-PACKAGES.md`](LANGUAGE-PACKAGES.md) | any AI that builds an app | German and English language packages: files, use, style rules, glossary, checks |
| [`RETROFIT-LANGUAGE.md`](RETROFIT-LANGUAGE.md) | any AI | Task prompt: add the language packages to an app that already exists (in the KI-Werkstatt with the full guide attached) |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | any AI that builds an app | The MiniNode App Kit: tokens (light and dark), shell, components, copy rules |
| [`prompts/`](prompts/) | the prompt composer | App types and feature modules, composed in *Verwaltung → KI-Werkstatt* into the prompt that fits the chosen tool (ADR 0030) |
| [`playbooks/`](playbooks/) | the integration agent | Step-by-step conversion per source type |
| `mininode doctor` | agent, CI, humans | The deterministic definition of done |
| [`.claude/skills/integrate-app`](../../.claude/skills/integrate-app/SKILL.md) | Claude Code | Orchestrates classify → playbook → test → doctor |

The easiest start is *Verwaltung → KI-Werkstatt* in the portal: it composes the prompt for your
tool (Claude, ChatGPT, AI Studio, Bolt, a coding agent in this repository, a local model) from the
app idea, its type and features, and offers a **starter package** (App Kit, preview SDK, language
files, manifest, rules) so the app runs in the tool's own preview. Agents in this repository read
`hosted/AGENTS.md`.

Workflow: build the app with the spec → drop the ZIP into `inbox/` → run `/integrate-app` in
Claude Code → review the PR → merge → deployed.

When the spec changes in a way that old apps would violate, bump `CURRENT_SPEC_VERSION` in
`packages/manifest` and `specVersion` here together.
