# @mininode/manifest

Schema, types and validator for `mininode.json`, the manifest that every hosted app carries.

```ts
import { parseManifest } from '@mininode/manifest';

const result = parseManifest(JSON.parse(text));
if (!result.ok) console.error(result.errors); // ["kind: kind \"spa\" cannot run on target \"nucbox\" …"]
```

- `src/schema.ts` holds the zod schema and the cross-field rules (target ↔ kind, required blocks).
- `game` marks the app as a game for the Gaming Hub (ADR 0009): `genre`, `players` and up to
  six `stats` (`id`, `label`, `better`, `format`, `min`, `max`); rounds reported with other
  stat ids or values outside `min`..`max` are dropped.
- `googleScopes(manifest.google)` / `googleConnectSrc(…)` turn the `google` block into OAuth
  scopes (API) and CSP origins (gate); `ALL_GOOGLE_SCOPES` is what the portal asks Google for.
- `pnpm build` regenerates `schema.json` (JSON Schema for editors, referenced via `$schema`).
- `pnpm test` runs the unit tests.

Bump `CURRENT_SPEC_VERSION` only together with `docs/ai/NEW-APP-SPEC.md`.
