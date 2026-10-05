/**
 * Haushaltsinventar: household items with warranties, receipts, service dates and owners.
 * Data is shared-account (mn.kv), files go to mn.files, reminders through mn.push.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Header, Navigation, type Tab } from './components/Shell';
import { showToast, ToastContainer } from './components/Toast';
import { ItemSheet } from './dialogs/ItemSheet';
import { MaintenanceSheet } from './dialogs/MaintenanceSheet';
import { t } from './i18n';
import { InventoryContext, SdkContext } from './lib/context';
import { categoryStats, EMPTY_FILTERS, maintenanceRule } from './lib/domain';
import { exportToExcel } from './lib/excel';
import { formatMoney } from './lib/format';
import { useInventory } from './lib/useInventory';
import type { Filters, Item } from './types';
import { DashboardView } from './views/DashboardView';
import { InventoryView } from './views/InventoryView';

// The editor and the household page are only needed on demand: they load when first opened.
const EditorSheet = lazy(() =>
  import('./dialogs/EditorSheet').then((module) => ({ default: module.EditorSheet })),
);
const HouseholdView = lazy(() =>
  import('./views/HouseholdView').then((module) => ({ default: module.HouseholdView })),
);

interface EditorState {
  item: Item | null;
  focusReceipt?: boolean;
}

function dropItemParam() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('item')) {
    url.searchParams.delete('item');
    window.history.replaceState(null, '', url);
  }
}

export default function App() {
  const api = useInventory();
  const { data, user, loading, offline } = api;
  const [tab, setTab] = useState<Tab>('start');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('item'),
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [maintenance, setMaintenance] = useState<{ item: Item; suggestion: string } | null>(null);

  // A household another person deleted falls back to "all".
  const preferred = data.prefs.activeHouseholdId ?? '';
  const activeHouseholdId = data.households.some((household) => household.id === preferred)
    ? preferred
    : '';
  const viewMode = data.prefs.viewMode ?? 'grid';
  const scopeFilters: Filters = { ...filters, householdId: activeHouseholdId };

  const scopeItems = useMemo(
    () =>
      data.items.filter(
        (item) => !activeHouseholdId || !item.householdId || item.householdId === activeHouseholdId,
      ),
    [data.items, activeHouseholdId],
  );

  const owners = useMemo(() => {
    const names = new Set<string>();
    for (const household of data.households) {
      if (!activeHouseholdId || household.id === activeHouseholdId) {
        for (const member of household.members) names.add(member.name);
      }
    }
    for (const item of scopeItems) if (item.owner) names.add(item.owner);
    if (user.name) names.add(user.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [data.households, scopeItems, activeHouseholdId, user.name]);

  const detail = detailId ? (data.items.find((item) => item.id === detailId) ?? null) : null;

  // A link from a reminder (?item=…) for an item that no longer exists just opens the app.
  useEffect(() => {
    if (!loading && detailId && !detail) {
      setDetailId(null);
      dropItemParam();
    }
  }, [loading, detailId, detail]);

  const openDetail = useCallback((item: Item) => setDetailId(item.id), []);
  const closeDetail = () => {
    setDetailId(null);
    dropItemParam();
  };
  const addItem = useCallback(() => setEditor({ item: null }), []);

  async function exportExcel() {
    try {
      await exportToExcel(
        scopeItems,
        data.settings.insuranceLimit,
        new Map(data.households.map((household) => [household.id, household.name])),
      );
      showToast(t('export.done'));
    } catch {
      showToast(t('export.failed'));
    }
  }

  function logMaintenance(item: Item, suggestion?: string) {
    setMaintenance({
      item,
      suggestion: suggestion ?? t(`maintenance.${maintenanceRule(item.name, item.category).id}`),
    });
  }

  const total = categoryStats(scopeItems).total;
  const titles: Record<Tab, [string, string]> = {
    start: [t('nav.start'), t('start.subtitle', { n: scopeItems.length })],
    inventory: [
      t('nav.inventory'),
      t('inventory.subtitle', { n: scopeItems.length, value: formatMoney(total, 0) }),
    ],
    household: [
      t('nav.household'),
      data.households.length === 1
        ? (data.households[0]?.name ?? '')
        : (data.households.find((household) => household.id === activeHouseholdId)?.name ??
          t('household.all')),
    ],
  };

  const tools =
    data.households.length > 1 ? (
      <label className="mn-field">
        <span className="mn-sr-only">{t('household.switch')}</span>
        <select
          value={activeHouseholdId}
          onChange={(event) => api.setPrefs({ activeHouseholdId: event.target.value })}
        >
          <option value="">{t('household.all')}</option>
          {data.households.map((household) => (
            <option key={household.id} value={household.id}>
              {household.name}
            </option>
          ))}
        </select>
      </label>
    ) : undefined;

  return (
    <SdkContext.Provider value={api.mn}>
      <InventoryContext.Provider value={api}>
        <Navigation tab={tab} onSelect={setTab} onAdd={addItem} />
        <div className="mn-page">
          <Header
            title={titles[tab][0]}
            subtitle={loading ? t('app.loading') : titles[tab][1]}
            tools={tools}
            offline={offline}
            onAdd={addItem}
          />
          {loading ? (
            <main className="mn-main" aria-busy="true">
              <span className="mn-sk" style={{ height: '88px', display: 'block' }} />
              <span className="mn-sk" style={{ height: '220px', display: 'block' }} />
            </main>
          ) : tab === 'start' ? (
            <DashboardView
              items={scopeItems}
              settings={data.settings}
              onOpen={openDetail}
              onAdd={addItem}
              onAddReceipt={() => setEditor({ item: null, focusReceipt: true })}
              onExport={exportExcel}
              onShowWarranties={() => {
                setFilters({ ...EMPTY_FILTERS, warranty: 'soon' });
                setTab('inventory');
              }}
              onShowInventory={() => setTab('inventory')}
              onLogMaintenance={logMaintenance}
            />
          ) : tab === 'inventory' ? (
            <InventoryView
              items={scopeItems}
              rooms={data.rooms}
              owners={owners}
              filters={scopeFilters}
              viewMode={viewMode}
              onFilters={setFilters}
              onViewMode={(mode) => api.setPrefs({ viewMode: mode })}
              onOpen={openDetail}
              onAdd={addItem}
              onExport={exportExcel}
            />
          ) : (
            <Suspense fallback={<main className="mn-main" aria-busy="true" />}>
              <HouseholdView
                items={scopeItems}
                allItems={data.items}
                activeHouseholdId={activeHouseholdId}
                onExport={exportExcel}
              />
            </Suspense>
          )}
        </div>

        {detail && !editor && !maintenance && (
          <ItemSheet
            item={detail}
            households={data.households}
            onClose={closeDetail}
            onEdit={(item) => setEditor({ item })}
            onLogMaintenance={logMaintenance}
            onDelete={async (item) => {
              if (await api.removeItem(item)) {
                closeDetail();
                showToast(t('item.deleted'));
              }
            }}
          />
        )}
        <Suspense fallback={null}>
          {editor && (
            <EditorSheet
              mn={api.mn}
              item={editor.item}
              rooms={data.rooms}
              households={data.households}
              activeHouseholdId={activeHouseholdId}
              owners={owners}
              defaultOwner={user.name}
              focusReceipt={editor.focusReceipt}
              onClose={() => setEditor(null)}
              onSave={api.saveItem}
              onDiscard={api.dropFiles}
            />
          )}
        </Suspense>
        {maintenance && (
          <MaintenanceSheet
            item={maintenance.item}
            suggestion={maintenance.suggestion}
            onClose={() => setMaintenance(null)}
            onSave={async (item, title) => {
              const ok = await api.logMaintenance(item, title);
              if (ok) showToast(t('maintenance.saved'));
              return ok;
            }}
          />
        )}
        <ToastContainer />
      </InventoryContext.Provider>
    </SdkContext.Provider>
  );
}
