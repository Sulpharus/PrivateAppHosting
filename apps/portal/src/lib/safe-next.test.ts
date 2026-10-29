import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next.ts';

const origin = 'https://example.org';

describe('safeNext', () => {
  it('keeps same-origin paths relative', () => {
    expect(safeNext('/admin/users?x=1#y', origin)).toBe('/admin/users?x=1#y');
  });

  it('allows apps on the platform domain', () => {
    expect(safeNext('https://rezepte.example.org/woche', origin)).toBe(
      'https://rezepte.example.org/woche',
    );
  });

  it.each([
    'https://evil.example/',
    'https://example.org.evil.example/',
    '//evil.example/x',
    'javascript:alert(1)',
    'http://rezepte.example.org/',
    null,
  ])('falls back to / for %s', (next) => {
    expect(safeNext(next, origin)).toBe('/');
  });
});
