// Model aliases apps may request (see the manifest's `ai.models`) and what they cost.
// Prices are € per 1M tokens, which equals micro-€ per token. Provider list prices in USD are
// used as € on purpose: it slightly overestimates cost, so budgets never undershoot.
// Gemini model ids change often — override them with the MODEL_CATALOG var without a deploy.

export type ModelAlias = 'gemini-flash' | 'gemini-pro' | 'claude-haiku' | 'claude-sonnet';

export interface ModelEntry {
  provider: 'anthropic' | 'google';
  id: string;
  input: number;
  output: number;
  /**
   * Anthropic only: the effort level sent with every request. App calls are short (summaries,
   * extraction) and the output budget is small, so thinking stays low and leaves room for the
   * answer. Set it to null when MODEL_CATALOG points an alias at a model without effort.
   */
  effort?: 'low' | 'medium' | 'high' | null;
}

const DEFAULT_CATALOG: Record<ModelAlias, ModelEntry> = {
  'gemini-flash': { provider: 'google', id: 'gemini-3.7-flash', input: 0.75, output: 3.75 },
  'gemini-pro': { provider: 'google', id: 'gemini-3.1-pro', input: 2, output: 12 },
  // Claude Haiku 5.5 costs $0.10/$0.50 up to 100K input tokens and $0.50/$2.50 above; the higher
  // rate is used so a budget never undershoots.
  'claude-haiku': {
    provider: 'anthropic',
    id: 'claude-haiku-5-5',
    input: 0.5,
    output: 2.5,
    effort: 'low',
  },
  'claude-sonnet': {
    provider: 'anthropic',
    id: 'claude-sonnet-5-5',
    input: 2,
    output: 10,
    effort: 'low',
  },
};

/** Changes to some aliases: from Verwaltung → KI-Proxy (`platform.ai_models`) or `MODEL_CATALOG`. */
export type ModelPatch = Partial<Record<ModelAlias, Partial<ModelEntry>>>;

/**
 * The effective catalog: the defaults above, then what the admin set in Verwaltung → KI-Proxy
 * (`fromDb`), then the `MODEL_CATALOG` var (an emergency override without touching the database).
 */
export function catalog(
  override: string | undefined,
  fromDb: ModelPatch = {},
): Record<ModelAlias, ModelEntry> {
  const env = override ? (JSON.parse(override) as ModelPatch) : {};
  const merged = { ...DEFAULT_CATALOG };
  for (const alias of Object.keys(DEFAULT_CATALOG) as ModelAlias[])
    merged[alias] = { ...DEFAULT_CATALOG[alias], ...fromDb[alias], ...env[alias] };
  return merged;
}

/** A row of `platform.ai_models` as the proxy reads it. */
export interface ModelRow {
  alias: string;
  model_id: string;
  input_eur_per_mtok: number | string;
  output_eur_per_mtok: number | string;
  effort: 'low' | 'medium' | 'high' | null;
}

/** Rows of `platform.ai_models` as catalog changes; unknown aliases and bad prices are skipped. */
export function patchFromRows(rows: ModelRow[]): ModelPatch {
  const patch: ModelPatch = {};
  for (const row of rows) {
    if (!(row.alias in DEFAULT_CATALOG)) continue;
    const input = Number(row.input_eur_per_mtok);
    const output = Number(row.output_eur_per_mtok);
    if (!row.model_id || !Number.isFinite(input) || !Number.isFinite(output)) continue;
    const alias = row.alias as ModelAlias;
    patch[alias] = {
      id: row.model_id,
      input,
      output,
      ...(DEFAULT_CATALOG[alias].provider === 'anthropic' ? { effort: row.effort } : {}),
    };
  }
  return patch;
}

/**
 * Web search is billed per search on top of the tokens (Anthropic about $10 per 1,000 searches,
 * Gemini grounding per search query). One request may search several times, so a flat, generous
 * amount (micro-€) is added to the reservation and to the settled cost.
 */
export const SEARCH_SURCHARGE_MICRO = 50_000;
/** Tokens the found pages add to the prompt (up to five searches), reserved on top. */
export const SEARCH_INPUT_ALLOWANCE = 30_000;

/** Conservative token estimate for the reservation (~3 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3) + 16;
}

export function costMicro(model: ModelEntry, inputTokens: number, outputTokens: number): number {
  return Math.ceil(inputTokens * model.input + outputTokens * model.output);
}
