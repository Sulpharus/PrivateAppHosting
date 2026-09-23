# Integration fixtures

Real-shaped app exports and their correctly integrated versions. They document what the
playbooks in `docs/ai/playbooks/` turn an export into, and CI checks them on every PR
(`packages/cli/src/fixtures.test.ts`):

- every `input/` export **fails** `mininode doctor` with the listed rules (the problems the
  integration must fix), and
- every `expected/<slug>/` app **passes** `mininode doctor` without findings.

| Fixture | Source | Main changes |
|---|---|---|
| `static-html` | hand-written / generic HTML | CDN script → local, `localStorage` → `mn.kv`, SDK script tag |
| `claude-artifact` | Claude artifact (React) | `window.claude.complete` → `mn.ai.chat`, `window.storage` → `mn.kv`, Vite scaffold |
| `ai-studio` | Google AI Studio export | `@google/genai` + `process.env.API_KEY` → `mn.ai.json`, import map removed |

LLM-driven integration of these inputs (the `integrate-app` skill end to end) is an eval that runs
manually, not in CI, because it costs money and is not deterministic.
