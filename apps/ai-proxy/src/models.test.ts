// The model catalog and the Anthropic request body: current Claude models at low effort, merged with
// the JSON format, and no effort when an override sets it to null.
import { describe, expect, it } from 'vitest';
import { catalog, patchFromRows } from './models.ts';
import { anthropicParams } from './providers.ts';

const request = (alias: 'claude-haiku' | 'claude-sonnet', override?: string) => ({
  model: catalog(override)[alias],
  messages: [{ role: 'user' as const, content: 'Hallo' }],
  maxOutputTokens: 1500,
});

describe('anthropic request body', () => {
  it('uses the current Claude models at low effort', () => {
    expect(catalog(undefined)['claude-haiku'].id).toBe('claude-haiku-5-5');
    expect(catalog(undefined)['claude-sonnet'].id).toBe('claude-sonnet-5-5');
    expect(anthropicParams(request('claude-sonnet'))).toMatchObject({
      model: 'claude-sonnet-5-5',
      output_config: { effort: 'low' },
    });
  });

  it('keeps the effort next to the JSON format', () => {
    const schema = { type: 'object', properties: {} };
    expect(anthropicParams({ ...request('claude-haiku'), schema }).output_config).toEqual({
      effort: 'low',
      format: { type: 'json_schema', schema },
    });
  });

  it('sends no effort when MODEL_CATALOG points an alias at a model without it', () => {
    const override = JSON.stringify({ 'claude-haiku': { id: 'claude-haiku-4-5', effort: null } });
    const body = anthropicParams(request('claude-haiku', override));
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body).not.toHaveProperty('output_config');
  });
});

describe('catalog from Verwaltung → KI-Proxy', () => {
  it('turns rows into changes, skips unknown aliases and bad prices', () => {
    const patch = patchFromRows([
      {
        alias: 'claude-haiku',
        model_id: 'claude-haiku-6',
        input_eur_per_mtok: '0.2000',
        output_eur_per_mtok: '1',
        effort: null,
      },
      {
        alias: 'gemini-flash',
        model_id: 'gemini-4-flash',
        input_eur_per_mtok: 1,
        output_eur_per_mtok: 'x',
        effort: null,
      },
      {
        alias: 'gpt-x',
        model_id: 'gpt-x',
        input_eur_per_mtok: 1,
        output_eur_per_mtok: 1,
        effort: null,
      },
    ]);
    expect(patch).toEqual({
      'claude-haiku': { id: 'claude-haiku-6', input: 0.2, output: 1, effort: null },
    });
  });

  it('applies the defaults, then the admin settings, then MODEL_CATALOG', () => {
    const fromDb = { 'claude-haiku': { id: 'claude-haiku-6', input: 0.2 } };
    expect(catalog(undefined, fromDb)['claude-haiku']).toMatchObject({
      id: 'claude-haiku-6',
      input: 0.2,
      output: 2.5,
    });
    const env = JSON.stringify({ 'claude-haiku': { id: 'claude-haiku-7' } });
    expect(catalog(env, fromDb)['claude-haiku']).toMatchObject({
      id: 'claude-haiku-7',
      input: 0.2,
    });
  });
});
