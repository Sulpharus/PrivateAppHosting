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
}

export const DEFAULT_CATALOG: Record<ModelAlias, ModelEntry> = {
  'gemini-flash': { provider: 'google', id: 'gemini-3.7-flash', input: 0.75, output: 3.75 },
  'gemini-pro': { provider: 'google', id: 'gemini-3.1-pro', input: 2, output: 12 },
  'claude-haiku': { provider: 'anthropic', id: 'claude-haiku-4-5', input: 1, output: 5 },
  'claude-sonnet': { provider: 'anthropic', id: 'claude-sonnet-5', input: 2, output: 10 },
};

export function catalog(override: string | undefined): Record<ModelAlias, ModelEntry> {
  if (!override) return DEFAULT_CATALOG;
  const parsed = JSON.parse(override) as Partial<Record<ModelAlias, Partial<ModelEntry>>>;
  const merged = { ...DEFAULT_CATALOG };
  for (const alias of Object.keys(DEFAULT_CATALOG) as ModelAlias[]) {
    const patch = parsed[alias];
    if (patch) merged[alias] = { ...DEFAULT_CATALOG[alias], ...patch };
  }
  return merged;
}

/** Conservative token estimate for the reservation (~3 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3) + 16;
}

export function costMicro(model: ModelEntry, inputTokens: number, outputTokens: number): number {
  return Math.ceil(inputTokens * model.input + outputTokens * model.output);
}
