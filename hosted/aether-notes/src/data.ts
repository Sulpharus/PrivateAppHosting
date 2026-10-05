/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Contact,
  Interaction,
  JournalEntry,
  KanbanTask,
  Meetup,
  Note,
  Person,
  Routine,
  UserSettings,
} from './types';

export const INITIAL_SETTINGS: UserSettings = {
  userName: '',
  userTitle: '',
  avatarUrl: '',
  streakDays: 0,
  pushEnabled: true,
};

export const INITIAL_CONTACTS: Contact[] = [];
export const INITIAL_INTERACTIONS: Interaction[] = [];
export const INITIAL_MEETUPS: Meetup[] = [];
export const INITIAL_NOTES: Note[] = [];
export const INITIAL_ROUTINES: Routine[] = [];
export const INITIAL_KANBAN_TASKS: KanbanTask[] = [];
export const INITIAL_PEOPLE: Person[] = [];
export const INITIAL_JOURNAL_ENTRIES: JournalEntry[] = [];
