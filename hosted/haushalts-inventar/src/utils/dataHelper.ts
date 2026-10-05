/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InventoryItem } from '../types';

/**
 * Format cents to German currency (e.g. 129999 -> "1.299,99 €")
 */
export function formatCurrency(cents: number): string {
  const eur = (cents || 0) / 100;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(eur);
}

/**
 * Parse German currency input (e.g. "1.299,99", "1299.99", "50") to cents (integer)
 */
export function parseToCents(val: string | number): number {
  if (typeof val === 'number') return Math.round(val * 100);
  if (!val) return 0;
  // Clean string
  let cleaned = val.replace(/[€\s]/g, '').trim();
  // Handle German 1.234,56
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

/**
 * Format date to German string (e.g. "2026-10-01" -> "01. Okt. 2026")
 */
export function formatDate(isoDate: string): string {
  if (!isoDate) return '–';
  try {
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(d);
    }
    return isoDate;
  } catch (e) {
    return isoDate;
  }
}

/**
 * Calculate warranty status and days left
 */
export function getWarrantyInfo(expiryIso: string): {
  status: 'active' | 'expiring' | 'expired';
  daysLeft: number;
  label: string;
} {
  if (!expiryIso) {
    return { status: 'expired', daysLeft: 0, label: 'Keine Garantie' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parts = expiryIso.split('-');
  const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  expiry.setHours(0, 0, 0, 0);

  const diffTime = expiry.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return { status: 'expired', daysLeft, label: 'Garantie abgelaufen' };
  }
  if (daysLeft <= 30) {
    return { status: 'expiring', daysLeft, label: `Läuft in ${daysLeft} Tagen ab` };
  }
  return { status: 'active', daysLeft, label: `Garantie aktiv (${daysLeft} Tage)` };
}

/**
 * Export items to German CSV (; separated, UTF-8 BOM)
 */
export function exportToCsv(items: InventoryItem[]): void {
  const headers = [
    'ID',
    'Gegenstand',
    'Kategorie',
    'Raum',
    'Kaufpreis (EUR)',
    'Kaufdatum',
    'Garantie bis',
    'Geltungsbereich',
    'Besitzer',
    'Seriennummer',
    'Notizen',
  ];

  const rows = items.map((item) => [
    item.id,
    `"${(item.name || '').replace(/"/g, '""')}"`,
    `"${(item.category || '').replace(/"/g, '""')}"`,
    `"${(item.room || '').replace(/"/g, '""')}"`,
    ((item.purchasePriceCents || 0) / 100).toFixed(2).replace('.', ','),
    item.purchaseDate || '',
    item.warrantyExpiry || '',
    `"${(item.whereApplies || '').replace(/"/g, '""')}"`,
    `"${(item.ownerName || '').replace(/"/g, '""')}"`,
    `"${(item.serialNumber || '').replace(/"/g, '""')}"`,
    `"${(item.notes || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventar_export_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export full JSON backup
 */
export function exportToJson(data: any): void {
  const payload = {
    app: 'neue-app',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `neue_app_sicherung_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
