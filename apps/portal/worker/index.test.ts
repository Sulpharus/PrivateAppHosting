import { contentSecurityPolicy } from '@mininode/gate';
import { describe, expect, it } from 'vitest';
import { portalFrameSources } from './index.ts';

describe('portal frame-src (ADR 0032)', () => {
  it('lets an app in the viewer open pages it made itself, such as a PDF', () => {
    const csp = contentSecurityPolicy({
      supabaseUrl: 'https://proj.supabase.co',
      apiOrigin: 'https://api.example.org',
      aiOrigin: 'https://ai.example.org',
      frameSrc: portalFrameSources('example.org'),
    });
    // An app that navigates itself to blob:…/data:… (Rechnungen's PDF) was blocked in the frame.
    expect(csp).toContain("frame-src 'self' https: blob: data:");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('allows the local app hosts only on a local stack', () => {
    expect(portalFrameSources('localhost')).toContain('http://*.localhost:*');
    expect(portalFrameSources('example.org')).not.toContain('http://*.localhost:*');
  });
});
