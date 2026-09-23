# @mininode/manifest

Schema, types and validator for `mininode.json`, the manifest that every hosted app carries.

```ts
import { parseManifest } from '@mininode/manifest';

const result = parseManifest(JSON.parse(text));
if (!result.ok) console.error(result.errors); // ["kind: kind \"spa\" cannot run on target \"nucbox\" …"]
```

- `src/schema.ts` holds the zod schema and the cross-field rules (target ↔ kind, required blocks).
- `pnpm build` regenerates `schema.json` (JSON Schema for editors, referenced via `$schema`).
- `pnpm test` runs the unit tests.

Bump `CURRENT_SPEC_VERSION` only together with `docs/ai/NEW-APP-SPEC.md`.
