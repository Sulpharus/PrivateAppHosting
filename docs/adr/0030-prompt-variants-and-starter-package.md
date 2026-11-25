# ADR 0030: Prompt variants per tool and a starter package for building outside MiniNode

- Status: accepted
- Date: 2026-11-24

## Context

The KI-Werkstatt (ADR 0003) composed one long prompt for every tool: brief first, then spec, design
system, language guide, type and modules, with the kit CSS (45 KB) pasted in for Claude artifacts.
An audit found three kinds of problems:

- **Contradictions.** Most app types and several modules stored one kv key per entry although lists
  are tables (ADR 0022); modules hard-coded German formats although apps follow the person's
  language (ADR 0017); the Claude-artifact instructions asked for `window.storage` and
  `window.claude.complete` while the spec in the same prompt forbade both. Current models follow
  instructions literally and lose quality on conflicts; GPT models may stop and ask.
- **Wrong promises.** `images_unsupported` (only thrown by the compat layer), `create index
  concurrently` (app SQL runs in a transaction), `mn.notify` invitations to other people, "no maps".
- **One shape for every tool.** The SDK and `/_mininode/*` do not exist in a tool's preview, so
  models wrote their own fallbacks (`stand-in-sdk`); agents in the repository got 50 KB pasted that
  they can read themselves; small local models cannot hold the prompt; Bolt and ChatGPT work best
  with a short message plus a file or knowledge field.

## Decision

**The prompt is reference first, task last.** Spec, design system, language guide, app type and
feature modules come first, each in its own tag (`<platform_spec>`, `<design_system>`, …), followed by
the task, the tool's delivery steps, 15 numbered hard rules and a checklist that points back to them.
Anthropic, Google and OpenAI all advise this order for long prompts.

**The sources do not contradict each other**, checked by `apps/portal/src/admin/prompts.test.ts`
(no kv key per entry, no hard-coded `'de-DE'`, no promises the platform does not keep). Types suggest
an audience and modules; the composer always adds `tables` (and `teams` or `readonly-content` for
those audiences). Every type and module has a `when:` line in plain German, shown as a tooltip.

**One variant per tool:**

| Tool | Output |
| --- | --- |
| Coding agent in the repository (Claude Code, Codex, Cursor, Copilot, Gemini CLI, Jules) | a short pointer prompt: which files to read, the brief, "done" = doctor, `pnpm check`, e2e test, PR; `hosted/AGENTS.md` holds the app rules |
| Claude (claude.ai), other AI | one full prompt plus the starter package; the AI builds real files and hands over a ZIP |
| ChatGPT | a short prompt; the reference as `MININODE-REFERENCE.md` to attach |
| Google AI Studio | full prompt that switches off its server, Firebase and Tailwind defaults, plus the starter package |
| Bolt.new | a rules block for the project knowledge field, a short prompt and the reference file |
| Local or small model | a compact prompt (SDK, manifest, one HTML skeleton, language example, type, modules), built in steps |

**Starter package.** Tools outside the repository get a ZIP with `_mininode/` (the App Kit, `i18n.js`
and a preview SDK, `packages/ui/kit/sdk-preview.js`), empty language packages, a manifest, a page
skeleton, `AGENTS.md` with the rules and `MININODE-REFERENCE.md`. The preview SDK implements the
client's surface on this browser's storage, so the app runs in the tool's preview without code of its
own for "when MiniNode is not there". Its surface follows the real client
(`packages/sdk/src/preview-surface.test.ts`). It is the only allowed stand-in and carries a marker
line (`mininode-preview-sdk`): `mininode integrate` drops `_mininode/`, `public/_mininode/`,
`MININODE-REFERENCE.md`, the marked `AGENTS.md` and every file with the marker wherever the AI moved
it (and the page's `<script>` tags pointing at it), and `mininode doctor` refuses an app that still
ships `_mininode/` (`reserved-path`) or a marked file (`preview-sdk`). For *extend* and *fix* the
package holds only `_mininode/`, `AGENTS.md` and the reference, and the rules say to keep the app's
slug, name and data mode.

**Tasks besides new apps:** "extend an existing app" and "fix check findings" use the same blocks.

## Consequences

- The legacy `window.storage` artifact path is gone from new prompts; the Claude-artifact playbook
  still converts old exports.
- Builder ids changed (`claude-artifact` → `claude`, `claude-code` → `repo-agent`); `BUILDER_ALIASES`
  keeps old briefs working.
- The preview SDK must follow the real client's surface: a new SDK method gets a preview stand-in
  in the same pull request (its test covers the main calls).
- Tool defaults change often (AI Studio, Bolt, Lovable). The builder texts live in one place
  (`BUILDERS` in `apps/portal/src/admin/prompts.ts`) and say what to switch off, not which version
  a tool runs.
