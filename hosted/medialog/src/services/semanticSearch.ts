/**
 * Semantic Search Engine for Medialog
 * Supports natural language queries, semantic synonyms, fuzzy matching,
 * intent extraction (kinds, book subcategories, statuses, ratings, years), and relevance ranking.
 */

import type { BookSubtype, MediaItem, MediaKind, MediaStatus } from '../types';

export interface SemanticMatchResult {
  item: MediaItem;
  score: number;
  matchedTerms: string[];
  semanticReason?: string;
}

// Semantic concept dictionary mapping concepts & synonyms to metadata categories
const SEMANTIC_SYNONYMS: Record<
  string,
  {
    kinds?: MediaKind[];
    subtypes?: BookSubtype[];
    genres?: string[];
    status?: MediaStatus[];
    minRating?: number;
  }
> = {
  // Manga / Manhwa / Manhua / Asian Comics
  manga: { kinds: ['book'], subtypes: ['Manga'] },
  mangas: { kinds: ['book'], subtypes: ['Manga'] },
  manhwa: { kinds: ['book'], subtypes: ['Manhwa'] },
  manhwas: { kinds: ['book'], subtypes: ['Manhwa'] },
  webtoon: { kinds: ['book'], subtypes: ['Manhwa'] },
  webtoons: { kinds: ['book'], subtypes: ['Manhwa'] },
  manhua: { kinds: ['book'], subtypes: ['Manhua'] },
  'light novel': { kinds: ['book'], subtypes: ['Light Novel'] },
  'light novels': { kinds: ['book'], subtypes: ['Light Novel'] },
  ranobe: { kinds: ['book'], subtypes: ['Light Novel'] },
  comic: { kinds: ['book'], subtypes: ['Comic'] },
  comics: { kinds: ['book'], subtypes: ['Comic'] },
  'graphic novel': { kinds: ['book'], subtypes: ['Graphic Novel'] },
  'graphic novels': { kinds: ['book'], subtypes: ['Graphic Novel'] },
  roman: { kinds: ['book'], subtypes: ['Roman'] },
  romane: { kinds: ['book'], subtypes: ['Roman'] },
  sachbuch: { kinds: ['book'], subtypes: ['Sachbuch'] },

  // Sci-Fi / Space / Tech
  'sci-fi': { genres: ['Science Fiction', 'Sci-Fi', 'Dystopie', 'Cyberpunk', 'Space'] },
  scifi: { genres: ['Science Fiction', 'Sci-Fi', 'Dystopie'] },
  'science fiction': { genres: ['Science Fiction', 'Sci-Fi'] },
  zukunft: { genres: ['Science Fiction', 'Dystopie', 'Utopie'] },
  weltall: { genres: ['Science Fiction', 'Space', 'Astronomie'] },
  raumfahrt: { genres: ['Science Fiction', 'Space'] },
  ki: { genres: ['Science Fiction', 'Künstliche Intelligenz', 'Dystopie', 'Tech'] },
  roboter: { genres: ['Science Fiction', 'KI', 'Dystopie'] },
  dystopie: { genres: ['Dystopie', 'Science Fiction', 'Thriller'] },

  // Thriller / Horror / Mystery
  spannung: { genres: ['Thriller', 'Krimi', 'Mystery', 'Psychothriller'] },
  thriller: { genres: ['Thriller', 'Psychothriller', 'Krimi'] },
  krimi: { genres: ['Krimi', 'Detektiv', 'Mord', 'Thriller'] },
  gruselig: { genres: ['Horror', 'Mystery', 'Spuk', 'Grusel'] },
  horror: { genres: ['Horror', 'Mystery'] },
  mystery: { genres: ['Mystery', 'Rätsel', 'Thriller'] },

  // Fantasy / Adventure / Action
  magie: { genres: ['Fantasy', 'Magie', 'Zauberei'] },
  fantasy: { genres: ['Fantasy', 'Abenteuer', 'High Fantasy', 'Supernatural'] },
  abenteuer: { genres: ['Abenteuer', 'Reise', 'Action'] },
  action: { genres: ['Action', 'Abenteuer', 'Kampf'] },
  dungeon: { genres: ['Fantasy', 'Action', 'Dungeon'] },
  episch: { genres: ['Epik', 'Fantasy', 'Abenteuer', 'Sci-Fi'], minRating: 8 },

  // Drama / Romance
  liebe: { genres: ['Romanze', 'Liebesroman', 'Drama'] },
  romantik: { genres: ['Romanze', 'Liebesroman'] },
  drama: { genres: ['Drama', 'Tragödie', 'Historisch'] },
  traurig: { genres: ['Drama', 'Melancholie'] },
  melancholisch: { genres: ['Drama', 'Roman', 'Gedankenvoll'] },

  // Gaming
  game: { kinds: ['game'] },
  gaming: { kinds: ['game'] },
  zocken: { kinds: ['game'] },
  videospiel: { kinds: ['game'] },
  'open world': { kinds: ['game'], genres: ['Open World', 'Erkundung'] },

  // Status semantics
  'am lesen': { kinds: ['book'], status: ['active'] },
  'lese ich gerade': { kinds: ['book'], status: ['active'] },
  aktuell: { status: ['active'] },
  'im gange': { status: ['active'] },
  angefangen: { status: ['active'] },
  ungelesen: { status: ['wishlist'] },
  vormerkung: { status: ['wishlist'] },
  gemerkt: { status: ['wishlist'] },
  wunschliste: { status: ['wishlist'] },
  tbr: { kinds: ['book'], status: ['wishlist'] },
  beendet: { status: ['done'] },
  gelesen: { kinds: ['book'], status: ['done'] },
  ausgelesen: { kinds: ['book'], status: ['done'] },
  fertig: { status: ['done'] },
  abgeschlossen: { status: ['done'] },
  durch: { status: ['done'] },
  gesehen: { kinds: ['film', 'series'], status: ['done'] },
  durchgespielt: { kinds: ['game'], status: ['done'] },

  // Quality / Rating semantics
  meisterwerk: { minRating: 10 },
  perfekt: { minRating: 10 },
  favorit: { minRating: 9 },
  beste: { minRating: 9 },
  top: { minRating: 8 },
  empfehlung: { minRating: 8 },
  gut: { minRating: 7 },
  '10 sterne': { minRating: 10 },
  '9 sterne': { minRating: 9 },
  '8 sterne': { minRating: 8 },

  // Media kinds
  buch: { kinds: ['book'] },
  bücher: { kinds: ['book'] },
  literatur: { kinds: ['book'] },
  film: { kinds: ['film'] },
  filme: { kinds: ['film'] },
  kino: { kinds: ['film'] },
  movie: { kinds: ['film'] },
  serie: { kinds: ['series'] },
  serien: { kinds: ['series'] },
  staffel: { kinds: ['series'] },
  spiel: { kinds: ['game'] },
  spiele: { kinds: ['game'] },
};

/**
 * Normalizes text for accent- and case-insensitivity
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Calculates Levenshtein distance for fuzzy typo tolerance
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Checks if query token fuzzy matches target word with tolerance
 */
function fuzzyTokenMatch(token: string, targetWord: string): boolean {
  if (targetWord.includes(token)) return true;
  if (token.length >= 4 && targetWord.length >= 4) {
    const maxDist = token.length > 6 ? 2 : 1;
    return levenshteinDistance(token, targetWord) <= maxDist;
  }
  return false;
}

/**
 * Executes full semantic search across items
 */
export function executeSemanticSearch(items: MediaItem[], rawQuery: string): SemanticMatchResult[] {
  const query = normalizeText(rawQuery);
  if (!query) {
    return items.map((item) => ({ item, score: 1, matchedTerms: [] }));
  }

  // Extract query tokens
  const tokens = query.split(/[\s,.;:!?+\-_]+/).filter((t) => t.length > 0);

  // Look for semantic concepts in query
  const triggeredConcepts: Array<{
    phrase: string;
    rule: (typeof SEMANTIC_SYNONYMS)[string];
  }> = [];

  for (const [phrase, rule] of Object.entries(SEMANTIC_SYNONYMS)) {
    if (query.includes(phrase)) {
      triggeredConcepts.push({ phrase, rule });
    }
  }

  // Parse rating threshold e.g. "8 sterne", "10/10", "9+"
  let explicitMinRating: number | undefined;
  const ratingMatch = query.match(/(\d+)\s*(sterne?|\/10|\+)/);
  if (ratingMatch) {
    const val = parseInt(ratingMatch[1], 10);
    if (val >= 1 && val <= 10) {
      explicitMinRating = val;
    }
  }

  // Parse explicit year e.g. "2024", "1984"
  let explicitYear: number | undefined;
  const yearMatch = query.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    explicitYear = parseInt(yearMatch[1], 10);
  }

  const results: SemanticMatchResult[] = [];

  for (const item of items) {
    let score = 0;
    const matchedTerms: string[] = [];
    const reasons: string[] = [];

    const normTitle = normalizeText(item.title);
    const normCreator = normalizeText(item.creator);
    const normNotes = normalizeText(item.notes || '');
    const normSubtype = normalizeText(item.bookSubtype || '');
    const normGenres = item.genres.map(normalizeText);
    const normTags = item.tags.map(normalizeText);
    const normChapter = normalizeText(item.currentChapter || '');
    const allTargetWords = [
      ...normTitle.split(/\s+/),
      ...normCreator.split(/\s+/),
      ...normSubtype.split(/\s+/),
      ...normGenres,
      ...normTags,
    ];

    // 1. Direct and fuzzy token matching
    for (const token of tokens) {
      let tokenMatched = false;

      // Title match (highest weight: 12 pts)
      if (normTitle.includes(token)) {
        score += 12;
        tokenMatched = true;
        matchedTerms.push(token);
      } else if (allTargetWords.some((w) => fuzzyTokenMatch(token, w))) {
        score += 8;
        tokenMatched = true;
        matchedTerms.push(token);
      }

      // Subtype match (e.g. "manga", "manhwa", "roman") (10 pts)
      if (normSubtype.includes(token)) {
        score += 10;
        tokenMatched = true;
        matchedTerms.push(token);
        reasons.push(`Format: ${item.bookSubtype}`);
      }

      // Creator match (8 pts)
      if (normCreator.includes(token)) {
        score += 8;
        tokenMatched = true;
        matchedTerms.push(token);
      }

      // Genre & tags match (6 pts)
      if (normGenres.some((g) => g.includes(token)) || normTags.some((t) => t.includes(token))) {
        score += 6;
        tokenMatched = true;
        matchedTerms.push(token);
      }

      // Notes & chapters match (4 pts)
      if (normNotes.includes(token) || normChapter.includes(token)) {
        score += 4;
        tokenMatched = true;
        matchedTerms.push(token);
      }

      if (tokenMatched) {
        score += 2;
      }
    }

    // 2. Semantic concept rules matching
    for (const { rule } of triggeredConcepts) {
      // Subtype match (e.g. Manga, Manhwa, Manhua, Roman)
      if (rule.subtypes && item.bookSubtype && rule.subtypes.includes(item.bookSubtype)) {
        score += 9;
        reasons.push(`Buch-Kategorie „${item.bookSubtype}“`);
      }

      // Kind match
      if (rule.kinds?.includes(item.kind)) {
        score += 6;
        reasons.push(`Kategorie „${item.kind}“`);
      }

      // Status match
      if (rule.status?.includes(item.status)) {
        score += 6;
        reasons.push(`Status „${item.status}“`);
      }

      // Genre synonym match
      if (rule.genres) {
        for (const genSyn of rule.genres) {
          const normGenSyn = normalizeText(genSyn);
          if (normGenres.some((g) => g.includes(normGenSyn) || normGenSyn.includes(g))) {
            score += 8;
            reasons.push(`Semantisches Genre „${genSyn}“`);
            break;
          }
        }
      }

      // Rating semantics
      if (rule.minRating && item.rating && item.rating >= rule.minRating) {
        score += 5;
        reasons.push(`Hohe Bewertung (★ ${item.rating}/10)`);
      }
    }

    // 3. Explicit rating filter bonus
    if (explicitMinRating !== undefined) {
      if (item.rating && item.rating >= explicitMinRating) {
        score += 8;
        reasons.push(`★ ${item.rating} ≥ ${explicitMinRating}`);
      } else {
        score -= 10;
      }
    }

    // 4. Explicit year match
    if (explicitYear !== undefined && item.year === explicitYear) {
      score += 10;
      reasons.push(`Jahr ${explicitYear}`);
    }

    // Include if score passes threshold
    if (score > 3) {
      results.push({
        item,
        score,
        matchedTerms,
        semanticReason: reasons.slice(0, 2).join(' · ') || undefined,
      });
    }
  }

  // Sort descending by semantic relevance score
  return results.sort((a, b) => b.score - a.score);
}
