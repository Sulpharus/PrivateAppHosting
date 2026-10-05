import { describe, expect, it } from 'vitest';
import type { Filters, Item } from '../types';
import {
  addMonths,
  categoryStats,
  daysUntil,
  EMPTY_FILTERS,
  filterItems,
  maintenanceDue,
  maintenanceReminderAt,
  maintenanceRule,
  parseAmount,
  suggestMaintenance,
  warrantiesEnding,
  warrantyExpiryFor,
  warrantyRemaining,
  warrantyReminderAt,
  warrantyState,
} from './domain';

const today = new Date(2026, 9, 4); // 4 October 2026

function item(changes: Partial<Item>): Item {
  return {
    id: 'a',
    name: 'Kühlschrank',
    category: 'appliances',
    location: '@kitchen',
    purchasePrice: 500,
    purchaseDate: '',
    warrantyExpiry: '',
    createdAt: 1,
    updatedAt: 1,
    ...changes,
  };
}

describe('dates', () => {
  it('counts whole days from today', () => {
    expect(daysUntil('2026-10-04', today)).toBe(0);
    expect(daysUntil('2026-10-05', today)).toBe(1);
    expect(daysUntil('2026-10-03', today)).toBe(-1);
    expect(daysUntil('', today)).toBeNull();
    expect(daysUntil('2026-02-30', today)).toBeNull();
  });

  it('keeps the day inside the month when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(warrantyExpiryFor('2024-10-04', 24)).toBe('2026-10-04');
    expect(warrantyExpiryFor('', 24)).toBe('');
    expect(warrantyExpiryFor('2024-10-04', 0)).toBe('');
  });
});

describe('warranty', () => {
  it('names the state by days left', () => {
    expect(warrantyState({ warrantyExpiry: '' }, today)).toBe('none');
    expect(warrantyState({ warrantyExpiry: '2026-10-04' }, today)).toBe('expired');
    expect(warrantyState({ warrantyExpiry: '2026-10-20' }, today)).toBe('critical');
    expect(warrantyState({ warrantyExpiry: '2026-12-01' }, today)).toBe('soon');
    expect(warrantyState({ warrantyExpiry: '2027-06-01' }, today)).toBe('active');
  });

  it('computes what is left of the period', () => {
    const half = { purchaseDate: '2026-04-04', warrantyExpiry: '2027-04-04' };
    expect(warrantyRemaining(half, today)).toBe(50);
    expect(warrantyRemaining({ purchaseDate: '', warrantyExpiry: '2027-04-04' }, today)).toBe(0);
    expect(
      warrantyRemaining({ purchaseDate: '2020-01-01', warrantyExpiry: '2021-01-01' }, today),
    ).toBe(0);
  });

  it('plans reminders only for the future', () => {
    const now = new Date(2026, 9, 4, 12, 0);
    expect(warrantyReminderAt('2026-12-04', now)?.toISOString()).toBe(
      new Date(2026, 10, 4, 9, 0).toISOString(),
    );
    expect(warrantyReminderAt('2026-10-20', now)).toBeNull();
    expect(maintenanceReminderAt('2026-10-20', now)?.getDate()).toBe(13);
    expect(maintenanceReminderAt('2026-10-06', now)).toBeNull();
  });

  it('lists the warranties ending soonest first', () => {
    const list = warrantiesEnding(
      [
        item({ id: 'far', warrantyExpiry: '2027-12-01' }),
        item({ id: 'near', warrantyExpiry: '2026-10-20' }),
        item({ id: 'gone', warrantyExpiry: '2026-09-01' }),
        item({ id: 'mid', warrantyExpiry: '2026-12-01' }),
      ],
      today,
      90,
    );
    expect(list.map((entry) => entry.item.id)).toEqual(['near', 'mid']);
  });
});

describe('maintenance', () => {
  it('matches rules by name, and short keywords only as whole words', () => {
    expect(maintenanceRule('Samsung Kühlschrank', 'appliances').id).toBe('fridge');
    expect(maintenanceRule('Breville Espresso Pro', 'appliances').id).toBe('coffee');
    expect(maintenanceRule('Mac mini', 'electronics').id).toBe('general.electronics');
    expect(maintenanceRule('Backofen', 'appliances').id).toBe('oven');
    expect(maintenanceRule('Gaming PC', 'electronics').id).toBe('computer');
    expect(maintenanceRule('Sessel', 'furniture').id).toBe('general.other');
  });

  it('moves the next service date forward by whole intervals', () => {
    const suggestion = suggestMaintenance('Waschmaschine', 'appliances', '2025-01-10', today);
    expect(suggestion.intervalMonths).toBe(3);
    expect(suggestion.nextDate).toBe('2026-10-10');
    expect(suggestMaintenance('Sessel', 'furniture', '', today).nextDate).toBe('2027-10-04');
  });

  it('sorts due services, nearest first', () => {
    const due = maintenanceDue(
      [
        item({ id: 'late', nextMaintenanceDate: '2026-10-01' }),
        item({ id: 'soon', nextMaintenanceDate: '2026-10-20' }),
        item({ id: 'none' }),
        item({ id: 'later', nextMaintenanceDate: '2027-06-01' }),
      ],
      today,
    );
    expect(due.map((entry) => entry.item.id)).toEqual(['late', 'soon', 'later']);
    expect(due[0]?.overdue).toBe(true);
    expect(due[1]?.soon).toBe(true);
    expect(due[2]?.soon).toBe(false);
  });
});

describe('statistics and filters', () => {
  const items = [
    item({
      id: '1',
      name: 'Fernseher',
      category: 'electronics',
      purchasePrice: 900,
      owner: 'Lena',
    }),
    item({
      id: '2',
      name: 'Sofa',
      category: 'furniture',
      purchasePrice: 600,
      location: '@livingRoom',
    }),
    item({
      id: '3',
      name: 'Laptop',
      category: 'electronics',
      purchasePrice: 1500,
      householdId: 'h2',
    }),
  ];

  it('adds up the value by category', () => {
    const stats = categoryStats(items);
    expect(stats.total).toBe(3000);
    expect(stats.list[0]?.category).toBe('electronics');
    expect(stats.list[0]?.share).toBe(80);
  });

  it('filters by text without caring for case or accents', () => {
    const find = (query: string) =>
      filterItems(items, { ...EMPTY_FILTERS, query }, today).map((entry) => entry.id);
    expect(find('FERNSEH')).toEqual(['1']);
    expect(find('lena')).toEqual(['1']);
    expect(find('')).toEqual(['1', '2', '3']);
  });

  it('filters by room, category, owner and household', () => {
    const run = (changes: Partial<Filters>) =>
      filterItems(items, { ...EMPTY_FILTERS, ...changes }, today).map((entry) => entry.id);
    expect(run({ room: '@livingRoom' })).toEqual(['2']);
    expect(run({ category: 'electronics' })).toEqual(['1', '3']);
    expect(run({ owner: 'Lena' })).toEqual(['1']);
    // Items of no household show everywhere; others only in their own.
    expect(run({ householdId: 'h1' })).toEqual(['1', '2']);
    expect(run({ householdId: 'h2' })).toEqual(['1', '2', '3']);
  });

  it('filters by warranty state', () => {
    const list = [
      item({ id: 'a', warrantyExpiry: '2027-12-01' }),
      item({ id: 'b', warrantyExpiry: '2026-12-01' }),
      item({ id: 'c', warrantyExpiry: '2026-01-01' }),
      item({ id: 'd' }),
    ];
    const run = (warranty: Filters['warranty']) =>
      filterItems(list, { ...EMPTY_FILTERS, warranty }, today).map((entry) => entry.id);
    expect(run('active')).toEqual(['a', 'b']);
    expect(run('soon')).toEqual(['b']);
    expect(run('expired')).toEqual(['c']);
  });
});

describe('parseAmount', () => {
  it('reads German and English amounts', () => {
    expect(parseAmount('1.299,99')).toBe(1299.99);
    expect(parseAmount('1299,99')).toBe(1299.99);
    expect(parseAmount('1,299.99')).toBe(1299.99);
    expect(parseAmount('249.00')).toBe(249);
    expect(parseAmount('249')).toBe(249);
    expect(parseAmount('1.200')).toBe(1200);
    expect(parseAmount('12 €')).toBe(12);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});
