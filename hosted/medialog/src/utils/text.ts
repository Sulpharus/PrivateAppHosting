/**
 * Utility helpers for text processing, German formatting,
 * accent-insensitive search, and share text generation.
 */

import { locale, t } from '../i18n';
import type { MediaItem, MediaList } from '../types';

/** Language key of each book subtype (the stored value stays as it is). */
const SUBTYPE_KEYS: Record<string, string> = {
  Roman: 'subtype.roman',
  Manga: 'subtype.manga',
  Manhwa: 'subtype.manhwa',
  Manhua: 'subtype.manhua',
  'Light Novel': 'subtype.lightNovel',
  Comic: 'subtype.comic',
  'Graphic Novel': 'subtype.graphicNovel',
  Sachbuch: 'subtype.nonfiction',
};
/** A book subtype in the active language. */
export const getSubtypeLabel = (subtype: string): string => {
  const key = SUBTYPE_KEYS[subtype];
  return key ? t(key) : subtype;
};

/**
 * Normalizes text for accent-insensitive and case-insensitive comparison
 */
export function normalizeSearchString(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase(locale())
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
 * Label for MediaKind and BookSubtype in the active language
 */
export function getKindLabel(kind: string, subtype?: string): string {
  if (kind === 'audiobook') {
    return t('kind.audiobook');
  }
  if (kind === 'book') {
    if (subtype && subtype !== 'Roman') {
      return getSubtypeLabel(subtype);
    }
    return subtype ? getSubtypeLabel(subtype) : t('kind.book');
  }
  switch (kind) {
    case 'film':
      return t('kind.film');
    case 'series':
      return t('kind.series');
    case 'game':
      return t('kind.game');
    case 'collection':
      return t('kind.collection');
    default:
      return t('kind.other');
  }
}

/**
 * Label for MediaStatus in the active language
 */
export function getStatusLabel(status: string, kind = 'book'): string {
  switch (status) {
    case 'active':
      if (kind === 'book') return t('status.activeBook');
      if (kind === 'audiobook') return t('status.activeAudiobook');
      if (kind === 'film' || kind === 'series') return t('status.activeWatch');
      if (kind === 'game') return t('status.activeGame');
      return t('status.active');
    case 'wishlist':
      return t('status.wishlist');
    case 'done':
      if (kind === 'book') return t('status.doneBook');
      if (kind === 'audiobook') return t('status.doneAudiobook');
      if (kind === 'film' || kind === 'series') return t('status.doneWatch');
      if (kind === 'game') return t('status.doneGame');
      return t('status.done');
    case 'dropped':
      return t('status.dropped');
    default:
      return status;
  }
}

/**
 * Date formatting in the language of the page
 */
export function formatDate(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(locale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Format minutes into a readable duration (e.g. 14 Std. 20 Min. / 14 h 20 min)
 */
export function formatMinutes(totalMinutes?: number): string {
  if (!totalMinutes || totalMinutes <= 0) return t('duration.m', { m: 0 });
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return t('duration.hm', { h, m });
  if (h > 0) return t('duration.h', { h });
  return t('duration.m', { m });
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
    return t('progress.audiobook');
  }

  if (item.kind === 'book') {
    const isComicOrManga = ['Manga', 'Manhwa', 'Manhua', 'Comic'].includes(item.bookSubtype || '');

    // For Manga/Manhwa/Manhua: Chapter and Volume priority
    if (isComicOrManga) {
      const parts: string[] = [];
      if (item.currentChapter) parts.push(item.currentChapter);
      if (item.currentVolume) parts.push(t('progress.volume', { n: item.currentVolume }));
      if (item.currentPage && item.totalPages) {
        parts.push(t('progress.pages', { current: item.currentPage, total: item.totalPages }));
      }
      if (parts.length > 0) return parts.join(' · ');
    }

    if (item.currentPage && item.totalPages) {
      const pct = Math.round((item.currentPage / item.totalPages) * 100);
      const ch = item.currentChapter ? ` (${item.currentChapter})` : '';
      return `${t('progress.pages', { current: item.currentPage, total: item.totalPages })}${ch} · ${pct} %`;
    }
    if (item.currentChapter) return item.currentChapter;
    if (item.currentPage) return t('progress.page', { n: item.currentPage });
    if (item.currentVolume) return t('progress.volume', { n: item.currentVolume });
  }

  if (item.kind === 'series') {
    const s = item.currentSeason ?? 1;
    const ep = item.currentEpisode ?? 1;
    const epCount = item.episodes
      ? ` (${item.episodes.filter((e) => e.watched).length}/${item.episodes.length})`
      : '';
    return `${t('progress.season', { s, e: ep })}${epCount}`;
  }

  if (item.kind === 'game') {
    const parts: string[] = [];
    if (item.hoursPlayed) parts.push(t('progress.hoursPlayed', { n: item.hoursPlayed }));
    if (item.achievements && item.achievements.length > 0) {
      const unlocked = item.achievements.filter((a) => a.unlocked).length;
      parts.push(t('progress.achievements', { done: unlocked, total: item.achievements.length }));
    }
    return parts.join(' · ');
  }

  if (item.status === 'done' && item.finished) {
    return t('progress.finished', { date: formatDate(item.finished) });
  }
  return '';
}

/**
 * Formats a media item into clean text for copying or sharing
 */
export function generateMediaShareText(item: MediaItem): string {
  const parts: string[] = [];
  const typeLabel = item.bookSubtype
    ? t('share.bookType', { subtype: getSubtypeLabel(item.bookSubtype) })
    : getKindLabel(item.kind);
  parts.push(`📖 ${item.title}`);
  parts.push(t('share.creator', { creator: item.creator }) + (item.year ? ` (${item.year})` : ''));
  if (item.narrator) parts.push(t('share.narrator', { name: item.narrator }));
  parts.push(
    t('share.typeStatus', { type: typeLabel, status: getStatusLabel(item.status, item.kind) }),
  );

  if (item.rating) {
    parts.push(t('share.rating', { n: item.rating }));
  }

  const prog = getProgressSummary(item);
  if (prog) {
    parts.push(t('share.progress', { text: prog }));
  }

  if (item.notes) {
    parts.push(`\n${t('share.note')}\n${item.notes}`);
  }

  parts.push(`\n${t('share.footer')}`);
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
    parts.push(t('share.listMedia'));
    linked.forEach((it, idx) => {
      const star = it.rating ? ` [★ ${it.rating}/10]` : '';
      const stat = ` (${getStatusLabel(it.status, it.kind)})`;
      parts.push(`${idx + 1}. ${it.title} – ${it.creator}${star}${stat}`);
    });
    parts.push('');
  }

  if (list.customItems && list.customItems.length > 0) {
    parts.push(t('share.listTasks'));
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

  parts.push(`\n${t('share.footer')}`);
  return parts.join('\n');
}
