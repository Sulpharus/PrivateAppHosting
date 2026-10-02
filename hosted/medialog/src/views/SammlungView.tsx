import type React from 'react';
import { useMemo, useState } from 'react';
import { MediaRow } from '../components/MediaRow';
import { MediaTile } from '../components/MediaTile';
import { locale, t } from '../i18n';
import { executeSemanticSearch } from '../services/semanticSearch';
import type { MediaItem } from '../types';

interface SammlungViewProps {
  items: MediaItem[];
  onSelectItem: (item: MediaItem) => void;
  onOpenAddModal: (prefill?: Partial<MediaItem>) => void;
  initialStatusFilter?: string;
}

export type LibraryCategory = 'buchmedien' | 'visuell' | 'audiobooks' | 'spiele' | 'alle';

export const SammlungView: React.FC<SammlungViewProps> = ({
  items,
  onSelectItem,
  onOpenAddModal,
  initialStatusFilter = 'all',
}) => {
  // Top-level Library Category (Buchmedien, Visuell, Audiobooks, Spiele, Alle)
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory>('buchmedien');
  const [search, setSearch] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState<string>('all');
  const [consoleFilter, setConsoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [viewMode, setViewMode] = useState<'tiles' | 'list'>('tiles');

  const isFiltered =
    search.trim() !== '' ||
    subtypeFilter !== 'all' ||
    consoleFilter !== 'all' ||
    statusFilter !== 'all' ||
    ratingFilter !== 'all';

  const handleResetFilters = () => {
    setSearch('');
    setSubtypeFilter('all');
    setConsoleFilter('all');
    setStatusFilter('all');
    setRatingFilter('all');
  };

  // Group book series items into a single entry under that series title
  const consolidatedItems = useMemo(() => {
    const seriesMap = new Map<string, MediaItem>();
    const result: MediaItem[] = [];

    for (const item of items) {
      if (item.kind === 'book' && (item.isBookSeries || item.seriesTitle?.trim())) {
        const seriesKey = (item.seriesTitle || item.title).trim().toLowerCase();
        if (!seriesMap.has(seriesKey)) {
          const seriesEntry: MediaItem = {
            ...item,
            isBookSeries: true,
            seriesTitle: item.seriesTitle || item.title,
            volumes:
              item.volumes && item.volumes.length > 0
                ? [...item.volumes].sort((a, b) => a.volumeNumber - b.volumeNumber)
                : [
                    {
                      id: 'vol_1',
                      volumeNumber: item.currentVolume || 1,
                      title: item.title,
                      cover: item.cover,
                      totalPages: item.totalPages,
                      currentPage: item.currentPage,
                      status: item.status,
                      rating: item.rating,
                    },
                  ],
          };
          seriesMap.set(seriesKey, seriesEntry);
          result.push(seriesEntry);
        } else {
          // Merge this item into the existing series entry
          const existingSeries = seriesMap.get(seriesKey);
          if (!existingSeries) continue;
          const currentVolumes = existingSeries.volumes || [];
          const volNumber = item.currentVolume || currentVolumes.length + 1;

          if (!currentVolumes.some((v) => v.volumeNumber === volNumber)) {
            currentVolumes.push({
              id: item.id,
              volumeNumber: volNumber,
              title: item.title,
              cover: item.cover,
              totalPages: item.totalPages,
              currentPage: item.currentPage,
              status: item.status,
              rating: item.rating,
            });
            currentVolumes.sort((a, b) => a.volumeNumber - b.volumeNumber);
            existingSeries.volumes = currentVolumes;
            existingSeries.totalVolumes = Math.max(
              existingSeries.totalVolumes || 0,
              currentVolumes.length,
            );
          }
        }
      } else {
        result.push(item);
      }
    }

    return result;
  }, [items]);

  // Extract available game consoles
  const availableConsoles = useMemo(() => {
    const consoles = new Set<string>();
    items
      .filter((i) => i.kind === 'game')
      .forEach((i) => {
        if (i.console) consoles.add(i.console);
        else if (i.platform) consoles.add(i.platform);
      });
    return Array.from(consoles);
  }, [items]);

  // Perform semantic search + library category filtering + secondary filter chips
  const filteredAndSortedItems = useMemo(() => {
    // 1. Semantic search if search text is provided
    let candidateItems: { item: MediaItem; semanticReason?: string }[] = [];

    if (search.trim()) {
      const semanticResults = executeSemanticSearch(consolidatedItems, search);
      candidateItems = semanticResults.map((r) => ({
        item: r.item,
        semanticReason: r.semanticReason,
      }));
    } else {
      candidateItems = consolidatedItems.map((item) => ({ item }));
    }

    // 2. Filter by Library Category
    return candidateItems
      .filter(({ item }) => {
        // Library Category routing
        if (libraryCategory === 'buchmedien') {
          // Buchmedien: includes 'book' (Manga, Manhwa, Romane...) AND 'audiobook'!
          if (item.kind !== 'book' && item.kind !== 'audiobook') {
            return false;
          }
        } else if (libraryCategory === 'visuell') {
          // Visuelle Medien: Filme & Serien
          if (item.kind !== 'film' && item.kind !== 'series') {
            return false;
          }
        } else if (libraryCategory === 'audiobooks') {
          // Eigene dedizierte Audio-Library
          if (item.kind !== 'audiobook') {
            return false;
          }
        } else if (libraryCategory === 'spiele') {
          if (item.kind !== 'game') {
            return false;
          }
        }

        // Subtype filter
        if (subtypeFilter !== 'all') {
          if (subtypeFilter === 'Audiobook') {
            if (item.kind !== 'audiobook') return false;
          } else {
            if (item.kind !== 'book' || item.bookSubtype !== subtypeFilter) {
              return false;
            }
          }
        }

        // Console filter for games
        if (libraryCategory === 'spiele' && consoleFilter !== 'all') {
          const itemConsole = item.console || item.platform;
          if (itemConsole !== consoleFilter) {
            return false;
          }
        }

        // Status filter
        if (statusFilter !== 'all' && item.status !== statusFilter) {
          return false;
        }

        // Rating filter
        if (ratingFilter === '8plus' && (!item.rating || item.rating < 8)) {
          return false;
        }
        if (ratingFilter === '10only' && item.rating !== 10) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime();
        }
        if (sortBy === 'title') {
          return a.item.title.localeCompare(b.item.title, locale());
        }
        if (sortBy === 'console') {
          const conA = a.item.console || a.item.platform || 'ZZZ';
          const conB = b.item.console || b.item.platform || 'ZZZ';
          return conA.localeCompare(conB, locale());
        }
        if (sortBy === 'rating') {
          return (b.item.rating || 0) - (a.item.rating || 0);
        }
        if (sortBy === 'year') {
          return (b.item.year || 0) - (a.item.year || 0);
        }
        if (sortBy === 'progress') {
          const pctA =
            a.item.currentPage && a.item.totalPages ? a.item.currentPage / a.item.totalPages : 0;
          const pctB =
            b.item.currentPage && b.item.totalPages ? b.item.currentPage / b.item.totalPages : 0;
          return pctB - pctA;
        }
        return 0;
      });
  }, [
    consolidatedItems,
    search,
    libraryCategory,
    subtypeFilter,
    consoleFilter,
    statusFilter,
    ratingFilter,
    sortBy,
  ]);

  // Counts for Category Badges
  const countBooksAndAudio = items.filter(
    (i) => i.kind === 'book' || i.kind === 'audiobook',
  ).length;
  const countVisual = items.filter((i) => i.kind === 'film' || i.kind === 'series').length;
  const countAudioOnly = items.filter((i) => i.kind === 'audiobook').length;
  const countGames = items.filter((i) => i.kind === 'game').length;

  // Check if an exact title exists for search query
  const exactTitleMatchExists = useMemo(() => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return items.some(
      (i) => i.title.toLowerCase() === q || (i.seriesTitle && i.seriesTitle.toLowerCase() === q),
    );
  }, [items, search]);

  return (
    <div className="grid gap-6">
      {/* TOP-LEVEL LIBRARY CATEGORIES (Clear Separation: Visuell vs Buch vs Audiobooks vs Spiele) */}
      <div className="mn-card p-2 bg-[var(--mn-surface)]">
        <fieldset className="mn-seg grid-cols-2 sm:grid-cols-5" aria-label={t('lib.mainLibrary')}>
          <button
            type="button"
            aria-pressed={libraryCategory === 'buchmedien'}
            onClick={() => {
              setLibraryCategory('buchmedien');
              setSubtypeFilter('all');
            }}
          >
            {t('lib.catBooks', { n: countBooksAndAudio })}
          </button>
          <button
            type="button"
            aria-pressed={libraryCategory === 'visuell'}
            onClick={() => {
              setLibraryCategory('visuell');
              setSubtypeFilter('all');
            }}
          >
            {t('lib.catVisual', { n: countVisual })}
          </button>
          <button
            type="button"
            aria-pressed={libraryCategory === 'audiobooks'}
            onClick={() => {
              setLibraryCategory('audiobooks');
              setSubtypeFilter('all');
            }}
          >
            {t('lib.catAudio', { n: countAudioOnly })}
          </button>
          <button
            type="button"
            aria-pressed={libraryCategory === 'spiele'}
            onClick={() => {
              setLibraryCategory('spiele');
              setSubtypeFilter('all');
              setConsoleFilter('all');
            }}
          >
            {t('lib.catGames', { n: countGames })}
          </button>
          <button
            type="button"
            aria-pressed={libraryCategory === 'alle'}
            onClick={() => {
              setLibraryCategory('alle');
              setSubtypeFilter('all');
            }}
          >
            {t('lib.catAll', { n: items.length })}
          </button>
        </fieldset>
      </div>

      {/* Search Input with Semantic Search */}
      <div>
        <div className="mn-search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder={
              libraryCategory === 'buchmedien'
                ? t('lib.phBooks')
                : libraryCategory === 'visuell'
                  ? t('lib.phVisual')
                  : libraryCategory === 'audiobooks'
                    ? t('lib.phAudio')
                    : libraryCategory === 'spiele'
                      ? t('lib.phGames')
                      : t('lib.phAll')
            }
            aria-label={t('lib.searchLabel')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="text-xs text-[var(--mn-muted)] hover:text-[var(--mn-ink)] px-2"
              onClick={() => setSearch('')}
              title={t('lib.clearSearch')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Not Found Suggestion Banner right below search bar when query is typed */}
        {search.trim().length > 1 && !exactTitleMatchExists && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[var(--mn-surface-2)] border border-[var(--mn-line)] rounded-xl mt-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-base">💡</span>
              <span className="text-[var(--mn-muted)]">
                {t('lib.notInCollection', { query: search.trim() })}
              </span>
            </div>
            <button
              type="button"
              className="mn-btn mn-btn--primary text-xs shrink-0"
              onClick={() =>
                onOpenAddModal({
                  title: search.trim(),
                  kind:
                    libraryCategory === 'spiele'
                      ? 'game'
                      : libraryCategory === 'audiobooks'
                        ? 'audiobook'
                        : libraryCategory === 'visuell'
                          ? 'film'
                          : 'book',
                })
              }
            >
              {t('lib.addAndSearch', { query: search.trim() })}
            </button>
          </div>
        )}
      </div>

      {/* Filter Chips by Category */}
      <div className="grid gap-3">
        {/* Buchmedien Sub-Filters (Including Audiobooks!) */}
        {libraryCategory === 'buchmedien' && (
          <fieldset className="mn-chips" aria-label={t('lib.filterBooks')}>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'all'}
              onClick={() => setSubtypeFilter('all')}
            >
              {t('lib.allBooks', { n: countBooksAndAudio })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'Manga'}
              onClick={() => setSubtypeFilter(subtypeFilter === 'Manga' ? 'all' : 'Manga')}
            >
              {t('lib.chipManga', { n: items.filter((i) => i.bookSubtype === 'Manga').length })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'Manhwa'}
              onClick={() => setSubtypeFilter(subtypeFilter === 'Manhwa' ? 'all' : 'Manhwa')}
            >
              {t('lib.chipManhwa', { n: items.filter((i) => i.bookSubtype === 'Manhwa').length })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'Manhua'}
              onClick={() => setSubtypeFilter(subtypeFilter === 'Manhua' ? 'all' : 'Manhua')}
            >
              {t('lib.chipManhua', { n: items.filter((i) => i.bookSubtype === 'Manhua').length })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'Roman'}
              onClick={() => setSubtypeFilter(subtypeFilter === 'Roman' ? 'all' : 'Roman')}
            >
              {t('lib.chipNovels', { n: items.filter((i) => i.bookSubtype === 'Roman').length })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'Audiobook'}
              onClick={() => setSubtypeFilter(subtypeFilter === 'Audiobook' ? 'all' : 'Audiobook')}
            >
              {t('lib.chipAudio', { n: countAudioOnly })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'Light Novel'}
              onClick={() =>
                setSubtypeFilter(subtypeFilter === 'Light Novel' ? 'all' : 'Light Novel')
              }
            >
              {t('lib.chipLightNovels', {
                n: items.filter((i) => i.bookSubtype === 'Light Novel').length,
              })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'Comic'}
              onClick={() => setSubtypeFilter(subtypeFilter === 'Comic' ? 'all' : 'Comic')}
            >
              {t('lib.chipComics', { n: items.filter((i) => i.bookSubtype === 'Comic').length })}
            </button>
          </fieldset>
        )}

        {/* Visuelle Medien Sub-Filters */}
        {libraryCategory === 'visuell' && (
          <fieldset className="mn-chips" aria-label={t('lib.filterVisual')}>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'all'}
              onClick={() => setSubtypeFilter('all')}
            >
              {t('lib.allVisual', { n: countVisual })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'film'}
              onClick={() => setSubtypeFilter(subtypeFilter === 'film' ? 'all' : 'film')}
            >
              {t('lib.chipFilms', { n: items.filter((i) => i.kind === 'film').length })}
            </button>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={subtypeFilter === 'series'}
              onClick={() => setSubtypeFilter(subtypeFilter === 'series' ? 'all' : 'series')}
            >
              {t('lib.chipSeries', { n: items.filter((i) => i.kind === 'series').length })}
            </button>
          </fieldset>
        )}

        {/* Videospiele: Dedicated Console / Plattform Filters */}
        {libraryCategory === 'spiele' && (
          <fieldset className="mn-chips" aria-label={t('lib.filterConsole')}>
            <button
              type="button"
              className="mn-filter"
              aria-pressed={consoleFilter === 'all'}
              onClick={() => setConsoleFilter('all')}
            >
              {t('lib.allConsoles', { n: countGames })}
            </button>
            {availableConsoles.map((cons) => (
              <button
                key={cons}
                type="button"
                className="mn-filter"
                aria-pressed={consoleFilter === cons}
                onClick={() => setConsoleFilter(consoleFilter === cons ? 'all' : cons)}
              >
                {t('lib.consoleChip', {
                  name: cons,
                  n: items.filter((i) => (i.console || i.platform) === cons).length,
                })}
              </button>
            ))}
          </fieldset>
        )}

        {/* Status & Rating Filters */}
        <fieldset className="mn-chips" aria-label={t('lib.filterStatus')}>
          <button
            type="button"
            className="mn-filter"
            aria-pressed={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          >
            {t('lib.statusAll')}
          </button>
          <button
            type="button"
            className="mn-filter"
            aria-pressed={statusFilter === 'active'}
            onClick={() => setStatusFilter('active')}
          >
            {t('lib.statusActive')}
          </button>
          <button
            type="button"
            className="mn-filter"
            aria-pressed={statusFilter === 'done'}
            onClick={() => setStatusFilter('done')}
          >
            {t('lib.statusDone')}
          </button>
          <button
            type="button"
            className="mn-filter"
            aria-pressed={statusFilter === 'wishlist'}
            onClick={() => setStatusFilter('wishlist')}
          >
            {t('lib.statusWishlist')}
          </button>
          <button
            type="button"
            className="mn-filter"
            aria-pressed={ratingFilter === '8plus'}
            onClick={() => setRatingFilter(ratingFilter === '8plus' ? 'all' : '8plus')}
          >
            {t('lib.rating8')}
          </button>
          <button
            type="button"
            className="mn-filter"
            aria-pressed={ratingFilter === '10only'}
            onClick={() => setRatingFilter(ratingFilter === '10only' ? 'all' : '10only')}
          >
            {t('lib.rating10')}
          </button>

          {isFiltered && (
            <button
              type="button"
              className="mn-link text-xs ml-2 self-center"
              onClick={handleResetFilters}
            >
              {t('lib.resetFilters')}
            </button>
          )}
        </fieldset>
      </div>

      {/* Sorting bar & View Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--mn-line)]">
        <div
          className="text-sm font-semibold text-[var(--mn-muted)] flex items-center gap-2"
          aria-live="polite"
        >
          <span>{t('lib.entries', { n: filteredAndSortedItems.length })}</span>
          {search.trim() && (
            <span className="mn-chip mn-chip--plain text-xs font-semibold">
              {t('lib.semantic')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--mn-muted)]">
            {t('lib.sort')}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs py-1 px-2 border rounded"
            >
              <option value="newest">{t('lib.sortNewest')}</option>
              <option value="title">{t('lib.sortTitle')}</option>
              <option value="console">{t('lib.sortConsole')}</option>
              <option value="rating">{t('lib.sortRating')}</option>
              <option value="year">{t('lib.sortYear')}</option>
              <option value="progress">{t('lib.sortProgress')}</option>
            </select>
          </label>

          {/* View mode toggle */}
          <fieldset className="mn-seg mn-seg--icons" aria-label={t('lib.switchView')}>
            <button
              type="button"
              aria-pressed={viewMode === 'tiles'}
              aria-label={t('lib.tileView')}
              onClick={() => setViewMode('tiles')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              aria-label={t('lib.listView')}
              onClick={() => setViewMode('list')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </fieldset>
        </div>
      </div>

      {/* Content Rendering: Tiles or List with semantic match reasons */}
      {filteredAndSortedItems.length > 0 ? (
        viewMode === 'tiles' ? (
          <div className="mn-tiles">
            {filteredAndSortedItems.map(({ item, semanticReason }) => (
              <div key={item.id} className="relative">
                <MediaTile item={item} onClick={() => onSelectItem(item)} />
                {/* Book series quick volume badge */}
                {item.isBookSeries && item.volumes && item.volumes.length > 0 && (
                  <div className="px-1 py-1 -mt-1 text-[11px] text-[var(--mn-muted)] flex flex-wrap gap-1">
                    <span className="font-bold text-[var(--mn-accent-text)]">
                      {t('lib.volumesBadge', { n: item.volumes.length })}
                    </span>
                    {item.volumes.slice(0, 4).map((v) => (
                      <span key={v.id} className="mn-chip mn-chip--plain text-[10px] py-0 px-1">
                        {t('lib.volShort', { n: v.volumeNumber })} {v.status === 'done' ? '✓' : ''}
                      </span>
                    ))}
                    {item.volumes.length > 4 && (
                      <span className="text-[10px] text-[var(--mn-muted)] self-center">
                        {t('lib.moreVolumes', { n: item.volumes.length - 4 })}
                      </span>
                    )}
                  </div>
                )}
                {semanticReason && search.trim() && (
                  <span className="block text-[11px] text-[var(--mn-accent-text)] font-semibold mt-1 px-1 truncate">
                    💡 {semanticReason}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mn-list">
            {filteredAndSortedItems.map(({ item, semanticReason }) => (
              <div key={item.id}>
                <MediaRow item={item} onClick={() => onSelectItem(item)} />
                {item.isBookSeries && item.volumes && item.volumes.length > 0 && (
                  <div className="text-[11px] text-[var(--mn-muted)] pl-16 pb-1 -mt-1 flex flex-wrap gap-1">
                    <span className="font-bold text-[var(--mn-accent-text)]">
                      {t('lib.seriesInfo', { n: item.volumes.length })}
                    </span>
                  </div>
                )}
                {semanticReason && search.trim() && (
                  <div className="text-[11px] text-[var(--mn-accent-text)] font-semibold pl-16 pb-2 -mt-1">
                    {t('lib.matchReason', { reason: semanticReason })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="mn-empty">
          <div className="mn-empty-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3>
            {search.trim()
              ? t('lib.notInCollectionTitle', { query: search.trim() })
              : t('lib.noEntriesCategory')}
          </h3>
          <p>
            {search.trim()
              ? t('lib.noEntryFor', { query: search.trim() })
              : isFiltered
                ? t('lib.noMatchFilters')
                : t('lib.noEntriesHere')}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-3">
            {search.trim() ? (
              <>
                <button
                  type="button"
                  className="mn-btn mn-btn--primary"
                  onClick={() =>
                    onOpenAddModal({
                      title: search.trim(),
                      kind:
                        libraryCategory === 'spiele'
                          ? 'game'
                          : libraryCategory === 'audiobooks'
                            ? 'audiobook'
                            : libraryCategory === 'visuell'
                              ? 'film'
                              : 'book',
                    })
                  }
                >
                  {t('lib.addAndSearch', { query: search.trim() })}
                </button>
                <button type="button" className="mn-btn" onClick={handleResetFilters}>
                  {t('lib.resetSearch')}
                </button>
              </>
            ) : isFiltered ? (
              <button type="button" className="mn-btn" onClick={handleResetFilters}>
                {t('lib.resetFilters')}
              </button>
            ) : (
              <button
                type="button"
                className="mn-btn mn-btn--primary"
                onClick={() =>
                  onOpenAddModal({
                    kind:
                      libraryCategory === 'spiele'
                        ? 'game'
                        : libraryCategory === 'audiobooks'
                          ? 'audiobook'
                          : libraryCategory === 'visuell'
                            ? 'film'
                            : 'book',
                  })
                }
              >
                {t('nav.addMedium')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
