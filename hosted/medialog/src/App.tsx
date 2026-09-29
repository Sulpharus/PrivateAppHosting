/**
 * Medialog - MiniNode App
 * Archiv und Sammlung für Bücher, Filme, Serien und Spiele mit Bewertung und Leselisten.
 */

import { useCallback, useEffect, useState } from 'react';
import { DetailSheet } from './components/DetailSheet';
import { EditorSheet } from './components/EditorSheet';
import { Header } from './components/Header';
import { type AppTab, Navigation } from './components/Navigation';
import { ShareModal } from './components/ShareModal';
import { showToast, ToastContainer } from './components/Toast';
import { pruneApiCache } from './services/mediaApis';
import { type MiniNodeSDK, mininode, signedInUser, toJson } from './services/mininode';
import {
  type AppSettings,
  applyAccent,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  setCurrentSettings,
} from './services/settings';
import {
  type Person,
  publishShare,
  type SharedEntry,
  sharedWithMe,
  unpublishShare,
} from './services/sharing';
import type { MediaItem, MediaList, MiniNodeUser } from './types';
import { EinstellungenView } from './views/EinstellungenView';
import { ListenView } from './views/ListenView';
import { SammlungView } from './views/SammlungView';
import { StartView } from './views/StartView';
import { StatistikView } from './views/StatistikView';

export default function App() {
  const [sdk, setSdk] = useState<MiniNodeSDK | null>(null);
  const [currentUser, setCurrentUser] = useState<MiniNodeUser>({
    id: '',
    name: '',
    email: '',
    avatarInitials: '',
  });
  const [people, setPeople] = useState<Person[]>([]);
  const [shared, setShared] = useState<SharedEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [lists, setLists] = useState<MediaList[]>([]);
  const [currentTab, setCurrentTab] = useState<AppTab>('start');
  const [sammlungFilter, setSammlungFilter] = useState<string>('all');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isLoading, setIsLoading] = useState(true);

  // Active sheets / modals
  const [selectedDetailItem, setSelectedDetailItem] = useState<MediaItem | null>(null);
  const [editorItem, setEditorItem] = useState<Partial<MediaItem> | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ item?: MediaItem; list?: MediaList } | null>(
    null,
  );

  // Load data from KV store
  const loadAllData = useCallback(async (mnInstance: MiniNodeSDK, me?: MiniNodeUser) => {
    try {
      const workEntries = await mnInstance.kv.list('work:');
      const loadedItems = workEntries.map((e) => e.value as unknown as MediaItem);

      const listEntries = await mnInstance.kv.list('list:');
      const loadedLists = listEntries.map((e) => e.value as unknown as MediaList);

      setItems(loadedItems);
      setLists(loadedLists);
      if (me?.id) {
        // Shared entries and people need the network; the own collection works offline.
        sharedWithMe(mnInstance).then(setShared, () => undefined);
      }
    } catch (err) {
      console.error('Error loading data from mn.kv:', err);
      showToast('Deine Sammlung konnte nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize SDK
  useEffect(() => {
    let unsubscribeOffline: (() => void) | undefined;
    let unsubscribeSynced: (() => void) | undefined;
    let onVisible: (() => void) | undefined;

    async function init() {
      try {
        const mn = await mininode();
        const user = await signedInUser(mn);
        setSdk(mn);
        setCurrentUser(user);
        const loaded = await loadSettings(mn);
        setSettings(loaded);
        setCurrentSettings(loaded);
        applyAccent(loaded.accent);

        await loadAllData(mn, user);
        mn.people().then(setPeople, () => setPeople([]));
        pruneApiCache().catch(() => undefined);

        // Offline tracking
        setIsOffline(!mn.offline.online());
        unsubscribeOffline = mn.offline.onChange((online) => {
          setIsOffline(!online);
          if (online) {
            showToast('Wieder online');
          } else {
            showToast('Offline: Änderungen werden später übertragen');
          }
        });
        // Changes made offline reached the server; other devices' changes show on return.
        unsubscribeSynced = mn.offline.onSynced(() => loadAllData(mn, user));
        onVisible = () => {
          if (document.visibilityState === 'visible') loadAllData(mn, user);
        };
        document.addEventListener('visibilitychange', onVisible);
      } catch (e) {
        console.error('Failed to init MiniNode SDK', e);
        setIsLoading(false);
      }
    }

    init();

    return () => {
      if (unsubscribeOffline) unsubscribeOffline();
      if (unsubscribeSynced) unsubscribeSynced();
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadAllData]);

  // Keeps the recipients' copy of a shared list current when its works change.
  // Awaited, so a quick share-then-unshare cannot land in the wrong order.
  const republishList = async (list: MediaList, allItems: MediaItem[]) => {
    if (!sdk || !list.sharedWith?.length) return;
    const listItems = allItems.filter((it) => list.itemIds.includes(it.id));
    await publishShare(sdk, currentUser, { list, items: listItems }).catch(() =>
      showToast('Die geteilte Fassung konnte nicht aktualisiert werden.'),
    );
  };

  // Save Media Item to KV
  const handleSaveItem = async (input: MediaItem) => {
    if (!sdk) return;
    const savedItem: MediaItem = { ...input, ownerId: currentUser.id, by: currentUser.name };
    await sdk.kv.set(`work:${savedItem.id}`, toJson(savedItem));
    if (savedItem.sharedWith?.length) {
      await publishShare(sdk, currentUser, { work: savedItem }).catch(() =>
        showToast('Die geteilte Fassung konnte nicht aktualisiert werden.'),
      );
    }

    // If item was updated and is currently open in detail sheet, update selectedDetailItem
    if (selectedDetailItem?.id === savedItem.id) {
      setSelectedDetailItem(savedItem);
    }

    // Also update any list associations
    const nextItems = [...items.filter((it) => it.id !== savedItem.id), savedItem];
    for (const l of lists) {
      const isInList = l.itemIds.includes(savedItem.id);
      const shouldBeInList = savedItem.listIds ? savedItem.listIds.includes(l.id) : isInList;
      let next = l;
      if (shouldBeInList && !isInList) next = { ...l, itemIds: [...l.itemIds, savedItem.id] };
      else if (!shouldBeInList && isInList)
        next = { ...l, itemIds: l.itemIds.filter((id) => id !== savedItem.id) };
      if (next !== l) await sdk.kv.set(`list:${l.id}`, toJson(next));
      if (isInList || shouldBeInList) await republishList(next, nextItems);
    }

    await loadAllData(sdk, currentUser);
  };

  // Delete Media Item from KV
  const handleDeleteItem = async (itemId: string) => {
    if (!sdk) return;
    await sdk.kv.delete(`work:${itemId}`);
    unpublishShare(sdk, currentUser, 'work', itemId).catch(() => undefined);

    // Remove from any lists
    const nextItems = items.filter((it) => it.id !== itemId);
    for (const l of lists) {
      if (l.itemIds.includes(itemId)) {
        const updatedList = { ...l, itemIds: l.itemIds.filter((id) => id !== itemId) };
        await sdk.kv.set(`list:${l.id}`, toJson(updatedList));
        await republishList(updatedList, nextItems);
      }
    }

    if (selectedDetailItem?.id === itemId) {
      setSelectedDetailItem(null);
    }

    await loadAllData(sdk, currentUser);
  };

  // Save List to KV
  const handleSaveList = async (input: MediaList) => {
    if (!sdk) return;
    const savedList: MediaList = { ...input, ownerId: currentUser.id, by: currentUser.name };
    await sdk.kv.set(`list:${savedList.id}`, toJson(savedList));
    await republishList(savedList, items);
    await loadAllData(sdk, currentUser);
  };

  // Delete List from KV
  const handleDeleteList = async (listId: string) => {
    if (!sdk) return;
    await sdk.kv.delete(`list:${listId}`);
    unpublishShare(sdk, currentUser, 'list', listId).catch(() => undefined);
    await loadAllData(sdk, currentUser);
    showToast('Liste gelöscht');
  };

  // Import items batch
  const handleImportItems = async (newItems: MediaItem[]) => {
    if (!sdk) return;
    for (const item of newItems) {
      await sdk.kv.set(`work:${item.id}`, toJson(item));
    }
    await loadAllData(sdk, currentUser);
  };

  // Import full backup
  const handleImportFullBackup = async (data: { items: MediaItem[]; lists: MediaList[] }) => {
    if (!sdk) return 0;
    // An entry that changed here after the backup was made is kept, not overwritten; one that is
    // overwritten keeps who it is shared with (the share itself lives in the database).
    let skipped = 0;
    for (const item of data.items) {
      const existing = items.find((it) => it.id === item.id);
      if (existing && existing.updatedAt >= item.updatedAt) skipped++;
      else {
        const { sharedWith, sharedWithNames } = existing ?? {};
        await sdk.kv.set(`work:${item.id}`, toJson({ ...item, sharedWith, sharedWithNames }));
      }
    }
    for (const l of data.lists) {
      const existing = lists.find((x) => x.id === l.id);
      if (existing && existing.updatedAt >= l.updatedAt) skipped++;
      else {
        const { sharedWith, sharedWithNames } = existing ?? {};
        await sdk.kv.set(`list:${l.id}`, toJson({ ...l, sharedWith, sharedWithNames }));
      }
    }
    await loadAllData(sdk, currentUser);
    return skipped;
  };

  // Share with other users of the app (ids; the names are kept for display)
  const handleUpdateSharedWith = async (ids: string[]) => {
    if (!sdk || !shareTarget) return;
    const sharedWithNames = ids.map((id) => people.find((p) => p.id === id)?.name ?? 'Unbekannt');
    const changes = { sharedWith: ids, sharedWithNames, updatedAt: new Date().toISOString() };
    if (shareTarget.item) {
      const item = { ...shareTarget.item, ...changes };
      await handleSaveItem(item);
      if (ids.length === 0) await unpublishShare(sdk, currentUser, 'work', item.id);
      setShareTarget({ item });
    } else if (shareTarget.list) {
      const list = { ...shareTarget.list, ...changes };
      await handleSaveList(list);
      if (ids.length === 0) await unpublishShare(sdk, currentUser, 'list', list.id);
      setShareTarget({ list });
    }
  };

  const handleChangeSettings = async (changes: Partial<AppSettings>) => {
    if (!sdk) return;
    const next = { ...settings, ...changes };
    await saveSettings(sdk, next);
    setSettings(next);
    setCurrentSettings(next);
    applyAccent(next.accent);
  };

  // Copy a work someone shared into the own collection
  const handleCopySharedWork = async (work: MediaItem) => {
    const copy: MediaItem = {
      ...work,
      id: `work_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId: currentUser.id,
      by: currentUser.name,
      sharedWith: [],
      sharedWithNames: [],
      listIds: [],
      consumptionLogs: [],
      history: [],
      updatedAt: new Date().toISOString(),
    };
    await handleSaveItem(copy);
    showToast(`„${work.title}“ in deine Sammlung übernommen`);
  };

  // Navigation helpers
  const handleNavigateToSammlung = (statusFilter?: string) => {
    if (statusFilter) {
      setSammlungFilter(statusFilter);
    }
    setCurrentTab('sammlung');
  };

  // View Subtitles
  const getSubtitle = () => {
    switch (currentTab) {
      case 'start':
        return `${items.filter((i) => i.status === 'active').length} aktiv im Gange · ${items.length} gesamt`;
      case 'sammlung':
        return `${items.length} Medien im Archiv verzeichnet`;
      case 'listen':
        return `${lists.length} ${lists.length === 1 ? 'Liste' : 'Listen'} angelegt`;
      case 'statistik':
        return 'Auswertung deiner Lese-, Seh- und Spielgewohnheiten';
      case 'einstellungen':
        return 'Sicherung, CSV-Import & Multi-User-Freigaben';
      default:
        return 'Medialog';
    }
  };

  const getViewTitle = () => {
    switch (currentTab) {
      case 'start':
        return 'Start';
      case 'sammlung':
        return 'Sammlung';
      case 'listen':
        return 'Listen';
      case 'statistik':
        return 'Statistik';
      case 'einstellungen':
        return 'Optionen';
      default:
        return 'Medialog';
    }
  };

  return (
    <div>
      {/* MiniNode Navigation: Bottom on mobile, Left sidebar on desktop */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenAddModal={() => {
          setEditorItem(null);
          setShowEditor(true);
        }}
        activeItemCount={items.length}
      />

      <div className="mn-page">
        {/* Header */}
        <Header
          title={getViewTitle()}
          subtitle={getSubtitle()}
          isOffline={isOffline}
          onOpenAddModal={() => {
            setEditorItem(null);
            setShowEditor(true);
          }}
          tools={
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="mn-btn mn-btn--ghost text-xs"
                onClick={() => window.print()}
                title="Drucken / Als PDF speichern"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span className="hidden sm:inline">Drucken</span>
              </button>

              <button
                type="button"
                className="mn-btn mn-btn--ghost text-xs"
                onClick={() => setCurrentTab('einstellungen')}
                title={`Angemeldet als ${currentUser.name}`}
              >
                <span className="w-6 h-6 rounded-full bg-[var(--mn-accent-soft)] text-[var(--mn-accent-text)] font-bold text-xs flex items-center justify-center">
                  {currentUser.avatarInitials}
                </span>
                <span className="hidden sm:inline">{currentUser.name}</span>
              </button>
            </div>
          }
        />

        {/* Main Content Area */}
        <main className="mn-main">
          {isLoading ? (
            <div className="grid gap-4">
              <span className="mn-sk" style={{ height: '140px' }} />
              <span className="mn-sk" style={{ height: '240px' }} />
              <span className="mn-sk" style={{ height: '180px' }} />
            </div>
          ) : (
            <>
              {currentTab === 'start' && (
                <StartView
                  items={items}
                  onSelectItem={(item) => setSelectedDetailItem(item)}
                  onOpenAddModal={() => {
                    setEditorItem(null);
                    setShowEditor(true);
                  }}
                  onNavigateToSammlung={handleNavigateToSammlung}
                />
              )}

              {currentTab === 'sammlung' && (
                <SammlungView
                  items={items}
                  initialStatusFilter={sammlungFilter}
                  onSelectItem={(item) => setSelectedDetailItem(item)}
                  onOpenAddModal={(prefill) => {
                    setEditorItem(prefill || null);
                    setShowEditor(true);
                  }}
                />
              )}

              {currentTab === 'listen' && (
                <ListenView
                  lists={lists}
                  items={items}
                  onSelectItem={(item) => setSelectedDetailItem(item)}
                  onSaveList={handleSaveList}
                  onDeleteList={handleDeleteList}
                  onOpenShareModalForList={(l) => setShareTarget({ list: l })}
                  shared={shared}
                  onCopySharedWork={handleCopySharedWork}
                />
              )}

              {currentTab === 'statistik' && <StatistikView items={items} />}

              {currentTab === 'einstellungen' && (
                <EinstellungenView
                  items={items}
                  lists={lists}
                  currentUser={currentUser}
                  people={people}
                  settings={settings}
                  onChangeSettings={handleChangeSettings}
                  accountUrl={sdk?.auth.accountUrl() ?? 'https://mininode.app/account'}
                  onImportItems={handleImportItems}
                  onImportFullBackup={handleImportFullBackup}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Detail Sheet */}
      {selectedDetailItem && (
        <DetailSheet
          item={selectedDetailItem}
          lists={lists}
          onClose={() => setSelectedDetailItem(null)}
          onEdit={(itemToEdit) => {
            setSelectedDetailItem(null);
            setEditorItem(itemToEdit);
            setShowEditor(true);
          }}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
          onOpenShareModal={(it) => setShareTarget({ item: it })}
        />
      )}

      {/* Editor Sheet */}
      {showEditor && (
        <EditorSheet
          initialItem={editorItem}
          lists={lists}
          onClose={() => setShowEditor(false)}
          onSave={handleSaveItem}
        />
      )}

      {/* Share Modal */}
      {shareTarget && (
        <ShareModal
          item={shareTarget.item}
          list={shareTarget.list}
          linkedItems={
            shareTarget.list ? items.filter((it) => shareTarget.list?.itemIds.includes(it.id)) : []
          }
          people={people}
          onClose={() => setShareTarget(null)}
          onUpdateSharedWith={handleUpdateSharedWith}
        />
      )}

      {/* Toast Notification Container */}
      <ToastContainer />
    </div>
  );
}
