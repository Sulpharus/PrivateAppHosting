// The model catalog and the Anthropic request body: current Claude models at low effort, merged with
// the JSON format, and no effort when an override sets it to null.
import { describe, expect, it } from 'vitest';
import { catalog } from './models.ts';
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
