import { describe, expect, it } from 'vitest';
import type { Backup, Item } from '../types';
import { usedPaths } from './store';

const item = (id: string, photoPath?: string, receiptPath?: string): Item => ({
  id,
  name: id,
  category: 'others',
  location: '@kitchen',
  purchasePrice: 0,
  purchaseDate: '',
  warrantyExpiry: '',
  photoPath,
  receiptPath,
  createdAt: 1,
  updatedAt: 1,
});

describe('usedPaths', () => {
  it('keeps files that an item or a backup still uses', () => {
    const backup: Backup = {
      id: 'b',
      label: 'x',
      savedAt: 1,
      items: [item('gone', 'items/gone/photo.png', 'items/gone/receipt.pdf')],
      rooms: [],
      households: [],
    };
    const used = usedPaths([item('a', 'items/a/photo.png')], [backup]);
    expect(used.has('items/a/photo.png')).toBe(true);
    expect(used.has('items/gone/photo.png')).toBe(true);
    expect(used.has('items/gone/receipt.pdf')).toBe(true);
    expect(used.has('items/other/photo.png')).toBe(false);
  });
});
