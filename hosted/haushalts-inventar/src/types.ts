/** The built-in categories; the stored value is the id, the label comes from the language package. */
export const CATEGORIES = ['electronics', 'appliances', 'furniture', 'tools', 'others'] as const;
export type CategoryId = (typeof CATEGORIES)[number];

/**
 * Rooms are plain names. The four that every household starts with are stored as these tokens
 * and shown in the active language; a room a person adds is stored and shown as typed.
 */
export const DEFAULT_ROOMS = ['@kitchen', '@livingRoom', '@bedroom', '@garage'] as const;

export interface MaintenanceEntry {
  id: string;
  title: string;
  /** ISO date (YYYY-MM-DD) of the day it was done. */
  date: string;
}

export interface Item {
  id: string;
  name: string;
  category: CategoryId;
  /** A room name or one of the default tokens. */
  location: string;
  purchasePrice: number;
  /** ISO dates (YYYY-MM-DD) or ''. */
  purchaseDate: string;
  warrantyMonths?: number;
  warrantyExpiry: string;
  warrantyProvider?: string;
  warrantyWhereApplies?: string;
  policyNumber?: string;
  owner?: string;
  householdId?: string;
  notes?: string;
  /** Logical mn.files paths (the SDK adds the app and account folders). */
  photoPath?: string;
  /** A small copy of the photo for tiles and lists. */
  thumbPath?: string;
  receiptPath?: string;
  serialNumber?: string;
  color?: string;
  capacity?: string;
  store?: string;
  paymentMethod?: string;
  nextMaintenanceDate?: string;
  maintenanceLog?: MaintenanceEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface Member {
  id: string;
  name: string;
}

export interface Household {
  id: string;
  name: string;
  members: Member[];
  createdAt: number;
}

/** A named copy of the inventory that can be restored. */
export interface Backup {
  id: string;
  label: string;
  savedAt: number;
  items: Item[];
  rooms: string[];
  households: Household[];
}

export interface Settings {
  /** Insured sum in euros; null until the person sets it. */
  insuranceLimit: number | null;
}

/** Per person, per device group: what they last looked at. */
export interface Prefs {
  activeHouseholdId?: string;
  viewMode?: 'grid' | 'list';
}

export interface User {
  id: string;
  name: string;
}

export interface Filters {
  query: string;
  room: string;
  category: CategoryId | 'all';
  warranty: 'all' | 'active' | 'soon' | 'expired';
  owner: string;
  /** '' means all households. */
  householdId: string;
}
