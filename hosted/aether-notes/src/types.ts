/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TagType =
  | 'Kreativ'
  | 'Tagebuch'
  | 'Arbeit'
  | 'Planung'
  | 'Privat'
  | 'Idee'
  | 'Entwurf'
  | string;

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: TagType[];
  createdAt: string; // ISO String
  updatedAt?: string;
  type: 'text' | 'checklist';
  checklistItems?: { id: string; text: string; completed: boolean }[];
  accentBorder?: boolean;
  contactId?: string;
  photos?: string[];
}

export interface NewNoteInput {
  title: string;
  content: string;
  tags: TagType[];
  type: 'text' | 'checklist';
  checklistItems?: { id: string; text: string; completed: boolean }[];
  contactId?: string;
}

export type RoutineTimeOfDay =
  | 'Morgen'
  | 'Nachmittag'
  | 'Abend'
  | 'Morning'
  | 'Afternoon'
  | 'Evening';

export type ConnectionCategory = 'Family' | 'Friends' | 'Colleagues' | string;

export interface PersonConnection {
  targetId: string;
  type: string;
  description?: string;
}

export interface PersonInteractionLog {
  id: string;
  timestamp: string;
  note: string;
}

export interface Person {
  id: string;
  name: string;
  role?: string;
  category: string;
  avatarUrl?: string;
  initials?: string;
  lastSpoke: string;
  lastSpokeDate: string;
  notes?: string;
  interactionLogs?: PersonInteractionLog[];
  connections?: PersonConnection[];
  phone?: string;
  email?: string;
  address?: string;
  birthday?: string;
  tags?: string[];
  coffeePreference?: string;
  likes?: string;
  favoriteColor?: string;
  petsInfo?: string;
  job?: string;
  meetupPlan?: string;
  giftIdeas?: string;
  personalityType?: string;
  favoriteFood?: string;
  sensitiveTopics?: string;
  sharedGoals?: string;
}

export type JournalMood =
  | 'peaceful'
  | 'joyful'
  | 'reflective'
  | 'tired'
  | 'anxious'
  | 'zen'
  | 'energetic'
  | 'neutral'
  | 'low'
  | string;

export interface JournalEntry {
  id: string;
  title?: string;
  content?: string;
  text?: string;
  place?: string;
  peopleMetIds?: string[];
  date: string;
  mood: JournalMood;
  createdAt: string;
}

export interface Routine {
  id: string;
  title: string;
  description: string;
  timeOfDay: RoutineTimeOfDay;
  timeLabel: string; // e.g., "08:00"
  completed: boolean;
  duration?: string; // e.g. "15 Min."
}

export interface UserSettings {
  userName: string;
  userTitle: string;
  avatarUrl: string;
  streakDays: number;
  pushEnabled?: boolean;
}

export type KanbanColumn = 'todo' | 'in_progress' | 'review' | 'done';

export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
  column: KanbanColumn;
  priority: 'low' | 'medium' | 'high';
  category?: 'work' | 'personal';
  dueDate?: string;
  dueTime?: string;
  tags?: string[];
  createdAt: string;
  checklistItems?: { id: string; text: string; completed: boolean }[];
  position?: number;
}

export interface ContactConnection {
  targetId: string;
  type: string;
  description?: string;
}

export interface Contact {
  id: string;
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  address?: string;
  birthday?: string; // YYYY-MM-DD or MM-DD
  tags: string[];
  notes?: string;
  followUpDate?: string | null;
  followUpNote?: string;
  avatarUrl?: string;
  photos?: string[];
  category?: string; // z.B. Familie, Freunde, Kollegen, Partner
  connections?: ContactConnection[];
  coffeePreference?: string;
  likes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Interaction {
  id: string;
  contactId: string;
  date: string; // YYYY-MM-DD
  channel: 'call' | 'email' | 'meeting' | 'message' | string;
  summary: string;
  createdAt: number;
}

export interface Meetup {
  id: string;
  contactId: string; // References Contact.id
  contactIds?: string[]; // References multiple Contact.ids
  title: string; // Meetup title / Ziel
  date: string; // YYYY-MM-DD
  time?: string; // e.g. "14:00"
  location?: string; // e.g. "Café Grün", "Büro", "Zoom"
  preparationNotes?: string;
  completed?: boolean;
  createdAt: number;
}
