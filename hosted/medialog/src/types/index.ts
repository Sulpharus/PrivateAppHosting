/**
 * Medialog Data Types
 */

export type MediaKind = 'book' | 'audiobook' | 'film' | 'series' | 'game' | 'collection';

export type BookSubtype =
  | 'Roman'
  | 'Manga'
  | 'Manhwa'
  | 'Manhua'
  | 'Light Novel'
  | 'Comic'
  | 'Graphic Novel'
  | 'Sachbuch';

export type MediaStatus = 'active' | 'wishlist' | 'done' | 'dropped';

export interface Episode {
  id: string;
  season: number;
  number: number;
  title: string;
  rating?: number; // 1 to 10
  notes?: string;
  watched: boolean;
  watchedAt?: string;
  runtimeMinutes?: number;
}

export interface SeasonInfo {
  season: number;
  episodeCount: number;
  name?: string;
}

export interface BookChapter {
  id: string;
  number: number;
  title: string;
  read?: boolean;
  readAt?: string;
  durationMinutes?: number; // for audiobooks
}

export interface BookVolume {
  id: string;
  volumeNumber: number; // 1, 2, 3...
  title: string; // z. B. "Band 1", "Volume 1: Der Einstieg"
  originalTitle?: string;
  year?: number;
  cover?: string;
  totalPages?: number;
  currentPage?: number;
  chapters?: BookChapter[];
  currentChapter?: string;
  status: MediaStatus;
  rating?: number;
  notes?: string;
  readAt?: string;
  finished?: string;
}

export interface GameAchievement {
  id: string;
  title: string;
  description?: string;
  unlocked: boolean;
  unlockedAt?: string;
  points?: number;
}

export interface ConsumptionLogEntry {
  id: string;
  workId: string;
  workTitle: string;
  kind: MediaKind;
  date: string; // YYYY-MM-DD
  action: string; // e.g. "Kapitel 4 gelesen", "Folge 3 geschaut", "Band 2 beendet", "1.5h gehört"
  progressNote?: string;
  rating?: number;
}

export interface MediaHistoryEntry {
  at: string;
  note: string;
  rating?: number;
}

export interface MediaItem {
  id: string;
  title: string;
  originalTitle?: string; // z. B. Shingeki no Kyojin / 進撃の巨人
  englishTitle?: string; // Übersetzter englischer Titel, falls weder deutsch noch englisch
  creator: string; // Autor, Zeichner, Regisseur, Studio
  year?: number;
  kind: MediaKind;
  bookSubtype?: BookSubtype; // Subkategorie für Bücher
  genres: string[];
  tags: string[];
  status: MediaStatus;
  rating?: number; // 1 to 10 stars/points
  notes?: string;
  cover?: string; // Image URL or data URL
  photos?: string[];
  started?: string;
  finished?: string;

  // Buchreihen (Series of volumes)
  isBookSeries?: boolean; // Kennzeichnet, ob es eine Buch- oder Mangareihe ist
  seriesTitle?: string;
  volumes?: BookVolume[]; // Alle Bände der Reihe in einem gemeinsamen Eintrag
  selectedVolumeId?: string; // Der gerade im Fokus stehende Band

  // Progress tracking
  currentPage?: number;
  totalPages?: number;
  currentChapter?: string; // z. B. "Kapitel 142" oder "Ch. 85"
  totalChapters?: string;
  currentVolume?: number; // Für Manga/Manhwa/Comics: Aktueller Band / Volume
  totalVolumes?: number;
  chapters?: BookChapter[]; // Namensliste von Chaptern/Inhaltsverzeichnis

  // Audiobooks
  narrator?: string; // Sprecher
  audioTotalMinutes?: number; // Gesamtlaufzeit in Minuten
  audioCurrentMinutes?: number; // Gehörte Minuten

  // Series
  currentSeason?: number;
  currentEpisode?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
  seasonDetails?: SeasonInfo[]; // Episoden pro Staffel
  episodes?: Episode[];

  // Movies / Games
  runtimeMinutes?: number;
  watchedMinutes?: number;
  hoursPlayed?: number;
  platform?: string;
  console?: string; // Konsole: 'Nintendo Switch', 'PlayStation 5', 'PC', etc.
  achievements?: GameAchievement[]; // Achievementlisten von Videospielen

  history?: MediaHistoryEntry[];
  consumptionLogs?: ConsumptionLogEntry[];
  listIds?: string[];

  // Ownership & collaboration
  ownerId: string;
  by?: string;
  updatedAt: string;
  /** User ids this is shared with (see services/sharing.ts). */
  sharedWith?: string[];
  sharedWithNames?: string[];
}

export interface ListItemSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface ListCustomItem {
  id: string;
  title: string;
  done: boolean;
  notes?: string;
  position: number;
  subtasks?: ListItemSubtask[];
  linkedMediaId?: string;
}

export interface MediaList {
  id: string;
  title: string;
  description?: string;
  kind: 'watchlist' | 'readinglist' | 'custom' | 'shopping' | 'checklist';
  itemIds: string[]; // Linked MediaItem ids
  customItems?: ListCustomItem[];
  sharedWith?: string[];
  sharedWithNames?: string[];
  updatedAt: string;
  ownerId: string;
  by?: string;
}

export interface MiniNodeUser {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
}
