/**
 * Utility helpers for text processing, German formatting,
 * accent-insensitive search, and share text generation.
 */

import type { MediaItem, MediaList } from '../types';

/**
 * Normalizes text for accent-insensitive and case-insensitive comparison
 */
export function normalizeSearchString(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de')
    .trim();
}

/**
 * Checks if search text matches any of the item's key fields
 */
export function matchesSearch(item: MediaItem, query: string): boolean {
  if (!query) return true;
  const q = normalizeSearchString(query);
  if (!q) return true;

  const title = normalizeSearchString(item.title);
  const creator = normalizeSearchString(item.creator);
  const narrator = normalizeSearchString(item.narrator || '');
  const notes = normalizeSearchString(item.notes || '');
  const subtype = normalizeSearchString(item.bookSubtype || '');
  const genres = item.genres.map(normalizeSearchString).join(' ');
  const tags = item.tags.map(normalizeSearchString).join(' ');
  const chapter = normalizeSearchString(item.currentChapter || '');
  const chapterTitles = (item.chapters || []).map((c) => normalizeSearchString(c.title)).join(' ');
  const achievements = (item.achievements || [])
    .map((a) => normalizeSearchString(a.title))
    .join(' ');

  return (
    title.includes(q) ||
    creator.includes(q) ||
    narrator.includes(q) ||
    notes.includes(q) ||
    subtype.includes(q) ||
    genres.includes(q) ||
    tags.includes(q) ||
    chapter.includes(q) ||
    chapterTitles.includes(q) ||
    achievements.includes(q)
  );
}

/**
 * German label for MediaKind and BookSubtype
 */
export function getKindLabel(kind: string, subtype?: string): string {
  if (kind === 'audiobook') {
    return 'Hörbuch';
  }
  if (kind === 'book') {
    if (subtype && subtype !== 'Roman') {
      return `${subtype}`;
    }
    return subtype || 'Buch';
  }
  switch (kind) {
    case 'film':
      return 'Film';
    case 'series':
      return 'Serie';
    case 'game':
      return 'Spiel';
    case 'collection':
      return 'Sammlung';
    default:
      return 'Medium';
  }
}

/**
 * German label for MediaStatus
 */
export function getStatusLabel(status: string, kind = 'book'): string {
  switch (status) {
    case 'active':
      if (kind === 'book') return 'Am Lesen';
      if (kind === 'audiobook') return 'Am Hören';
      if (kind === 'film' || kind === 'series') return 'Am Schauen';
      if (kind === 'game') return 'Am Spielen';
      return 'Aktiv';
    case 'wishlist':
      return 'Wunschliste';
    case 'done':
      if (kind === 'book') return 'Gelesen';
      if (kind === 'audiobook') return 'Gehört';
      if (kind === 'film' || kind === 'series') return 'Gesehen';
      if (kind === 'game') return 'Durchgespielt';
      return 'Beendet';
    case 'dropped':
      return 'Pausiert';
    default:
      return status;
  }
}

/**
 * German date formatting
 */
export function formatDateDe(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Format minutes into readable German duration (e.g. 14 Std. 20 Min.)
 */
export function formatMinutes(totalMinutes?: number): string {
  if (!totalMinutes || totalMinutes <= 0) return '0 Min.';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h} Std. ${m} Min.`;
  if (h > 0) return `${h} Std.`;
  return `${m} Min.`;
}

/**
 * Get progress summary text
 */
export function getProgressSummary(item: MediaItem): string {
  if (item.kind === 'audiobook') {
    if (item.audioTotalMinutes) {
      const cur = item.audioCurrentMinutes || 0;
      const pct = Math.round((cur / item.audioTotalMinutes) * 100);
      const ch = item.currentChapter ? ` (${item.currentChapter})` : '';
      return `${formatMinutes(cur)} / ${formatMinutes(item.audioTotalMinutes)}${ch} · ${pct} %`;
    }
    if (item.currentChapter) return item.currentChapter;
    return 'Hörbuch';
  }

  if (item.kind === 'book') {
    const isComicOrManga = ['Manga', 'Manhwa', 'Manhua', 'Comic'].includes(item.bookSubtype || '');

    // For Manga/Manhwa/Manhua: Chapter and Volume priority
    if (isComicOrManga) {
      const parts: string[] = [];
      if (item.currentChapter) parts.push(item.currentChapter);
      if (item.currentVolume) parts.push(`Band ${item.currentVolume}`);
      if (item.currentPage && item.totalPages) {
        parts.push(`S. ${item.currentPage}/${item.totalPages}`);
      }
      if (parts.length > 0) return parts.join(' · ');
    }

    if (item.currentPage && item.totalPages) {
      const pct = Math.round((item.currentPage / item.totalPages) * 100);
      const ch = item.currentChapter ? ` (${item.currentChapter})` : '';
      return `S. ${item.currentPage}/${item.totalPages}${ch} · ${pct} %`;
    }
    if (item.currentChapter) return item.currentChapter;
    if (item.currentPage) return `Seite ${item.currentPage}`;
    if (item.currentVolume) return `Band ${item.currentVolume}`;
  }

  if (item.kind === 'series') {
    const s = item.currentSeason ?? 1;
    const ep = item.currentEpisode ?? 1;
    const epCount = item.episodes
      ? ` (${item.episodes.filter((e) => e.watched).length}/${item.episodes.length})`
      : '';
    return `Staffel ${s}, Folge ${ep}${epCount}`;
  }

  if (item.kind === 'game') {
    const parts: string[] = [];
    if (item.hoursPlayed) parts.push(`${item.hoursPlayed} Std. gespielt`);
    if (item.achievements && item.achievements.length > 0) {
      const unlocked = item.achievements.filter((a) => a.unlocked).length;
      parts.push(`${unlocked}/${item.achievements.length} Erfolge`);
    }
    return parts.join(' · ');
  }

  if (item.status === 'done' && item.finished) {
    return `Beendet: ${formatDateDe(item.finished)}`;
  }
  return '';
}

/**
 * Formats a media item into clean text for copying or sharing
 */
export function generateMediaShareText(item: MediaItem): string {
  const parts: string[] = [];
  const typeLabel = item.bookSubtype ? `${item.bookSubtype} (Buch)` : getKindLabel(item.kind);
  parts.push(`📖 ${item.title}`);
  parts.push(`Urheber: ${item.creator}${item.year ? ` (${item.year})` : ''}`);
  if (item.narrator) parts.push(`Sprecher: ${item.narrator}`);
  parts.push(`Typ: ${typeLabel} · Status: ${getStatusLabel(item.status, item.kind)}`);

  if (item.rating) {
    parts.push(`Bewertung: ★ ${item.rating}/10`);
  }

  const prog = getProgressSummary(item);
  if (prog) {
    parts.push(`Fortschritt: ${prog}`);
  }

  if (item.notes) {
    parts.push(`\nNotiz:\n${item.notes}`);
  }

  parts.push(`\nGeteilt aus Medialog (MiniNode)`);
  return parts.join('\n');
}

/**
 * Formats a list into clean text for copying or sharing
 */
export function generateListShareText(list: MediaList, items: MediaItem[]): string {
  const parts: string[] = [];
  parts.push(`📋 ${list.title}`);
  if (list.description) parts.push(list.description);
  parts.push('');

  const linked = items.filter((it) => list.itemIds.includes(it.id));
  if (linked.length > 0) {
    parts.push('Medien in dieser Liste:');
    linked.forEach((it, idx) => {
      const star = it.rating ? ` [★ ${it.rating}/10]` : '';
      const stat = ` (${getStatusLabel(it.status, it.kind)})`;
      parts.push(`${idx + 1}. ${it.title} – ${it.creator}${star}${stat}`);
    });
    parts.push('');
  }

  if (list.customItems && list.customItems.length > 0) {
    parts.push('Aufgaben / Einträge:');
    list.customItems.forEach((ci) => {
      const mark = ci.done ? '[x]' : '[ ]';
      parts.push(`${mark} ${ci.title}`);
      if (ci.subtasks && ci.subtasks.length > 0) {
        ci.subtasks.forEach((st) => {
          parts.push(`   ${st.done ? '✓' : '–'} ${st.title}`);
        });
      }
    });
  }

  parts.push(`\nGeteilt aus Medialog (MiniNode)`);
  return parts.join('\n');
}
