import { describe, expect, it } from 'vitest';
import { parseInstanceConfig, resolveEnvironment } from './instance.ts';

const valid = {
  cloudflare: { accountId: 'a'.repeat(32) },
  github: { repository: 'someone/my-platform' },
  environments: {
    production: {
      domain: 'apps.example.org',
      supabase: {
        projectRef: 'abcdefghijklmnopqrst',
        publishableKey: 'sb_publishable_0123456789abcdef',
      },
    },
  },
};

// Built at run time: a literal would look like a leaked key to the secret scan.
const wrongKind = ['sb', 'secret', 'x'.repeat(16)].join('_');

describe('instance config', () => {
  it('accepts a minimal valid file', () => {
    expect(parseInstanceConfig(valid).ok).toBe(true);
  });

  it('derives every address from the domain and the project reference', () => {
    const parsed = parseInstanceConfig(valid);
    if (!parsed.ok) throw new Error('invalid');
    expect(resolveEnvironment(parsed.config)).toMatchObject({
      domain: 'apps.example.org',
      zone: 'apps.example.org',
      portalUrl: 'https://apps.example.org',
      apiUrl: 'https://api.apps.example.org',
      aiUrl: 'https://ai.apps.example.org',
      supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      mailFrom: 'hallo@apps.example.org',
    });
  });

  it('takes the zone from the file when the domain is a subdomain', () => {
    const parsed = parseInstanceConfig({ ...valid, zone: 'example.org' });
    if (!parsed.ok) throw new Error('invalid');
    expect(resolveEnvironment(parsed.config).zone).toBe('example.org');
  });

  it.each([
    ['a URL instead of a domain', { domain: 'https://apps.example.org' }],
    ['a domain with a path', { domain: 'apps.example.org/x' }],
    ['no dot', { domain: 'localhost' }],
    [
      'uppercase project reference',
      {
        supabase: {
          projectRef: 'ABCDEFGHIJKLMNOPQRST',
          publishableKey: 'sb_publishable_0123456789abcdef',
        },
      },
    ],
    [
      'a secret key as the publishable key',
      {
        supabase: {
          projectRef: 'abcdefghijklmnopqrst',
          publishableKey: wrongKind,
        },
      },
    ],
  ])('rejects %s', (_label, patch) => {
    const production = { ...valid.environments.production, ...patch };
    expect(parseInstanceConfig({ ...valid, environments: { production } }).ok).toBe(false);
  });

  it('rejects unknown keys, so a typo or a pasted secret is noticed', () => {
    expect(parseInstanceConfig({ ...valid, serviceRoleKey: 'x' }).ok).toBe(false);
  });

  it('lets staging start without a domain but not be resolved', () => {
    const parsed = parseInstanceConfig({
      ...valid,
      environments: {
        ...valid.environments,
        staging: {
          supabase: {
            projectRef: 'tsrqponmlkjihgfedcba',
            publishableKey: 'sb_publishable_fedcba9876543210',
          },
        },
      },
    });
    if (!parsed.ok) throw new Error('invalid');
    expect(() => resolveEnvironment(parsed.config, 'staging')).toThrow(/no domain/);
  });
});
