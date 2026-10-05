/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  room: string;
  purchasePriceCents: number; // Stored in cents (integer) as per MiniNode spec
  purchaseDate: string; // YYYY-MM-DD
  warrantyMonths: number;
  warrantyExpiry: string; // YYYY-MM-DD
  whereApplies: string; // e.g. "Herstellergarantie DE", "AppleCare+ weltweit", "MediaMarkt Schutz"
  householdId: string;
  ownerName: string; // Member name or arbitrary person
  photoPath?: string; // Path in mn.files
  photoUrl?: string; // Display URL
  receiptPath?: string; // Bill/receipt path in mn.files
  receiptUrl?: string; // Bill preview URL
  receiptName?: string;
  serialNumber?: string;
  notes?: string;
  deletedAt?: number | null; // Soft delete timestamp for Papierkorb
  createdAt: number;
  updatedAt: number;
}

export interface HouseholdMember {
  id: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  isMiniNodeUser: boolean;
}

export interface Household {
  id: string;
  name: string;
  members: HouseholdMember[];
  createdAt: number;
}

export interface AppSettings {
  activeHouseholdId: string;
  insuranceLimitEur: number;
  rooms: string[];
  categories: string[];
}
