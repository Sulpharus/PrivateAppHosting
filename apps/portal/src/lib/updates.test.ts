import { describe, expect, it } from 'vitest';
import { updateLabel } from './updates.ts';

describe('updateLabel', () => {
  it('tells current, outdated and unknown apart', () => {
    expect(updateLabel(true).text).toBe('Aktuell');
    expect(updateLabel(false).text).toBe('Update verfügbar');
    expect(updateLabel(null).text).toBe('Stand unbekannt');
  });
});
