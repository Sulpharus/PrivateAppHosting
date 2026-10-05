import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'de';

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Sidebar & Navigation
    dashboard: 'Dashboard',
    notesLibrary: 'Notes Library',
    routines: 'Rhythms & Routines',
    people: 'People & Network',
    contactsCrm: 'CRM & Contacts',
    workTasks: 'Tasks',
    settings: 'Settings',
    newNote: 'New Note',
    dailyStreak: 'Daily Streak',
    days: 'Days',
    signedIn: 'Signed in',
    signOut: 'Sign Out',

    // Settings Tab
    settingsTitle: 'Space Settings',
    settingsSubtitle: 'Appearance, backup and reset of your slow-living workspace.',
    profileSection: 'Profile Identity',
    usernameLabel: 'Username / Handle',
    userTitleLabel: 'Space Title / Subtitle',
    avatarUrlLabel: 'Avatar URL',
    streakLevels: 'Streak Levels',
    streakDaysLabel: 'Current Streak Count (Days)',
    saveSettings: 'Save Workspace',
    dangerZone: 'Danger Zone',
    resetActions: 'Workspace Reset Actions',
    resetDescription:
      'Wipe all your workspace notes, habits, routines, journals, contacts, and task boards to start with a fresh, clean slate.',
    resetButton: 'Reset Workspace',
    confirmReset: 'Are you sure you want to permanently reset everything?',
    yesReset: 'Yes, Reset Everything',
    cancel: 'Cancel',

    // Dashboard Tab
    welcomeBack: 'Welcome back',
    ritualsCompleted: 'rituals completed',
    keepFlowing: 'Keep flowing',
    quickRitual: 'Quick Ritual',
    addQuickRitual: 'Add Quick Ritual',
    recentNotes: 'Recent Notes',
    noRecentNotes: 'No recent notes yet. Begin writing to capture your thoughts.',
    morningRhythm: 'Morning Rhythm',
    afternoonRhythm: 'Afternoon Rhythm',
    eveningRhythm: 'Evening Rhythm',
    allRhythmsCompleted: 'All rhythms for today are completed! What a beautiful flow.',

    // Routines Tab
    routinesTitle: 'Rhythms & Daily Routines',
    routinesSubtitle: 'Set mindful daily cycles to build consistent, meaningful habits.',
    addRoutine: 'Add Routine',
    todaysClarity: "Today's Clarity",
    completedOf: 'completed of',
    rhythmicCycles: 'rhythmic cycles. Taking a breath builds clarity.',
    noRoutinesYet:
      "You haven't defined any routines yet. Plan your morning, afternoon, and evening cycles to begin building your streak!",
    startNextDay: 'Start Next Day',
    newDayReset: 'New Day Reset',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    routineTitle: 'Routine Title',
    routineDesc: 'Description',
    timeLabel: 'Time (e.g., 08:00)',
    duration: 'Duration (e.g., 15 mins)',
    deleteRoutine: 'Delete Routine',
    newDayModalTitle: 'A New Day Awaits!',
    newDayModalResetTitle: 'Reset Rhythms?',
    newDayModalSuccess:
      "Magnificent work! You completed all of today's routines and grew your streak! Starting a new day will refresh your rhythmic checklists so you can pursue tomorrow's goals.",
    newDayModalWarning:
      "Are you sure you want to advance to the next day? You haven't completed all routines today. Starting a new day now will reset your checklist and break your streak back to 0.",
    beginTomorrowsRhythm: "Begin Tomorrow's Rhythm",
    resetDayAndStreak: 'Reset Day & Streak',
    routineScheduled: 'Routine scheduled successfully!',
    routineDeleted: 'Routine deleted.',

    // People Tab
    peopleTitle: 'People & Network',
    peopleSubtitle: 'A personal encyclopedia of dialogues, milestones, and companionship.',
    addConnection: 'Add Connection',
    cancelProfile: 'Cancel Profile',
    scheduleMeetup: 'Schedule Meetup',
    meetupPlannerBoard: 'Meetup Planner & Preparation Board',
    pending: 'pending',
    noScheduledMeetups: 'No scheduled meetups with connections found.',
    firstMeetupPrompt: 'Schedule your first meetup with a connection',
    viewConnectionProfile: 'View Connection Profile',
    deletedConnectionError: 'Associated connection has been deleted.',
    prepNotesTitle: 'Preparation & Notes',
    locationUnassigned: 'Location unassigned',
    reopen: 'Reopen',
    done: 'Done',
    searchConnectionPlaceholder: 'Search connections by name, tags, or job...',
    relationshipStrengths: 'Relationship Strengths',
    interactionsCount: 'interactions',
    lastContact: 'Last contact:',
    neverContacted: 'Never contacted yet',
    viewFullProfile: 'View Full Profile',
    addNewConnectionProfile: 'Add New Connection Profile',
    connectionName: 'Connection Name *',
    category: 'Category / Sphere *',
    relationshipStrengthLabel: 'Relationship Strength *',
    tagsLabel: 'Tags / Commonalities (comma separated)',
    jobLabel: 'Job Role / Occupation',
    phoneLabel: 'Phone Number',
    emailLabel: 'Email Address',
    notesPlaceholder: 'Personal bio, notes, background, how you met...',
    avatarUrlPlaceholder: 'Profile Image URL (optional)',
    createProfile: 'Create Profile',
    close: 'Close',

    // Notes Library Tab
    notesLibraryTitle: 'Notes Library',
    notesLibrarySubtitle: 'A calm sanctuary for your thoughts, logs, and reflections.',
    searchNotesPlaceholder: 'Search notes by title or content...',
    allNotes: 'All Notes',
    allTags: 'All Tags',
    noNotesFound: 'No notes found in your library.',
    createFirstNote: 'Create your first note',
    journalTab: 'Personal Journal',
    journalSubtitle: 'Log daily events, moods, and deep reflections.',
    howWasDay: 'How was your day? Log your thoughts and feelings...',
    ratingLabel: 'Rating (1-5):',
    addLog: 'Add Log Entry',
    deleteLog: 'Delete Log Entry',
    noJournalEntries: 'Your journal is empty. Add your first daily log above.',
    noteSaved: 'Note saved successfully!',
    noteDeleted: 'Note deleted.',

    // CRM / Contacts Tab
    crmTitle: 'Contacts CRM',
    crmSubtitle: 'Manage communications, touchpoints, log notes, and schedule events.',
    addContact: 'Add Contact',
    searchCRMPlaceholder: 'Search contacts...',
    interactionsLog: 'Interactions Log',
    noInteractions: 'No interactions logged yet.',
    logInteraction: 'Log Interaction',
    meetupDate: 'Date',
    notes: 'Notes',
    addInteraction: 'Add Interaction',

    // Tasks Tab (Combined Work & Personal Tasks)
    tasksTitle: 'Tasks & Priorities',
    tasksSubtitle: 'Manage your personal and work priorities seamlessly in one place.',
    allTasks: 'All Tasks',
    workCategory: 'Work',
    personalCategory: 'Personal',
    addTask: 'Add Task',
    taskTitle: 'Task Title *',
    taskDescription: 'Description',
    categoryLabel: 'Category *',
    statusLabel: 'Status *',
    priorityLabel: 'Priority *',
    todo: 'To Do',
    inProgress: 'In Progress',
    completed: 'Completed',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    noTasks: 'No tasks found. Add a task to get started!',
    saveTask: 'Save Task',
    deleteTask: 'Delete Task',

    // Reminders
    reminders: 'Reminders & Follow-Ups',
    upcomingReminders: 'Upcoming Reminders',
    noUpcomingReminders: 'No pending reminders or follow-ups. Everything is in peaceful order.',
    dueToday: 'Due Today',
    overdue: 'Overdue',
    dueTomorrow: 'Tomorrow',
    viewInCrm: 'Open in CRM',
    viewInTasks: 'Open in Tasks',
    meetupWith: 'Meetup with',
  },
  de: {
    // Sidebar & Navigation
    dashboard: 'Dashboard',
    notesLibrary: 'Notizbibliothek',
    routines: 'Rhythmen & Routinen',
    people: 'Kontakte & Netzwerk',
    contactsCrm: 'CRM & Kontakte',
    workTasks: 'Aufgaben',
    settings: 'Einstellungen',
    newNote: 'Neue Notiz',
    dailyStreak: 'Tägliche Serie',
    days: 'Tage',
    signedIn: 'Angemeldet',
    signOut: 'Abmelden',

    // Settings Tab
    settingsTitle: 'Bereichs-Einstellungen',
    settingsSubtitle: 'Erscheinungsbild, Sicherung und Zurücksetzen deines Arbeitsbereichs.',
    profileSection: 'Profil-Identität',
    usernameLabel: 'Benutzername / Kürzel',
    userTitleLabel: 'Bereichs-Titel / Untertitel',
    avatarUrlLabel: 'Avatar-URL',
    streakLevels: 'Serien-Level',
    streakDaysLabel: 'Aktuelle Serie (Tage)',
    saveSettings: 'Einstellungen speichern',
    dangerZone: 'Gefahrenzone',
    resetActions: 'Zurücksetz-Aktionen',
    resetDescription:
      'Lösche all deine Notizen, Gewohnheiten, Routinen, Journale, Kontakte und Aufgabenboards, um mit einer sauberen Weste neu zu beginnen.',
    resetButton: 'Bereich zurücksetzen',
    confirmReset: 'Bist du sicher, dass du dauerhaft alles zurücksetzen möchtest?',
    yesReset: 'Ja, alles zurücksetzen',
    cancel: 'Abbrechen',

    // Dashboard Tab
    welcomeBack: 'Willkommen zurück',
    ritualsCompleted: 'Rituale abgeschlossen',
    keepFlowing: 'Bleib im Fluss',
    quickRitual: 'Kurzes Ritual',
    addQuickRitual: 'Kurzes Ritual hinzufügen',
    recentNotes: 'Kürzliche Notizen',
    noRecentNotes: 'Noch keine Notizen. Schreib etwas, um deine Gedanken festzuhalten.',
    morningRhythm: 'Morgen-Rhythmus',
    afternoonRhythm: 'Nachmittag-Rhythmus',
    eveningRhythm: 'Abend-Rhythmus',
    allRhythmsCompleted: 'Alle Rhythmen für heute sind abgeschlossen! Was für ein schöner Fluss.',

    // Routines Tab
    routinesTitle: 'Rhythmen & Tagesroutinen',
    routinesSubtitle:
      'Setze achtsame tägliche Zyklen, um beständige, sinnvolle Gewohnheiten aufzubauen.',
    addRoutine: 'Routine hinzufügen',
    todaysClarity: 'Heutige Klarheit',
    completedOf: 'abgeschlossen von',
    rhythmicCycles: 'rhythmischen Zyklen. Tiefes Durchatmen schafft Klarheit.',
    noRoutinesYet:
      'Du hast noch keine Routinen definiert. Plane deine Morgen-, Nachmittags- und Abendzyklen, um deine Serie zu starten!',
    startNextDay: 'Nächsten Tag starten',
    newDayReset: 'Neuer Tag Reset',
    morning: 'Morgen',
    afternoon: 'Nachmittag',
    evening: 'Abend',
    routineTitle: 'Titel der Routine',
    routineDesc: 'Beschreibung',
    timeLabel: 'Uhrzeit (z.B. 08:00)',
    duration: 'Dauer (z.B. 15 Min.)',
    deleteRoutine: 'Routine löschen',
    newDayModalTitle: 'Ein neuer Tag erwartet dich!',
    newDayModalResetTitle: 'Rhythmen zurücksetzen?',
    newDayModalSuccess:
      'Großartige Arbeit! Du hast alle heutigen Routinen abgeschlossen und deine Serie verlängert! Ein neuer Tag erfrischt deine Checklisten, damit du die nächsten Ziele verfolgen kannst.',
    newDayModalWarning:
      'Bist du sicher, dass du zum nächsten Tag wechseln möchtest? Du hast heute nicht alle Routinen abgeschlossen. Wenn du jetzt einen neuen Tag startest, wird deine Serie auf 0 zurückgesetzt.',
    beginTomorrowsRhythm: 'Morgigen Rhythmus beginnen',
    resetDayAndStreak: 'Tag & Serie zurücksetzen',
    routineScheduled: 'Routine erfolgreich geplant!',
    routineDeleted: 'Routine gelöscht.',

    // People Tab
    peopleTitle: 'Kontakte & Netzwerk',
    peopleSubtitle: 'Ein persönliches Nachschlagewerk für Dialoge, Meilensteine und Weggefährten.',
    addConnection: 'Verbindung hinzufügen',
    cancelProfile: 'Profil abbrechen',
    scheduleMeetup: 'Treffen planen',
    meetupPlannerBoard: 'Treffen-Planer & Vorbereitungsboard',
    pending: 'ausstehend',
    noScheduledMeetups: 'Keine geplanten Treffen mit Kontakten gefunden.',
    firstMeetupPrompt: 'Plane dein erstes Treffen mit einem Kontakt',
    viewConnectionProfile: 'Verbindungsprofil anzeigen',
    deletedConnectionError: 'Die zugehörige Verbindung wurde gelöscht.',
    prepNotesTitle: 'Vorbereitung & Notizen',
    locationUnassigned: 'Ort nicht zugewiesen',
    reopen: 'Wiedereröffnen',
    done: 'Erledigt',
    searchConnectionPlaceholder: 'Kontakte nach Name, Tags oder Beruf suchen...',
    relationshipStrengths: 'Beziehungsstärke',
    interactionsCount: 'Interaktionen',
    lastContact: 'Letzter Kontakt:',
    neverContacted: 'Noch kein Kontakt',
    viewFullProfile: 'Vollständiges Profil anzeigen',
    addNewConnectionProfile: 'Neues Verbindungsprofil hinzufügen',
    connectionName: 'Name des Kontakts *',
    category: 'Kategorie / Bereich *',
    relationshipStrengthLabel: 'Beziehungsstärke *',
    tagsLabel: 'Tags / Gemeinsamkeiten (kommagetrennt)',
    jobLabel: 'Berufsbezeichnung / Rolle',
    phoneLabel: 'Telefonnummer',
    emailLabel: 'E-Mail-Adresse',
    notesPlaceholder: 'Persönliche Notizen, Hintergrund, wie ihr euch kennengelernt habt...',
    avatarUrlPlaceholder: 'Profilbild-URL (optional)',
    createProfile: 'Profil erstellen',
    close: 'Schließen',

    // Notes Library Tab
    notesLibraryTitle: 'Notizbibliothek',
    notesLibrarySubtitle:
      'Ein ruhiger Zufluchtsort für deine Gedanken, Protokolle und Reflexionen.',
    searchNotesPlaceholder: 'Notizen nach Titel oder Inhalt durchsuchen...',
    allNotes: 'Alle Notizen',
    allTags: 'Alle Tags',
    noNotesFound: 'Keine Notizen in deiner Bibliothek gefunden.',
    createFirstNote: 'Erstelle deine erste Notiz',
    journalTab: 'Persönliches Tagebuch',
    journalSubtitle: 'Protokolliere tägliche Ereignisse, Stimmungen und Reflexionen.',
    howWasDay: 'Wie war dein Tag? Schreib deine Gedanken und Gefühle auf...',
    ratingLabel: 'Bewertung (1-5):',
    addLog: 'Eintrag hinzufügen',
    deleteLog: 'Eintrag löschen',
    noJournalEntries: 'Dein Tagebuch ist leer. Füge oben deinen ersten täglichen Eintrag hinzu.',
    noteSaved: 'Notiz erfolgreich gespeichert!',
    noteDeleted: 'Notiz gelöscht.',

    // CRM / Contacts Tab
    crmTitle: 'Kontakte-CRM',
    crmSubtitle: 'Verwalte Kontakte, Notizen, Wiedervorlagen und plane Treffen.',
    addContact: 'Kontakt hinzufügen',
    searchCRMPlaceholder: 'Kontakte suchen...',
    interactionsLog: 'Interaktionsprotokoll',
    noInteractions: 'Noch keine Interaktionen protokolliert.',
    logInteraction: 'Interaktion protokollieren',
    meetupDate: 'Datum',
    notes: 'Notizen',
    addInteraction: 'Interaktion hinzufügen',

    // Tasks Tab (Combined Work & Personal Tasks)
    tasksTitle: 'Aufgaben',
    tasksSubtitle: 'Verwalte deine persönlichen und beruflichen Prioritäten nahtlos an einem Ort.',
    allTasks: 'Alle Aufgaben',
    workCategory: 'Arbeit',
    personalCategory: 'Privat',
    addTask: 'Aufgabe hinzufügen',
    taskTitle: 'Aufgabetitel *',
    taskDescription: 'Beschreibung',
    categoryLabel: 'Kategorie *',
    statusLabel: 'Status *',
    priorityLabel: 'Priorität *',
    todo: 'Zu tun',
    inProgress: 'In Bearbeitung',
    completed: 'Abgeschlossen',
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch',
    noTasks: 'Keine Aufgaben gefunden. Füge eine Aufgabe hinzu, um zu starten!',
    saveTask: 'Aufgabe speichern',
    deleteTask: 'Aufgabe löschen',

    // Reminders
    reminders: 'Erinnerungen & Wiedervorlagen',
    upcomingReminders: 'Anstehende Erinnerungen',
    noUpcomingReminders:
      'Keine anstehenden Erinnerungen oder Wiedervorlagen. Alles ist in bester Ordnung.',
    dueToday: 'Heute fällig',
    overdue: 'Überfällig',
    dueTomorrow: 'Morgen',
    viewInCrm: 'Im CRM öffnen',
    viewInTasks: 'In Aufgaben öffnen',
    meetupWith: 'Treffen mit',
  },
};

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('aether_language');
    return saved === 'de' || saved === 'en' ? saved : 'de';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('aether_language', lang);
  };

  const t = (key: string, fallback?: string): string => {
    return translations[language]?.[key] || fallback || key;
  };

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};
