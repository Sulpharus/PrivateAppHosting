import React, { useState } from 'react';
import { Overlay } from '../components/Overlay';
import { t } from '../i18n';
import {
  type ApiSearchResult,
  type SearchCategoryTarget,
  type SearchSortBy,
  searchMediaApis,
} from '../services/mediaApis';
import type {
  BookChapter,
  BookSubtype,
  BookVolume,
  ConsumptionLogEntry,
  Episode,
  GameAchievement,
  MediaItem,
  MediaKind,
  MediaList,
  MediaStatus,
  SeasonInfo,
} from '../types';
import { getKindLabel } from '../utils/text';
import { StarRating } from './StarRating';
import { showToast } from './Toast';

interface EditorSheetProps {
  initialItem?: Partial<MediaItem> | null;
  lists: MediaList[];
  onClose: () => void;
  onSave: (item: MediaItem) => Promise<void>;
  onUploadFile?: (path: string, blob: Blob) => Promise<string>;
}

export const EditorSheet: React.FC<EditorSheetProps> = ({
  initialItem,
  lists,
  onClose,
  onSave,
}) => {
  const isEditing = Boolean(initialItem?.id);
  const [currentStep, setCurrentStep] = useState<number>(isEditing ? 2 : 1);

  // Form State
  const [title, setTitle] = useState(initialItem?.title || '');
  const [originalTitle, setOriginalTitle] = useState(initialItem?.originalTitle || '');
  const [englishTitle, setEnglishTitle] = useState(initialItem?.englishTitle || '');
  const [creator, setCreator] = useState(initialItem?.creator || '');
  const [narrator, setNarrator] = useState(initialItem?.narrator || '');
  const [year, setYear] = useState<number | undefined>(initialItem?.year);
  const [kind, setKind] = useState<MediaKind>(initialItem?.kind || 'book');
  const [bookSubtype, setBookSubtype] = useState<BookSubtype>(initialItem?.bookSubtype || 'Roman');
  const [status, setStatus] = useState<MediaStatus>(initialItem?.status || 'active');
  const [genresText, setGenresText] = useState((initialItem?.genres || []).join(', '));
  const [cover, setCover] = useState(initialItem?.cover || '');
  const [rating, setRating] = useState<number | undefined>(initialItem?.rating);
  const [notes, setNotes] = useState(initialItem?.notes || '');

  // Buchreihen
  const [isBookSeries, setIsBookSeries] = useState<boolean>(initialItem?.isBookSeries || false);
  const [seriesTitle, setSeriesTitle] = useState(initialItem?.seriesTitle || '');
  const [volumes, setVolumes] = useState<BookVolume[]>(initialItem?.volumes || []);

  // Progress Fields
  const [currentPage, setCurrentPage] = useState<number | undefined>(initialItem?.currentPage);
  const [totalPages, setTotalPages] = useState<number | undefined>(initialItem?.totalPages);
  const [currentChapter, setCurrentChapter] = useState(initialItem?.currentChapter || '');
  const [currentVolume, setCurrentVolume] = useState<number | undefined>(
    initialItem?.currentVolume,
  );
  const [totalVolumes, setTotalVolumes] = useState<number | undefined>(initialItem?.totalVolumes);
  const [currentSeason, setCurrentSeason] = useState<number | undefined>(
    initialItem?.currentSeason || 1,
  );
  const [currentEpisode, setCurrentEpisode] = useState<number | undefined>(
    initialItem?.currentEpisode || 1,
  );
  const [totalSeasons, setTotalSeasons] = useState<number | undefined>(initialItem?.totalSeasons);
  const [totalEpisodes, setTotalEpisodes] = useState<number | undefined>(
    initialItem?.totalEpisodes,
  );
  const [seasonDetails, setSeasonDetails] = useState<SeasonInfo[]>(
    initialItem?.seasonDetails || [],
  );
  const [episodes, setEpisodes] = useState<Episode[]>(initialItem?.episodes || []);
  const [chapters, setChapters] = useState<BookChapter[]>(initialItem?.chapters || []);
  const [achievements, setAchievements] = useState<GameAchievement[]>(
    initialItem?.achievements || [],
  );
  const [audioTotalMinutes, setAudioTotalMinutes] = useState<number | undefined>(
    initialItem?.audioTotalMinutes,
  );
  const [audioCurrentMinutes, setAudioCurrentMinutes] = useState<number | undefined>(
    initialItem?.audioCurrentMinutes || 0,
  );
  const [runtimeMinutes, setRuntimeMinutes] = useState<number | undefined>(
    initialItem?.runtimeMinutes,
  );
  const [watchedMinutes, _setWatchedMinutes] = useState<number | undefined>(
    initialItem?.watchedMinutes || 0,
  );
  const [hoursPlayed, setHoursPlayed] = useState<number | undefined>(initialItem?.hoursPlayed);
  const [platform, setPlatform] = useState(initialItem?.platform ?? '');
  const [consoleName, setConsoleName] = useState(
    initialItem?.console || initialItem?.platform || '',
  );
  const [consumptionLogs, _setConsumptionLogs] = useState<ConsumptionLogEntry[]>(
    initialItem?.consumptionLogs || [],
  );

  // Lists
  const [selectedListIds, setSelectedListIds] = useState<string[]>(
    lists.filter((l) => initialItem?.id && l.itemIds.includes(initialItem.id)).map((l) => l.id),
  );

  // Online Search State
  const [searchQuery, setSearchQuery] = useState(initialItem?.title || '');
  const [searchCategory, setSearchCategory] = useState<SearchCategoryTarget>(() => {
    if (initialItem?.kind === 'book') return 'book';
    if (initialItem?.kind === 'film' || initialItem?.kind === 'series') return 'film_series';
    if (initialItem?.kind === 'audiobook') return 'audiobook';
    if (initialItem?.kind === 'game') return 'game';
    return 'all';
  });
  const [searchSortBy, setSearchSortBy] = useState<SearchSortBy>('richness');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ApiSearchResult[]>([]);
  const [isOfflineSearch, setIsOfflineSearch] = useState(!navigator.onLine);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [correctionSuggestion, setCorrectionSuggestion] = useState<string | null>(null);
  const [translatedQuery, setTranslatedQuery] = useState<string | null>(null);
  const [keyMissingApis, setKeyMissingApis] = useState<
    { id: string; name: string; message: string; docs?: string }[]
  >([]);
  const [unavailableApis, setUnavailableApis] = useState<
    { id: string; name: string; message: string }[]
  >([]);
  const [isRateLimited, setIsRateLimited] = useState(false);

  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Execute online search
  const handlePerformOnlineSearch = async (
    overrideQuery?: string,
    e?: React.FormEvent,
    overrideCategory?: SearchCategoryTarget,
    overrideSortBy?: SearchSortBy,
  ) => {
    if (e) e.preventDefault();
    const queryToUse = (overrideQuery !== undefined ? overrideQuery : searchQuery).trim();
    if (!queryToUse) return;

    if (!navigator.onLine) {
      setIsOfflineSearch(true);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setIsOfflineSearch(false);
    setCorrectionSuggestion(null);
    setTranslatedQuery(null);
    setKeyMissingApis([]);
    setUnavailableApis([]);
    setIsRateLimited(false);

    const catToUse = overrideCategory || searchCategory;
    const sortToUse = overrideSortBy || searchSortBy;

    const res = await searchMediaApis(queryToUse, kind, {
      category: catToUse,
      sortBy: sortToUse,
    });
    setIsSearching(false);

    if (res.isOffline) {
      setIsOfflineSearch(true);
    } else if (res.error) {
      setSearchError(res.error);
    } else {
      if (res.keyMissingApis && res.keyMissingApis.length > 0) {
        setKeyMissingApis(res.keyMissingApis);
      }
      if (res.unavailableApis && res.unavailableApis.length > 0) {
        setUnavailableApis(res.unavailableApis);
      }
      if (res.isRateLimited) {
        setIsRateLimited(true);
        // Rate-limited: back off and show the last data
      } else {
        setSearchResults(res.results);
      }
      if (res.correctionSuggestion) setCorrectionSuggestion(res.correctionSuggestion);
      if (res.translatedQuery) setTranslatedQuery(res.translatedQuery);
      if (res.results.length === 0 && (!res.keyMissingApis || res.keyMissingApis.length === 0)) {
        setSearchError(t('editor.noMatches'));
      }
    }
  };

  // The effects below call the latest search function without re-running on every render.
  const searchRef = React.useRef(handlePerformOnlineSearch);
  searchRef.current = handlePerformOnlineSearch;

  // Debounced search-as-you-type (≥ 300 ms, ≥ 3 characters)
  React.useEffect(() => {
    if (currentStep !== 1) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) return;

    const timer = setTimeout(() => {
      void searchRef.current(trimmed);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, currentStep]);

  // If initialItem had title and not editing, trigger search on mount
  const initialTitle = initialItem?.title ?? '';
  const searchedInitial = React.useRef(false);
  React.useEffect(() => {
    if (searchedInitial.current || isEditing || initialTitle.trim().length <= 1) return;
    searchedInitial.current = true;
    void searchRef.current(initialTitle);
  }, [isEditing, initialTitle]);

  // Select an API Search Result - loads all rich data (episodes, chapters, achievements, etc.)
  const handleSelectApiResult = (res: ApiSearchResult) => {
    setTitle(res.title);
    if (res.originalTitle) setOriginalTitle(res.originalTitle);
    if (res.englishTitle) setEnglishTitle(res.englishTitle);
    setCreator(res.creator);
    if (res.narrator) setNarrator(res.narrator);
    if (res.year) setYear(res.year);
    setKind(res.kind);
    if (res.bookSubtype) setBookSubtype(res.bookSubtype);
    if (res.cover) setCover(res.cover);
    if (res.genres && res.genres.length > 0) setGenresText(res.genres.join(', '));
    if (res.notes) setNotes(res.notes);
    if (res.totalPages) setTotalPages(res.totalPages);
    if (res.totalEpisodes) setTotalEpisodes(res.totalEpisodes);
    if (res.totalSeasons) setTotalSeasons(res.totalSeasons);
    if (res.seasonDetails) setSeasonDetails(res.seasonDetails);
    if (res.episodes) setEpisodes(res.episodes);
    if (res.chapters) setChapters(res.chapters);
    if (res.achievements) setAchievements(res.achievements);
    if (res.audioTotalMinutes) setAudioTotalMinutes(res.audioTotalMinutes);
    if (res.runtimeMinutes) setRuntimeMinutes(res.runtimeMinutes);
    if (res.platform) setPlatform(res.platform);
    if (res.console) setConsoleName(res.console);
    if (res.rating) setRating(res.rating);

    // Buchreihen handling
    if (res.isBookSeries) {
      setIsBookSeries(true);
      setSeriesTitle(res.seriesTitle || res.title);
      if (res.volumes && res.volumes.length > 0) {
        setVolumes(res.volumes);
      } else {
        setVolumes([
          {
            id: 'vol_1',
            volumeNumber: 1,
            title: t('editor.volume1'),
            cover: res.cover,
            totalPages: res.totalPages,
            status: 'wishlist',
          },
        ]);
      }
    }

    const enrichedDetails: string[] = [];
    if (res.isBookSeries) enrichedDetails.push(t('editor.detailSeries'));
    if (res.episodes && res.episodes.length > 0)
      enrichedDetails.push(t('editor.detailEpisodes', { n: res.episodes.length }));
    if (res.chapters && res.chapters.length > 0)
      enrichedDetails.push(t('editor.detailChapters', { n: res.chapters.length }));
    if (res.achievements && res.achievements.length > 0)
      enrichedDetails.push(t('editor.detailAchievements', { n: res.achievements.length }));
    if (res.totalPages) enrichedDetails.push(t('editor.detailPages', { n: res.totalPages }));

    const enrichmentText = enrichedDetails.length > 0 ? ` (${enrichedDetails.join(', ')})` : '';
    showToast(t('editor.dataTaken', { title: res.title, details: enrichmentText }));
    setCurrentStep(2);
  };

  // Image File Upload with thumbnail resize
  const handleCoverFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert(t('editor.fileTooBig'));
      return;
    }

    try {
      // Shrunk to 480 px (JPEG), so the cover stays small in the synced collection.
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setCover(canvas.toDataURL('image/jpeg', 0.82));
      showToast(t('editor.coverLoaded'));
    } catch (_err) {
      showToast(t('editor.coverFailed'));
    }
  };

  // Submit and Save
  const handleSave = async () => {
    if (!title.trim()) {
      setCurrentStep(2);
      showToast(t('editor.needTitle'));
      return;
    }

    const genres = genresText
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    const now = new Date().toISOString();
    const itemId =
      initialItem?.id || `work_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const savedItem: MediaItem = {
      id: itemId,
      title: title.trim(),
      originalTitle: originalTitle.trim() || undefined,
      englishTitle: englishTitle.trim() || undefined,
      creator: creator.trim() || t('common.unknown'),
      narrator: narrator.trim() || undefined,
      year: year ? Number(year) : undefined,
      kind,
      bookSubtype: kind === 'book' ? bookSubtype : undefined,
      isBookSeries: kind === 'book' ? isBookSeries : undefined,
      seriesTitle: isBookSeries ? seriesTitle.trim() || title.trim() : undefined,
      volumes: isBookSeries
        ? volumes.length > 0
          ? volumes
          : [
              {
                id: 'vol_1',
                volumeNumber: 1,
                title: t('editor.volume1Short'),
                cover,
                totalPages: totalPages || undefined,
                currentPage,
                status,
              },
            ]
        : undefined,
      genres,
      tags: initialItem?.tags || [],
      status,
      rating,
      notes: notes.trim() || undefined,
      cover: cover || undefined,
      currentPage: currentPage !== undefined ? Number(currentPage) : undefined,
      totalPages: totalPages !== undefined ? Number(totalPages) : undefined,
      currentChapter: currentChapter.trim() || undefined,
      currentVolume: currentVolume !== undefined ? Number(currentVolume) : undefined,
      totalVolumes: totalVolumes !== undefined ? Number(totalVolumes) : undefined,
      currentSeason: currentSeason !== undefined ? Number(currentSeason) : undefined,
      currentEpisode: currentEpisode !== undefined ? Number(currentEpisode) : undefined,
      totalSeasons: totalSeasons !== undefined ? Number(totalSeasons) : undefined,
      totalEpisodes:
        totalEpisodes !== undefined
          ? Number(totalEpisodes)
          : episodes.length > 0
            ? episodes.length
            : undefined,
      seasonDetails: seasonDetails.length > 0 ? seasonDetails : undefined,
      episodes,
      chapters,
      achievements,
      audioTotalMinutes: audioTotalMinutes !== undefined ? Number(audioTotalMinutes) : undefined,
      audioCurrentMinutes: audioCurrentMinutes !== undefined ? Number(audioCurrentMinutes) : 0,
      runtimeMinutes: runtimeMinutes !== undefined ? Number(runtimeMinutes) : undefined,
      watchedMinutes: watchedMinutes !== undefined ? Number(watchedMinutes) : 0,
      hoursPlayed: hoursPlayed !== undefined ? Number(hoursPlayed) : undefined,
      platform: platform.trim() || undefined,
      console: kind === 'game' ? consoleName || platform || undefined : undefined,
      consumptionLogs,
      started: initialItem?.started || (status === 'active' ? now.slice(0, 10) : undefined),
      finished: initialItem?.finished || (status === 'done' ? now.slice(0, 10) : undefined),
      ownerId: initialItem?.ownerId ?? '',
      updatedAt: now,
      listIds: selectedListIds,
    };

    await onSave(savedItem);
    onClose();
    showToast(t(isEditing ? 'editor.saved' : 'editor.created'));
  };

  return (
    <Overlay onClose={onClose} labelledBy="editor-title" sheetClassName="mn-sheet mn-sheet--tall">
      {/* Top Header Bar */}
      <div className="mn-sheet-bar">
        <button type="button" className="mn-btn mn-btn--ghost" onClick={onClose}>
          {t('editor.abbrechen')}
        </button>
        <h2 id="editor-title">{t(isEditing ? 'editor.titleEdit' : 'editor.titleNew')}</h2>
        <span />
      </div>

      {/* Step Indicator */}
      <div className="mn-steps" role="tablist">
        <button
          type="button"
          aria-current={currentStep === 1 ? 'step' : undefined}
          className={currentStep > 1 ? 'done' : ''}
          onClick={() => setCurrentStep(1)}
        >
          <i>1</i>
          <span>{t('editor.suche')}</span>
        </button>
        <button
          type="button"
          aria-current={currentStep === 2 ? 'step' : undefined}
          className={currentStep > 2 ? 'done' : ''}
          onClick={() => setCurrentStep(2)}
        >
          <i>2</i>
          <span>{t('editor.basisdaten')}</span>
        </button>
        <button
          type="button"
          aria-current={currentStep === 3 ? 'step' : undefined}
          className={currentStep > 3 ? 'done' : ''}
          onClick={() => setCurrentStep(3)}
        >
          <i>3</i>
          <span>{t('editor.fortschritt')}</span>
        </button>
        <button
          type="button"
          aria-current={currentStep === 4 ? 'step' : undefined}
          className={currentStep > 4 ? 'done' : ''}
          onClick={() => setCurrentStep(4)}
        >
          <i>4</i>
          <span>{t('editor.listen')}</span>
        </button>
      </div>

      {/* Sheet Body with Step Content */}
      <div className="mn-sheet-body">
        {/* STEP 1: Online Search & Import */}
        {currentStep === 1 && (
          <div className="grid gap-5">
            <div>
              <h3 className="text-xl font-bold mb-1">{t('editor.onlineMediensuche')}</h3>
              <p className="text-sm text-[var(--mn-muted)]">{t('editor.apiIntro')}</p>
            </div>

            {/* OFFLINE WARNING IF OFFLINE */}
            {isOfflineSearch && (
              <div className="mn-banner mn-banner--warn" role="alert">
                <div className="flex-1">
                  <b className="block mb-1">{t('editor.offlineOnlineMediensucheNicht')}</b>
                  <p className="text-xs text-[var(--mn-ink)] mb-2">
                    {t('editor.daDuMomentanOffline')}
                  </p>
                  <button
                    type="button"
                    className="mn-btn mn-btn--primary text-xs"
                    onClick={() => setCurrentStep(2)}
                  >
                    {t('editor.jetztManuellAnlegen')}
                  </button>
                </div>
              </div>
            )}

            {/* Medientyp-Vorfilter (genauere Suche & Ausblendung irrelevanter Medien) */}
            <div className="p-3 bg-[var(--mn-surface-2)] rounded-xl border border-[var(--mn-line)]">
              <span className="block text-xs font-bold text-[var(--mn-muted)] mb-2">
                {t('editor.1WonachSuchstDu')}
              </span>
              <fieldset
                className="flex flex-wrap gap-1.5"
                aria-label={t('editor.medientypOnlineSucheWaehlen')}
              >
                <button
                  type="button"
                  className="mn-filter text-xs"
                  aria-pressed={searchCategory === 'book'}
                  onClick={() => {
                    setSearchCategory('book');
                    setKind('book');
                    if (searchQuery.trim().length >= 2) {
                      handlePerformOnlineSearch(searchQuery, undefined, 'book');
                    }
                  }}
                >
                  {t('editor.buecherMangaRomane')}
                </button>
                <button
                  type="button"
                  className="mn-filter text-xs"
                  aria-pressed={searchCategory === 'film_series'}
                  onClick={() => {
                    setSearchCategory('film_series');
                    setKind('film');
                    if (searchQuery.trim().length >= 2) {
                      handlePerformOnlineSearch(searchQuery, undefined, 'film_series');
                    }
                  }}
                >
                  {t('editor.filmeSerien')}
                </button>
                <button
                  type="button"
                  className="mn-filter text-xs"
                  aria-pressed={searchCategory === 'audiobook'}
                  onClick={() => {
                    setSearchCategory('audiobook');
                    setKind('audiobook');
                    if (searchQuery.trim().length >= 2) {
                      handlePerformOnlineSearch(searchQuery, undefined, 'audiobook');
                    }
                  }}
                >
                  {t('editor.audiobooksHoerbuecher')}
                </button>
                <button
                  type="button"
                  className="mn-filter text-xs"
                  aria-pressed={searchCategory === 'game'}
                  onClick={() => {
                    setSearchCategory('game');
                    setKind('game');
                    if (searchQuery.trim().length >= 2) {
                      handlePerformOnlineSearch(searchQuery, undefined, 'game');
                    }
                  }}
                >
                  {t('editor.videospieleSteamKonsolen')}
                </button>
                <button
                  type="button"
                  className="mn-filter text-xs"
                  aria-pressed={searchCategory === 'all'}
                  onClick={() => {
                    setSearchCategory('all');
                    if (searchQuery.trim().length >= 2) {
                      handlePerformOnlineSearch(searchQuery, undefined, 'all');
                    }
                  }}
                >
                  {t('editor.alleMedientypen')}
                </button>
              </fieldset>
            </div>

            <form onSubmit={(e) => handlePerformOnlineSearch(undefined, e)} className="grid gap-3">
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
                    searchCategory === 'book'
                      ? t('editor.phBook')
                      : searchCategory === 'game'
                        ? t('editor.phGame')
                        : searchCategory === 'film_series'
                          ? t('editor.phFilm')
                          : searchCategory === 'audiobook'
                            ? t('editor.phAudio')
                            : t('editor.phAll')
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    className="mn-btn mn-btn--primary"
                    disabled={isSearching || !searchQuery.trim()}
                  >
                    {isSearching ? t('editor.searching') : t('editor.searchOnline')}
                  </button>
                  <button
                    type="button"
                    className="mn-btn mn-btn--ghost"
                    onClick={() => setCurrentStep(2)}
                  >
                    {t('editor.ohneSucheManuellEingeben')}
                  </button>
                </div>

                {/* Sortierung: Meiste Daten vs Höchste Relevanz */}
                <div className="flex items-center gap-1.5 text-xs text-[var(--mn-muted)]">
                  <span className="font-semibold">{t('editor.sortieren')}</span>
                  <fieldset
                    className="mn-seg text-xs"
                    aria-label={t('editor.sortierungSuchergebnisse')}
                  >
                    <button
                      type="button"
                      className="py-1 px-2.5 text-xs"
                      aria-pressed={searchSortBy === 'richness'}
                      onClick={() => {
                        setSearchSortBy('richness');
                        if (searchQuery.trim().length >= 2) {
                          handlePerformOnlineSearch(searchQuery, undefined, undefined, 'richness');
                        }
                      }}
                    >
                      {t('editor.meisteDaten')}
                    </button>
                    <button
                      type="button"
                      className="py-1 px-2.5 text-xs"
                      aria-pressed={searchSortBy === 'relevance'}
                      onClick={() => {
                        setSearchSortBy('relevance');
                        if (searchQuery.trim().length >= 2) {
                          handlePerformOnlineSearch(searchQuery, undefined, undefined, 'relevance');
                        }
                      }}
                    >
                      {t('editor.hoechsteRelevanz')}
                    </button>
                  </fieldset>
                </div>
              </div>
            </form>

            {searchError && <div className="mn-banner mn-banner--warn text-sm">{searchError}</div>}

            {/* Friendly Empty State for Missing Host-Level API Keys */}
            {keyMissingApis.length > 0 && (
              <div className="grid gap-3">
                {keyMissingApis.map((api) => (
                  <div
                    key={api.id}
                    className="p-4 bg-[var(--mn-surface-2)] border border-[var(--mn-line)] rounded-xl flex items-start gap-3 shadow-xs"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 text-base">
                      🔑
                    </div>
                    <div className="flex-1 text-xs">
                      <div className="font-semibold text-sm text-[var(--mn-ink)] mb-0.5">
                        {api.name} wird eingerichtet
                      </div>
                      <p className="text-[var(--mn-muted)] leading-relaxed">
                        {t('editor.dieseFunktionGeradeEingerichtet')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Service Unavailable with Retry */}
            {unavailableApis.length > 0 && (
              <div className="grid gap-2">
                {unavailableApis.map((api) => (
                  <div
                    key={api.id}
                    className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl flex items-center justify-between gap-3 text-xs text-red-900 dark:text-red-200"
                  >
                    <div className="flex items-center gap-2">
                      <span>⚠️</span>
                      <span>{t('editor.apiUnavailable', { name: api.name })}</span>
                    </div>
                    <button
                      type="button"
                      className="mn-btn mn-btn--ghost text-xs cursor-pointer shrink-0"
                      onClick={() => handlePerformOnlineSearch(searchQuery)}
                    >
                      {t('editor.erneutVersuchen')}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Rate Limited Notification */}
            {isRateLimited && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/50 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <span>⏳</span>
                <span>{t('editor.rateLimitErreichtMax')}</span>
              </div>
            )}

            {/* Correction suggestion */}
            {correctionSuggestion && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-700/50 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">💡</span>
                  <span>{t('editor.didYouMean', { query: correctionSuggestion })}</span>
                </div>
                <button
                  type="button"
                  className="mn-btn mn-btn--ghost text-xs cursor-pointer"
                  onClick={() => {
                    setSearchQuery(correctionSuggestion);
                    handlePerformOnlineSearch(correctionSuggestion);
                  }}
                >
                  {t('editor.jetztSuchen')}
                </button>
              </div>
            )}

            {/* Translation notice */}
            {translatedQuery && (
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-300 dark:border-blue-700/50 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                <span className="text-base">🌐</span>
                <span>
                  {t('editor.translatedNote', {
                    label: t('editor.titelUebersetzt'),
                    query: translatedQuery,
                  })}
                </span>
              </div>
            )}

            {/* Search Results List */}
            {searchResults.length > 0 && (
              <div className="grid gap-3 mt-2">
                <h4 className="text-sm font-bold text-[var(--mn-muted)]">
                  {t('editor.gefundeneTrefferMeistenDaten')}
                </h4>
                <div className="grid gap-2">
                  {searchResults.map((res) => (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the whole card is a mouse shortcut for its own button
                    // biome-ignore lint/a11y/noStaticElementInteractions: see above
                    <div
                      key={res.id}
                      className="p-3 bg-[var(--mn-surface-2)] rounded-xl flex items-center justify-between gap-3 hover:bg-[var(--mn-surface)] border border-transparent hover:border-[var(--mn-accent)] transition-colors cursor-pointer"
                      onClick={() => handleSelectApiResult(res)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {res.cover ? (
                          <img
                            src={res.cover}
                            alt=""
                            className="w-12 h-16 object-cover rounded shadow-sm shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-16 bg-[var(--mn-accent-soft)] text-[var(--mn-accent-text)] font-bold flex items-center justify-center rounded shrink-0">
                            {res.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="block font-bold text-[var(--mn-ink)] truncate text-base">
                            {res.title}
                          </span>
                          {(res.englishTitle || res.originalTitle) && (
                            <span className="block text-[11px] text-[var(--mn-muted)] truncate">
                              {[res.englishTitle, res.originalTitle]
                                .filter((t) => t && t !== res.title)
                                .join(' · ')}
                            </span>
                          )}
                          <span className="block text-xs text-[var(--mn-muted)] truncate">
                            {[res.creator, res.year ? `(${res.year})` : '', getKindLabel(res.kind)]
                              .filter(Boolean)
                              .join(' · ')}
                            {res.germanTitle && (
                              <span className="mn-chip ml-1 text-[10px]">
                                {t('editor.deutsch')}
                              </span>
                            )}
                          </span>
                          {res.genres.length > 0 && (
                            <span className="block text-xs text-[var(--mn-accent-text)] font-medium truncate mt-0.5">
                              {res.genres.slice(0, 3).join(', ')}
                            </span>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {res.isBookSeries && (
                              <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1.5 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold">
                                {t('editor.reiheBand1')}
                              </span>
                            )}
                            {res.episodes && res.episodes.length > 0 && (
                              <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold">
                                {t('editor.chipSeasons', {
                                  seasons: res.totalSeasons || 1,
                                  episodes: res.episodes.length,
                                })}
                              </span>
                            )}
                            {res.chapters && res.chapters.length > 0 && (
                              <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold">
                                {t('editor.chipChapters', { n: res.chapters.length })}
                              </span>
                            )}
                            {res.achievements && res.achievements.length > 0 && (
                              <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold">
                                {t('editor.chipAchievements', { n: res.achievements.length })}
                              </span>
                            )}
                            {res.totalPages && (
                              <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1.5">
                                {t('editor.chipPages', { n: res.totalPages })}
                              </span>
                            )}
                            {res.audioTotalMinutes && (
                              <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1.5">
                                {t('editor.chipHours', {
                                  n: Math.round(res.audioTotalMinutes / 60),
                                })}
                              </span>
                            )}
                            {res.console && (
                              <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1.5">
                                🎮 {res.console}
                              </span>
                            )}
                            {res.attribution && (
                              <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1.5 opacity-80 bg-gray-100 dark:bg-gray-800 text-[var(--mn-muted)]">
                                {res.attribution}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="mn-btn mn-btn--primary text-xs shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectApiResult(res);
                        }}
                      >
                        {t('editor.uebernehmen')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Basic Metadata */}
        {currentStep === 2 && (
          <div className="mn-form">
            <fieldset>
              <legend>{t('editor.basisdatenMediums')}</legend>

              <label className="mn-field">
                {t('editor.titel')}
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('editor.grafMonteChristo')}
                />
              </label>

              {originalTitle && (
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 border border-blue-200 dark:border-blue-800">
                  <span>
                    {t('editor.originalTitle')} <b>{originalTitle}</b>
                  </span>
                  {englishTitle && (
                    <span className="text-[var(--mn-muted)]">
                      {t('editor.englishTitle', { title: englishTitle })}
                    </span>
                  )}
                </div>
              )}

              <div className="mn-grid-2">
                <label className="mn-field">
                  {t('editor.urheberAutorRegisseur')}
                  <input
                    type="text"
                    required
                    value={creator}
                    onChange={(e) => setCreator(e.target.value)}
                    placeholder={t('editor.alexandreDumas')}
                  />
                </label>
                <label className="mn-field">
                  {t('editor.erscheinungsjahr')}
                  <input
                    type="number"
                    value={year || ''}
                    onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="z. B. 1844"
                  />
                </label>
              </div>

              <div className="mn-grid-2">
                <label className="mn-field">
                  {t('editor.mediumTyp')}
                  <select value={kind} onChange={(e) => setKind(e.target.value as MediaKind)}>
                    <option value="book">{t('editor.buchMangaComic')}</option>
                    <option value="audiobook">{t('editor.hoerbuchAudiobook')}</option>
                    <option value="film">Film</option>
                    <option value="series">{t('editor.serie')}</option>
                    <option value="game">{t('editor.videospiel')}</option>
                    <option value="collection">{t('editor.sammlung')}</option>
                  </select>
                </label>

                <label className="mn-field">
                  {t('editor.statusLabel')}
                  <select value={status} onChange={(e) => setStatus(e.target.value as MediaStatus)}>
                    <option value="active">{t('editor.amLesenSchauenSpielen')}</option>
                    <option value="wishlist">{t('editor.wunschlisteGemerkt')}</option>
                    <option value="done">{t('editor.beendetGelesenGesehen')}</option>
                    <option value="dropped">{t('editor.pausiertAbgebrochen')}</option>
                  </select>
                </label>
              </div>

              {/* Konsole selection for Videospiele */}
              {kind === 'game' && (
                <div className="mn-grid-2">
                  <label className="mn-field">
                    {t('editor.gespieltKonsolePlattform')}
                    <select
                      value={consoleName}
                      onChange={(e) => {
                        setConsoleName(e.target.value);
                        setPlatform(e.target.value);
                      }}
                    >
                      <option value="Nintendo Switch">Nintendo Switch</option>
                      <option value="PlayStation 5">PlayStation 5</option>
                      <option value="PlayStation 4">PlayStation 4</option>
                      <option value="PC / Steam">PC / Steam</option>
                      <option value="Xbox Series X/S">Xbox Series X/S</option>
                      <option value="Xbox One">Xbox One</option>
                      <option value="Steam Deck">Steam Deck</option>
                      <option value="Nintendo 3DS / DS">Nintendo 3DS / DS</option>
                      <option value="PlayStation 2 / PS1">PlayStation 2 / PS1</option>
                      <option value="Retro (SNES, N64, GameCube)">
                        {t('editor.retroKonsole')}
                      </option>
                      <option value="Sonstige">{t('editor.sonstigePlattform')}</option>
                    </select>
                  </label>
                  <label className="mn-field">
                    {t('editor.plattformDetailsEdition')}
                    <input
                      type="text"
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      placeholder={t('editor.digitalDeluxeCartridge')}
                    />
                  </label>
                </div>
              )}

              {/* Buchreihen / Manga-Serien Checkbox */}
              {kind === 'book' && (
                <div className="p-3 bg-[var(--mn-surface-2)] rounded-xl grid gap-2">
                  <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isBookSeries}
                      onChange={(e) => {
                        setIsBookSeries(e.target.checked);
                        if (e.target.checked && volumes.length === 0) {
                          setVolumes([
                            {
                              id: 'vol_1',
                              volumeNumber: 1,
                              title: t('editor.volume1'),
                              totalPages: totalPages || undefined,
                              status: 'wishlist',
                            },
                          ]);
                        }
                      }}
                    />
                    <span>{t('editor.diesBuchreiheMangaSerie')}</span>
                  </label>
                  {isBookSeries && (
                    <div className="pt-2 border-t border-[var(--mn-line)]">
                      <label className="mn-field text-xs">
                        {t('editor.nameGesamtreihe')}
                        <input
                          type="text"
                          value={seriesTitle}
                          onChange={(e) => setSeriesTitle(e.target.value)}
                          placeholder={t('editor.berserkSoloLeveling')}
                        />
                      </label>
                      <span className="text-[11px] text-[var(--mn-muted)] block mt-1">
                        {t('editor.volume1ZuerstAngezeigt')}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {kind === 'audiobook' && (
                <div className="mn-grid-2">
                  <label className="mn-field">
                    {t('editor.sprecherNarrator')}
                    <input
                      type="text"
                      value={narrator}
                      onChange={(e) => setNarrator(e.target.value)}
                      placeholder={t('editor.achimHoeppnerRufusBeck')}
                    />
                  </label>
                  <label className="mn-field">
                    {t('editor.gesamtlaufzeitMinuten')}
                    <input
                      type="number"
                      value={audioTotalMinutes || ''}
                      onChange={(e) =>
                        setAudioTotalMinutes(e.target.value ? Number(e.target.value) : undefined)
                      }
                      placeholder={t('editor.72012Stunden')}
                    />
                  </label>
                </div>
              )}

              {kind === 'book' && (
                <label className="mn-field">
                  {t('editor.buchKategorieFormat')}
                  <select
                    value={bookSubtype}
                    onChange={(e) => setBookSubtype(e.target.value as BookSubtype)}
                  >
                    <option value="Roman">{t('editor.romanKlassiker')}</option>
                    <option value="Manga">{t('editor.mangaJapanisch')}</option>
                    <option value="Manhwa">{t('editor.manhwaKoreanischWebtoon')}</option>
                    <option value="Manhua">{t('editor.manhuaChinesisch')}</option>
                    <option value="Light Novel">{t('editor.lightNovelRanobe')}</option>
                    <option value="Comic">Comic</option>
                    <option value="Graphic Novel">Graphic Novel</option>
                    <option value="Sachbuch">{t('editor.sachbuchFachbuch')}</option>
                  </select>
                </label>
              )}

              <label className="mn-field">
                {t('editor.genresSchlagwoerterKommagetrennt')}
                <input
                  type="text"
                  value={genresText}
                  onChange={(e) => setGenresText(e.target.value)}
                  placeholder={t('editor.klassikerAbenteuerHistorisch')}
                />
              </label>

              <div className="mn-group">
                <label className="mn-field">
                  {t('editor.coverBildUrlDatei')}
                  <input
                    type="url"
                    value={cover}
                    onChange={(e) => setCover(e.target.value)}
                    placeholder={t('editor.httpsBildlink')}
                  />
                </label>
                <div className="flex items-center gap-3">
                  <label className="mn-btn mn-btn--ghost text-xs cursor-pointer">
                    <span>{t('editor.eigenesBildHochladen')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverFileUpload}
                    />
                  </label>
                  {cover && (
                    <span className="text-xs text-[var(--mn-ok)] font-semibold">
                      {t('editor.bildHinterlegt')}
                    </span>
                  )}
                </div>
              </div>
            </fieldset>
          </div>
        )}

        {/* STEP 3: Progress & Rating */}
        {currentStep === 3 && (
          <div className="mn-form">
            <fieldset>
              <legend>{t('editor.fortschrittBewertung')}</legend>

              {/* 1-10 Stars Rating */}
              <div className="mb-4">
                <StarRating value={rating} onChange={setRating} />
              </div>

              {/* Type specific progress */}
              {kind === 'book' && (
                <div className="mn-group">
                  <span className="text-sm font-bold text-[var(--mn-ink)]">
                    {bookSubtype}-Fortschritt (Kapitel, Band & Seiten)
                  </span>
                  <div className="mn-grid-2">
                    <label className="mn-field">
                      {t('editor.aktuellesKapitel')}
                      <input
                        type="text"
                        value={currentChapter}
                        onChange={(e) => setCurrentChapter(e.target.value)}
                        placeholder={t('editor.kapitel142Ch85')}
                      />
                    </label>
                    <label className="mn-field">
                      {t('editor.gesamtkapitelFallsBekannt')}
                      <input
                        type="text"
                        value={totalEpisodes ? String(totalEpisodes) : ''}
                        onChange={(e) =>
                          setTotalEpisodes(e.target.value ? Number(e.target.value) : undefined)
                        }
                        placeholder="z. B. 180"
                      />
                    </label>
                  </div>

                  {['Manga', 'Manhwa', 'Manhua', 'Comic', 'Graphic Novel', 'Light Novel'].includes(
                    bookSubtype,
                  ) && (
                    <div className="mn-grid-2">
                      <label className="mn-field">
                        {t('editor.aktuellerBandVolume')}
                        <input
                          type="number"
                          min="1"
                          value={currentVolume || ''}
                          onChange={(e) =>
                            setCurrentVolume(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="z. B. 14"
                        />
                      </label>
                      <label className="mn-field">
                        {t('editor.gesamtbaende')}
                        <input
                          type="number"
                          min="1"
                          value={totalVolumes || ''}
                          onChange={(e) =>
                            setTotalVolumes(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="z. B. 41"
                        />
                      </label>
                    </div>
                  )}

                  <div className="mn-grid-2">
                    <label className="mn-field">
                      {t('editor.aktuelleSeiteOptional')}
                      <input
                        type="number"
                        value={currentPage || ''}
                        onChange={(e) =>
                          setCurrentPage(e.target.value ? Number(e.target.value) : undefined)
                        }
                        placeholder="z. B. 120"
                      />
                    </label>
                    <label className="mn-field">
                      {t('editor.gesamtseitenOptional')}
                      <input
                        type="number"
                        value={totalPages || ''}
                        onChange={(e) =>
                          setTotalPages(e.target.value ? Number(e.target.value) : undefined)
                        }
                        placeholder="z. B. 450"
                      />
                    </label>
                  </div>

                  {chapters.length > 0 && (
                    <div className="p-2.5 bg-[var(--mn-surface)] rounded text-xs border border-[var(--mn-line)]">
                      <span className="font-bold text-[var(--mn-ok)]">
                        {t('editor.importedChapters', { n: chapters.length })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {kind === 'audiobook' && (
                <div className="mn-group">
                  <span className="text-sm font-bold text-[var(--mn-ink)]">
                    {t('editor.hoerbuchFortschrittLaufzeit')}
                  </span>
                  <div className="mn-grid-2">
                    <label className="mn-field">
                      {t('editor.gehoerteMinuten')}
                      <input
                        type="number"
                        value={audioCurrentMinutes || ''}
                        onChange={(e) =>
                          setAudioCurrentMinutes(
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        placeholder="z. B. 120"
                      />
                    </label>
                    <label className="mn-field">
                      {t('editor.gesamtlaufzeitMinuten2')}
                      <input
                        type="number"
                        value={audioTotalMinutes || ''}
                        onChange={(e) =>
                          setAudioTotalMinutes(e.target.value ? Number(e.target.value) : undefined)
                        }
                        placeholder="z. B. 720"
                      />
                    </label>
                  </div>
                  {chapters.length > 0 && (
                    <div className="p-2.5 bg-[var(--mn-surface)] rounded text-xs border border-[var(--mn-line)]">
                      <span className="font-bold text-[var(--mn-ok)]">
                        {t('editor.importedTracks', { n: chapters.length })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {kind === 'series' && (
                <div className="mn-group">
                  <span className="text-sm font-bold text-[var(--mn-ink)]">
                    {t('editor.serienFortschrittStaffeln')}
                  </span>
                  <div className="mn-grid-2">
                    <label className="mn-field">
                      {t('editor.aktuelleStaffel')}
                      <input
                        type="number"
                        value={currentSeason || ''}
                        onChange={(e) =>
                          setCurrentSeason(e.target.value ? Number(e.target.value) : undefined)
                        }
                      />
                    </label>
                    <label className="mn-field">
                      {t('editor.aktuelleFolge')}
                      <input
                        type="number"
                        value={currentEpisode || ''}
                        onChange={(e) =>
                          setCurrentEpisode(e.target.value ? Number(e.target.value) : undefined)
                        }
                      />
                    </label>
                  </div>
                  <label className="mn-field">
                    {t('editor.gesamtzahlFolgen')}
                    <input
                      type="number"
                      value={totalEpisodes || ''}
                      onChange={(e) =>
                        setTotalEpisodes(e.target.value ? Number(e.target.value) : undefined)
                      }
                      placeholder="z. B. 24"
                    />
                  </label>

                  {seasonDetails.length > 0 && (
                    <div className="p-2.5 bg-[var(--mn-surface)] rounded text-xs border border-[var(--mn-line)]">
                      <span className="font-bold block mb-1">
                        {t('editor.staffelAufschluesselungApi')}
                      </span>
                      <div className="flex flex-wrap gap-1.5 text-[var(--mn-muted)]">
                        {seasonDetails.map((s) => (
                          <span key={s.season} className="mn-chip mn-chip--plain text-[11px]">
                            {s.name}: {s.episodeCount} Folgen
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {episodes.length > 0 && (
                    <div className="p-2.5 bg-[var(--mn-surface)] rounded text-xs border border-[var(--mn-line)]">
                      <span className="font-bold text-[var(--mn-ok)]">
                        {t('editor.importedEpisodes', { n: episodes.length })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {kind === 'game' && (
                <div className="mn-group">
                  <span className="text-sm font-bold text-[var(--mn-ink)]">
                    {t('editor.spielFortschrittErfolge')}
                  </span>
                  <div className="mn-grid-2">
                    <label className="mn-field">
                      {t('editor.gespielteStunden')}
                      <input
                        type="number"
                        value={hoursPlayed || ''}
                        onChange={(e) =>
                          setHoursPlayed(e.target.value ? Number(e.target.value) : undefined)
                        }
                        placeholder="z. B. 45"
                      />
                    </label>
                    <label className="mn-field">
                      {t('editor.plattform')}
                      <input
                        type="text"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                        placeholder={t('editor.pcPs5Switch')}
                      />
                    </label>
                  </div>

                  {achievements.length > 0 && (
                    <div className="p-2.5 bg-[var(--mn-surface)] rounded text-xs border border-[var(--mn-line)]">
                      <span className="font-bold text-[var(--mn-ok)]">
                        {t('editor.importedAchievements', { n: achievements.length })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <label className="mn-field">
                {t('editor.persoenlicheNotizenEindruecke')}
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('editor.gedankenZitateWarumEs')}
                />
              </label>
            </fieldset>
          </div>
        )}

        {/* STEP 4: List Assignments */}
        {currentStep === 4 && (
          <div className="mn-form">
            <fieldset>
              <legend>{t('editor.leseSchaulistenHinzufuegen')}</legend>
              <p className="mn-hint">{t('editor.ordneDiesenEintragDeinen')}</p>

              {lists.length > 0 ? (
                <div className="mn-checks">
                  {lists.map((list) => {
                    const isChecked = selectedListIds.includes(list.id);
                    return (
                      <label key={list.id}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedListIds([...selectedListIds, list.id]);
                            } else {
                              setSelectedListIds(selectedListIds.filter((id) => id !== list.id));
                            }
                          }}
                        />
                        <div>
                          <span className="font-semibold">{list.title}</span>
                          {list.description && <small>{list.description}</small>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[var(--mn-muted)]">
                  {t('editor.nochKeineBenutzerdefiniertenListen')}
                </p>
              )}
            </fieldset>
          </div>
        )}
      </div>

      {/* Sticky Sheet Footer */}
      <div className="mn-sheet-foot">
        {currentStep > 1 && (
          <button
            type="button"
            className="mn-btn mn-btn--ghost"
            onClick={() => setCurrentStep(currentStep - 1)}
          >
            {t('editor.zurueck')}
          </button>
        )}

        <div className="mn-grow" />

        {currentStep < 4 ? (
          <button
            type="button"
            className="mn-btn"
            onClick={() => {
              if (currentStep === 2 && !title.trim()) {
                showToast(t('editor.needTitleFirst'));
                return;
              }
              setCurrentStep(currentStep + 1);
            }}
          >
            {t('editor.weiter')}
          </button>
        ) : null}

        <button type="button" className="mn-btn mn-btn--primary" onClick={handleSave}>
          {t(isEditing ? 'editor.saveChanges' : 'editor.createMedium')}
        </button>
      </div>
    </Overlay>
  );
};
