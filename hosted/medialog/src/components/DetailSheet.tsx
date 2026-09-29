import React, { useState } from 'react';
import { Overlay } from '../components/Overlay';
import { type ApiSearchResult, searchMediaApis, searchNextVolume } from '../services/mediaApis';
import type {
  BookChapter,
  BookVolume,
  ConsumptionLogEntry,
  Episode,
  GameAchievement,
  MediaItem,
  MediaList,
} from '../types';
import {
  formatDateDe,
  formatMinutes,
  generateMediaShareText,
  getKindLabel,
  getStatusLabel,
} from '../utils/text';
import { StarRating } from './StarRating';
import { showToast } from './Toast';

interface DetailSheetProps {
  item: MediaItem;
  lists: MediaList[];
  onClose: () => void;
  onEdit: (item: MediaItem) => void;
  onSave: (updatedItem: MediaItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenShareModal: (item: MediaItem) => void;
}

export const DetailSheet: React.FC<DetailSheetProps> = ({
  item,
  onClose,
  onEdit,
  onSave,
  onDelete,
  onOpenShareModal,
}) => {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  // Buchreihen State
  const initialVolumes: BookVolume[] =
    item.volumes && item.volumes.length > 0
      ? item.volumes
      : [
          {
            id: 'vol_1',
            volumeNumber: 1,
            title: item.title,
            cover: item.cover,
            totalPages: item.totalPages,
            currentPage: item.currentPage,
            status: item.status,
            rating: item.rating,
          },
        ];
  const [selectedVolumeId, setSelectedVolumeId] = useState<string>(initialVolumes[0].id);
  const [_isSearchingNextVolume, setIsSearchingNextVolume] = useState(false);

  // Dedicated Online Volume Search Modal State
  const [showVolumeSearchModal, setShowVolumeSearchModal] = useState(false);
  const [volumeSearchQuery, setVolumeSearchQuery] = useState('');
  const [volumeSearchResults, setVolumeSearchResults] = useState<ApiSearchResult[]>([]);
  const [isSearchingVolumeModal, setIsSearchingVolumeModal] = useState(false);
  const [targetVolumeNumber, setTargetVolumeNumber] = useState(1);

  const currentVolumeList = item.volumes && item.volumes.length > 0 ? item.volumes : initialVolumes;
  const selectedVolume =
    currentVolumeList.find((v) => v.id === selectedVolumeId) || currentVolumeList[0];

  // Activity logging state
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logAction, setLogAction] = useState('');
  const [logNote, setLogNote] = useState('');

  // Episode form state
  const [newEpTitle, setNewEpTitle] = useState('');
  const [newEpSeason, setNewEpSeason] = useState(item.currentSeason || 1);
  const [newEpNumber, setNewEpNumber] = useState((item.episodes?.length || 0) + 1);
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);

  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Open Online Volume Search Modal pre-filled with Series Name + Next Volume
  const handleOpenVolumeSearch = (targetNum?: number) => {
    const existing = item.volumes && item.volumes.length > 0 ? item.volumes : initialVolumes;
    const nextVolumeNumber = targetNum || existing.length + 1;
    const seriesName = item.seriesTitle || item.title;
    const initialQuery = `${seriesName} Band ${nextVolumeNumber}`;

    setTargetVolumeNumber(nextVolumeNumber);
    setVolumeSearchQuery(initialQuery);
    setShowVolumeSearchModal(true);
    setVolumeSearchResults([]);

    setIsSearchingVolumeModal(true);
    searchMediaApis(initialQuery, 'book', { category: 'book', sortBy: 'relevance' })
      .then((res) => {
        setVolumeSearchResults(res.results);
      })
      .catch(() => {})
      .finally(() => {
        setIsSearchingVolumeModal(false);
      });
  };

  const handlePerformVolumeModalSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!volumeSearchQuery.trim()) return;

    setIsSearchingVolumeModal(true);
    searchMediaApis(volumeSearchQuery.trim(), 'book', { category: 'book', sortBy: 'relevance' })
      .then((res) => {
        setVolumeSearchResults(res.results);
      })
      .catch(() => {})
      .finally(() => {
        setIsSearchingVolumeModal(false);
      });
  };

  const handleSelectVolumeSearchResult = async (res: ApiSearchResult) => {
    const existing = item.volumes && item.volumes.length > 0 ? item.volumes : initialVolumes;
    const seriesName = item.seriesTitle || item.title;

    const escaped = seriesName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cleanTitle = res.title.replace(new RegExp(`^${escaped}[:,-]?\\s*`, 'i'), '').trim();
    const newVolTitle = cleanTitle
      ? cleanTitle.toLowerCase().startsWith('band') || cleanTitle.toLowerCase().startsWith('vol')
        ? cleanTitle
        : `Band ${targetVolumeNumber}: ${cleanTitle}`
      : `Band ${targetVolumeNumber}`;

    const existingIndex = existing.findIndex((v) => v.volumeNumber === targetVolumeNumber);
    const newVol: BookVolume = {
      id: `vol_${Date.now()}_${targetVolumeNumber}`,
      volumeNumber: targetVolumeNumber,
      title: newVolTitle,
      cover: res.cover || item.cover,
      totalPages: res.totalPages,
      currentPage: 0,
      status: 'wishlist',
      year: res.year,
    };

    let updatedVolumes: BookVolume[];
    if (existingIndex >= 0) {
      updatedVolumes = existing.map((v, i) => (i === existingIndex ? newVol : v));
    } else {
      updatedVolumes = [...existing, newVol].sort((a, b) => a.volumeNumber - b.volumeNumber);
    }

    const updatedItem: MediaItem = {
      ...item,
      isBookSeries: true,
      seriesTitle: seriesName,
      volumes: updatedVolumes,
      totalVolumes: item.totalVolumes
        ? Math.max(item.totalVolumes, updatedVolumes.length)
        : updatedVolumes.length,
      updatedAt: new Date().toISOString(),
    };

    await onSave(updatedItem);
    setSelectedVolumeId(newVol.id);
    setShowVolumeSearchModal(false);
    showToast(`Band ${targetVolumeNumber} (${newVol.title}) zur Reihe hinzugefügt!`);
  };

  const handleAddAllRemainingVolumes = async () => {
    if (!item.totalVolumes || item.totalVolumes <= currentVolumeList.length) return;
    const existing = item.volumes && item.volumes.length > 0 ? item.volumes : initialVolumes;
    const seriesName = item.seriesTitle || item.title;
    const existingNums = new Set(existing.map((v) => v.volumeNumber));

    const newVols: BookVolume[] = [];
    for (let num = 1; num <= item.totalVolumes; num++) {
      if (!existingNums.has(num)) {
        newVols.push({
          id: `vol_${Date.now()}_${num}`,
          volumeNumber: num,
          title: `Band ${num}`,
          currentPage: 0,
          status: 'wishlist',
          cover: item.cover,
        });
      }
    }

    const updatedVolumes = [...existing, ...newVols].sort(
      (a, b) => a.volumeNumber - b.volumeNumber,
    );
    const updatedItem: MediaItem = {
      ...item,
      isBookSeries: true,
      seriesTitle: seriesName,
      volumes: updatedVolumes,
      totalVolumes: item.totalVolumes,
      updatedAt: new Date().toISOString(),
    };

    await onSave(updatedItem);
    showToast(
      `Alle restlichen ${newVols.length} Bände (bis Band ${item.totalVolumes}) automatisch angelegt!`,
    );
  };

  // Handle adding the next volume in a book/manga series
  const _handleSearchAndAddNextVolume = async () => {
    setIsSearchingNextVolume(true);
    const existing = item.volumes && item.volumes.length > 0 ? item.volumes : initialVolumes;
    const nextVolumeNumber = existing.length + 1;
    const seriesName = item.seriesTitle || item.title;

    try {
      const newVol = await searchNextVolume(seriesName, nextVolumeNumber);
      const updatedVolumes = [...existing, newVol];

      const updatedItem: MediaItem = {
        ...item,
        isBookSeries: true,
        seriesTitle: seriesName,
        volumes: updatedVolumes,
        totalVolumes: Math.max(item.totalVolumes || 0, nextVolumeNumber),
        updatedAt: new Date().toISOString(),
      };

      await onSave(updatedItem);
      setSelectedVolumeId(newVol.id);
      showToast(`Band ${nextVolumeNumber} zur Reihe „${seriesName}“ hinzugefügt!`);
    } catch (_err) {
      showToast(`Band ${nextVolumeNumber} konnte nicht geladen werden.`);
    } finally {
      setIsSearchingNextVolume(false);
    }
  };

  // Handle updating a single volume within a series
  const handleUpdateVolume = async (volId: string, updates: Partial<BookVolume>) => {
    const existing = item.volumes && item.volumes.length > 0 ? item.volumes : initialVolumes;
    const updatedVolumes = existing.map((v) => (v.id === volId ? { ...v, ...updates } : v));

    const updatedItem: MediaItem = {
      ...item,
      isBookSeries: true,
      volumes: updatedVolumes,
      updatedAt: new Date().toISOString(),
    };

    await onSave(updatedItem);
    showToast('Band aktualisiert');
  };

  // Quick rating update
  const handleRatingChange = async (newRating: number | undefined) => {
    const updated: MediaItem = {
      ...item,
      rating: newRating,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
    showToast(newRating ? `Bewertung auf ★ ${newRating}/10 gesetzt` : 'Bewertung entfernt');
  };

  // Quick page progress update
  const handlePageChange = async (delta: number) => {
    const current = item.currentPage || 0;
    const total = item.totalPages || 9999;
    const next = Math.max(0, Math.min(total, current + delta));
    const isDone = item.totalPages ? next >= item.totalPages : false;

    const updated: MediaItem = {
      ...item,
      currentPage: next,
      status: isDone ? 'done' : item.status === 'wishlist' ? 'active' : item.status,
      finished: isDone && !item.finished ? new Date().toISOString().slice(0, 10) : item.finished,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
    showToast(`Fortschritt: Seite ${next}${item.totalPages ? ` von ${item.totalPages}` : ''}`);
  };

  // Quick chapter increment
  const handleChapterChange = async (delta: number) => {
    const match = (item.currentChapter || '').match(/\d+/);
    const curNum = match ? parseInt(match[0], 10) : 0;
    const nextNum = Math.max(0, curNum + delta);
    const newChapterText = `Kapitel ${nextNum}`;

    const updated: MediaItem = {
      ...item,
      currentChapter: newChapterText,
      status: item.status === 'wishlist' ? 'active' : item.status,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
    showToast(`Fortschritt: ${newChapterText}`);
  };

  // Quick volume increment
  const handleVolumeChange = async (delta: number) => {
    const curVol = item.currentVolume || 1;
    const nextVol = Math.max(1, curVol + delta);

    const updated: MediaItem = {
      ...item,
      currentVolume: nextVol,
      status: item.status === 'wishlist' ? 'active' : item.status,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
    showToast(`Fortschritt: Band ${nextVol}`);
  };

  // Audiobook runtime increment
  const handleAudioMinutesChange = async (deltaMinutes: number) => {
    const current = item.audioCurrentMinutes || 0;
    const total = item.audioTotalMinutes || 99999;
    const next = Math.max(0, Math.min(total, current + deltaMinutes));
    const isDone = item.audioTotalMinutes ? next >= item.audioTotalMinutes : false;

    const updated: MediaItem = {
      ...item,
      audioCurrentMinutes: next,
      status: isDone ? 'done' : item.status === 'wishlist' ? 'active' : item.status,
      finished: isDone && !item.finished ? new Date().toISOString().slice(0, 10) : item.finished,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
    showToast(`Hörfortschritt: ${formatMinutes(next)}`);
  };

  // Toggle chapter read
  const handleToggleChapter = async (chapterId: string) => {
    let toggledChapter: BookChapter | undefined;
    const chapters = (item.chapters || []).map((ch) => {
      if (ch.id === chapterId) {
        const nextRead = !ch.read;
        toggledChapter = {
          ...ch,
          read: nextRead,
          readAt: nextRead ? new Date().toISOString() : undefined,
        };
        return toggledChapter;
      }
      return ch;
    });

    const readCount = chapters.filter((c) => c.read).length;
    const isAllRead = chapters.length > 0 && readCount === chapters.length;

    let consumptionLogs = item.consumptionLogs || [];
    if (toggledChapter?.read) {
      const today = new Date().toISOString().slice(0, 10);
      const newEntry: ConsumptionLogEntry = {
        id: `log_ch_${Date.now()}`,
        workId: item.id,
        workTitle: item.title,
        kind: item.kind,
        date: today,
        action: `${toggledChapter.title} gelesen`,
      };
      consumptionLogs = [newEntry, ...consumptionLogs];
    }

    const updated: MediaItem = {
      ...item,
      chapters,
      consumptionLogs,
      status: isAllRead ? 'done' : item.status === 'wishlist' ? 'active' : item.status,
      finished: isAllRead && !item.finished ? new Date().toISOString().slice(0, 10) : item.finished,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
  };

  // Toggle game achievement
  const handleToggleAchievement = async (achId: string) => {
    let toggledAch: GameAchievement | undefined;
    const achievements = (item.achievements || []).map((ach) => {
      if (ach.id === achId) {
        const nextUnlocked = !ach.unlocked;
        toggledAch = {
          ...ach,
          unlocked: nextUnlocked,
          unlockedAt: nextUnlocked ? new Date().toISOString() : undefined,
        };
        return toggledAch;
      }
      return ach;
    });

    let consumptionLogs = item.consumptionLogs || [];
    if (toggledAch?.unlocked) {
      const today = new Date().toISOString().slice(0, 10);
      const newEntry: ConsumptionLogEntry = {
        id: `log_ach_${Date.now()}`,
        workId: item.id,
        workTitle: item.title,
        kind: item.kind,
        date: today,
        action: `Erfolg freigeschaltet: „${toggledAch.title}“`,
      };
      consumptionLogs = [newEntry, ...consumptionLogs];
    }

    const updated: MediaItem = {
      ...item,
      achievements,
      consumptionLogs,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
    showToast('Erfolg aktualisiert');
  };

  // Toggle episode watched
  const handleToggleEpisode = async (epId: string) => {
    let toggledEp: Episode | undefined;
    const episodes = (item.episodes || []).map((ep) => {
      if (ep.id === epId) {
        const nextWatched = !ep.watched;
        toggledEp = {
          ...ep,
          watched: nextWatched,
          watchedAt: nextWatched ? new Date().toISOString() : undefined,
        };
        return toggledEp;
      }
      return ep;
    });

    const watchedCount = episodes.filter((e) => e.watched).length;
    const isAllDone = episodes.length > 0 && watchedCount === episodes.length;

    let consumptionLogs = item.consumptionLogs || [];
    if (toggledEp?.watched) {
      const today = new Date().toISOString().slice(0, 10);
      const newEntry: ConsumptionLogEntry = {
        id: `log_ep_${Date.now()}`,
        workId: item.id,
        workTitle: item.title,
        kind: item.kind,
        date: today,
        action: `Staffel ${toggledEp.season} Folge ${toggledEp.number}: „${toggledEp.title}“ geschaut`,
      };
      consumptionLogs = [newEntry, ...consumptionLogs];
    }

    const updated: MediaItem = {
      ...item,
      episodes,
      consumptionLogs,
      currentEpisode: watchedCount,
      status: isAllDone ? 'done' : item.status === 'wishlist' ? 'active' : item.status,
      finished: isAllDone && !item.finished ? new Date().toISOString().slice(0, 10) : item.finished,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
  };

  // Update episode details
  const handleUpdateEpisodeDetails = async (epId: string, rating?: number, notes?: string) => {
    const episodes = (item.episodes || []).map((ep) => {
      if (ep.id === epId) {
        return { ...ep, rating, notes };
      }
      return ep;
    });

    const updated: MediaItem = {
      ...item,
      episodes,
      updatedAt: new Date().toISOString(),
    };
    await onSave(updated);
    showToast('Episoden-Bewertung gespeichert');
  };

  // Add new episode
  const handleAddEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEpTitle.trim()) return;

    const newEp: Episode = {
      id: `ep_${Date.now()}`,
      season: Number(newEpSeason),
      number: Number(newEpNumber),
      title: newEpTitle.trim(),
      watched: false,
    };

    const episodes = [...(item.episodes || []), newEp];
    const updated: MediaItem = {
      ...item,
      episodes,
      totalEpisodes: episodes.length,
      updatedAt: new Date().toISOString(),
    };

    await onSave(updated);
    setNewEpTitle('');
    setNewEpNumber(episodes.length + 1);
    showToast(`Folge „${newEp.title}“ hinzugefügt`);
  };

  // Add consumption log entry with custom date
  const handleAddConsumptionLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logAction.trim()) return;

    const newLog: ConsumptionLogEntry = {
      id: `log_${Date.now()}`,
      workId: item.id,
      workTitle: item.title,
      kind: item.kind,
      date: logDate,
      action: logAction.trim(),
      progressNote: logNote.trim() || undefined,
    };

    const consumptionLogs = [newLog, ...(item.consumptionLogs || [])];
    const updated: MediaItem = {
      ...item,
      consumptionLogs,
      status: item.status === 'wishlist' ? 'active' : item.status,
      updatedAt: new Date().toISOString(),
    };

    await onSave(updated);
    setLogAction('');
    setLogNote('');
    setShowLogModal(false);
    showToast(`Aktivität für den ${formatDateDe(logDate)} geloggt`);
  };

  // Native share or clipboard copy
  const handleShareText = async () => {
    const text = generateMediaShareText(item);
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text });
        return;
      } catch (_err) {}
    }
    await navigator.clipboard.writeText(text);
    showToast('Eintragsdetails in die Zwischenablage kopiert');
  };

  const pctBook =
    item.currentPage && item.totalPages
      ? Math.min(100, Math.round((item.currentPage / item.totalPages) * 100))
      : 0;

  const pctAudio =
    item.audioCurrentMinutes && item.audioTotalMinutes
      ? Math.min(100, Math.round((item.audioCurrentMinutes / item.audioTotalMinutes) * 100))
      : 0;

  return (
    <>
      <Overlay onClose={onClose} labelledBy="detail-title" sheetClassName="mn-sheet">
        {/* Floating action bar */}
        <div className="mn-sheet-bar mn-sheet-bar--float">
          <button type="button" className="mn-icon-btn" onClick={onClose} aria-label="Schließen">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="mn-btn mn-btn--ghost"
              onClick={() => onOpenShareModal(item)}
              aria-label="Teilen & Drucken"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>Teilen</span>
            </button>
            <button type="button" className="mn-btn" onClick={() => onEdit(item)}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Bearbeiten</span>
            </button>
          </div>
        </div>

        {/* Hero image or initials */}
        {item.cover ? (
          <img src={item.cover} alt={item.title} className="mn-sheet-hero" itemProp="image" />
        ) : (
          <div className="mn-sheet-hero flex items-center justify-center text-5xl font-bold text-[var(--mn-accent-text)] bg-[var(--mn-accent-soft)]">
            {item.title.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="mn-sheet-body">
          {/* Header & Chips */}
          <header className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mn-chip mn-chip--plain" itemProp="genre">
                {getKindLabel(item.kind, item.bookSubtype)}
              </span>
              <span
                className={`mn-chip ${
                  item.status === 'active'
                    ? 'mn-chip--plain bg-[var(--mn-accent-soft)] text-[var(--mn-accent-text)]'
                    : item.status === 'done'
                      ? 'mn-chip--ok'
                      : item.status === 'wishlist'
                        ? 'mn-chip--warn'
                        : 'mn-chip--plain'
                }`}
              >
                {getStatusLabel(item.status, item.kind)}
              </span>
              {item.year && (
                <span className="mn-chip mn-chip--plain" itemProp="datePublished">
                  {item.year}
                </span>
              )}
              {item.genres.map((g) => (
                <span key={g} className="mn-chip mn-chip--plain" itemProp="keywords">
                  {g}
                </span>
              ))}
              {item.console && (
                <span className="mn-chip mn-chip--plain bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold">
                  🎮 Konsole: {item.console}
                </span>
              )}
              {item.isBookSeries && (
                <span className="mn-chip mn-chip--plain bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold">
                  📚 Buchreihe ({item.volumes?.length || 1} Bände)
                </span>
              )}
            </div>

            <h2 id="detail-title" className="mn-sheet-title" itemProp="name">
              {item.title}
            </h2>
            {item.originalTitle && item.englishTitle && item.title !== item.originalTitle && (
              <p className="text-xs text-[var(--mn-muted)] -mt-2">
                Originaltitel: <b>{item.originalTitle}</b> · Übersetzt: {item.englishTitle}
              </p>
            )}
            <p className="text-lg font-medium text-[var(--mn-muted)] -mt-1" itemProp="author">
              von {item.creator}
              {item.narrator ? ` · Gelesen von ${item.narrator}` : ''}
              {item.console ? ` · 🎮 Gespielt auf ${item.console}` : ''}
            </p>
          </header>

          <hr className="my-6 border-[var(--mn-line)]" />

          {/* 1-10 Star Rating Section */}
          <div className="mn-card mb-6">
            <h3 className="text-base font-bold mb-3 flex items-center justify-between">
              <span>Deine Bewertung</span>
              {item.rating ? (
                <span className="mn-chip mn-chip--plain font-bold">★ {item.rating} / 10</span>
              ) : null}
            </h3>
            <StarRating value={item.rating} onChange={handleRatingChange} />
          </div>

          {/* ACTIVITY LOGGING BUTTON WITH DATE */}
          <div className="mn-card mb-6 bg-[var(--mn-surface-2)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <b className="block text-sm">Konsum-Aktivität eintragen</b>
                <span className="text-xs text-[var(--mn-muted)]">
                  Halte fest, an welchem Tag du welche Kapitel, Folgen oder Seiten gelesen hast.
                </span>
              </div>
              <button
                type="button"
                className="mn-btn mn-btn--primary text-xs shrink-0"
                onClick={() => setShowLogModal(true)}
              >
                📅 Aktivität mit Datum loggen
              </button>
            </div>
          </div>

          {/* Audiobooks Progress & Chapters */}
          {item.kind === 'audiobook' && (
            <div className="mn-card mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold">Hörbuch-Fortschritt</h3>
                <span className="text-sm font-semibold mn-num text-[var(--mn-muted)]">
                  {formatMinutes(item.audioCurrentMinutes || 0)} von{' '}
                  {formatMinutes(item.audioTotalMinutes || 0)} ({pctAudio} %)
                </span>
              </div>

              {item.audioTotalMinutes && (
                <div className="mn-meter mb-4">
                  <i style={{ width: `${pctAudio}%` }} />
                </div>
              )}

              {/* Quick Audio time buttons */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <button
                  type="button"
                  className="mn-btn mn-btn--ghost text-xs"
                  onClick={() => handleAudioMinutesChange(-30)}
                  disabled={!item.audioCurrentMinutes || item.audioCurrentMinutes <= 0}
                >
                  −30 Min.
                </button>
                <button
                  type="button"
                  className="mn-btn text-xs"
                  onClick={() => handleAudioMinutesChange(15)}
                >
                  +15 Min.
                </button>
                <button
                  type="button"
                  className="mn-btn text-xs"
                  onClick={() => handleAudioMinutesChange(30)}
                >
                  +30 Min.
                </button>
                <button
                  type="button"
                  className="mn-btn mn-btn--primary text-xs"
                  onClick={() => handleAudioMinutesChange(60)}
                >
                  +1 Stunde
                </button>
              </div>

              {/* Audio Chapters list */}
              {item.chapters && item.chapters.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-[var(--mn-muted)] mb-2">
                    <span className="font-bold">
                      Kapitel & Tracks ({item.chapters.filter((c) => c.read).length}/
                      {item.chapters.length} gehört)
                    </span>
                    <button
                      type="button"
                      className="mn-link text-xs"
                      onClick={() => setShowChapters(!showChapters)}
                    >
                      {showChapters ? 'Einklappen' : 'Alle Kapitel anzeigen'}
                    </button>
                  </div>

                  {showChapters && (
                    <div className="grid gap-1.5 max-h-72 overflow-y-auto pr-1">
                      {item.chapters.map((ch) => (
                        <label
                          key={ch.id}
                          className="flex items-center justify-between p-2 bg-[var(--mn-surface)] rounded text-xs cursor-pointer border border-[var(--mn-line)]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={ch.read}
                              onChange={() => handleToggleChapter(ch.id)}
                            />
                            <span
                              className={
                                ch.read
                                  ? 'line-through text-[var(--mn-muted)] truncate'
                                  : 'truncate font-medium'
                              }
                            >
                              {ch.title}
                            </span>
                          </div>
                          {ch.durationMinutes && (
                            <span className="text-[var(--mn-muted)] font-mono ml-2 shrink-0">
                              {ch.durationMinutes} Min.
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Buchreihen-Manager & Volume-Navigator (Volume 1 zuerst!) */}
          {(item.isBookSeries ||
            (item.volumes && item.volumes.length > 0) ||
            ['Manga', 'Manhwa', 'Manhua', 'Comic', 'Light Novel'].includes(
              item.bookSubtype || '',
            )) && (
            <div className="mn-card mb-6 border-2 border-[var(--mn-accent-soft)]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <span>📚 Buchreihen-Manager: {item.seriesTitle || item.title}</span>
                    <span className="mn-chip mn-chip--plain text-xs">
                      {currentVolumeList.length} {currentVolumeList.length === 1 ? 'Band' : 'Bände'}
                    </span>
                  </h3>
                  <span className="text-xs text-[var(--mn-muted)]">
                    Band 1 wird zuerst angezeigt. Wähle einen Band aus, um dafür Fortschritt
                    einzutragen oder suche den nächsten Band per Knopfdruck online.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {item.totalVolumes &&
                  item.totalVolumes > 0 &&
                  currentVolumeList.length >= item.totalVolumes ? (
                    <span className="mn-chip mn-chip--plain text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                      ✓ Alle {item.totalVolumes} Bände der Reihe erfasst
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="mn-btn mn-btn--primary text-xs"
                        onClick={() => handleOpenVolumeSearch()}
                        title="Nächsten Band per Online-Suche gezielt suchen und auswählen"
                      >
                        + Nächstes Volume (Band {currentVolumeList.length + 1}
                        {item.totalVolumes ? ` von ${item.totalVolumes}` : ''}) online suchen
                      </button>

                      {item.totalVolumes && item.totalVolumes > currentVolumeList.length && (
                        <button
                          type="button"
                          className="mn-btn mn-btn--ghost text-xs"
                          onClick={handleAddAllRemainingVolumes}
                          title={`Alle restlichen Bände bis Band ${item.totalVolumes} automatisch anlegen`}
                        >
                          ⚡ Restliche Bände bis {item.totalVolumes} anlegen
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    className="mn-btn mn-btn--ghost text-xs"
                    onClick={() => {
                      const nextNum = currentVolumeList.length + 1;
                      const newVol: BookVolume = {
                        id: `vol_${Date.now()}`,
                        volumeNumber: nextNum,
                        title: `Band ${nextNum}`,
                        currentPage: 0,
                        status: 'wishlist',
                      };
                      const updatedVolumes = [...currentVolumeList, newVol];
                      onSave({
                        ...item,
                        isBookSeries: true,
                        seriesTitle: item.seriesTitle || item.title,
                        volumes: updatedVolumes,
                        totalVolumes: item.totalVolumes
                          ? Math.max(item.totalVolumes, updatedVolumes.length)
                          : updatedVolumes.length,
                        updatedAt: new Date().toISOString(),
                      });
                      setSelectedVolumeId(newVol.id);
                      showToast(`Band ${nextNum} manuell angelegt`);
                    }}
                  >
                    + Manuell
                  </button>
                </div>
              </div>

              {/* Volume Selection Buttons (Volume 1 is first!) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-thin">
                {currentVolumeList.map((vol) => {
                  const isSelected = vol.id === selectedVolumeId;
                  const isDone =
                    vol.status === 'done' ||
                    (vol.totalPages && vol.currentPage && vol.currentPage >= vol.totalPages);
                  return (
                    <button
                      key={vol.id}
                      type="button"
                      className={`p-2.5 rounded-xl text-left border shrink-0 transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-[var(--mn-accent)] bg-[var(--mn-accent-soft)] shadow-sm'
                          : 'border-[var(--mn-line)] bg-[var(--mn-surface)] hover:bg-[var(--mn-surface-2)]'
                      }`}
                      style={{ minWidth: '135px' }}
                      onClick={() => setSelectedVolumeId(vol.id)}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-xs text-[var(--mn-ink)]">
                          Band {vol.volumeNumber}
                        </span>
                        {isDone ? (
                          <span className="text-[10px] text-[var(--mn-ok)] font-bold">
                            ✓ Gelesen
                          </span>
                        ) : vol.status === 'active' ? (
                          <span className="text-[10px] text-[var(--mn-accent-text)] font-semibold">
                            Am Lesen
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--mn-muted)]">Wunschliste</span>
                        )}
                      </div>
                      <span className="block text-[11px] text-[var(--mn-muted)] truncate max-w-[125px]">
                        {vol.title}
                      </span>
                      <div className="text-[10px] text-[var(--mn-muted)] mt-1 font-mono">
                        {vol.currentPage || 0} / {vol.totalPages || '?'} S.
                        {vol.rating ? ` · ★ ${vol.rating}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Volume Detail & Entry Logger */}
              {selectedVolume && (
                <div className="p-3.5 bg-[var(--mn-surface)] rounded-xl border border-[var(--mn-line)] grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] text-[var(--mn-accent-text)] font-bold uppercase tracking-wider block">
                        Ausgewählt für Eintrag:
                      </span>
                      <h4 className="text-sm sm:text-base font-bold text-[var(--mn-ink)]">
                        Band {selectedVolume.volumeNumber}: {selectedVolume.title}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedVolume.status || 'wishlist'}
                        onChange={(e) =>
                          handleUpdateVolume(selectedVolume.id, {
                            status: e.target.value as any,
                            finished:
                              e.target.value === 'done'
                                ? new Date().toISOString().slice(0, 10)
                                : undefined,
                          })
                        }
                        className="text-xs p-1.5 border rounded"
                      >
                        <option value="wishlist">Wunschliste</option>
                        <option value="active">Am Lesen</option>
                        <option value="done">Gelesen (Beendet)</option>
                      </select>
                      <select
                        value={selectedVolume.rating || ''}
                        onChange={(e) =>
                          handleUpdateVolume(selectedVolume.id, {
                            rating: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="text-xs p-1.5 border rounded"
                      >
                        <option value="">Bewertung ...</option>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            ★ {n} / 10
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Volume Progress Bar */}
                  {selectedVolume.totalPages && (
                    <div>
                      <div className="flex justify-between text-xs text-[var(--mn-muted)] mb-1">
                        <span>Seiten-Fortschritt</span>
                        <span className="font-mono">
                          {selectedVolume.currentPage || 0} von {selectedVolume.totalPages} Seiten (
                          {Math.round(
                            ((selectedVolume.currentPage || 0) / selectedVolume.totalPages) * 100,
                          )}{' '}
                          %)
                        </span>
                      </div>
                      <div className="mn-meter">
                        <i
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                ((selectedVolume.currentPage || 0) / selectedVolume.totalPages) *
                                  100,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Quick actions for this volume */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--mn-line)]">
                    <span className="text-xs font-semibold text-[var(--mn-muted)] mr-1">
                      Aktionen für Band {selectedVolume.volumeNumber}:
                    </span>
                    <button
                      type="button"
                      className="mn-btn text-xs"
                      onClick={() => {
                        const cur = selectedVolume.currentPage || 0;
                        const tot = selectedVolume.totalPages;
                        const next = tot ? Math.min(tot, cur + 10) : cur + 10;
                        handleUpdateVolume(selectedVolume.id, {
                          currentPage: next,
                          status: tot && next >= tot ? 'done' : 'active',
                        });
                      }}
                    >
                      +10 S.
                    </button>
                    <button
                      type="button"
                      className="mn-btn text-xs"
                      onClick={() => {
                        const cur = selectedVolume.currentPage || 0;
                        const tot = selectedVolume.totalPages;
                        const next = tot ? Math.min(tot, cur + 25) : cur + 25;
                        handleUpdateVolume(selectedVolume.id, {
                          currentPage: next,
                          status: tot && next >= tot ? 'done' : 'active',
                        });
                      }}
                    >
                      +25 S.
                    </button>
                    <button
                      type="button"
                      className="mn-btn mn-btn--ok text-xs"
                      onClick={() => {
                        handleUpdateVolume(selectedVolume.id, {
                          currentPage: selectedVolume.totalPages ?? selectedVolume.currentPage,
                          status: 'done',
                          finished: new Date().toISOString().slice(0, 10),
                        });
                      }}
                    >
                      ✓ Band fertig gelesen
                    </button>
                    <button
                      type="button"
                      className="mn-btn mn-btn--primary text-xs ml-auto"
                      onClick={() => {
                        setLogAction(
                          `Band ${selectedVolume.volumeNumber} (${selectedVolume.title}) gelesen`,
                        );
                        setShowLogModal(true);
                      }}
                    >
                      📅 Eintrag für Band {selectedVolume.volumeNumber} loggen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Book / Manga / Manhwa Progress Section */}
          {item.kind === 'book' && (
            <div className="mn-card mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold">
                  {item.bookSubtype ? `${item.bookSubtype}-Fortschritt` : 'Lesefortschritt'}
                </h3>
                <span className="text-sm font-semibold mn-num text-[var(--mn-muted)]">
                  {item.currentChapter ||
                    (item.currentPage ? `Seite ${item.currentPage}` : 'Nicht begonnen')}
                  {item.currentVolume ? ` · Band ${item.currentVolume}` : ''}
                </span>
              </div>

              {item.totalPages && (
                <div className="mn-meter mb-4">
                  <i style={{ width: `${pctBook}%` }} />
                </div>
              )}

              {/* Chapter & Volume quick buttons */}
              <div className="p-3 bg-[var(--mn-surface-2)] rounded-xl mb-4 grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--mn-muted)]">
                    Kapitel-Tracking:
                  </span>
                  <span className="text-sm font-bold text-[var(--mn-ink)]">
                    {item.currentChapter || 'Noch kein Kapitel eingetragen'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="mn-btn mn-btn--ghost text-xs"
                    onClick={() => handleChapterChange(-1)}
                  >
                    −1 Kap.
                  </button>
                  <button
                    type="button"
                    className="mn-btn mn-btn--primary text-xs"
                    onClick={() => handleChapterChange(1)}
                  >
                    +1 Kapitel
                  </button>
                  <button
                    type="button"
                    className="mn-btn text-xs"
                    onClick={() => handleChapterChange(5)}
                  >
                    +5 Kap.
                  </button>
                  <button
                    type="button"
                    className="mn-btn text-xs"
                    onClick={() => handleChapterChange(10)}
                  >
                    +10 Kap.
                  </button>
                </div>

                {/* Volumes if Manga / Comic */}
                {['Manga', 'Manhwa', 'Manhua', 'Comic', 'Light Novel'].includes(
                  item.bookSubtype || '',
                ) && (
                  <div className="pt-2 mt-1 border-t border-[var(--mn-line)] flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--mn-muted)]">Band / Volume:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold mr-1">
                        Band {item.currentVolume || 1}
                        {item.totalVolumes ? ` von ${item.totalVolumes}` : ''}
                      </span>
                      <button
                        type="button"
                        className="mn-btn mn-btn--ghost text-xs"
                        onClick={() => handleVolumeChange(-1)}
                        disabled={!item.currentVolume || item.currentVolume <= 1}
                      >
                        −1 Bd.
                      </button>
                      <button
                        type="button"
                        className="mn-btn text-xs"
                        onClick={() => handleVolumeChange(1)}
                      >
                        +1 Band
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Named Chapters List if available */}
              {item.chapters && item.chapters.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-[var(--mn-muted)] mb-2">
                    <span className="font-bold">
                      Kapitelübersicht ({item.chapters.filter((c) => c.read).length}/
                      {item.chapters.length} gelesen)
                    </span>
                    <button
                      type="button"
                      className="mn-link text-xs"
                      onClick={() => setShowChapters(!showChapters)}
                    >
                      {showChapters ? 'Einklappen' : 'Alle Kapitel auflisten'}
                    </button>
                  </div>

                  {showChapters && (
                    <div className="grid gap-1.5 max-h-64 overflow-y-auto pr-1">
                      {item.chapters.map((ch) => (
                        <label
                          key={ch.id}
                          className="flex items-center gap-2 p-2 bg-[var(--mn-surface)] rounded text-xs cursor-pointer border border-[var(--mn-line)]"
                        >
                          <input
                            type="checkbox"
                            checked={ch.read}
                            onChange={() => handleToggleChapter(ch.id)}
                          />
                          <span
                            className={
                              ch.read ? 'line-through text-[var(--mn-muted)]' : 'font-medium'
                            }
                          >
                            {ch.title}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Page buttons */}
              {item.totalPages && (
                <div>
                  <span className="block text-xs font-semibold text-[var(--mn-muted)] mb-2">
                    Seitenzahlen:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="mn-btn mn-btn--ghost text-sm"
                      onClick={() => handlePageChange(-10)}
                      disabled={!item.currentPage || item.currentPage <= 0}
                    >
                      −10 S.
                    </button>
                    <button
                      type="button"
                      className="mn-btn mn-btn--ghost text-sm"
                      onClick={() => handlePageChange(-1)}
                      disabled={!item.currentPage || item.currentPage <= 0}
                    >
                      −1 S.
                    </button>
                    <button
                      type="button"
                      className="mn-btn text-sm"
                      onClick={() => handlePageChange(1)}
                    >
                      +1 S.
                    </button>
                    <button
                      type="button"
                      className="mn-btn text-sm"
                      onClick={() => handlePageChange(5)}
                    >
                      +5 S.
                    </button>
                    <button
                      type="button"
                      className="mn-btn mn-btn--primary text-sm"
                      onClick={() => handlePageChange(10)}
                    >
                      +10 S.
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Series Episode Tracker & Season Breakdown */}
          {item.kind === 'series' && (
            <div className="mn-card mb-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-base font-bold">Serien-Fortschritt & Staffeln</h3>
                  {item.seasonDetails && item.seasonDetails.length > 0 && (
                    <span className="text-xs text-[var(--mn-muted)]">
                      {item.seasonDetails
                        .map((s) => `${s.name}: ${s.episodeCount} Folgen`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold mn-num text-[var(--mn-muted)]">
                  Staffel {item.currentSeason || 1}, Folge {item.currentEpisode || 1}
                </span>
              </div>

              {item.episodes && item.episodes.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between text-xs text-[var(--mn-muted)] mb-3">
                    <span>
                      {item.episodes.filter((e) => e.watched).length} von {item.episodes.length}{' '}
                      Folgen gesehen
                    </span>
                    <button
                      type="button"
                      className="mn-link text-xs"
                      onClick={() => setShowEpisodes(!showEpisodes)}
                    >
                      {showEpisodes
                        ? 'Episodenliste einklappen'
                        : 'Alle Folgen mit Titeln anzeigen'}
                    </button>
                  </div>

                  {showEpisodes && (
                    <div className="grid gap-2 mt-3 max-h-96 overflow-y-auto pr-1">
                      {item.episodes.map((ep) => (
                        <div
                          key={ep.id}
                          className="p-3 bg-[var(--mn-surface-2)] rounded-lg text-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <label className="flex items-center gap-3 font-semibold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={ep.watched}
                                onChange={() => handleToggleEpisode(ep.id)}
                              />
                              <span
                                className={ep.watched ? 'line-through text-[var(--mn-muted)]' : ''}
                              >
                                S{ep.season}E{ep.number}: {ep.title}
                              </span>
                            </label>
                            {ep.rating && (
                              <span className="mn-chip mn-chip--plain text-xs font-bold shrink-0">
                                ★ {ep.rating}/10
                              </span>
                            )}
                          </div>

                          {ep.notes && (
                            <p className="mt-1 text-xs text-[var(--mn-muted)] pl-8">{ep.notes}</p>
                          )}

                          {editingEpisodeId === ep.id ? (
                            <div className="mt-2 pl-8 pt-2 border-t border-[var(--mn-line)] grid gap-2">
                              <label className="text-xs font-semibold text-[var(--mn-muted)]">
                                Episoden-Bewertung (1–10)
                                <select
                                  value={ep.rating || ''}
                                  onChange={(e) =>
                                    handleUpdateEpisodeDetails(
                                      ep.id,
                                      e.target.value ? Number(e.target.value) : undefined,
                                      ep.notes,
                                    )
                                  }
                                  className="mt-1 text-xs p-1"
                                >
                                  <option value="">Keine Bewertung</option>
                                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>
                                      ★ {n} von 10
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="text-xs font-semibold text-[var(--mn-muted)]">
                                Episoden-Notiz
                                <input
                                  type="text"
                                  defaultValue={ep.notes || ''}
                                  placeholder="Deine Notizen zu dieser Folge ..."
                                  onBlur={(e) =>
                                    handleUpdateEpisodeDetails(ep.id, ep.rating, e.target.value)
                                  }
                                  className="mt-1 text-xs"
                                />
                              </label>
                              <button
                                type="button"
                                className="mn-btn mn-btn--ghost text-xs justify-self-start"
                                onClick={() => setEditingEpisodeId(null)}
                              >
                                Fertig
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="mn-link text-xs ml-8 mt-1 block"
                              onClick={() => setEditingEpisodeId(ep.id)}
                            >
                              Folge bewerten / Notiz schreiben
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--mn-muted)] mb-3">
                  Noch keine Einzelfolgen hinterlegt. Du kannst Folgen hinzufügen:
                </p>
              )}

              {/* Add episode form */}
              <form
                onSubmit={handleAddEpisode}
                className="mt-4 pt-4 border-t border-[var(--mn-line)] grid gap-2"
              >
                <div className="grid grid-cols-4 gap-2">
                  <label className="mn-field">
                    Staffel
                    <input
                      type="number"
                      min="1"
                      value={newEpSeason}
                      onChange={(e) => setNewEpSeason(Number(e.target.value))}
                    />
                  </label>
                  <label className="mn-field">
                    Folge
                    <input
                      type="number"
                      min="1"
                      value={newEpNumber}
                      onChange={(e) => setNewEpNumber(Number(e.target.value))}
                    />
                  </label>
                  <label className="mn-field col-span-2">
                    Titel der Folge
                    <input
                      type="text"
                      placeholder="z. B. Der Anfang"
                      value={newEpTitle}
                      onChange={(e) => setNewEpTitle(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="mn-btn mn-btn--ghost text-xs justify-self-end mt-1"
                  disabled={!newEpTitle.trim()}
                >
                  + Folge anlegen
                </button>
              </form>
            </div>
          )}

          {/* Videogames Achievements Section */}
          {item.kind === 'game' && (
            <div className="mn-card mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-[var(--mn-line)]">
                <div>
                  <span className="text-xs text-[var(--mn-muted)] block">
                    Gespielt auf Konsole / Plattform:
                  </span>
                  <span className="text-sm font-bold text-[var(--mn-ink)] flex items-center gap-1.5">
                    🎮 {item.console || item.platform || 'Nicht angegeben'}
                  </span>
                </div>
                {item.hoursPlayed !== undefined && (
                  <div className="text-right">
                    <span className="text-xs text-[var(--mn-muted)] block">
                      Erfasste Spielzeit:
                    </span>
                    <span className="text-sm font-bold text-[var(--mn-ink)]">
                      ⏱ {item.hoursPlayed} Stunden
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-base font-bold">Erfolge & Trophäen</h3>
                  {item.achievements && (
                    <span className="text-xs text-[var(--mn-muted)]">
                      {item.achievements.filter((a) => a.unlocked).length} von{' '}
                      {item.achievements.length} freigeschaltet
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="mn-link text-xs"
                  onClick={() => setShowAchievements(!showAchievements)}
                >
                  {showAchievements ? 'Einklappen' : 'Achievements anzeigen'}
                </button>
              </div>

              {showAchievements && item.achievements && (
                <div className="grid gap-2 mt-3">
                  {item.achievements.map((ach) => (
                    <div
                      key={ach.id}
                      className={`p-3 rounded-lg border flex items-center justify-between gap-3 text-xs ${
                        ach.unlocked
                          ? 'bg-[var(--mn-ok-soft)] border-[var(--mn-ok)]'
                          : 'bg-[var(--mn-surface-2)] border-[var(--mn-line)] opacity-70'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-base">{ach.unlocked ? '🏆' : '🔒'}</span>
                        <div>
                          <b className="block text-sm text-[var(--mn-ink)]">{ach.title}</b>
                          {ach.description && (
                            <span className="text-[var(--mn-muted)]">{ach.description}</span>
                          )}
                          {ach.unlockedAt && (
                            <span className="block text-[10px] text-[var(--mn-ok)] mt-0.5">
                              Freigeschaltet am {formatDateDe(ach.unlockedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`mn-btn text-xs ${ach.unlocked ? 'mn-btn--primary' : 'mn-btn--ghost'}`}
                        onClick={() => handleToggleAchievement(ach.id)}
                      >
                        {ach.unlocked ? '✓ Erreicht' : 'Freischalten'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Consumption History Log List */}
          {item.consumptionLogs && item.consumptionLogs.length > 0 && (
            <div className="mn-card mb-6">
              <h3 className="text-base font-bold mb-3">Protokollierte Konsum-Tage</h3>
              <div className="grid gap-2 text-xs">
                {item.consumptionLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 bg-[var(--mn-surface-2)] rounded flex items-center justify-between"
                  >
                    <div>
                      <b className="text-[var(--mn-accent-text)]">{formatDateDe(log.date)}</b>
                      <span className="ml-2 font-medium text-[var(--mn-ink)]">{log.action}</span>
                      {log.progressNote && (
                        <span className="block text-[var(--mn-muted)] mt-0.5">
                          {log.progressNote}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes and Facts */}
          <div className="mn-card mb-6">
            <h3 className="text-base font-bold mb-3">Informationen & Notizen</h3>
            <dl className="mn-facts">
              <div>
                <dt>Urheber</dt>
                <dd>{item.creator}</dd>
              </div>
              {item.narrator && (
                <div>
                  <dt>Sprecher</dt>
                  <dd>{item.narrator}</dd>
                </div>
              )}
              {item.year && (
                <div>
                  <dt>Erschienen</dt>
                  <dd>{item.year}</dd>
                </div>
              )}
              {item.started && (
                <div>
                  <dt>Begonnen</dt>
                  <dd>{formatDateDe(item.started)}</dd>
                </div>
              )}
              {item.finished && (
                <div>
                  <dt>Beendet</dt>
                  <dd>{formatDateDe(item.finished)}</dd>
                </div>
              )}
              {item.notes && (
                <div>
                  <dt>Notizen</dt>
                  <dd className="whitespace-pre-wrap">{item.notes}</dd>
                </div>
              )}
              {item.sharedWith && item.sharedWith.length > 0 && (
                <div>
                  <dt>Geteilt mit</dt>
                  <dd>{(item.sharedWithNames ?? item.sharedWith).join(', ')}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Quick Share action button */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              type="button"
              className="mn-btn mn-btn--primary flex-1"
              onClick={() => onOpenShareModal(item)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>Teilen & Drucken</span>
            </button>
            <button type="button" className="mn-btn" onClick={handleShareText}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Text kopieren</span>
            </button>
          </div>

          {/* Destructive Delete Button */}
          <div className="pt-4 border-t border-[var(--mn-line)] flex items-center justify-between">
            <span className="text-xs text-[var(--mn-muted)]">
              Zuletzt aktualisiert: {formatDateDe(item.updatedAt)}
            </span>
            <button
              type="button"
              className="mn-btn mn-btn--danger text-sm"
              onClick={async () => {
                if (!deleteConfirm) {
                  setDeleteConfirm(true);
                  setTimeout(() => setDeleteConfirm(false), 4000);
                } else {
                  await onDelete(item.id);
                  onClose();
                  showToast('Medium gelöscht');
                }
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>{deleteConfirm ? 'Zum Löschen erneut tippen' : 'Löschen'}</span>
            </button>
          </div>
        </div>
      </Overlay>

      {/* Modal: Activity Log with Date */}
      {showLogModal && (
        <Overlay onClose={() => setShowLogModal(false)} labelledBy="log-title">
          <div className="mn-sheet-bar">
            <button
              type="button"
              className="mn-btn mn-btn--ghost"
              onClick={() => setShowLogModal(false)}
            >
              Abbrechen
            </button>
            <h2 id="log-title">Konsum-Aktivität eintragen</h2>
            <span />
          </div>

          <form onSubmit={handleAddConsumptionLog} className="mn-sheet-body mn-form">
            <fieldset>
              <label className="mn-field">
                Wann hast du dieses Werk konsumiert / gelesen? *
                <input
                  type="date"
                  required
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                />
              </label>

              <label className="mn-field">
                Was hast du gemacht? *
                <input
                  type="text"
                  required
                  placeholder="z. B. Kapitel 4 gelesen, Staffel 2 Folge 3 geschaut, 45 Min. gehört"
                  value={logAction}
                  onChange={(e) => setLogAction(e.target.value)}
                />
              </label>

              <label className="mn-field">
                Eindrücke / Notizen zu dieser Sitzung (optional)
                <textarea
                  rows={3}
                  placeholder="Wichtige Szene, Gedanken oder Zitate ..."
                  value={logNote}
                  onChange={(e) => setLogNote(e.target.value)}
                />
              </label>
            </fieldset>

            <button type="submit" className="mn-btn mn-btn--primary w-full mt-4">
              Aktivität speichern
            </button>
          </form>
        </Overlay>
      )}

      {/* Online Volume Search Modal Dialog */}
      {showVolumeSearchModal && (
        <Overlay
          onClose={() => setShowVolumeSearchModal(false)}
          labelledBy="volume-search-title"
          sheetClassName="mn-sheet max-w-lg"
        >
          <div className="mn-sheet-bar">
            <button
              type="button"
              className="mn-btn mn-btn--ghost"
              onClick={() => setShowVolumeSearchModal(false)}
            >
              Abbrechen
            </button>
            <h2 id="volume-search-title">Band {targetVolumeNumber} online suchen</h2>
            <span />
          </div>

          <div className="mn-sheet-body grid gap-4 p-4">
            <p className="text-xs text-[var(--mn-muted)]">
              Suche in Google Books, MangaDex, Open Library und Jikan nach Band {targetVolumeNumber}{' '}
              der Reihe <b>„{item.seriesTitle || item.title}“</b>:
            </p>

            <form onSubmit={handlePerformVolumeModalSearch} className="flex gap-2">
              <div className="mn-search flex-1">
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
                  value={volumeSearchQuery}
                  onChange={(e) => setVolumeSearchQuery(e.target.value)}
                  placeholder="Suchbegriff für diesen Band ..."
                />
              </div>
              <button
                type="submit"
                className="mn-btn mn-btn--primary text-xs"
                disabled={isSearchingVolumeModal || !volumeSearchQuery.trim()}
              >
                {isSearchingVolumeModal ? 'Sucht ...' : 'Suchen'}
              </button>
            </form>

            {/* Loading State */}
            {isSearchingVolumeModal && (
              <div className="p-8 text-center text-xs text-[var(--mn-muted)] flex items-center justify-center gap-2">
                <svg
                  aria-hidden="true"
                  className="animate-spin w-4 h-4 text-[var(--mn-accent)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                </svg>
                <span>Band-Datenbanken werden durchsucht ...</span>
              </div>
            )}

            {/* Results List */}
            {!isSearchingVolumeModal && volumeSearchResults.length > 0 && (
              <div className="grid gap-2 max-h-[360px] overflow-y-auto pr-1">
                <span className="text-xs font-bold text-[var(--mn-muted)]">
                  Gefundene Ausgaben & Bände:
                </span>
                {volumeSearchResults.map((res) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the whole card is a mouse shortcut for its own button
                  // biome-ignore lint/a11y/noStaticElementInteractions: see above
                  <div
                    key={res.id}
                    className="p-3 bg-[var(--mn-surface-2)] rounded-xl border border-[var(--mn-line)] flex items-center justify-between gap-3 hover:border-[var(--mn-accent)] transition-colors cursor-pointer"
                    onClick={() => handleSelectVolumeSearchResult(res)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {res.cover ? (
                        <img
                          src={res.cover}
                          alt=""
                          className="w-10 h-14 object-cover rounded shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-[var(--mn-accent-soft)] text-[var(--mn-accent-text)] font-bold flex items-center justify-center rounded shrink-0 text-xs">
                          #{targetVolumeNumber}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="block font-bold text-sm text-[var(--mn-ink)] truncate">
                          {res.title}
                        </span>
                        <span className="block text-xs text-[var(--mn-muted)] truncate">
                          {[
                            res.creator,
                            res.year ? `(${res.year})` : '',
                            res.totalPages ? `${res.totalPages} Seiten` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {res.attribution && (
                          <span className="mn-chip mn-chip--plain text-[10px] py-0 px-1 mt-1">
                            {res.attribution}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="mn-btn mn-btn--primary text-xs shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectVolumeSearchResult(res);
                      }}
                    >
                      Übernehmen
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isSearchingVolumeModal && volumeSearchResults.length === 0 && (
              <div className="p-4 bg-[var(--mn-surface-2)] rounded-xl text-center text-xs text-[var(--mn-muted)]">
                <span>Keine genauen Online-Treffer für „{volumeSearchQuery}“ gefunden.</span>
              </div>
            )}

            {/* Fallback Action */}
            <div className="pt-2 border-t border-[var(--mn-line)] flex justify-end gap-2">
              <button
                type="button"
                className="mn-btn mn-btn--ghost text-xs"
                onClick={() => {
                  const existing =
                    item.volumes && item.volumes.length > 0 ? item.volumes : initialVolumes;
                  const newVol: BookVolume = {
                    id: `vol_${Date.now()}_${targetVolumeNumber}`,
                    volumeNumber: targetVolumeNumber,
                    title: `Band ${targetVolumeNumber}`,
                    currentPage: 0,
                    status: 'wishlist',
                    cover: item.cover,
                  };
                  const updatedVolumes = [...existing, newVol].sort(
                    (a, b) => a.volumeNumber - b.volumeNumber,
                  );
                  onSave({
                    ...item,
                    isBookSeries: true,
                    seriesTitle: item.seriesTitle || item.title,
                    volumes: updatedVolumes,
                    totalVolumes: item.totalVolumes
                      ? Math.max(item.totalVolumes, updatedVolumes.length)
                      : updatedVolumes.length,
                    updatedAt: new Date().toISOString(),
                  });
                  setSelectedVolumeId(newVol.id);
                  setShowVolumeSearchModal(false);
                  showToast(`Band ${targetVolumeNumber} als Standard-Band angelegt`);
                }}
              >
                + Als Standard Band {targetVolumeNumber} anlegen
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
};
