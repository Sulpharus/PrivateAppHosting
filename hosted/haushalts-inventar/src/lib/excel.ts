import { language, t } from '../i18n';
import type { Item } from '../types';
import { categoryStats, daysUntil, warrantyState } from './domain';
import { categoryLabel, roomLabel } from './format';

const HEADER_FILL = 'FF1F2937';

/** Builds the workbook and downloads it. The library is loaded only when someone exports. */
export async function exportToExcel(
  items: Item[],
  insuranceLimit: number | null,
  householdNames: Map<string, string>,
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const today = new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = t('app.title');
  workbook.created = today;

  const euro = '#,##0.00 "€"';
  const header = (row: import('exceljs').Row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    row.alignment = { vertical: 'middle', wrapText: true };
    row.height = 22;
  };

  // Inventory sheet first, so the overview can add it up with formulas.
  const inventory = workbook.addWorksheet(t('excel.inventory'));
  inventory.columns = [
    { header: t('excel.name'), key: 'name', width: 30 },
    { header: t('excel.category'), key: 'category', width: 16 },
    { header: t('excel.room'), key: 'room', width: 16 },
    { header: t('excel.price'), key: 'price', width: 14, style: { numFmt: euro } },
    {
      header: t('excel.purchaseDate'),
      key: 'purchase',
      width: 14,
      style: { numFmt: 'yyyy-mm-dd' },
    },
    { header: t('excel.expiry'), key: 'expiry', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
    { header: t('excel.warranty'), key: 'warranty', width: 16 },
    { header: t('excel.daysLeft'), key: 'days', width: 12 },
    { header: t('excel.owner'), key: 'owner', width: 16 },
    { header: t('excel.household'), key: 'household', width: 18 },
    { header: t('excel.store'), key: 'store', width: 18 },
    { header: t('excel.serial'), key: 'serial', width: 18 },
    {
      header: t('excel.nextMaintenance'),
      key: 'maintenance',
      width: 16,
      style: { numFmt: 'yyyy-mm-dd' },
    },
    { header: t('excel.notes'), key: 'notes', width: 40 },
  ];
  header(inventory.getRow(1));
  inventory.views = [{ state: 'frozen', ySplit: 1 }];
  const asDate = (iso: string | undefined) => (iso ? new Date(`${iso}T00:00:00`) : undefined);
  for (const item of items) {
    inventory.addRow({
      name: item.name,
      category: categoryLabel(item.category),
      room: roomLabel(item.location),
      price: item.purchasePrice || undefined,
      purchase: asDate(item.purchaseDate),
      expiry: asDate(item.warrantyExpiry),
      warranty: t(`warranty.state.${warrantyState(item, today)}`),
      days: daysUntil(item.warrantyExpiry, today) ?? undefined,
      owner: item.owner,
      household: item.householdId ? householdNames.get(item.householdId) : undefined,
      store: item.store,
      serial: item.serialNumber,
      maintenance: asDate(item.nextMaintenanceDate),
      notes: item.notes,
    });
  }
  inventory.autoFilter = { from: 'A1', to: { row: 1, column: 14 } };

  const overview = workbook.addWorksheet(t('excel.overview'), {
    views: [{ showGridLines: false }],
  });
  overview.columns = [{ width: 34 }, { width: 22 }, { width: 14 }, { width: 14 }];
  overview.getCell('A1').value = t('excel.title');
  overview.getCell('A1').font = { size: 16, bold: true };
  overview.getCell('A2').value = t('excel.generated', {
    date: new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'de-DE', {
      dateStyle: 'long',
    }).format(today),
  });
  overview.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } };

  const stats = categoryStats(items);
  const rows: [string, number | { formula: string; result: number }, string?][] = [
    [
      t('excel.totalValue'),
      { formula: `SUM('${t('excel.inventory')}'!D2:D5000)`, result: stats.total },
      euro,
    ],
    [
      t('excel.totalItems'),
      { formula: `COUNTA('${t('excel.inventory')}'!A2:A5000)`, result: items.length },
    ],
  ];
  if (insuranceLimit !== null) rows.push([t('excel.insured'), insuranceLimit, euro]);
  rows.forEach(([label, value, format], index) => {
    const row = 4 + index;
    overview.getCell(`A${row}`).value = label;
    overview.getCell(`A${row}`).font = { bold: true };
    const cell = overview.getCell(`B${row}`);
    cell.value = value;
    if (format) cell.numFmt = format;
  });

  const start = 4 + rows.length + 1;
  overview.getRow(start).values = [
    t('excel.category'),
    t('excel.count'),
    t('excel.value'),
    t('excel.share'),
  ];
  header(overview.getRow(start));
  stats.list.forEach((entry, index) => {
    const row = overview.getRow(start + 1 + index);
    row.values = [categoryLabel(entry.category), entry.count, entry.value, entry.share / 100];
    row.getCell(3).numFmt = euro;
    row.getCell(4).numFmt = '0%';
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${t('excel.fileName')}-${today.toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
