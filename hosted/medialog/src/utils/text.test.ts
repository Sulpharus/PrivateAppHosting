import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import { getKindLabel, getProgressSummary, getStatusLabel, getSubtypeLabel } from './text';

// The tests run with the German package (test/setup.ts).
describe('labels', () => {
  it('names kinds, subtypes and statuses in the active language', () => {
    expect(getKindLabel('audiobook')).toBe('Hörbuch');
    expect(getKindLabel('book', 'Light Novel')).toBe('Light Novel');
    expect(getSubtypeLabel('Sachbuch')).toBe('Sachbuch');
    expect(getSubtypeLabel('Something new')).toBe('Something new');
    expect(getStatusLabel('active', 'book')).toBe('Am Lesen');
    expect(getStatusLabel('done', 'game')).toBe('Durchgespielt');
  });

  it('summarises progress with placeholders and plurals', () => {
    const series = {
      kind: 'series',
      currentSeason: 2,
      currentEpisode: 3,
      episodes: [{ watched: true }, { watched: false }],
    } as unknown as MediaItem;
    expect(getProgressSummary(series)).toBe('Staffel 2, Folge 3 (1/2)');
  });
});
