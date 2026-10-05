/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import CelebrationModal from './components/CelebrationModal';
import ContactsView from './components/ContactsView';
import DashboardView from './components/DashboardView';
import KanbanView from './components/KanbanView';
import NoteModal from './components/NoteModal';
import NotesLibraryView from './components/NotesLibraryView';
import PeopleView from './components/PeopleView';
import RoutinesView from './components/RoutinesView';
import SettingsView from './components/SettingsView';
import Sidebar from './components/Sidebar';
import { useTranslation } from './contexts/TranslationContext';
import {
  INITIAL_CONTACTS,
  INITIAL_INTERACTIONS,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_KANBAN_TASKS,
  INITIAL_MEETUPS,
  INITIAL_NOTES,
  INITIAL_PEOPLE,
  INITIAL_ROUTINES,
  INITIAL_SETTINGS,
} from './data';
import {
  cancelMiniNodeReminder,
  MiniNode,
  type MiniNodeUser,
  scheduleMiniNodeReminder,
} from './mininode';
import type {
  Contact,
  Interaction,
  JournalEntry,
  KanbanTask,
  Meetup,
  Note,
  Person,
  Routine,
  TagType,
  UserSettings,
} from './types';

export default function App() {
  const { language, setLanguage, t } = useTranslation();
  // Navigation State
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'library' | 'routines' | 'people' | 'contacts' | 'settings' | 'kanban'
  >('dashboard');

  // MiniNode Session & Loading States
  const [currentUser, setCurrentUser] = useState<MiniNodeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Application States
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [routines, setRoutines] = useState<Routine[]>(INITIAL_ROUTINES);
  const [people, setPeople] = useState<Person[]>(INITIAL_PEOPLE);
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [interactions, setInteractions] = useState<Interaction[]>(INITIAL_INTERACTIONS);
  const [meetups, setMeetups] = useState<Meetup[]>(INITIAL_MEETUPS);
  const [settings, setSettings] = useState<UserSettings>(INITIAL_SETTINGS);
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>(INITIAL_KANBAN_TASKS);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(INITIAL_JOURNAL_ENTRIES);

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('aether_dark_mode') === 'true';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('aether_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('aether_dark_mode', 'false');
    }
  }, [isDarkMode]);

  const handleToggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  // Modal Note State
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Async Initialization from MiniNode API
  const bootstrap = async (user: MiniNodeUser, isMounted: boolean) => {
    try {
      const [
        notesMap,
        routinesMap,
        peopleMap,
        kanbanMap,
        journalMap,
        contactsMap,
        interactionsMap,
        meetupsMap,
        savedSettings,
      ] = await Promise.all([
        MiniNode.db.list('notes'),
        MiniNode.db.list('routines'),
        MiniNode.db.list('people'),
        MiniNode.db.list('kanban_tasks'),
        MiniNode.db.list('journal_entries'),
        MiniNode.db.list('contacts'),
        MiniNode.db.list('interactions'),
        MiniNode.db.list('meetups'),
        MiniNode.db.getItem('aether_settings_v1'),
      ]);

      if (!isMounted) return;

      const loadedNotes = Object.values(notesMap) as Note[];
      const loadedRoutines = Object.values(routinesMap) as Routine[];
      const loadedPeople = Object.values(peopleMap) as Person[];
      const loadedKanban = Object.values(kanbanMap) as KanbanTask[];
      const loadedJournal = Object.values(journalMap) as JournalEntry[];
      const loadedContacts = Object.values(contactsMap) as Contact[];
      const loadedInteractions = Object.values(interactionsMap) as Interaction[];
      const loadedMeetups = Object.values(meetupsMap) as Meetup[];

      // Purge any stored sample/example records from storage
      const SAMPLE_IDS = new Set([
        'p-1',
        'p-2',
        'p-3',
        'c-1',
        'c-2',
        'c-3',
        'i-1',
        'i-2',
        'm-1',
        'm-2',
        'n-1',
        'n-2',
        'n-3',
        'r-1',
        'r-2',
        'r-3',
        'k-1',
        'k-2',
        'k-3',
        'k-4',
        'j-1',
        'j-2',
      ]);

      for (const id of SAMPLE_IDS) {
        if (notesMap[id]) await MiniNode.db.remove('notes', id);
        if (routinesMap[id]) await MiniNode.db.remove('routines', id);
        if (peopleMap[id]) await MiniNode.db.remove('people', id);
        if (kanbanMap[id]) await MiniNode.db.remove('kanban_tasks', id);
        if (journalMap[id]) await MiniNode.db.remove('journal_entries', id);
        if (contactsMap[id]) await MiniNode.db.remove('contacts', id);
        if (interactionsMap[id]) await MiniNode.db.remove('interactions', id);
        if (meetupsMap[id]) await MiniNode.db.remove('meetups', id);
      }

      setNotes(loadedNotes.filter((n) => !SAMPLE_IDS.has(n.id)));
      setRoutines(loadedRoutines.filter((r) => !SAMPLE_IDS.has(r.id)));
      setPeople(loadedPeople.filter((p) => !SAMPLE_IDS.has(p.id)));
      setKanbanTasks(loadedKanban.filter((t) => !SAMPLE_IDS.has(t.id)));
      setJournalEntries(
        loadedJournal
          .filter((j) => !SAMPLE_IDS.has(j.id))
          .sort((a, b) => b.date.localeCompare(a.date)),
      );
      setContacts(loadedContacts.filter((c) => !SAMPLE_IDS.has(c.id)));
      setInteractions(loadedInteractions.filter((i) => !SAMPLE_IDS.has(i.id)));
      setMeetups(loadedMeetups.filter((m) => !SAMPLE_IDS.has(m.id)));

      if (savedSettings) {
        setSettings(savedSettings);
      } else {
        const initial = {
          ...INITIAL_SETTINGS,
          userName: user.username || INITIAL_SETTINGS.userName,
        };
        await MiniNode.db.setItem('aether_settings_v1', initial);
        setSettings(initial);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to bootstrap app state:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function initGate() {
      try {
        const user = await MiniNode.auth.requireLogin();
        if (!isMounted) return;
        setCurrentUser(user);
        await bootstrap(user, isMounted);
      } catch (err) {
        console.error('Error in login gate:', err);
      }
    }

    initGate();

    // Listen for sign-out/sign-in changes to force reload state safely
    const unsubscribe = MiniNode.auth.onChange(async (u) => {
      if (!u && !isLoading) {
        setIsLoading(true);
        setCurrentUser(null);
        const reUser = await MiniNode.auth.requireLogin();
        if (isMounted) {
          setCurrentUser(reUser);
          bootstrap(reUser, isMounted);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Routine Completion Check-off Handler
  const handleToggleRoutine = async (id: string) => {
    let targetRoutine: Routine | undefined;
    setRoutines((prev) => {
      const updated = prev.map((r) => {
        if (r.id === id) {
          targetRoutine = { ...r, completed: !r.completed };
          return targetRoutine;
        }
        return r;
      });

      const wasAllCompletedBefore = prev.length > 0 && prev.every((r) => r.completed);
      const isAllCompletedNow = updated.length > 0 && updated.every((r) => r.completed);

      if (isAllCompletedNow && !wasAllCompletedBefore) {
        // Automatically update the daily streak when finishing all daily routines
        setSettings((s) => {
          const next = { ...s, streakDays: s.streakDays + 1 };
          MiniNode.db.setItem('aether_settings_v1', next);
          return next;
        });
        setShowCelebration(true);
      }

      return updated;
    });

    if (targetRoutine) {
      await MiniNode.db.set('routines', id, targetRoutine);
    }
  };

  // Delete routine handler
  const handleDeleteRoutine = async (id: string) => {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    await MiniNode.db.remove('routines', id);
  };

  // Start New Day Handler
  const handleStartNewDay = async (completedAll: boolean) => {
    // 1. Reset all routines completion states
    setRoutines((prev) => {
      const updated = prev.map((r) => ({ ...r, completed: false }));
      // Save all updated routines back to MiniNode.db
      updated.forEach(async (r) => {
        await MiniNode.db.set('routines', r.id, r);
      });
      return updated;
    });

    // 2. Adjust streak: if they didn't complete all routines, set streakDays to 0
    if (!completedAll) {
      setSettings((s) => {
        const next = { ...s, streakDays: 0 };
        MiniNode.db.setItem('aether_settings_v1', next);
        return next;
      });
    }
  };

  // Delete person handler
  const handleDeletePerson = async (id: string) => {
    setPeople((prev) => prev.filter((p) => p.id !== id));
    await MiniNode.db.remove('people', id);
  };

  // Add routine handler
  const handleAddNewRoutine = async (newRoutineData: Omit<Routine, 'id' | 'completed'>) => {
    const newRoutine: Routine = {
      ...newRoutineData,
      id: `routine-${Date.now()}`,
      completed: false,
    };
    setRoutines((prev) => [...prev, newRoutine]);
    await MiniNode.db.set('routines', newRoutine.id, newRoutine);
  };

  // Note Interaction Handlers
  const handleOpenEditNote = (note: Note) => {
    setSelectedNote(note);
    setIsNoteModalOpen(true);
  };

  const handleOpenNewNote = () => {
    setSelectedNote(null);
    setIsNoteModalOpen(true);
  };

  // Save / Edit Note
  const handleSaveNote = async (noteData: {
    id?: string;
    title: string;
    content: string;
    tags: TagType[];
    type: 'text' | 'checklist';
    checklistItems?: { id: string; text: string; completed: boolean }[];
  }) => {
    if (noteData.id) {
      // Editing existing note
      const existing = notes.find((n) => n.id === noteData.id);
      const updatedNote: Note = {
        id: noteData.id,
        title: noteData.title,
        content: noteData.content,
        tags: noteData.tags,
        type: noteData.type,
        checklistItems: noteData.checklistItems,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accentBorder: existing?.accentBorder,
      };
      setNotes((prev) => prev.map((n) => (n.id === noteData.id ? updatedNote : n)));
      await MiniNode.db.set('notes', updatedNote.id, updatedNote);
    } else {
      // Creating a new note
      const newNote: Note = {
        id: `note-${Date.now()}`,
        title: noteData.title,
        content: noteData.content,
        tags: noteData.tags,
        type: noteData.type,
        checklistItems: noteData.checklistItems,
        createdAt: new Date().toISOString(),
      };
      setNotes((prev) => [newNote, ...prev]);
      await MiniNode.db.set('notes', newNote.id, newNote);
    }
    // Close modal
    setIsNoteModalOpen(false);
    setSelectedNote(null);
  };

  // Delete note
  const handleDeleteNote = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setIsNoteModalOpen(false);
    setSelectedNote(null);
    await MiniNode.db.remove('notes', id);
  };

  // Toggle checklist item within library view
  const handleToggleLibraryChecklist = async (noteId: string, itemId: string) => {
    let updatedNote: Note | undefined;
    setNotes((prev) =>
      prev.map((note) => {
        if (note.id === noteId && note.checklistItems) {
          updatedNote = {
            ...note,
            checklistItems: note.checklistItems.map((item) =>
              item.id === itemId ? { ...item, completed: !item.completed } : item,
            ),
          };
          return updatedNote;
        }
        return note;
      }),
    );
    if (updatedNote) {
      await MiniNode.db.set('notes', noteId, updatedNote);
    }
  };

  // Update person connection data
  const handleUpdatePerson = async (updatedPerson: Person) => {
    setPeople(
      (prev) =>
        prev
          .map((person) => (person.id === updatedPerson.id ? updatedPerson : person))
          .sort((a, b) => b.lastSpokeDate.localeCompare(a.lastSpokeDate)), // Sort recent spoken first
    );
    await MiniNode.db.set('people', updatedPerson.id, updatedPerson);
  };

  // Create connection diary person
  const handleAddNewPerson = async (
    personData: Omit<Person, 'id' | 'lastSpoke' | 'lastSpokeDate'>,
  ) => {
    const newPerson: Person = {
      ...personData,
      id: `person-${Date.now()}`,
      lastSpoke: 'Just added',
      lastSpokeDate: new Date().toISOString(),
      interactionLogs: personData.notes
        ? [
            {
              id: `log-${Date.now()}`,
              timestamp: new Date().toISOString(),
              note: personData.notes,
            },
          ]
        : [],
    };
    setPeople((prev) => [newPerson, ...prev]);
    await MiniNode.db.set('people', newPerson.id, newPerson);
  };

  // CRM Action Handlers
  const handleAddContact = async (
    contactData: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> => {
    const id = `contact-${Date.now()}`;
    const newContact: Contact = {
      id,
      ...contactData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await MiniNode.db.set('contacts', id, newContact);
    setContacts((prev) => [...prev, newContact]);
    if (newContact.followUpDate) {
      await scheduleMiniNodeReminder({
        key: `contact:${id}`,
        at: newContact.followUpDate,
        title: `Nachfassen: ${newContact.name}`,
        body: newContact.followUpNote || 'Wiedervorlage fällig',
        path: '/contacts',
      });
    } else if (MiniNode.notify) {
      await MiniNode.notify('Kontakt gespeichert', `Profil angelegt: ${newContact.name}`);
    }
    return id;
  };

  const handleUpdateContact = async (updated: Contact) => {
    await MiniNode.db.set('contacts', updated.id, updated);
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (updated.followUpDate) {
      await scheduleMiniNodeReminder({
        key: `contact:${updated.id}`,
        at: updated.followUpDate,
        title: `Nachfassen: ${updated.name}`,
        body: updated.followUpNote || 'Wiedervorlage fällig',
        path: '/contacts',
      });
    } else {
      await cancelMiniNodeReminder(`contact:${updated.id}`);
    }
  };

  const handleDeleteContact = async (id: string) => {
    await MiniNode.db.remove('contacts', id);
    await cancelMiniNodeReminder(`contact:${id}`);
    setContacts((prev) => prev.filter((c) => c.id !== id));

    const targetInts = interactions.filter((i) => i.contactId === id);
    for (const i of targetInts) {
      await MiniNode.db.remove('interactions', i.id);
    }
    setInteractions((prev) => prev.filter((i) => i.contactId !== id));

    const updatedMeetups: Meetup[] = [];
    for (const m of meetups) {
      const ids = m.contactIds || (m.contactId ? [m.contactId] : []);
      if (ids.includes(id)) {
        const remainingIds = ids.filter((cid) => cid !== id);
        if (remainingIds.length === 0) {
          await MiniNode.db.remove('meetups', m.id);
          await cancelMiniNodeReminder(`meetup:${m.id}`);
        } else {
          const updatedM: Meetup = {
            ...m,
            contactIds: remainingIds,
            contactId: remainingIds[0] || '',
          };
          await MiniNode.db.set('meetups', m.id, updatedM);
          updatedMeetups.push(updatedM);
        }
      } else {
        updatedMeetups.push(m);
      }
    }
    setMeetups(updatedMeetups);
  };

  const handleAddInteraction = async (intData: Omit<Interaction, 'id' | 'createdAt'>) => {
    const id = `int-${Date.now()}`;
    const newInt: Interaction = {
      id,
      ...intData,
      createdAt: Date.now(),
    };
    await MiniNode.db.set('interactions', id, newInt);
    setInteractions((prev) => [...prev, newInt]);

    const contact = contacts.find((c) => c.id === intData.contactId);
    if (contact) {
      const updated = { ...contact, updatedAt: Date.now() };
      await MiniNode.db.set('contacts', contact.id, updated);
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? updated : c)));
    }
  };

  const handleDeleteInteraction = async (id: string) => {
    await MiniNode.db.remove('interactions', id);
    setInteractions((prev) => prev.filter((i) => i.id !== id));
  };

  const handleLinkNoteToContact = async (noteId: string, contactId: string | undefined) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      const updatedNote = { ...note, contactId };
      await MiniNode.db.set('notes', noteId, updatedNote);
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updatedNote : n)));
    }
  };

  const handleAddMeetup = async (meetupData: Omit<Meetup, 'id' | 'createdAt'>) => {
    const id = `meetup-${Date.now()}`;
    const newMeetup: Meetup = {
      id,
      ...meetupData,
      createdAt: Date.now(),
    };
    await MiniNode.db.set('meetups', id, newMeetup);
    setMeetups((prev) => [...prev, newMeetup]);

    const ids = meetupData.contactIds || (meetupData.contactId ? [meetupData.contactId] : []);
    const contactNames = ids.map((cid) => contacts.find((c) => c.id === cid)?.name).filter(Boolean);
    const contactName = contactNames.join(', ') || 'Kontakt';

    if (newMeetup.date) {
      await scheduleMiniNodeReminder({
        key: `meetup:${id}`,
        at: newMeetup.date,
        title: `Treffen: ${newMeetup.title || contactName}`,
        body: `${newMeetup.time ? `${newMeetup.time} Uhr ` : ''}${newMeetup.location ? `in ${newMeetup.location}` : ''}`,
        path: '/contacts',
      });
    } else if (MiniNode.notify) {
      await MiniNode.notify('Treffen geplant', `Treffen mit ${contactName} am ${meetupData.date}`);
    }
  };

  const handleUpdateMeetup = async (updated: Meetup) => {
    await MiniNode.db.set('meetups', updated.id, updated);
    setMeetups((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    if (updated.date && !updated.completed) {
      await scheduleMiniNodeReminder({
        key: `meetup:${updated.id}`,
        at: updated.date,
        title: `Treffen: ${updated.title}`,
        body: `${updated.time ? `${updated.time} Uhr ` : ''}${updated.location ? `in ${updated.location}` : ''}`,
        path: '/contacts',
      });
    } else {
      await cancelMiniNodeReminder(`meetup:${updated.id}`);
    }
  };

  const handleDeleteMeetup = async (id: string) => {
    await MiniNode.db.remove('meetups', id);
    await cancelMiniNodeReminder(`meetup:${id}`);
    setMeetups((prev) => prev.filter((m) => m.id !== id));
  };

  // Kanban Task Action Handlers
  const handleAddKanbanTask = async (taskData: Omit<KanbanTask, 'id' | 'createdAt'>) => {
    const id = `k-task-${Date.now()}`;
    const newTask: KanbanTask = {
      ...taskData,
      id,
      createdAt: new Date().toISOString(),
    };
    setKanbanTasks((prev) => [newTask, ...prev]);
    await MiniNode.db.set('kanban_tasks', id, newTask);
    if (newTask.dueDate) {
      await scheduleMiniNodeReminder({
        key: `task:${id}`,
        at: newTask.dueDate,
        title: `Fällige Aufgabe: ${newTask.title}`,
        body: newTask.description,
        path: '/kanban',
      });
    }
  };

  const handleUpdateKanbanTask = async (updatedTask: KanbanTask) => {
    setKanbanTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
    await MiniNode.db.set('kanban_tasks', updatedTask.id, updatedTask);
    if (updatedTask.dueDate && updatedTask.column !== 'done') {
      await scheduleMiniNodeReminder({
        key: `task:${updatedTask.id}`,
        at: updatedTask.dueDate,
        title: `Fällige Aufgabe: ${updatedTask.title}`,
        body: updatedTask.description,
        path: '/kanban',
      });
    } else {
      await cancelMiniNodeReminder(`task:${updatedTask.id}`);
    }
  };

  const handleDeleteKanbanTask = async (id: string) => {
    setKanbanTasks((prev) => prev.filter((task) => task.id !== id));
    await MiniNode.db.remove('kanban_tasks', id);
    await cancelMiniNodeReminder(`task:${id}`);
  };

  // Clear spaces / Restore defaults
  const handleResetToDefaults = async () => {
    // Clear collections
    for (const note of notes) {
      await MiniNode.db.remove('notes', note.id);
    }
    for (const r of routines) {
      await MiniNode.db.remove('routines', r.id);
    }
    for (const p of people) {
      await MiniNode.db.remove('people', p.id);
    }
    for (const t of kanbanTasks) {
      await MiniNode.db.remove('kanban_tasks', t.id);
    }
    for (const je of journalEntries) {
      await MiniNode.db.remove('journal_entries', je.id);
    }
    for (const c of contacts) {
      await MiniNode.db.remove('contacts', c.id);
    }
    for (const i of interactions) {
      await MiniNode.db.remove('interactions', i.id);
    }
    for (const m of meetups) {
      await MiniNode.db.remove('meetups', m.id);
    }

    // Reset default settings
    const defaultWithUser = {
      ...INITIAL_SETTINGS,
      userName: currentUser?.username || INITIAL_SETTINGS.userName,
    };
    await MiniNode.db.setItem('aether_settings_v1', defaultWithUser);

    setNotes([]);
    setRoutines([]);
    setPeople([]);
    setContacts([]);
    setInteractions([]);
    setMeetups([]);
    setSettings(defaultWithUser);
    setKanbanTasks([]);
    setJournalEntries([]);
    setActiveTab('dashboard');
  };

  // Add journal entries handler
  const handleAddNewJournalEntry = async (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => {
    const newEntry: JournalEntry = {
      ...entry,
      id: `journal-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setJournalEntries((prev) => [newEntry, ...prev]);
    await MiniNode.db.set('journal_entries', newEntry.id, newEntry);
  };

  // Delete journal entries handler
  const handleDeleteJournalEntry = async (id: string) => {
    setJournalEntries((prev) => prev.filter((e) => e.id !== id));
    await MiniNode.db.remove('journal_entries', id);
  };

  // Dynamic Greeting Quick Ritual Adder
  const handleAddQuickRitual = () => {
    const titleVal = window.prompt('Schedule a quick daily ritual:');
    if (!titleVal) return;
    handleAddNewRoutine({
      title: titleVal,
      description: 'Custom quick daily task',
      timeOfDay: new Date().getHours() < 12 ? 'Morning' : 'Afternoon',
      timeLabel: new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      duration: '10 mins',
    });
  };

  const handleSaveSettings = async (nextSettings: UserSettings) => {
    setSettings(nextSettings);
    await MiniNode.db.setItem('aether_settings_v1', nextSettings);
  };

  const handleImportBackup = async (
    importedData: any,
  ): Promise<{ count: number; error?: string }> => {
    if (!importedData || typeof importedData !== 'object') {
      return {
        count: 0,
        error: language === 'de' ? 'Ungültiges Dateiformat' : 'Invalid file format',
      };
    }

    const data = importedData.data || importedData;
    let count = 0;

    if (Array.isArray(data.notes)) {
      for (const note of data.notes) {
        if (note && note.id && note.title) {
          await MiniNode.db.set('notes', note.id, note);
          count++;
        }
      }
    }

    if (Array.isArray(data.routines)) {
      for (const r of data.routines) {
        if (r && r.id && r.title) {
          await MiniNode.db.set('routines', r.id, r);
          count++;
        }
      }
    }

    if (Array.isArray(data.people)) {
      for (const p of data.people) {
        if (p && p.id && p.name) {
          await MiniNode.db.set('people', p.id, p);
          count++;
        }
      }
    }

    if (Array.isArray(data.contacts)) {
      for (const c of data.contacts) {
        if (c && c.id && c.name) {
          await MiniNode.db.set('contacts', c.id, c);
          count++;
        }
      }
    }

    if (Array.isArray(data.interactions)) {
      for (const i of data.interactions) {
        if (i && i.id && i.contactId) {
          await MiniNode.db.set('interactions', i.id, i);
          count++;
        }
      }
    }

    if (Array.isArray(data.meetups)) {
      for (const m of data.meetups) {
        if (m && m.id) {
          await MiniNode.db.set('meetups', m.id, m);
          count++;
        }
      }
    }

    if (Array.isArray(data.kanbanTasks)) {
      for (const t of data.kanbanTasks) {
        if (t && t.id && t.title) {
          await MiniNode.db.set('kanban_tasks', t.id, t);
          count++;
        }
      }
    }

    if (Array.isArray(data.journalEntries)) {
      for (const je of data.journalEntries) {
        if (je && je.id && je.text) {
          await MiniNode.db.set('journal_entries', je.id, je);
          count++;
        }
      }
    }

    if (data.settings && typeof data.settings === 'object') {
      await MiniNode.db.setItem('aether_settings_v1', data.settings);
    }

    if (currentUser) {
      await bootstrap(currentUser, true);
    }

    return { count };
  };

  const handleLogout = async () => {
    setIsLoading(true);
    setCurrentUser(null);
    await MiniNode.auth.logout();
  };

  if (isLoading) {
    return (
      <div
        id="mininode-auth-loading animate-fade-in"
        className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center font-sans select-none"
      >
        <div className="w-16 h-16 relative mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-primary/10"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
          <span
            className="material-symbols-outlined text-primary text-3xl absolute inset-0 m-auto w-fit h-fit"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            stylus_note
          </span>
        </div>
        <h2 className="text-xl font-bold font-sans tracking-tight text-on-background mb-1">
          Aether Notes
        </h2>
        <p className="font-serif text-xs italic text-on-surface-variant/75 max-w-xs leading-normal">
          Connecting to your secure host profile...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-background text-on-background font-sans antialiased min-h-screen flex flex-col md:flex-row min-w-0">
      {/* Sidebar navigation component */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        settings={settings}
        onNewNoteClick={handleOpenNewNote}
        streakCount={settings.streakDays}
        currentUser={currentUser}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
      />

      {/* Main Canvas Area */}
      <main className="flex-1 w-full ml-0 md:ml-64 pt-16 md:pt-6 pb-20 md:pb-10 px-5 md:px-12 min-h-screen overflow-x-hidden relative">
        {/* Global Top-Right Quick Bar */}
        <div className="absolute top-4 right-5 md:top-6 md:right-12 hidden md:flex items-center gap-2.5 z-50 select-none">
          {/* Language Toggle */}
          <div className="flex bg-surface-container-high/60 border border-outline-variant/20 p-1 rounded-lg gap-1 items-center shadow-xs backdrop-blur-md">
            <button
              onClick={() => setLanguage('en')}
              className={`px-2 py-1 rounded-md text-[9px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                language === 'en'
                  ? 'bg-primary text-on-primary shadow-2xs font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('de')}
              className={`px-2 py-1 rounded-md text-[9px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                language === 'de'
                  ? 'bg-primary text-on-primary shadow-2xs font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
              }`}
            >
              DE
            </button>
          </div>

          {/* Dark Mode Toggle */}
          <button
            onClick={handleToggleDarkMode}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-container-high/60 border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-200 cursor-pointer shadow-xs backdrop-blur-md"
            title={
              language === 'de'
                ? isDarkMode
                  ? 'Lichtmodus'
                  : 'Dunkelmodus'
                : isDarkMode
                  ? 'Light Mode'
                  : 'Dark Mode'
            }
          >
            <span className="material-symbols-outlined text-[16px]">
              {isDarkMode ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <DashboardView
            settings={settings}
            notes={notes}
            routines={routines}
            toggleRoutine={handleToggleRoutine}
            onNoteClick={handleOpenEditNote}
            onNavigateToTab={setActiveTab}
            onAddQuickRoutine={handleAddQuickRitual}
            contacts={contacts}
            meetups={meetups}
            kanbanTasks={kanbanTasks}
          />
        )}

        {activeTab === 'library' && (
          <NotesLibraryView
            notes={notes}
            onNoteClick={handleOpenEditNote}
            onNewNoteClick={handleOpenNewNote}
            onToggleChecklistItem={handleToggleLibraryChecklist}
            people={people}
            journalEntries={journalEntries}
            onAddJournalEntry={handleAddNewJournalEntry}
            onDeleteJournalEntry={handleDeleteJournalEntry}
          />
        )}

        {activeTab === 'routines' && (
          <RoutinesView
            routines={routines}
            toggleRoutine={handleToggleRoutine}
            onAddRoutine={handleAddNewRoutine}
            onDeleteRoutine={handleDeleteRoutine}
            streakCount={settings.streakDays}
            onStartNewDay={handleStartNewDay}
          />
        )}

        {activeTab === 'people' && (
          <PeopleView
            people={people}
            onUpdatePerson={handleUpdatePerson}
            onAddPerson={handleAddNewPerson}
            onDeletePerson={handleDeletePerson}
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsView
            contacts={contacts}
            interactions={interactions}
            notes={notes}
            meetups={meetups}
            onAddContact={handleAddContact}
            onUpdateContact={handleUpdateContact}
            onDeleteContact={handleDeleteContact}
            onAddInteraction={handleAddInteraction}
            onDeleteInteraction={handleDeleteInteraction}
            onLinkNoteToContact={handleLinkNoteToContact}
            onAddMeetup={handleAddMeetup}
            onUpdateMeetup={handleUpdateMeetup}
            onDeleteMeetup={handleDeleteMeetup}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onResetApp={handleResetToDefaults}
            isDarkMode={isDarkMode}
            onToggleDarkMode={handleToggleDarkMode}
            workspaceData={{
              notes,
              routines,
              people,
              contacts,
              interactions,
              meetups,
              kanbanTasks,
              journalEntries,
              settings,
            }}
            onImportBackup={handleImportBackup}
          />
        )}

        {activeTab === 'kanban' && (
          <KanbanView
            tasks={kanbanTasks}
            onAddTask={handleAddKanbanTask}
            onUpdateTask={handleUpdateKanbanTask}
            onDeleteTask={handleDeleteKanbanTask}
          />
        )}
      </main>

      {/* Note viewing / editing / creation floating sheet modal */}
      <NoteModal
        note={selectedNote}
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
      />

      {/* Rhythmic Success / Cosmic Streak celebration overlay */}
      <CelebrationModal
        isOpen={showCelebration}
        onClose={() => setShowCelebration(false)}
        streakDays={settings.streakDays}
      />
    </div>
  );
}
