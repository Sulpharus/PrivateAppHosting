# @mininode/ai-proxy — `ai.mininode.app`

Lets hosted apps use Gemini and Claude without shipping keys. Called by `mn.ai.chat/stream/json`.

Per request:

1. Verify the session JWT (JWKS) and that `Origin` is `https://<app>.mininode.app`.
2. Check the user's grant for the app and the app's `ai.models` allow-list from its manifest.
3. Cap `maxOutputTokens` at the manifest limit, then atomically **reserve** the worst-case cost
   (`platform.ai_reserve`). Budgets: global, per app, per role, per user (see the Host Manager).
4. Call the provider through **Cloudflare AI Gateway** (logs, caching, rate limits).
5. **Settle** the real cost (`platform.ai_settle`); failed calls release the reservation.

| Endpoint | Body | Response |
|---|---|---|
| `POST /v1/chat` | `{ app, messages, model?, system?, maxOutputTokens?, temperature?, stream? }` | `{ text, usage }` or a `text/plain` stream |
| `POST /v1/json` | same + `schema` (JSON Schema) | `{ json, usage }` |

Errors: `401 unauthenticated`, `403 origin_mismatch | forbidden | ai_disabled | model_not_allowed`,
`402 budget_exceeded`, `502 provider_error | invalid_json`.

Model ids and prices live in `src/models.ts`; override without a deploy via the `MODEL_CATALOG`
var. Secrets: `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, optional
`AI_GATEWAY_TOKEN` (authenticated gateway). Gemini model ids should be re-checked when setting up.
