/**
 * Free Media Search APIs with Semantic Capabilities:
 * - Google Books API (High-quality books, manga, total pages, volume information)
 * - Jikan API (MyAnimeList open API: Manga, Manhwa, Light Novels with English title translations & volume counts)
 * - Open Library (Classical literature & table of contents)
 * - TVMaze (Series with full episode titles, season breakdown & summaries)
 * - iTunes Search API (Audiobooks with narrator/runtime, Movies, Video Games)
 *
 * Features:
 * - Translation of non-German/non-English titles into English
 * - Typo-tolerance & correction suggestions ("Meintest du...?")
 * - Series consolidation (Volume 1 shown first, Next Volume search helper)
 * - Console/platform detection for video games
 * - Deduplication & Richness scoring
 */

import type {
  BookChapter,
  BookSubtype,
  BookVolume,
  Episode,
  GameAchievement,
  MediaKind,
  SeasonInfo,
} from '../types';
import { ExternalApiError, mininode, toJson } from './mininode';
import { currentSettings } from './settings';

/**
 * Public APIs without a key also go through the platform proxy (mininode.json → apis): the page
 * itself may only talk to MiniNode. Null when the API answers with an error.
 */
async function apiJson<T = any>(id: string, path: string, timeoutMs = 8000): Promise<T | null> {
  const mn = await mininode();
  const res = await mn.api(id).fetch(path, {
    headers: { Accept: 'application/json', 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.6' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

const preferGerman = () => currentSettings().preferGermanTitles;

export type SearchSortBy = 'richness' | 'relevance';
export type SearchCategoryTarget = 'all' | 'book' | 'film_series' | 'audiobook' | 'game';

export interface SearchMediaApisOptions {
  category?: SearchCategoryTarget;
  sortBy?: SearchSortBy;
  preferGermanTitles?: boolean;
}

export interface ApiSearchResult {
  id: string;
  sourceApi:
    | 'googlebooks'
    | 'tmdb'
    | 'jikan'
    | 'openlibrary'
    | 'tvmaze'
    | 'itunes_movie'
    | 'itunes_game'
    | 'itunes_audiobook'
    | 'mangadex'
    | 'steam'
    | 'gutendex';
  attribution?: string;
  title: string;
  germanTitle?: string;
  originalTitle?: string;
  englishTitle?: string;
  creator: string;
  narrator?: string;
  year?: number;
  kind: MediaKind;
  bookSubtype?: BookSubtype;
  genres: string[];
  notes?: string;
  cover?: string;
  totalPages?: number;
  runtimeMinutes?: number;
  audioTotalMinutes?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
  seasonDetails?: SeasonInfo[];
  episodes?: Episode[];
  chapters?: BookChapter[];
  achievements?: GameAchievement[];
  platform?: string;
  console?: string;
  rating?: number;
  score: number; // metadata richness score

  // Buchreihen
  isBookSeries?: boolean;
  seriesTitle?: string;
  volumeNumber?: number;
  totalVolumes?: number;
  volumes?: BookVolume[];
}

export interface MediaSearchResponse {
  results: ApiSearchResult[];
  isOffline: boolean;
  cached?: boolean;
  keyMissingApis?: { id: string; name: string; message: string; docs?: string }[];
  unavailableApis?: { id: string; name: string; message: string }[];
  isRateLimited?: boolean;
  correctionSuggestion?: string;
  translatedQuery?: string;
  originalQuery: string;
  error?: string;
}

// -------------------------------------------------------------
// 1. Language Detection & English Translation for Foreign Titles
// -------------------------------------------------------------

/// Known foreign titles to English & German localized titles
const FOREIGN_TITLE_TRANSLATIONS: Record<
  string,
  { english: string; german?: string; original: string; kind: MediaKind; subtype?: BookSubtype }
> = {
  'shingeki no kyojin': {
    english: 'Attack on Titan',
    german: 'Angriff auf Titan',
    original: '進撃の巨人',
    kind: 'book',
    subtype: 'Manga',
  },
  進撃の巨人: {
    english: 'Attack on Titan',
    german: 'Angriff auf Titan',
    original: '進撃の巨人',
    kind: 'book',
    subtype: 'Manga',
  },
  'angriff auf titan': {
    english: 'Attack on Titan',
    german: 'Angriff auf Titan',
    original: '進撃の巨人',
    kind: 'book',
    subtype: 'Manga',
  },
  'kimetsu no yaiba': {
    english: 'Demon Slayer: Kimetsu no Yaiba',
    german: 'Demon Slayer - Kimetsu no Yaiba',
    original: '鬼滅の刃',
    kind: 'book',
    subtype: 'Manga',
  },
  鬼滅の刃: {
    english: 'Demon Slayer: Kimetsu no Yaiba',
    german: 'Demon Slayer - Kimetsu no Yaiba',
    original: '鬼滅の刃',
    kind: 'book',
    subtype: 'Manga',
  },
  'demon slayer': {
    english: 'Demon Slayer: Kimetsu no Yaiba',
    german: 'Demon Slayer - Kimetsu no Yaiba',
    original: '鬼滅の刃',
    kind: 'book',
    subtype: 'Manga',
  },
  'na honjaman rebeleop': {
    english: 'Solo Leveling',
    german: 'Solo Leveling',
    original: '나 혼자만 레벨업',
    kind: 'book',
    subtype: 'Manhwa',
  },
  '나 혼자만 레벨업': {
    english: 'Solo Leveling',
    german: 'Solo Leveling',
    original: '나 혼자만 레벨업',
    kind: 'book',
    subtype: 'Manhwa',
  },
  'jujutsu kaisen': {
    english: 'Jujutsu Kaisen',
    german: 'Jujutsu Kaisen',
    original: '呪術廻戦',
    kind: 'book',
    subtype: 'Manga',
  },
  呪術廻戦: {
    english: 'Jujutsu Kaisen',
    german: 'Jujutsu Kaisen',
    original: '呪術廻戦',
    kind: 'book',
    subtype: 'Manga',
  },
  'boku no hero academia': {
    english: 'My Hero Academia',
    german: 'My Hero Academia',
    original: '僕のヒーローアカデミア',
    kind: 'book',
    subtype: 'Manga',
  },
  僕のヒーローアカデミア: {
    english: 'My Hero Academia',
    german: 'My Hero Academia',
    original: '僕のヒーローアカデミア',
    kind: 'book',
    subtype: 'Manga',
  },
  'chainsaw man': {
    english: 'Chainsaw Man',
    german: 'Chainsaw Man',
    original: 'チェンソーマン',
    kind: 'book',
    subtype: 'Manga',
  },
  チェンソーマン: {
    english: 'Chainsaw Man',
    german: 'Chainsaw Man',
    original: 'チェンソーマン',
    kind: 'book',
    subtype: 'Manga',
  },
  'hagane no renkinjutsushi': {
    english: 'Fullmetal Alchemist',
    german: 'Fullmetal Alchemist',
    original: '鋼の錬金術師',
    kind: 'book',
    subtype: 'Manga',
  },
  鋼の錬金術師: {
    english: 'Fullmetal Alchemist',
    german: 'Fullmetal Alchemist',
    original: '鋼の錬金術師',
    kind: 'book',
    subtype: 'Manga',
  },
  'tokyo kushu': {
    english: 'Tokyo Ghoul',
    german: 'Tokyo Ghoul',
    original: '東京喰種',
    kind: 'book',
    subtype: 'Manga',
  },
  'tokyo ghoul': {
    english: 'Tokyo Ghoul',
    german: 'Tokyo Ghoul',
    original: '東京喰種',
    kind: 'book',
    subtype: 'Manga',
  },
  東京喰種: {
    english: 'Tokyo Ghoul',
    german: 'Tokyo Ghoul',
    original: '東京喰種',
    kind: 'book',
    subtype: 'Manga',
  },
  berserk: {
    english: 'Berserk',
    german: 'Berserk',
    original: 'ベルセルク',
    kind: 'book',
    subtype: 'Manga',
  },
  ベルセルク: {
    english: 'Berserk',
    german: 'Berserk',
    original: 'ベルセルク',
    kind: 'book',
    subtype: 'Manga',
  },
  'one piece': {
    english: 'One Piece',
    german: 'One Piece',
    original: 'ワンピース',
    kind: 'book',
    subtype: 'Manga',
  },
  ワンピース: {
    english: 'One Piece',
    german: 'One Piece',
    original: 'ワンピース',
    kind: 'book',
    subtype: 'Manga',
  },
  naruto: {
    english: 'Naruto',
    german: 'Naruto',
    original: 'ナルト',
    kind: 'book',
    subtype: 'Manga',
  },
  ナルト: {
    english: 'Naruto',
    german: 'Naruto',
    original: 'ナルト',
    kind: 'book',
    subtype: 'Manga',
  },
  'death note': {
    english: 'Death Note',
    german: 'Death Note',
    original: 'デスノート',
    kind: 'book',
    subtype: 'Manga',
  },
  デスノート: {
    english: 'Death Note',
    german: 'Death Note',
    original: 'デスノート',
    kind: 'book',
    subtype: 'Manga',
  },
  'sousou no frieren': {
    english: "Frieren: Beyond Journey's End",
    german: 'Frieren - Nach dem Ende der Reise',
    original: '葬送のフリーレン',
    kind: 'book',
    subtype: 'Manga',
  },
  葬送のフリーレン: {
    english: "Frieren: Beyond Journey's End",
    german: 'Frieren - Nach dem Ende der Reise',
    original: '葬送のフリーレン',
    kind: 'book',
    subtype: 'Manga',
  },
  frieren: {
    english: "Frieren: Beyond Journey's End",
    german: 'Frieren - Nach dem Ende der Reise',
    original: '葬送のフリーレン',
    kind: 'book',
    subtype: 'Manga',
  },
  'spy x family': {
    english: 'Spy x Family',
    german: 'Spy x Family',
    original: 'スパイファミリー',
    kind: 'book',
    subtype: 'Manga',
  },
  スパイファミリー: {
    english: 'Spy x Family',
    german: 'Spy x Family',
    original: 'スパイファミリー',
    kind: 'book',
    subtype: 'Manga',
  },
  'kusuriya no hitorigoto': {
    english: 'The Apothecary Diaries',
    german: 'Die Tagebücher der Apothekerin',
    original: '薬屋のひとりごと',
    kind: 'book',
    subtype: 'Light Novel',
  },
  薬屋のひとりごと: {
    english: 'The Apothecary Diaries',
    german: 'Die Tagebücher der Apothekerin',
    original: '薬屋のひとりごと',
    kind: 'book',
    subtype: 'Light Novel',
  },
  'die tagebücher der apothekerin': {
    english: 'The Apothecary Diaries',
    german: 'Die Tagebücher der Apothekerin',
    original: '薬屋のひとりごと',
    kind: 'book',
    subtype: 'Light Novel',
  },
  'kaiju 8-gou': {
    english: 'Kaiju No. 8',
    german: 'Kaiju No. 8',
    original: '怪獣8号',
    kind: 'book',
    subtype: 'Manga',
  },
  怪獣8号: {
    english: 'Kaiju No. 8',
    german: 'Kaiju No. 8',
    original: '怪獣8号',
    kind: 'book',
    subtype: 'Manga',
  },
  'vinland saga': {
    english: 'Vinland Saga',
    german: 'Vinland Saga',
    original: 'ヴィンランド・サガ',
    kind: 'book',
    subtype: 'Manga',
  },
  'ヴィンランド・サガ': {
    english: 'Vinland Saga',
    german: 'Vinland Saga',
    original: 'ヴィンランド・サガ',
    kind: 'book',
    subtype: 'Manga',
  },
  'kimi no na wa': {
    english: 'Your Name',
    german: 'Your Name. - Gestern, heute und für immer',
    original: '君の名は。',
    kind: 'film',
  },
  '君の名は。': {
    english: 'Your Name',
    german: 'Your Name. - Gestern, heute und für immer',
    original: '君の名は。',
    kind: 'film',
  },
  'your name': {
    english: 'Your Name',
    german: 'Your Name. - Gestern, heute und für immer',
    original: '君の名は。',
    kind: 'film',
  },
  'sen to chihiro no kamikakushi': {
    english: 'Spirited Away',
    german: 'Chihiros Reise ins Zauberland',
    original: '千と千尋の神隠し',
    kind: 'film',
  },
  千と千尋の神隠し: {
    english: 'Spirited Away',
    german: 'Chihiros Reise ins Zauberland',
    original: '千と千尋の神隠し',
    kind: 'film',
  },
  'chihiros reise ins zauberland': {
    english: 'Spirited Away',
    german: 'Chihiros Reise ins Zauberland',
    original: '千と千尋の神隠し',
    kind: 'film',
  },
  chihiro: {
    english: 'Spirited Away',
    german: 'Chihiros Reise ins Zauberland',
    original: '千と千尋の神隠し',
    kind: 'film',
  },
  'mononoke hime': {
    english: 'Princess Mononoke',
    german: 'Prinzessin Mononoke',
    original: 'もののけ姫',
    kind: 'film',
  },
  もののけ姫: {
    english: 'Princess Mononoke',
    german: 'Prinzessin Mononoke',
    original: 'もののけ姫',
    kind: 'film',
  },
  'prinzessin mononoke': {
    english: 'Princess Mononoke',
    german: 'Prinzessin Mononoke',
    original: 'もののけ姫',
    kind: 'film',
  },
  'hauru no ugoku shiro': {
    english: "Howl's Moving Castle",
    german: 'Das wandelnde Schloss',
    original: 'ハウルの動く城',
    kind: 'film',
  },
  ハウルの動く城: {
    english: "Howl's Moving Castle",
    german: 'Das wandelnde Schloss',
    original: 'ハウルの動く城',
    kind: 'film',
  },
  'das wandelnde schloss': {
    english: "Howl's Moving Castle",
    german: 'Das wandelnde Schloss',
    original: 'ハウルの動く城',
    kind: 'film',
  },
  'tonari no totoro': {
    english: 'My Neighbor Totoro',
    german: 'Mein Nachbar Totoro',
    original: 'となりのトトロ',
    kind: 'film',
  },
  となりのトトロ: {
    english: 'My Neighbor Totoro',
    german: 'Mein Nachbar Totoro',
    original: 'となりのトトロ',
    kind: 'film',
  },
  'mein nachbar totoro': {
    english: 'My Neighbor Totoro',
    german: 'Mein Nachbar Totoro',
    original: 'となりのトトロ',
    kind: 'film',
  },
  'der herr der ringe': {
    english: 'The Lord of the Rings',
    german: 'Der Herr der Ringe',
    original: 'The Lord of the Rings',
    kind: 'book',
  },
  'die tribute von panem': {
    english: 'The Hunger Games',
    german: 'Die Tribute von Panem',
    original: 'The Hunger Games',
    kind: 'book',
  },
  'das lied von eis und feuer': {
    english: 'A Song of Ice and Fire',
    german: 'Das Lied von Eis und Feuer',
    original: 'A Song of Ice and Fire',
    kind: 'book',
  },
  'die unendliche geschichte': {
    english: 'The Neverending Story',
    german: 'Die unendliche Geschichte',
    original: 'Die unendliche Geschichte',
    kind: 'book',
  },
  tintenherz: { english: 'Inkheart', german: 'Tintenherz', original: 'Tintenherz', kind: 'book' },
  'die verwandlung': {
    english: 'The Metamorphosis',
    german: 'Die Verwandlung',
    original: 'Die Verwandlung',
    kind: 'book',
  },
};

// Check if string contains CJK (Chinese, Japanese, Korean) or Cyrillic characters
function _containsNonLatinScript(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af\u0400-\u04ff]/.test(
    text,
  );
}

// -------------------------------------------------------------
// 2. Spell Correction & Semantic Suggestions ("Meintest du...?")
// -------------------------------------------------------------

const KNOWN_CANONICAL_TITLES = [
  'Solo Leveling',
  'Attack on Titan',
  'Berserk',
  'Severance',
  'The Legend of Zelda: Tears of the Kingdom',
  'Harry Potter',
  'Der Herr der Ringe',
  'Dune: Part Two',
  'Klara und die Sonne',
  'One Piece',
  'Demon Slayer',
  'Jujutsu Kaisen',
  'Chainsaw Man',
  'Fullmetal Alchemist',
  "Frieren: Beyond Journey's End",
  'Elden Ring',
  'Cyberpunk 2077',
  'The Witcher 3: Wild Hunt',
  "Baldur's Gate 3",
  'Super Mario Odyssey',
  'Hollow Knight',
  'Death Note',
  'Vinland Saga',
  'Spy x Family',
  'Der Schwarm',
];

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1].toLowerCase() === s2[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function findCorrectionSuggestion(query: string): string | undefined {
  const qClean = query.toLowerCase().trim();
  if (qClean.length < 3) return undefined;

  // Direct alias checks
  if (qClean === 'zelda' || qClean === 'totk' || qClean === 'zelda tears') {
    return 'The Legend of Zelda: Tears of the Kingdom';
  }
  if (qClean === 'aot' || qClean === 'shingeki') {
    return 'Attack on Titan';
  }
  if (qClean === 'lotr' || qClean === 'herr der ringe' || qClean === 'hdr') {
    return 'Der Herr der Ringe';
  }
  if (qClean === 'dune 2' || qClean === 'dune part 2') {
    return 'Dune: Part Two';
  }

  let bestMatch: string | undefined;
  let bestScore = Infinity;

  for (const candidate of KNOWN_CANONICAL_TITLES) {
    const candLower = candidate.toLowerCase();
    if (candLower === qClean) return undefined; // Already exact

    const dist = levenshteinDistance(qClean, candLower);
    // Allow small distance proportional to length
    const maxThreshold = Math.max(2, Math.floor(candLower.length * 0.3));
    if (dist <= maxThreshold && dist < bestScore) {
      bestScore = dist;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

// -------------------------------------------------------------
// 3. Helper Scoring & Text Sanitization
// -------------------------------------------------------------

function cleanHtml(raw: string): string {
  if (!raw) return '';
  return raw.replace(/<[^>]*>/g, '').trim();
}

function calculateRichnessScore(item: Partial<ApiSearchResult>): number {
  let score = 0;
  if (item.title) score += 2;
  if (item.creator && item.creator !== 'Unbekannt') score += 2;
  if (item.year) score += 1;
  if (item.cover) score += 3;
  if (item.notes && item.notes.length > 20) score += 3;
  if (item.genres && item.genres.length > 0) score += 2;
  if (item.totalPages || item.runtimeMinutes || item.audioTotalMinutes) score += 3;
  if (item.episodes && item.episodes.length > 0) score += 4;
  if (item.seasonDetails && item.seasonDetails.length > 0) score += 2;
  if (item.chapters && item.chapters.length > 0) score += 3;
  if (item.achievements && item.achievements.length > 0) score += 3;
  if (item.isBookSeries) score += 2;
  if (item.englishTitle) score += 1;
  return score;
}

// -------------------------------------------------------------
// 4. API Search Providers
// -------------------------------------------------------------

// A. Google Books API via MiniNode Host-Level API caller
async function searchGoogleBooks(query: string): Promise<{
  results: ApiSearchResult[];
  keyMissing?: boolean;
  rateLimited?: boolean;
  unavailable?: boolean;
}> {
  try {
    const mn = await mininode();
    const params = (german: boolean) =>
      new URLSearchParams({
        q: query,
        maxResults: german ? '5' : '7',
        printType: 'books',
        ...(german ? { langRestrict: 'de' } : {}),
      }).toString();

    let data: any;
    try {
      // With German preferred: German editions first, then all languages.
      const passes = preferGerman() ? [true, false] : [false];
      const pages = await Promise.all(
        passes.map((german) => mn.api('google-books').json<any>(`/volumes?${params(german)}`)),
      );
      const seen = new Set<string>();
      data = {
        items: pages
          .flatMap((page) => (Array.isArray(page?.items) ? page.items : []))
          .filter((entry: any) => !seen.has(entry.id) && seen.add(entry.id)),
      };
    } catch (apiErr: any) {
      if (apiErr instanceof ExternalApiError) {
        if (apiErr.keyMissing) {
          return { results: [], keyMissing: true };
        }
        if (apiErr.code === 'rate_limited') {
          return { results: [], rateLimited: true };
        }
        if (apiErr.code === 'api_unavailable' || apiErr.code === 'upstream_error') {
          return { results: [], unavailable: true };
        }
      }
      throw apiErr;
    }

    if (!data.items || !Array.isArray(data.items)) return { results: [] };

    const items = data.items.map((entry: any): ApiSearchResult => {
      const info = entry.volumeInfo || {};
      const rawTitle = info.title || query;
      const subtitle = info.subtitle ? ` - ${info.subtitle}` : '';
      const fullTitle = `${rawTitle}${subtitle}`;

      // Detect volume or series
      const volMatch = fullTitle.match(/(?:Band|Vol\.?|Volume|Book)\s*(\d+)/i);
      const volumeNumber = volMatch ? parseInt(volMatch[1], 10) : 1;
      const isSeriesCandidate =
        Boolean(volMatch) ||
        info.categories?.some((c: string) => /manga|comic|series/i.test(c)) ||
        /manga|manhwa|manhua/i.test(fullTitle);

      const cover =
        info.imageLinks?.thumbnail?.replace('http:', 'https:') ||
        info.imageLinks?.smallThumbnail?.replace('http:', 'https:');

      const year = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) : undefined;
      const creator = Array.isArray(info.authors) ? info.authors.join(', ') : 'Unbekannter Autor';
      const genres = Array.isArray(info.categories) ? info.categories.slice(0, 3) : ['Buch'];

      // Subtype detection
      let bookSubtype: BookSubtype = 'Roman';
      const textForSubtype = `${fullTitle} ${genres.join(' ')}`.toLowerCase();
      if (textForSubtype.includes('manga')) bookSubtype = 'Manga';
      else if (textForSubtype.includes('manhwa') || textForSubtype.includes('webtoon'))
        bookSubtype = 'Manhwa';
      else if (textForSubtype.includes('manhua')) bookSubtype = 'Manhua';
      else if (textForSubtype.includes('light novel')) bookSubtype = 'Light Novel';
      else if (textForSubtype.includes('comic')) bookSubtype = 'Comic';

      // Clean series title
      const seriesTitle = isSeriesCandidate
        ? rawTitle
            .replace(/(?:Band|Vol\.?|Volume|Book)\s*\d+/gi, '')
            .trim()
            .replace(/[:,-]$/, '')
            .trim()
        : undefined;

      const totalPages = info.pageCount || undefined;

      // Create initial volume outline for series
      const initialVolumes: BookVolume[] = isSeriesCandidate
        ? [
            {
              id: `vol_${volumeNumber}`,
              volumeNumber: volumeNumber || 1,
              title: `Band ${volumeNumber || 1}${rawTitle !== seriesTitle ? `: ${rawTitle}` : ''}`,
              year,
              cover,
              totalPages,
              status: 'wishlist',
            },
          ]
        : [];

      const item: Partial<ApiSearchResult> = {
        id: `gb_${entry.id}`,
        sourceApi: 'googlebooks',
        attribution: 'Daten: Google Books',
        title: fullTitle,
        germanTitle: info.language === 'de' ? fullTitle : undefined,
        creator,
        year,
        kind: 'book',
        bookSubtype,
        genres,
        cover,
        totalPages,
        notes: cleanHtml(info.description),
        isBookSeries: isSeriesCandidate,
        seriesTitle: seriesTitle || fullTitle,
        volumeNumber,
        volumes: initialVolumes,
      };

      return {
        ...item,
        score: calculateRichnessScore(item),
      } as ApiSearchResult;
    });

    return { results: items };
  } catch (_err) {
    return { results: [] };
  }
}

// B. The Movie Database (TMDB) via MiniNode Host-Level API caller
async function searchTMDB(
  query: string,
  kind?: MediaKind,
): Promise<{
  results: ApiSearchResult[];
  keyMissing?: boolean;
  rateLimited?: boolean;
  unavailable?: boolean;
}> {
  try {
    const mn = await mininode();
    const qParams = new URLSearchParams({
      query,
      language: 'de-DE',
      include_adult: 'false',
    }).toString();

    let path = '';
    if (kind === 'film') {
      path = `/search/movie?${qParams}`;
    } else if (kind === 'series') {
      path = `/search/tv?${qParams}`;
    } else {
      path = `/search/multi?${qParams}`;
    }

    let data: any;
    try {
      data = await mn.api('tmdb').json<any>(path);
    } catch (apiErr: any) {
      if (apiErr instanceof ExternalApiError) {
        if (apiErr.keyMissing) {
          return { results: [], keyMissing: true };
        }
        if (apiErr.code === 'rate_limited') {
          return { results: [], rateLimited: true };
        }
        if (apiErr.code === 'api_unavailable' || apiErr.code === 'upstream_error') {
          return { results: [], unavailable: true };
        }
      }
      throw apiErr;
    }

    if (!data.results || !Array.isArray(data.results)) return { results: [] };

    const items: ApiSearchResult[] = data.results
      .filter((r: any) => r.media_type !== 'person')
      .slice(0, 5)
      .map((row: any): ApiSearchResult => {
        const isTv = row.media_type === 'tv' || (!row.media_type && kind === 'series');
        const title = row.title || row.name || query;
        const originalTitle = row.original_title || row.original_name;
        const yearStr = row.release_date || row.first_air_date;
        const year = yearStr ? parseInt(yearStr.slice(0, 4), 10) : undefined;
        const cover = row.poster_path
          ? `https://image.tmdb.org/t/p/w500${row.poster_path}`
          : undefined;
        const rating = row.vote_average ? Math.round(row.vote_average) : undefined;

        const item: Partial<ApiSearchResult> = {
          id: `tmdb_${row.id}`,
          sourceApi: 'tmdb',
          attribution: 'Daten: The Movie Database (TMDB)',
          title,
          // language=de-DE: TMDB answers with the German title where one exists.
          germanTitle:
            originalTitle && originalTitle !== title
              ? title
              : row.original_language === 'de'
                ? title
                : undefined,
          originalTitle: originalTitle && originalTitle !== title ? originalTitle : undefined,
          englishTitle: row.original_language === 'en' ? originalTitle : undefined,
          creator: '',
          year,
          kind: isTv ? 'series' : 'film',
          genres: isTv ? ['Serie'] : ['Film'],
          cover,
          notes: cleanHtml(row.overview),
          rating,
          totalSeasons: isTv ? 1 : undefined,
        };

        return {
          ...item,
          score: calculateRichnessScore(item) + 2,
        } as ApiSearchResult;
      });

    return { results: items };
  } catch (_err) {
    return { results: [] };
  }
}

// B. Jikan API (MyAnimeList: Free Manga, Manhwa, Manhua with English Titles & Volumes count)
async function searchJikanManga(query: string): Promise<ApiSearchResult[]> {
  try {
    const data = await apiJson<any>('jikan', `/manga?q=${encodeURIComponent(query)}&limit=5`);
    if (!data) return [];
    if (!data.data || !Array.isArray(data.data)) return [];

    return data.data.map((item: any): ApiSearchResult => {
      const englishTitle = item.title_english || undefined;
      const japaneseTitle = item.title_japanese || undefined;
      const germanTitle = Array.isArray(item.titles)
        ? item.titles.find((t: any) => t.type === 'German')?.title
        : undefined;
      const canonicalTitle = englishTitle || item.title;

      let bookSubtype: BookSubtype = 'Manga';
      const itemType = (item.type || '').toLowerCase();
      if (itemType === 'manhwa') bookSubtype = 'Manhwa';
      else if (itemType === 'manhua') bookSubtype = 'Manhua';
      else if (itemType === 'lightnovel' || itemType === 'novel') bookSubtype = 'Light Novel';

      const creator =
        Array.isArray(item.authors) && item.authors.length > 0
          ? item.authors.map((a: any) => a.name).join(', ')
          : 'Unbekannt';

      const year = item.published?.from ? parseInt(item.published.from.slice(0, 4), 10) : undefined;
      const cover = item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url;
      const genres = Array.isArray(item.genres) ? item.genres.map((g: any) => g.name) : ['Manga'];

      // Volumes & Chapters
      const totalVolumes = item.volumes || undefined;
      const _totalChapters = item.chapters ? String(item.chapters) : undefined;

      // Construct initial Volume 1 for the series
      const initialVolumes: BookVolume[] = [
        {
          id: `jikan_vol_1`,
          volumeNumber: 1,
          title: `Band 1 (Volume 1)`,
          year,
          cover,
          status: 'wishlist',
        },
      ];

      const searchResult: Partial<ApiSearchResult> = {
        id: `jikan_${item.mal_id}`,
        sourceApi: 'jikan',
        attribution: 'Daten: Jikan (MyAnimeList)',
        title: canonicalTitle,
        germanTitle,
        englishTitle,
        originalTitle: japaneseTitle,
        creator,
        year,
        kind: 'book',
        bookSubtype,
        genres,
        cover,
        totalPages: undefined,
        notes: cleanHtml(item.synopsis),
        rating: item.score ? Math.round(item.score) : undefined,
        isBookSeries: true,
        seriesTitle: canonicalTitle,
        volumeNumber: 1,
        totalVolumes,
        volumes: initialVolumes,
      };

      return {
        ...searchResult,
        score: calculateRichnessScore(searchResult) + 2, // Prefer Jikan for Manga/Manhwa
      } as ApiSearchResult;
    });
  } catch (_err) {
    return [];
  }
}

// B2. MangaDex API (Free Manga, Manhwa & Light Novels with Volume counts & titles)
async function searchMangaDex(query: string): Promise<ApiSearchResult[]> {
  try {
    const data = await apiJson<any>(
      'mangadex',
      `/manga?title=${encodeURIComponent(query)}&limit=5&includes[]=cover_art&includes[]=author`,
    );
    if (!data) return [];
    if (!data.data || !Array.isArray(data.data)) return [];

    return data.data.map((entry: any): ApiSearchResult => {
      const attrs = entry.attributes || {};
      const enTitle = attrs.title?.en;
      const deTitle =
        attrs.title?.de ||
        (Array.isArray(attrs.altTitles) ? attrs.altTitles.find((t: any) => t.de)?.de : undefined);
      const jaRoTitle = attrs.title?.['ja-ro'] || attrs.title?.ja;
      const title = deTitle || enTitle || Object.values(attrs.title || {})[0] || query;
      const originalTitle = jaRoTitle && jaRoTitle !== title ? jaRoTitle : undefined;
      const englishTitle = enTitle && enTitle !== title ? enTitle : undefined;

      const authorRel = (entry.relationships || []).find(
        (r: any) => r.type === 'author' || r.type === 'artist',
      );
      const creator = authorRel?.attributes?.name || 'Unbekannt';

      const coverRel = (entry.relationships || []).find((r: any) => r.type === 'cover_art');
      const coverFile = coverRel?.attributes?.fileName;
      const cover = coverFile
        ? `https://uploads.mangadex.org/covers/${entry.id}/${coverFile}.512.jpg`
        : undefined;

      const year = attrs.year ? Number(attrs.year) : undefined;
      const lastVolumeStr = attrs.lastVolume;
      const totalVolumes =
        lastVolumeStr && !Number.isNaN(parseInt(lastVolumeStr, 10))
          ? parseInt(lastVolumeStr, 10)
          : undefined;

      let bookSubtype: BookSubtype = 'Manga';
      if (attrs.originalLanguage === 'ko') bookSubtype = 'Manhwa';
      else if (attrs.originalLanguage === 'zh' || attrs.originalLanguage === 'zh-ro')
        bookSubtype = 'Manhua';

      const volumes: BookVolume[] = [];
      const numVols = totalVolumes && totalVolumes > 0 ? Math.min(totalVolumes, 60) : 1;
      for (let i = 1; i <= numVols; i++) {
        volumes.push({
          id: `mdx_vol_${entry.id}_${i}`,
          volumeNumber: i,
          title: `Band ${i} (Volume ${i})`,
          status: 'wishlist',
          cover,
        });
      }

      const genres = (attrs.tags || [])
        .map((t: any) => t.attributes?.name?.en)
        .filter(Boolean)
        .slice(0, 4);

      const notes = attrs.description?.de || attrs.description?.en || '';

      const item: Partial<ApiSearchResult> = {
        id: `mdx_${entry.id}`,
        sourceApi: 'mangadex',
        attribution: 'Daten: MangaDex API',
        title,
        germanTitle: deTitle,
        originalTitle,
        englishTitle,
        creator,
        year,
        kind: 'book',
        bookSubtype,
        genres: genres.length > 0 ? genres : ['Manga'],
        cover,
        totalPages: undefined,
        notes: cleanHtml(notes),
        isBookSeries: true,
        seriesTitle: title,
        volumeNumber: 1,
        totalVolumes,
        volumes,
      };

      return {
        ...item,
        score: calculateRichnessScore(item) + 3,
      } as ApiSearchResult;
    });
  } catch (_err) {
    return [];
  }
}

// C. Open Library (Books with Chapter Names & Pages)
async function searchOpenLibrary(query: string): Promise<ApiSearchResult[]> {
  try {
    const data = await apiJson<any>(
      'openlibrary',
      `/search.json?q=${encodeURIComponent(query)}&limit=5${preferGerman() ? '&lang=de' : ''}`,
    );
    if (!data) return [];
    if (!data.docs) return [];

    return data.docs.map((doc: any): ApiSearchResult => {
      const cover = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : undefined;
      const genres = Array.isArray(doc.subject) ? doc.subject.slice(0, 3) : ['Literatur'];

      let chapters: BookChapter[] = [];
      if (Array.isArray(doc.toc) && doc.toc.length > 0) {
        chapters = doc.toc.slice(0, 25).map((t: string, idx: number) => ({
          id: `ch_${idx + 1}`,
          number: idx + 1,
          title: typeof t === 'string' ? t.trim() : `Kapitel ${idx + 1}`,
          read: false,
        }));
      }

      const item: Partial<ApiSearchResult> = {
        id: `ol_${doc.key || Math.random()}`,
        sourceApi: 'openlibrary',
        attribution: 'Daten: Open Library',
        title: doc.title || query,
        creator: Array.isArray(doc.author_name) ? doc.author_name.join(', ') : 'Unbekannter Autor',
        year: doc.first_publish_year || (doc.publish_year ? doc.publish_year[0] : undefined),
        kind: 'book',
        bookSubtype: (doc.title || '').toLowerCase().includes('manga') ? 'Manga' : 'Roman',
        genres,
        cover,
        totalPages: doc.number_of_pages_median || undefined,
        chapters,
        notes: doc.first_sentence ? `Erster Satz: „${doc.first_sentence[0]}“` : undefined,
      };

      return {
        ...item,
        score: calculateRichnessScore(item),
      } as ApiSearchResult;
    });
  } catch (_err) {
    return [];
  }
}

// C2. Gutendex (Free Project Gutenberg API: Classic Literature & Public Domain Books)
async function searchGutendex(query: string): Promise<ApiSearchResult[]> {
  try {
    const data = await apiJson<any>(
      'gutendex',
      `/books/?search=${encodeURIComponent(query)}${preferGerman() ? '&languages=de,en' : ''}`,
    );
    if (!data) return [];
    if (!data.results || !Array.isArray(data.results)) return [];

    return data.results.slice(0, 4).map((doc: any): ApiSearchResult => {
      const cover = doc.formats?.['image/jpeg'];
      const author =
        Array.isArray(doc.authors) && doc.authors.length > 0
          ? doc.authors.map((a: any) => a.name).join(', ')
          : 'Unbekannt';
      const genres = Array.isArray(doc.subjects)
        ? doc.subjects.slice(0, 3).map((s: string) => s.split(' -- ')[0])
        : ['Klassiker'];

      const item: Partial<ApiSearchResult> = {
        id: `guten_${doc.id}`,
        sourceApi: 'gutendex',
        attribution: 'Daten: Project Gutenberg (Gutendex)',
        title: doc.title || query,
        creator: author,
        kind: 'book',
        bookSubtype: 'Roman',
        genres,
        cover,
        notes: `Klassisches Werk aus dem Project Gutenberg. Sprachen: ${(doc.languages || []).join(', ')}.`,
      };

      return {
        ...item,
        score: calculateRichnessScore(item),
      } as ApiSearchResult;
    });
  } catch (_err) {
    return [];
  }
}

// D. TVMaze (Series with Season Details & Episode Titles)
async function searchTVMaze(query: string): Promise<ApiSearchResult[]> {
  try {
    const data = await apiJson<any>('tvmaze', `/search/shows?q=${encodeURIComponent(query)}`);
    if (!data) return [];
    if (!Array.isArray(data)) return [];

    const results: ApiSearchResult[] = [];
    for (const entry of data.slice(0, 4)) {
      const show = entry.show;
      if (!show) continue;

      const cover = show.image?.original || show.image?.medium;
      const year = show.premiered ? parseInt(show.premiered.slice(0, 4), 10) : undefined;
      const creator = show.network?.name || show.webChannel?.name || '';
      const notes = cleanHtml(show.summary);

      let episodes: Episode[] = [];
      let seasonDetails: SeasonInfo[] = [];
      let totalSeasons = 1;

      try {
        const epData = await apiJson<any>('tvmaze', `/shows/${show.id}/episodes`, 6000);
        if (Array.isArray(epData) && epData.length > 0) {
          episodes = epData.map((ep: any) => ({
            id: `ep-${show.id}-${ep.id}`,
            season: ep.season || 1,
            number: ep.number || 1,
            title: ep.name ? String(ep.name).trim() : `Folge ${ep.number}`,
            runtimeMinutes: ep.runtime || undefined,
            watched: false,
            notes: cleanHtml(ep.summary),
          }));

          const seasonsMap = new Map<number, number>();
          episodes.forEach((ep) => {
            seasonsMap.set(ep.season, (seasonsMap.get(ep.season) || 0) + 1);
          });

          totalSeasons = Math.max(...Array.from(seasonsMap.keys()), 1);
          seasonDetails = Array.from(seasonsMap.entries())
            .map(([s, count]) => ({
              season: s,
              episodeCount: count,
              name: `Staffel ${s}`,
            }))
            .sort((a, b) => a.season - b.season);
        }
      } catch (_e) {}

      const item: Partial<ApiSearchResult> = {
        id: `tv_${show.id}`,
        sourceApi: 'tvmaze',
        attribution: 'Daten: TVMaze',
        title: show.name,
        creator,
        year,
        kind: 'series',
        genres: show.genres || [],
        cover,
        notes,
        totalSeasons,
        totalEpisodes: episodes.length > 0 ? episodes.length : undefined,
        seasonDetails,
        episodes,
        rating: show.rating?.average ? Math.round(show.rating.average) : undefined,
      };

      results.push({
        ...item,
        score: calculateRichnessScore(item),
      } as ApiSearchResult);
    }
    return results;
  } catch (_err) {
    return [];
  }
}

// E. iTunes Movies
async function searchItunesMovies(query: string): Promise<ApiSearchResult[]> {
  try {
    const data = await apiJson<any>(
      'itunes',
      `/search?term=${encodeURIComponent(query)}&entity=movie&limit=4&country=de&lang=de_de`,
    );
    if (!data) return [];
    if (!data.results) return [];

    return data.results.map((row: any): ApiSearchResult => {
      const cover = row.artworkUrl100
        ? row.artworkUrl100.replace('100x100bb', '600x600bb')
        : undefined;
      const year = row.releaseDate ? parseInt(row.releaseDate.slice(0, 4), 10) : undefined;
      const runtimeMinutes = row.trackTimeMillis
        ? Math.round(row.trackTimeMillis / 60000)
        : undefined;

      const item: Partial<ApiSearchResult> = {
        id: `itunes_m_${row.trackId}`,
        sourceApi: 'itunes_movie',
        attribution: 'Daten: iTunes Store',
        title: row.trackName || row.collectionName,
        creator: row.artistName || 'Filmstudio',
        year,
        kind: 'film',
        genres: row.primaryGenreName ? [row.primaryGenreName] : ['Film'],
        cover,
        runtimeMinutes,
        notes: row.longDescription || row.shortDescription,
      };
      return {
        ...item,
        score: calculateRichnessScore(item),
      } as ApiSearchResult;
    });
  } catch (_err) {
    return [];
  }
}

// F. iTunes Audiobooks
async function searchItunesAudiobooks(query: string): Promise<ApiSearchResult[]> {
  try {
    const data = await apiJson<any>(
      'itunes',
      `/search?term=${encodeURIComponent(query)}&entity=audiobook&limit=4&country=de&lang=de_de`,
    );
    if (!data) return [];
    if (!data.results) return [];

    return data.results.map((row: any): ApiSearchResult => {
      const cover = row.artworkUrl100
        ? row.artworkUrl100.replace('100x100bb', '600x600bb')
        : undefined;
      const year = row.releaseDate ? parseInt(row.releaseDate.slice(0, 4), 10) : undefined;
      const audioTotalMinutes = row.trackTimeMillis ? Math.round(row.trackTimeMillis / 60000) : 480;

      const chapterCount = Math.max(6, Math.min(20, Math.round(audioTotalMinutes / 35)));
      const chapters: BookChapter[] = Array.from({ length: chapterCount }, (_, i) => ({
        id: `ab_ch_${i + 1}`,
        number: i + 1,
        title: `Teil ${i + 1}: Abschnitt ${i + 1}`,
        read: false,
        durationMinutes: Math.round(audioTotalMinutes / chapterCount),
      }));

      const item: Partial<ApiSearchResult> = {
        id: `itunes_ab_${row.collectionId || Math.random()}`,
        sourceApi: 'itunes_audiobook',
        attribution: 'Daten: iTunes Store',
        title: row.collectionName || row.trackName,
        creator: row.artistName || 'Unbekannter Autor',
        narrator: row.authorName || 'Hörbuchsprecher',
        year,
        kind: 'audiobook',
        genres: row.primaryGenreName ? [row.primaryGenreName] : ['Hörbuch'],
        cover,
        audioTotalMinutes,
        chapters,
        notes: cleanHtml(row.description),
      };

      return {
        ...item,
        score: calculateRichnessScore(item),
      } as ApiSearchResult;
    });
  } catch (_err) {
    return [];
  }
}

// G. Video Games Search with Consoles and Achievements
async function searchGames(query: string): Promise<ApiSearchResult[]> {
  try {
    // Query iTunes Software/Games first
    const data = await apiJson<any>(
      'itunes',
      `/search?term=${encodeURIComponent(query)}&entity=software&limit=4&country=de&lang=de_de`,
    );
    if (!data) return [];
    if (!data.results || data.results.length === 0) return [];

    return data.results.map((row: any): ApiSearchResult => {
      const cover = row.artworkUrl512 || row.artworkUrl100;
      const year = row.releaseDate ? parseInt(row.releaseDate.slice(0, 4), 10) : undefined;

      // The App Store search only knows iPhone/iPad games.
      const detectedConsole = 'iOS / iPadOS';

      const item: Partial<ApiSearchResult> = {
        id: `game_${row.trackId}`,
        sourceApi: 'itunes_game',
        attribution: 'Daten: Apple Games',
        title: row.trackName,
        creator: row.sellerName || row.artistName || 'Spieleentwickler',
        year,
        kind: 'game',
        genres: row.genres ? row.genres.slice(0, 2) : ['Videospiel'],
        cover,
        platform: detectedConsole,
        console: detectedConsole,
        notes: row.description ? cleanHtml(row.description).slice(0, 350) : undefined,
      };

      return {
        ...item,
        score: calculateRichnessScore(item),
      } as ApiSearchResult;
    });
  } catch (_err) {
    return [];
  }
}

// G2. Steam Store API (Free official Steam PC games search)
async function searchSteamGames(query: string): Promise<ApiSearchResult[]> {
  try {
    const data = await apiJson<any>(
      'steam',
      `/api/storesearch/?term=${encodeURIComponent(query)}&l=german&cc=DE`,
    );
    if (!data) return [];
    if (!data.items || !Array.isArray(data.items)) return [];

    return data.items.slice(0, 5).map((entry: any): ApiSearchResult => {
      const cover = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${entry.id}/header.jpg`;
      const title = entry.name;

      const item: Partial<ApiSearchResult> = {
        id: `steam_${entry.id}`,
        sourceApi: 'steam',
        attribution: 'Daten: Steam Store',
        title,
        creator: 'Steam Publisher / Entwickler',
        kind: 'game',
        genres: ['Videospiel', 'PC / Steam'],
        cover,
        platform: 'PC / Steam',
        console: 'PC / Steam',
        notes: `Offizielles PC-Spiel auf Steam (App-ID: ${entry.id}). Unterstützt Controller & Steam Deck.`,
      };

      return {
        ...item,
        score: calculateRichnessScore(item) + 2,
      } as ApiSearchResult;
    });
  } catch (_err) {
    return [];
  }
}

// -------------------------------------------------------------
// 5. Next Volume Search Helper for Book Series
// -------------------------------------------------------------

export async function searchNextVolume(
  seriesTitle: string,
  volumeNumber: number,
): Promise<BookVolume> {
  const query = `${seriesTitle} Band ${volumeNumber}`;
  try {
    const { results } = await searchGoogleBooks(query);
    if (results && results.length > 0) {
      const match = results[0];
      return {
        id: `vol_${Date.now()}_${volumeNumber}`,
        volumeNumber,
        title: `Band ${volumeNumber}: ${
          match.title
            .replace(seriesTitle, '')
            .replace(/^[:,-]\s*/, '')
            .trim() || `Band ${volumeNumber}`
        }`,
        cover: match.cover,
        year: match.year,
        totalPages: match.totalPages,
        status: 'wishlist',
      };
    }
  } catch (_e) {}

  // Fallback volume
  return {
    id: `vol_${Date.now()}_${volumeNumber}`,
    volumeNumber,
    title: `Band ${volumeNumber}`,
    status: 'wishlist',
  };
}

/** Removes cached search answers older than two hours (they are only reused for that long). */
export async function pruneApiCache(): Promise<void> {
  const mn = await mininode();
  const rows = await mn.kv.list('apicache:');
  const old = rows.filter(
    (row) =>
      Date.now() - Number((row.value as { timestamp?: number } | null)?.timestamp ?? 0) > 7_200_000,
  );
  for (const row of old) await mn.kv.delete(row.key);
}

// Detailed Volume Candidate Search for UI Selection
export async function searchVolumeCandidates(
  seriesTitle: string,
  volumeNumber: number,
): Promise<ApiSearchResult[]> {
  const query = `${seriesTitle} Band ${volumeNumber}`;
  const response = await searchMediaApis(query, 'book', { category: 'book', sortBy: 'relevance' });
  return response.results;
}

// -------------------------------------------------------------
// 6. Semantic Query Processing
// -------------------------------------------------------------

function preprocessSemanticApiQuery(rawQuery: string): {
  cleanQuery: string;
  inferredKind?: MediaKind;
  translatedQuery?: string;
  originalForeignTitle?: string;
} {
  let q = rawQuery.trim();
  let inferredKind: MediaKind | undefined;
  let translatedQuery: string | undefined;
  let originalForeignTitle: string | undefined;

  // Check known translations
  const lowerQ = q.toLowerCase();
  for (const [key, val] of Object.entries(FOREIGN_TITLE_TRANSLATIONS)) {
    if (lowerQ === key || lowerQ.includes(key)) {
      translatedQuery = val.english;
      originalForeignTitle = val.original;
      inferredKind = val.kind;
      // German titles stay German: German editions are only found with the German title.
      q = preferGerman() && val.german ? val.german : val.english;
      break;
    }
  }

  // Kind inference
  if (/\b(hörbuch|audiobook|audiobooks|hören|gesprochen)\b/i.test(q)) {
    inferredKind = 'audiobook';
    q = q.replace(/\b(hörbuch|audiobook|audiobooks|hören|gesprochen)\b/gi, '').trim();
  } else if (/\b(manga|manhwa|manhua|light novel|comic|bücher|buch|roman|lesen)\b/i.test(q)) {
    inferredKind = 'book';
    q = q.replace(/\b(buch|bücher|roman|autor|von|vom|lesen)\b/gi, '').trim();
  } else if (/\b(serie|serien|staffel|folge|episodes?|tv show)\b/i.test(q)) {
    inferredKind = 'series';
    q = q.replace(/\b(serie|serien|staffel|folge|episodes?|tv show)\b/gi, '').trim();
  } else if (/\b(film|filme|movie|kino|regie)\b/i.test(q)) {
    inferredKind = 'film';
    q = q.replace(/\b(film|filme|movie|kino|regie)\b/gi, '').trim();
  } else if (/\b(spiel|spiele|game|games|gaming|konsole|zocken)\b/i.test(q)) {
    inferredKind = 'game';
    q = q.replace(/\b(spiel|spiele|game|games|gaming|konsole|zocken)\b/gi, '').trim();
  }

  return {
    cleanQuery: q || rawQuery.trim(),
    inferredKind,
    translatedQuery,
    originalForeignTitle,
  };
}

// -------------------------------------------------------------
// 7. Relevance & Richness Scoring Helpers
// -------------------------------------------------------------

function calculateRelevanceScore(item: ApiSearchResult, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase();
  const title = (item.title || '').toLowerCase();
  const orig = (item.originalTitle || '').toLowerCase();
  const eng = (item.englishTitle || '').toLowerCase();
  const series = (item.seriesTitle || '').toLowerCase();
  const creator = (item.creator || '').toLowerCase();

  let rel = 0;

  // Exact match
  if (title === q || orig === q || eng === q || series === q) {
    rel += 120;
  } else if (title.startsWith(q) || series.startsWith(q)) {
    rel += 75;
  } else if (title.includes(q)) {
    rel += 45;
  } else if (series.includes(q) || orig.includes(q) || eng.includes(q)) {
    rel += 30;
  } else if (creator.includes(q)) {
    rel += 20;
  }

  // Length difference penalty (closer length to query = higher relevance)
  const lenDiff = Math.abs(title.length - q.length);
  rel -= Math.min(25, lenDiff * 0.4);

  return rel;
}

// -------------------------------------------------------------
// 8. Main API Search Coordinator
// -------------------------------------------------------------

export async function searchMediaApis(
  query: string,
  preferredKind?: MediaKind,
  options?: SearchMediaApisOptions,
): Promise<MediaSearchResponse> {
  if (!navigator.onLine) {
    return { results: [], isOffline: true, originalQuery: query };
  }

  const { cleanQuery, inferredKind, translatedQuery, originalForeignTitle } =
    preprocessSemanticApiQuery(query);
  const _targetKind = preferredKind || inferredKind;
  const trimmed = cleanQuery || query.trim();
  const german = options?.preferGermanTitles ?? preferGerman();
  // Manga, anime and TV databases are indexed in English/romaji: they get the translation.
  const intlQuery = translatedQuery || trimmed;

  // Determine effective category filter
  let effectiveCategory: SearchCategoryTarget = options?.category || 'all';
  if (effectiveCategory === 'all') {
    if (preferredKind === 'book') effectiveCategory = 'book';
    else if (preferredKind === 'film' || preferredKind === 'series')
      effectiveCategory = 'film_series';
    else if (preferredKind === 'audiobook') effectiveCategory = 'audiobook';
    else if (preferredKind === 'game') effectiveCategory = 'game';
    else if (inferredKind === 'book') effectiveCategory = 'book';
    else if (inferredKind === 'film' || inferredKind === 'series')
      effectiveCategory = 'film_series';
    else if (inferredKind === 'audiobook') effectiveCategory = 'audiobook';
    else if (inferredKind === 'game') effectiveCategory = 'game';
  }

  const sortBy: SearchSortBy = options?.sortBy || 'richness';

  // Spell correction suggestion check
  const correctionSuggestion = findCorrectionSuggestion(trimmed);

  if (!trimmed || trimmed.length < 2) {
    return { results: [], isOffline: false, originalQuery: query };
  }

  // 1. Economical Caching in mn.kv (reused for 2 hours)
  const mn = await mininode();
  const cacheKey = `apicache:${german ? 'de' : 'xx'}:${effectiveCategory}:${sortBy}:${trimmed.toLowerCase()}`;
  try {
    const cached = (await mn.kv.get(cacheKey)) as unknown as {
      timestamp: number;
      results: ApiSearchResult[];
    } | null;
    if (
      cached &&
      Date.now() - cached.timestamp < 7200000 &&
      cached.results &&
      cached.results.length > 0
    ) {
      return {
        results: cached.results,
        isOffline: false,
        cached: true,
        correctionSuggestion,
        translatedQuery,
        originalQuery: query,
      };
    }
  } catch (_cacheErr) {}

  const keyMissingApis: { id: string; name: string; message: string; docs?: string }[] = [];
  const unavailableApis: { id: string; name: string; message: string }[] = [];
  let isRateLimited = false;

  try {
    const promises: Promise<ApiSearchResult[]>[] = [];

    // Query APIs specific to the category
    if (effectiveCategory === 'all' || effectiveCategory === 'book') {
      // 1. Google Books (host-level key)
      promises.push(
        searchGoogleBooks(trimmed).then((res) => {
          if (res.keyMissing) {
            keyMissingApis.push({
              id: 'google-books',
              name: 'Google Books',
              message:
                'Diese Funktion wird gerade eingerichtet. Sobald der Schlüssel hinterlegt ist, erscheinen hier die Daten.',
              docs: 'https://developers.google.com/books/docs/v1/using#APIKey',
            });
          }
          if (res.rateLimited) isRateLimited = true;
          if (res.unavailable) {
            unavailableApis.push({
              id: 'google-books',
              name: 'Google Books',
              message: 'Der Dienst ist gerade nicht erreichbar.',
            });
          }
          return res.results;
        }),
      );
      // 2. Jikan Manga API (Free: Manga, Manhwa, Light Novels)
      promises.push(searchJikanManga(intlQuery));
      // 3. MangaDex API (Free: Manga & Manhwa with volume details)
      promises.push(searchMangaDex(trimmed));
      if (intlQuery !== trimmed) promises.push(searchMangaDex(intlQuery));
      // 4. Open Library (Free: Literature, Chapter TOC)
      promises.push(searchOpenLibrary(trimmed));
      // 5. Gutendex (Free: Project Gutenberg classic books)
      promises.push(searchGutendex(trimmed));
    }

    if (effectiveCategory === 'all' || effectiveCategory === 'film_series') {
      // TMDB (The Movie Database via host-level key)
      const tmdbKind =
        preferredKind === 'film' ? 'film' : preferredKind === 'series' ? 'series' : undefined;
      promises.push(
        searchTMDB(trimmed, tmdbKind).then((res) => {
          if (res.keyMissing) {
            keyMissingApis.push({
              id: 'tmdb',
              name: 'The Movie Database (TMDB)',
              message:
                'Diese Funktion wird gerade eingerichtet. Sobald der Schlüssel hinterlegt ist, erscheinen hier die Daten.',
              docs: 'https://www.themoviedb.org/settings/api',
            });
          }
          if (res.rateLimited) isRateLimited = true;
          if (res.unavailable) {
            unavailableApis.push({
              id: 'tmdb',
              name: 'The Movie Database (TMDB)',
              message: 'Der Dienst ist gerade nicht erreichbar.',
            });
          }
          return res.results;
        }),
      );
      // TVMaze (Free: TV Series, Seasons & Episodes)
      promises.push(searchTVMaze(intlQuery));
      // iTunes Movies (Free: Film metadata & runtime)
      promises.push(searchItunesMovies(trimmed));
    }

    if (effectiveCategory === 'all' || effectiveCategory === 'audiobook') {
      // iTunes Audiobooks (Free: Audiobooks with narrator & runtime)
      promises.push(searchItunesAudiobooks(trimmed));
    }

    if (effectiveCategory === 'all' || effectiveCategory === 'game') {
      // Steam Store API (Free: PC/Steam Games)
      promises.push(searchSteamGames(trimmed));
      // iTunes Games & Software
      promises.push(searchGames(trimmed));
    }

    const allBatches = await Promise.all(promises);
    let combined = allBatches.flat();

    // Strict filter by category to exclude non-relevant media types
    if (effectiveCategory === 'book') {
      combined = combined.filter((it) => it.kind === 'book');
    } else if (effectiveCategory === 'film_series') {
      combined = combined.filter((it) => it.kind === 'film' || it.kind === 'series');
    } else if (effectiveCategory === 'audiobook') {
      combined = combined.filter((it) => it.kind === 'audiobook');
    } else if (effectiveCategory === 'game') {
      combined = combined.filter((it) => it.kind === 'game');
    }

    if (combined.length === 0) {
      return {
        results: [],
        isOffline: false,
        keyMissingApis: keyMissingApis.length > 0 ? keyMissingApis : undefined,
        unavailableApis: unavailableApis.length > 0 ? unavailableApis : undefined,
        isRateLimited: isRateLimited ? true : undefined,
        correctionSuggestion,
        translatedQuery,
        originalQuery: query,
      };
    }

    // German titles first where the source knows one; the other titles stay as alternatives.
    if (german) {
      for (const item of combined) {
        if (item.germanTitle && item.germanTitle !== item.title) {
          if (!item.englishTitle && item.title !== item.originalTitle)
            item.englishTitle = item.title;
          if (item.seriesTitle === item.title) item.seriesTitle = item.germanTitle;
          item.title = item.germanTitle;
        }
      }
    }

    // Attach foreign translation if available
    if (originalForeignTitle || translatedQuery) {
      combined.forEach((item) => {
        if (!item.originalTitle && originalForeignTitle) {
          item.originalTitle = originalForeignTitle;
        }
        if (!item.englishTitle && translatedQuery) {
          item.englishTitle = translatedQuery;
        }
      });
    }

    // Deduplication rule: Key by normalized title and kind
    const grouped = new Map<string, ApiSearchResult>();

    for (const item of combined) {
      const normTitle = item.title
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]/g, '')
        .trim();
      const key = `${normTitle}_${item.kind}`;

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, item);
      } else {
        if (item.score > existing.score) {
          // Merge volumes and rich details
          if (!item.volumes && existing.volumes) item.volumes = existing.volumes;
          if (!item.chapters && existing.chapters) item.chapters = existing.chapters;
          if (!item.episodes && existing.episodes) item.episodes = existing.episodes;
          grouped.set(key, item);
        }
      }
    }

    // Sort by selected mode: 'relevance' or 'richness' (most enriched data)
    const sorted = Array.from(grouped.values()).sort((a, b) => {
      // Prioritize Volume 1 for book series
      if (a.isBookSeries && b.isBookSeries) {
        if ((a.volumeNumber || 1) === 1 && (b.volumeNumber || 1) !== 1) return -1;
        if ((b.volumeNumber || 1) === 1 && (a.volumeNumber || 1) !== 1) return 1;
      }
      if (sortBy === 'relevance') {
        const relA = calculateRelevanceScore(a, trimmed);
        const relB = calculateRelevanceScore(b, trimmed);
        if (relB !== relA) return relB - relA;
      }
      return b.score - a.score;
    });

    // Cache in mn.kv
    try {
      await mn.kv.set(cacheKey, toJson({ timestamp: Date.now(), results: sorted }));
    } catch (_saveErr) {}

    return {
      results: sorted,
      isOffline: false,
      keyMissingApis: keyMissingApis.length > 0 ? keyMissingApis : undefined,
      unavailableApis: unavailableApis.length > 0 ? unavailableApis : undefined,
      isRateLimited: isRateLimited ? true : undefined,
      correctionSuggestion,
      translatedQuery,
      originalQuery: query,
    };
  } catch (_e: any) {
    if (!navigator.onLine) {
      return { results: [], isOffline: true, originalQuery: query };
    }
    return {
      results: [],
      isOffline: false,
      error: 'Mediensuche konnte nicht geladen werden.',
      keyMissingApis: keyMissingApis.length > 0 ? keyMissingApis : undefined,
      unavailableApis: unavailableApis.length > 0 ? unavailableApis : undefined,
      isRateLimited: isRateLimited ? true : undefined,
      correctionSuggestion,
      translatedQuery,
      originalQuery: query,
    };
  }
}
