import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next.ts';

const origin = 'https://mininode.app';

describe('safeNext', () => {
  it('keeps same-origin paths relative', () => {
    expect(safeNext('/admin/users?x=1#y', origin)).toBe('/admin/users?x=1#y');
  });

  it('allows apps on the platform domain', () => {
    expect(safeNext('https://rezepte.mininode.app/woche', origin)).toBe(
      'https://rezepte.mininode.app/woche',
    );
  });

  it.each([
    'https://evil.example/',
    'https://mininode.app.evil.example/',
    '//evil.example/x',
    'javascript:alert(1)',
    'http://rezepte.mininode.app/',
    null,
  ])('falls back to / for %s', (next) => {
    expect(safeNext(next, origin)).toBe('/');
  });
});
