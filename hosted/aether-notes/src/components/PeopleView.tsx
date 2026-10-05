/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../contexts/TranslationContext';
import { MiniNode } from '../mininode';
import type { ConnectionCategory, Person, PersonInteractionLog } from '../types';
import RelationshipMap from './RelationshipMap';

export interface PersonMeetup {
  id: string;
  personId: string; // References Person.id
  personIds?: string[]; // References multiple Person.id (multiple connections)
  title: string; // Meetup title / goal
  date: string; // YYYY-MM-DD
  time?: string; // e.g. "14:00"
  location?: string; // e.g. "Cottage Garden"
  preparationNotes?: string; // Notes of what to prepare
  completed: boolean;
  createdAt: number;
}

interface PeopleViewProps {
  people: Person[];
  onUpdatePerson: (person: Person) => void;
  onAddPerson: (person: Omit<Person, 'id' | 'lastSpoke' | 'lastSpokeDate'>) => void;
  onDeletePerson: (id: string) => void;
}

export default function PeopleView({
  people,
  onUpdatePerson,
  onAddPerson,
  onDeletePerson,
}: PeopleViewProps) {
  const { t } = useTranslation();
  const categoryName = (filter: string) =>
    ({
      all: t('people.filterAll'),
      Family: t('people.filterFamily'),
      Friends: t('people.filterFriends'),
      Colleagues: t('people.filterColleagues'),
    })[filter] ?? filter;
  const [activeFilter, setActiveFilter] = useState<'all' | ConnectionCategory>('all');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  // View mode switcher: 'grid' (directory list) vs 'map' (interactive Obsidian-like network graph)
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  // Modal connection manager state
  const [modalConnectTargetId, setModalConnectTargetId] = useState<string>('');
  const [modalConnectType, setModalConnectType] = useState<string>('Friend');
  const [modalConnectCustomType, setModalConnectCustomType] = useState<string>('');
  const [modalConnectDesc, setModalConnectDesc] = useState<string>('');

  // Custom Persona form fields for connection adding
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ConnectionCategory>('Family');
  const [newCustomCategoryInput, setNewCustomCategoryInput] = useState('');
  const [editCustomCategoryInput, setEditCustomCategoryInput] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newLikes, setNewLikes] = useState('');
  const [newFavoriteColor, setNewFavoriteColor] = useState('');
  const [newPetsInfo, setNewPetsInfo] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newJob, setNewJob] = useState('');
  const [newMeetupPlan, setNewMeetupPlan] = useState('');
  const [newCoffeePreference, setNewCoffeePreference] = useState('');
  const [newGiftIdeas, setNewGiftIdeas] = useState('');
  const [newBirthday, setNewBirthday] = useState('');
  const [newPersonalityType, setNewPersonalityType] = useState('');
  const [newFavoriteFood, setNewFavoriteFood] = useState('');
  const [newSensitiveTopics, setNewSensitiveTopics] = useState('');
  const [newSharedGoals, setNewSharedGoals] = useState('');
  const [addFormTab, setAddFormTab] = useState<'meetups_general' | 'contact' | 'hobbies'>(
    'meetups_general',
  );

  // Editable fields inside the modal inspector
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<ConnectionCategory>('Family');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLikes, setEditLikes] = useState('');
  const [editFavoriteColor, setEditFavoriteColor] = useState('');
  const [editPetsInfo, setEditPetsInfo] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editJob, setEditJob] = useState('');
  const [editMeetupPlan, setEditMeetupPlan] = useState('');
  const [editCoffeePreference, setEditCoffeePreference] = useState('');
  const [editGiftIdeas, setEditGiftIdeas] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editPersonalityType, setEditPersonalityType] = useState('');
  const [editFavoriteFood, setEditFavoriteFood] = useState('');
  const [editSensitiveTopics, setEditSensitiveTopics] = useState('');
  const [editSharedGoals, setEditSharedGoals] = useState('');
  const [editFormTab, setEditFormTab] = useState<
    'meetups_general' | 'contact' | 'hobbies' | 'connections'
  >('meetups_general');

  // Log conversation note inputs
  const [logNoteInput, setLogNoteInput] = useState('');
  const [logCustomDate, setLogCustomDate] = useState('');

  // Success indicator states
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Custom Inline Deletion confirmation states (work perfectly in sandboxed iframe previews)
  const [personIdPendingDelete, setPersonIdPendingDelete] = useState<string | null>(null);
  const [showProfileDeleteConfirm, setShowProfileDeleteConfirm] = useState(false);

  // Meetups State, Form Fields, and Storage Sync
  const [peopleMeetups, setPeopleMeetups] = useState<PersonMeetup[]>([]);
  // Both lists live in the account (mn.kv); nothing is written before they were read.
  const [listsLoaded, setListsLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([
      MiniNode.db.getItem('aether_custom_categories'),
      MiniNode.db.getItem('aether_people_meetups'),
    ])
      .then(([categories, meetups]) => {
        if (!live) return;
        if (Array.isArray(categories)) setCustomCategories(categories);
        if (Array.isArray(meetups)) setPeopleMeetups(meetups);
        setListsLoaded(true);
      })
      .catch((err) => console.error('Could not load the lists of the people view:', err));
    return () => {
      live = false;
    };
  }, []);

  const [showScheduleMeetupForm, setShowScheduleMeetupForm] = useState(false);
  const [editingMeetup, setEditingMeetup] = useState<PersonMeetup | null>(null);

  const [meetupTitle, setMeetupTitle] = useState('');
  const [meetupPersonIds, setMeetupPersonIds] = useState<string[]>([]);
  const [meetupDate, setMeetupDate] = useState(() =>
    new Date().toLocaleDateString('sv-SE').slice(0, 10),
  );
  const [meetupTime, setMeetupTime] = useState('14:00');
  const [meetupLocation, setMeetupLocation] = useState('');
  const [meetupPrepNotes, setMeetupPrepNotes] = useState('');

  useEffect(() => {
    if (listsLoaded) MiniNode.db.setItem('aether_people_meetups', peopleMeetups);
  }, [peopleMeetups, listsLoaded]);

  useEffect(() => {
    if (listsLoaded) MiniNode.db.setItem('aether_custom_categories', customCategories);
  }, [customCategories, listsLoaded]);

  const handleOpenScheduleMeetup = () => {
    setMeetupTitle('');
    setMeetupPersonIds(people[0] ? [people[0].id] : []);
    setMeetupDate(new Date().toLocaleDateString('sv-SE').slice(0, 10));
    setMeetupTime('14:00');
    setMeetupLocation('');
    setMeetupPrepNotes('');
    setEditingMeetup(null);
    setShowScheduleMeetupForm(true);
  };

  const handleOpenEditMeetup = (meetup: PersonMeetup) => {
    setMeetupTitle(meetup.title);
    setMeetupPersonIds(meetup.personIds || (meetup.personId ? [meetup.personId] : []));
    setMeetupDate(meetup.date);
    setMeetupTime(meetup.time || '12:00');
    setMeetupLocation(meetup.location || '');
    setMeetupPrepNotes(meetup.preparationNotes || '');
    setEditingMeetup(meetup);
    setShowScheduleMeetupForm(true);
  };

  const handleMeetupFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetupTitle.trim() || meetupPersonIds.length === 0) return;

    const meetupData = {
      title: meetupTitle.trim(),
      personIds: meetupPersonIds,
      personId: meetupPersonIds[0] || '', // Fallback for backwards compatibility
      date: meetupDate,
      time: meetupTime || undefined,
      location: meetupLocation.trim() || undefined,
      preparationNotes: meetupPrepNotes.trim() || undefined,
      completed: editingMeetup ? editingMeetup.completed : false,
    };

    if (editingMeetup) {
      setPeopleMeetups((prev) =>
        prev.map((m) => (m.id === editingMeetup.id ? { ...m, ...meetupData } : m)),
      );
      triggerAlert('Meetup modified securely!');
    } else {
      const newMeetup: PersonMeetup = {
        id: `meetup-${Date.now()}`,
        ...meetupData,
        completed: false,
        createdAt: Date.now(),
      };
      setPeopleMeetups((prev) => [...prev, newMeetup]);
      triggerAlert('Meetup scheduled beautifully!');
    }

    setShowScheduleMeetupForm(false);
    setEditingMeetup(null);
  };

  const handleToggleMeetupCompleted = (meetup: PersonMeetup) => {
    setPeopleMeetups((prev) =>
      prev.map((m) => (m.id === meetup.id ? { ...m, completed: !m.completed } : m)),
    );
    triggerAlert(meetup.completed ? 'Meetup reopened!' : 'Meetup completed!');
  };

  const handleDeleteMeetupItem = (id: string) => {
    setPeopleMeetups((prev) => prev.filter((m) => m.id !== id));
    triggerAlert('Meetup removed from planner.');
  };

  // Synchronize edit fields when selectedPerson changes
  useEffect(() => {
    setShowProfileDeleteConfirm(false);
    if (selectedPerson) {
      setEditName(selectedPerson.name || '');
      setEditCategory(selectedPerson.category || 'Family');
      setEditAvatarUrl(selectedPerson.avatarUrl || '');
      setEditNotes(selectedPerson.notes || '');
      setEditLikes(selectedPerson.likes || '');
      setEditFavoriteColor(selectedPerson.favoriteColor || '');
      setEditPetsInfo(selectedPerson.petsInfo || '');
      setEditEmail(selectedPerson.email || '');
      setEditPhone(selectedPerson.phone || '');
      setEditAddress(selectedPerson.address || '');
      setEditJob(selectedPerson.job || '');
      setEditMeetupPlan(selectedPerson.meetupPlan || '');
      setEditCoffeePreference(selectedPerson.coffeePreference || '');
      setEditGiftIdeas(selectedPerson.giftIdeas || '');
      setEditBirthday(selectedPerson.birthday || '');
      setEditPersonalityType(selectedPerson.personalityType || '');
      setEditFavoriteFood(selectedPerson.favoriteFood || '');
      setEditSensitiveTopics(selectedPerson.sensitiveTopics || '');
      setEditSharedGoals(selectedPerson.sharedGoals || '');
      setEditCustomCategoryInput('');
      setEditFormTab('meetups_general'); // default back to first tab
      setLogNoteInput('');
      setLogCustomDate(new Date().toISOString().substring(0, 16)); // Default to local time for input
    }
  }, [selectedPerson]);

  const triggerAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  // Filtering list
  const filteredPeople = useMemo(() => {
    if (activeFilter === 'all') return people;
    return people.filter((p) => p.category === activeFilter);
  }, [people, activeFilter]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          if (isEdit) {
            setEditAvatarUrl(reader.result);
          } else {
            setNewAvatarUrl(reader.result);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit person
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    let finalCategory = newCategory;
    if (newCategory === '__custom__') {
      const trimmed = newCustomCategoryInput.trim();
      if (trimmed) {
        finalCategory = trimmed;
        if (!customCategories.includes(trimmed)) {
          const updated = [...customCategories, trimmed];
          setCustomCategories(updated);
        }
      } else {
        finalCategory = 'Family';
      }
    }

    onAddPerson({
      name: newName,
      category: finalCategory,
      avatarUrl: newAvatarUrl || undefined,
      initials: getInitials(newName),
      notes: newNotes || undefined,
      likes: newLikes || undefined,
      favoriteColor: newFavoriteColor || undefined,
      petsInfo: newPetsInfo || undefined,
      email: newEmail || undefined,
      phone: newPhone || undefined,
      address: newAddress || undefined,
      job: newJob || undefined,
      meetupPlan: newMeetupPlan || undefined,
      coffeePreference: newCoffeePreference || undefined,
      giftIdeas: newGiftIdeas || undefined,
      birthday: newBirthday || undefined,
      personalityType: newPersonalityType || undefined,
      favoriteFood: newFavoriteFood || undefined,
      sensitiveTopics: newSensitiveTopics || undefined,
      sharedGoals: newSharedGoals || undefined,
    });

    setNewName('');
    setNewCategory('Family');
    setNewCustomCategoryInput('');
    setNewAvatarUrl('');
    setNewNotes('');
    setNewLikes('');
    setNewFavoriteColor('');
    setNewPetsInfo('');
    setNewEmail('');
    setNewPhone('');
    setNewAddress('');
    setNewJob('');
    setNewMeetupPlan('');
    setNewCoffeePreference('');
    setNewGiftIdeas('');
    setNewBirthday('');
    setNewPersonalityType('');
    setNewFavoriteFood('');
    setNewSensitiveTopics('');
    setNewSharedGoals('');
    setAddFormTab('meetups_general');
    setShowAddForm(false);
    triggerAlert('Connection recorded beautifully!');
  };

  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // Format timestamp helper
  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Trigger profile update
  const handleSaveProfileChanges = () => {
    if (!selectedPerson) return;

    let finalCategory = editCategory;
    if (editCategory === '__custom__') {
      const trimmed = editCustomCategoryInput.trim();
      if (trimmed) {
        finalCategory = trimmed;
        if (!customCategories.includes(trimmed)) {
          const updated = [...customCategories, trimmed];
          setCustomCategories(updated);
        }
      } else {
        finalCategory = selectedPerson.category;
      }
    }

    const updated: Person = {
      ...selectedPerson,
      name: editName.trim() || selectedPerson.name,
      category: finalCategory,
      avatarUrl: editAvatarUrl || undefined,
      initials: getInitials(editName.trim() || selectedPerson.name),
      notes: editNotes.trim() || undefined,
      likes: editLikes.trim() || undefined,
      favoriteColor: editFavoriteColor.trim() || undefined,
      petsInfo: editPetsInfo.trim() || undefined,
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
      address: editAddress.trim() || undefined,
      job: editJob.trim() || undefined,
      meetupPlan: editMeetupPlan.trim() || undefined,
      coffeePreference: editCoffeePreference.trim() || undefined,
      giftIdeas: editGiftIdeas.trim() || undefined,
      birthday: editBirthday.trim() || undefined,
      personalityType: editPersonalityType.trim() || undefined,
      favoriteFood: editFavoriteFood.trim() || undefined,
      sensitiveTopics: editSensitiveTopics.trim() || undefined,
      sharedGoals: editSharedGoals.trim() || undefined,
    };
    onUpdatePerson(updated);
    setSelectedPerson(updated);
    triggerAlert('Profile saved securelly!');
  };

  // Add a conversation memo to timeline
  const handleAddConversationLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson || !logNoteInput.trim()) return;

    const dateStr = logCustomDate
      ? new Date(logCustomDate).toISOString()
      : new Date().toISOString();

    const newLogItem: PersonInteractionLog = {
      id: `log-${Date.now()}`,
      timestamp: dateStr,
      note: logNoteInput.trim(),
    };

    const updatedLogs = selectedPerson.interactionLogs ? [...selectedPerson.interactionLogs] : [];
    // Prepend to show most recent log first
    updatedLogs.unshift(newLogItem);

    // Calculate relative spoken timing
    let spokenText = 'Today';
    const originalSpokeDate = new Date(dateStr);
    const diffTime = Math.abs(new Date().getTime() - originalSpokeDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0 && originalSpokeDate < new Date()) {
      if (diffDays === 1) spokenText = 'Yesterday';
      else spokenText = `${diffDays} days ago`;
    }

    const updated: Person = {
      ...selectedPerson,
      lastSpoke: spokenText,
      lastSpokeDate: dateStr,
      interactionLogs: updatedLogs,
    };

    onUpdatePerson(updated);
    setSelectedPerson(updated);
    setLogNoteInput('');
    triggerAlert('Dialogue logged today!');
  };

  // Delete a specific interaction history memo
  const handleDeleteLogItem = (logId: string) => {
    if (!selectedPerson) return;
    const updatedLogs = selectedPerson.interactionLogs
      ? selectedPerson.interactionLogs.filter((l) => l.id !== logId)
      : [];

    const updated: Person = {
      ...selectedPerson,
      interactionLogs: updatedLogs,
    };

    onUpdatePerson(updated);
    setSelectedPerson(updated);
    triggerAlert('Dialogue memo deleted');
  };

  // Add a bidirectional connection link
  const handleAddConnection = (
    personId1: string,
    personId2: string,
    type: string,
    description?: string,
  ) => {
    const p1 = people.find((p) => p.id === personId1);
    const p2 = people.find((p) => p.id === personId2);
    if (!p1 || !p2) return;

    const p1Connections = p1.connections ? [...p1.connections] : [];
    const p2Connections = p2.connections ? [...p2.connections] : [];

    // Prevent duplicates
    if (!p1Connections.some((c) => c.targetId === personId2)) {
      p1Connections.push({ targetId: personId2, type, description });
    }
    if (!p2Connections.some((c) => c.targetId === personId1)) {
      p2Connections.push({ targetId: personId1, type, description });
    }

    const updatedP1 = { ...p1, connections: p1Connections };
    const updatedP2 = { ...p2, connections: p2Connections };

    onUpdatePerson(updatedP1);
    onUpdatePerson(updatedP2);

    // Synchronize current modal if open
    if (selectedPerson) {
      if (selectedPerson.id === personId1) {
        setSelectedPerson(updatedP1);
      } else if (selectedPerson.id === personId2) {
        setSelectedPerson(updatedP2);
      }
    }

    triggerAlert(t('people.connectionLinkedSuccessfully'));
  };

  // Remove a bidirectional connection link
  const handleRemoveConnection = (personId1: string, personId2: string) => {
    const p1 = people.find((p) => p.id === personId1);
    const p2 = people.find((p) => p.id === personId2);
    if (!p1 || !p2) return;

    const p1Connections = p1.connections
      ? p1.connections.filter((c) => c.targetId !== personId2)
      : [];
    const p2Connections = p2.connections
      ? p2.connections.filter((c) => c.targetId !== personId1)
      : [];

    const updatedP1 = { ...p1, connections: p1Connections };
    const updatedP2 = { ...p2, connections: p2Connections };

    onUpdatePerson(updatedP1);
    onUpdatePerson(updatedP2);

    // Synchronize current modal if open
    if (selectedPerson) {
      if (selectedPerson.id === personId1) {
        setSelectedPerson(updatedP1);
      } else if (selectedPerson.id === personId2) {
        setSelectedPerson(updatedP2);
      }
    }

    triggerAlert(t('people.connectionUnlinked'));
  };

  const categories = useMemo(() => {
    const defaultCats = ['all', 'Family', 'Friends', 'Colleagues'];
    const dynamicCats = Array.from(
      new Set([...customCategories, ...people.map((p) => p.category).filter(Boolean)]),
    );
    return [
      ...defaultCats,
      ...dynamicCats.filter((cat) => !['Family', 'Friends', 'Colleagues', 'all'].includes(cat)),
    ];
  }, [customCategories, people]);

  return (
    <div
      id="people-section-view"
      className="max-w-4xl mx-auto w-full pt-4 md:pt-10 pb-16 flex flex-col gap-10 animate-fade-in select-none"
    >
      {/* Alert toast notification */}
      {alertMessage && (
        <div className="fixed top-6 right-6 bg-primary text-on-primary text-xs font-semibold px-5 py-3 rounded-xl shadow-lg border border-primary/20 z-60 animate-fade-in flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">done_all</span>
          {alertMessage}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans text-3xl font-bold text-on-surface tracking-tight">
            {t('people.connectionsProfile')}
          </h2>
          <p className="font-serif text-sm text-on-surface-variant mt-1.5 opacity-85">
            {t('people.aPersonalEncyclopediaOfDialogues')}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            id="btn-schedule-meetup"
            onClick={handleOpenScheduleMeetup}
            className="bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/20 text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-sm transition-all duration-200 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-sm">calendar_today</span>
            {t('people.scheduleMeetup')}
          </button>
          <button
            id="btn-add-connection"
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-sm transition-all duration-200 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-sm">
              {showAddForm ? 'close' : 'person_add'}
            </span>
            {showAddForm ? t('people.cancelProfile') : t('people.addConnection')}
          </button>
        </div>
      </div>

      {/* View Mode Switcher */}
      <div className="flex bg-surface-container-low p-1 rounded-2xl border border-outline-variant/15 self-start shrink-0 select-none">
        <button
          onClick={() => setViewMode('grid')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-sans font-bold transition-all cursor-pointer ${
            viewMode === 'grid'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-base">grid_view</span>
          {t('people.directoryGrid')}
        </button>
        <button
          onClick={() => setViewMode('map')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-sans font-bold transition-all cursor-pointer ${
            viewMode === 'map'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-base">hub</span>
          {t('people.relationshipMap')}
        </button>
      </div>

      {viewMode === 'grid' ? (
        <>
          {/* MEETUPS HORIZONTAL SIDESCROLLABLE BOARD */}
          <section className="bg-surface-container-low border border-outline-variant/15 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-primary text-xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  event_seat
                </span>
                <h3 className="font-serif text-base font-bold text-on-surface">
                  {t('people.meetupPlannerPreparationBoard')}
                </h3>
              </div>
              {peopleMeetups.length > 0 && (
                <span className="font-mono text-[10px] bg-primary/10 text-primary font-bold px-2.5 py-0.5 rounded-full">
                  {peopleMeetups.filter((m) => !m.completed).length} {t('people.pending')}
                </span>
              )}
            </div>

            <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-thin scroll-smooth select-none min-h-[170px]">
              {peopleMeetups.length === 0 ? (
                <div className="w-full flex flex-col items-center justify-center py-6 border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-lowest text-center">
                  <span className="material-symbols-outlined text-on-surface-variant/40 text-3xl mb-1.5">
                    groups_3
                  </span>
                  <p className="font-serif text-xs text-on-surface-variant/75">
                    {t('people.noScheduledMeetupsWithConnections')}
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenScheduleMeetup}
                    className="mt-2 text-primary hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {t('people.scheduleYourFirstMeetupWith')}
                  </button>
                </div>
              ) : (
                peopleMeetups
                  .sort(
                    (a, b) =>
                      a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''),
                  )
                  .map((m) => {
                    const linkedIds = m.personIds || (m.personId ? [m.personId] : []);
                    const linkedPeople = people.filter((p) => linkedIds.includes(p.id));

                    return (
                      <div
                        key={m.id}
                        className={`w-80 shrink-0 rounded-2xl border p-4.5 flex flex-col justify-between gap-3.5 transition-all text-left bg-surface-container-lowest ${
                          m.completed
                            ? 'border-outline-variant/20 opacity-65 grayscale-30 shadow-xs'
                            : 'border-primary/25 shadow-sm hover:border-primary/45 hover:shadow-md'
                        }`}
                      >
                        {/* Top Header */}
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4
                              className={`font-serif text-xs font-bold leading-tight truncate text-on-surface ${m.completed ? 'line-through text-on-surface-variant' : ''}`}
                            >
                              {m.title}
                            </h4>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEditMeetup(m)}
                                className="p-1 hover:bg-surface-container rounded text-on-surface-variant/70 hover:text-primary transition-all cursor-pointer"
                                title={t('meetups.edit')}
                              >
                                <span className="material-symbols-outlined text-xs">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMeetupItem(m.id)}
                                className="p-1 hover:bg-error/5 rounded text-on-surface-variant/70 hover:text-error transition-all cursor-pointer"
                                title={t('meetups.delete')}
                              >
                                <span className="material-symbols-outlined text-xs">delete</span>
                              </button>
                            </div>
                          </div>

                          {/* Date & Time Badge */}
                          <div className="flex items-center gap-2 text-[10px] font-sans font-semibold text-primary/85 bg-primary/5 rounded-lg px-2 py-0.5 w-max">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            <span>
                              {m.date} {m.time ? `@ ${m.time}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Connection Info Row */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold uppercase text-on-surface-variant/75 tracking-wider block">
                            Connections ({linkedPeople.length})
                          </span>
                          {linkedPeople.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-[76px] overflow-y-auto pr-1">
                              {linkedPeople.map((lp) => {
                                const initials = lp.name
                                  ? lp.name
                                      .split(' ')
                                      .map((n) => n[0])
                                      .join('')
                                      .slice(0, 2)
                                      .toUpperCase()
                                  : '??';
                                return (
                                  <div
                                    key={lp.id}
                                    className="flex items-center gap-1.5 p-1.5 pl-2 pr-2.5 bg-surface-container/50 hover:bg-surface-container rounded-lg cursor-pointer duration-100 border border-outline-variant/10 min-w-0 max-w-full"
                                    onClick={() => {
                                      setSelectedPerson(lp);
                                    }}
                                    title={`View Profile for ${lp.name}`}
                                  >
                                    {lp.avatarUrl ? (
                                      <img
                                        alt={lp.name}
                                        className="w-5 h-5 rounded-full object-cover shrink-0"
                                        src={lp.avatarUrl}
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className="w-5 h-5 shrink-0 rounded-full bg-primary-container/40 text-primary flex items-center justify-center font-bold text-[8px] uppercase">
                                        {initials}
                                      </div>
                                    )}
                                    <span className="text-[10px] font-bold text-on-surface truncate leading-none">
                                      {lp.name}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[9px] text-error/85 bg-error/5 border border-error/10 p-2 rounded-xl">
                              {t('meetups.connectionsDeleted')}
                            </div>
                          )}
                        </div>

                        {/* Preparation Notes */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold uppercase text-on-surface-variant/75 tracking-wider block">
                            {t('meetups.preparation')}
                          </span>
                          <div className="bg-surface-container/60 p-2.5 rounded-xl border border-outline-variant/10 min-h-[48px] max-h-[70px] overflow-y-auto">
                            <p className="text-[10px] text-on-surface-variant/90 leading-relaxed font-serif italic whitespace-pre-line">
                              {m.preparationNotes ||
                                'No preparation notes added. Click edit to compile what you might need to prepare for this meetup.'}
                            </p>
                          </div>
                        </div>

                        {/* Location & Toggle Complete */}
                        <div className="flex items-center justify-between gap-2 border-t border-outline-variant/10 pt-2.5 mt-1">
                          {m.location ? (
                            <div
                              className="flex items-center gap-1 min-w-0 text-[10px] text-on-surface-variant/85"
                              title={m.location}
                            >
                              <span className="material-symbols-outlined text-xs text-secondary">
                                pin_drop
                              </span>
                              <span className="truncate">{m.location}</span>
                            </div>
                          ) : (
                            <span className="text-[9px] text-on-surface-variant/60 italic">
                              {t('meetups.locationUnassigned')}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleMeetupCompleted(m)}
                            className={`px-3 py-1 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                              m.completed
                                ? 'bg-secondary/5 text-secondary border-secondary/15 hover:bg-secondary/10'
                                : 'bg-primary text-on-primary border-transparent hover:bg-primary/90'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[10px] font-bold">
                              {m.completed ? 'undo' : 'check'}
                            </span>
                            {m.completed ? 'Reopen' : 'Done'}
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </section>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2.5">
            {categories.map((filter) => {
              const isActive = activeFilter === filter;
              return (
                <button
                  id={`filter-chip-${filter}`}
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-1.5 rounded-full font-sans text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-primary text-on-primary border-transparent shadow-sm'
                      : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {categoryName(filter)}
                </button>
              );
            })}
          </div>

          {/* Dynamic Connection Addition Form */}
          {showAddForm && (
            <form
              id="add-connection-form"
              onSubmit={handleAddSubmit}
              className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/30 flex flex-col gap-5 animate-fade-in"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-outline-variant/15 pb-3 gap-3">
                <h3 className="font-sans text-sm font-bold text-primary">
                  {t('people.newConnectionDiaryEntry')}
                </h3>

                {/* Small Tab bar */}
                <div className="flex flex-wrap gap-1 bg-surface-container p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAddFormTab('meetups_general')}
                    className={`px-3 py-1 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
                      addFormTab === 'meetups_general'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {t('people.meetupsGeneralInfo')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddFormTab('contact')}
                    className={`px-3 py-1 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
                      addFormTab === 'contact'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {t('people.addressContact')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddFormTab('hobbies')}
                    className={`px-3 py-1 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
                      addFormTab === 'hobbies'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {t('people.hobbiesPersonal')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addFormTab === 'meetups_general' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.fullName')}
                      </label>
                      <input
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t('people.eGJohnDoe')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.connectionCategory')}
                      </label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2.5 rounded-xl text-sm font-sans focus:outline-primary text-on-surface mb-2"
                      >
                        <option value="Family">{t('people.family')}</option>
                        <option value="Friends">{t('people.friends')}</option>
                        <option value="Colleagues">{t('people.colleagues')}</option>
                        {customCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="__custom__">{t('people.createCustomCategory')}</option>
                      </select>

                      {newCategory === '__custom__' && (
                        <input
                          type="text"
                          required
                          value={newCustomCategoryInput}
                          onChange={(e) => setNewCustomCategoryInput(e.target.value)}
                          placeholder={t('people.enterCustomCategoryName')}
                          className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-xs font-sans focus:outline-primary text-on-surface mt-1.5"
                        />
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 font-sans">
                        {t('people.connectionPictureUploadFromCamera')}
                      </label>
                      <div className="flex items-center gap-4 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/15">
                        <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center bg-surface-container-high/50 border border-outline-variant/20 shrink-0 select-none">
                          {newAvatarUrl ? (
                            <img
                              alt={t('people.avatarPreview')}
                              className="w-full h-full object-cover"
                              src={newAvatarUrl}
                            />
                          ) : (
                            <span className="material-symbols-outlined text-xl text-on-surface-variant/55">
                              person
                            </span>
                          )}
                        </div>
                        <div className="flex-1">
                          <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-semibold rounded-xl cursor-pointer transition-colors border border-primary/10">
                            <span className="material-symbols-outlined text-sm">photo_camera</span>
                            <span>{t('people.uploadPhoto')}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageUpload(e, false)}
                              className="hidden"
                            />
                          </label>
                          {newAvatarUrl && (
                            <button
                              type="button"
                              onClick={() => setNewAvatarUrl('')}
                              className="ml-3 text-xs text-error font-semibold hover:underline"
                            >
                              {t('people.remove')}
                            </button>
                          )}
                          <p className="text-[10px] text-on-surface-variant/65 mt-1 leading-none">
                            {t('people.takePhotoOrUploadImage')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.personalDiaryNotesBackgroundSummary')}
                      </label>
                      <textarea
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        placeholder={t('people.exchangeGardeningRecipesMinimalistTimber')}
                        rows={3}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.meetupPlanFutureMeetupIdeas')}
                      </label>
                      <textarea
                        value={newMeetupPlan}
                        onChange={(e) => setNewMeetupPlan(e.target.value)}
                        placeholder={t('people.eGPlanToMeet')}
                        rows={3}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>
                  </>
                )}

                {addFormTab === 'contact' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.emailAddress')}
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder={t('people.eGContactExampleCom')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.jobRoleOccupation')}
                      </label>
                      <input
                        value={newJob}
                        onChange={(e) => setNewJob(e.target.value)}
                        placeholder={t('people.eGLeadArchitectCraft')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.phoneNumber')}
                      </label>
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="e.g. +49 170 1234567"
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.postalAddress')}
                      </label>
                      <textarea
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        placeholder={t('people.eG123WhisperWood')}
                        rows={2}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>
                  </>
                )}

                {addFormTab === 'hobbies' && (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.activitiesThingsTheyLike')}
                      </label>
                      <input
                        value={newLikes}
                        onChange={(e) => setNewLikes(e.target.value)}
                        placeholder={t('people.eGCeremonialMatchaFilm')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.favoriteColorColorSlogan')}
                      </label>
                      <input
                        value={newFavoriteColor}
                        onChange={(e) => setNewFavoriteColor(e.target.value)}
                        placeholder={t('people.eGSageWoodIndigo')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.petProfilesCompanionInfo')}
                      </label>
                      <input
                        value={newPetsInfo}
                        onChange={(e) => setNewPetsInfo(e.target.value)}
                        placeholder={t('people.eGAGoldenRetriever')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.coffeeTeaDrinkPreference')}
                      </label>
                      <input
                        value={newCoffeePreference}
                        onChange={(e) => setNewCoffeePreference(e.target.value)}
                        placeholder={t('people.eGFlatWhiteWith')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.personalityTypeMbtiVibeSlogan')}
                      </label>
                      <input
                        value={newPersonalityType}
                        onChange={(e) => setNewPersonalityType(e.target.value)}
                        placeholder={t('people.eGInfjThoughtfulHelper')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.birthdayAnniversary')}
                      </label>
                      <input
                        value={newBirthday}
                        onChange={(e) => setNewBirthday(e.target.value)}
                        placeholder={t('people.eGNovember23rd05')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.giftIdeasWishlist')}
                      </label>
                      <textarea
                        value={newGiftIdeas}
                        onChange={(e) => setNewGiftIdeas(e.target.value)}
                        placeholder={t('people.eGLovesCustomFountain')}
                        rows={2}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.favoriteFoodCuisine')}
                      </label>
                      <input
                        value={newFavoriteFood}
                        onChange={(e) => setNewFavoriteFood(e.target.value)}
                        placeholder={t('people.eGHomemadeSourdoughVegan')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.topicsToAvoidSensitiveTopics')}
                      </label>
                      <input
                        value={newSensitiveTopics}
                        onChange={(e) => setNewSensitiveTopics(e.target.value)}
                        placeholder={t('people.eGWorkStressPolitical')}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                        {t('people.sharedMilestonesLifeGoalsTogether')}
                      </label>
                      <textarea
                        value={newSharedGoals}
                        onChange={(e) => setNewSharedGoals(e.target.value)}
                        placeholder={t('people.eGTravelToNorway')}
                        rows={2}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40 text-on-surface"
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                type="submit"
                className="self-end bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                {t('people.createDiaryPersona')}
              </button>
            </form>
          )}

          {/* Directory Grid */}
          <div
            id="people-cards-grid"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 relative"
          >
            {filteredPeople.map((person) => (
              <div
                id={`person-card-${person.id}`}
                key={person.id}
                onClick={() => {
                  setSelectedPerson(person);
                }}
                className="group bg-surface-bright rounded-2xl p-6 shadow-sm hover:shadow-md flex flex-col items-center text-center cursor-pointer transition-all duration-300 w-full border border-surface-variant/25 hover:border-primary/20 relative"
              >
                {/* Direct hover quick delete button */}
                {personIdPendingDelete === person.id ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-3 right-3 bg-error text-on-error p-1.5 px-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md z-20 animate-fade-in"
                  >
                    <span className="text-[9px] font-sans font-black uppercase tracking-wider">
                      {t('people.clearQuestion')}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePerson(person.id);
                        setPersonIdPendingDelete(null);
                      }}
                      className="bg-surface-bright text-error font-sans text-[10px] font-bold px-1.5 py-0.5 rounded-lg hover:bg-surface-container transition-all active:scale-90 cursor-pointer"
                    >
                      {t('common.yes')}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPersonIdPendingDelete(null);
                      }}
                      className="text-on-error hover:bg-white/10 font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded-lg transition-all cursor-pointer"
                    >
                      {t('common.no')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPersonIdPendingDelete(person.id);
                    }}
                    className="absolute top-3 right-3 sm:opacity-0 group-hover:opacity-100 p-2 hover:bg-error/10 hover:text-error text-on-surface-variant/55 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center active:scale-95 z-10"
                    title={t('people.deleteProfile')}
                  >
                    <span className="material-symbols-outlined text-[18px] font-bold">delete</span>
                  </button>
                )}
                {/* Avatar block with circular ring */}
                <div className="w-24 h-24 rounded-full overflow-hidden mb-4 relative ring-4 ring-surface-container-low group-hover:ring-primary/25 transition-all flex items-center justify-center bg-surface-container-high/60 shrink-0 select-none">
                  {person.avatarUrl ? (
                    <img
                      alt={person.name}
                      className="w-full h-full object-cover"
                      src={person.avatarUrl}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="font-sans font-bold text-lg text-primary select-none">
                      {person.initials || getInitials(person.name)}
                    </span>
                  )}
                </div>

                {/* Content info */}
                <h3 className="font-sans font-bold text-base text-on-surface leading-tight mb-0.5 group-hover:text-primary transition-colors">
                  {person.name}
                </h3>

                {person.job && (
                  <p className="text-[11px] text-on-surface-variant font-medium font-sans truncate max-w-[200px] mb-2 leading-tight">
                    {person.job}
                  </p>
                )}

                <div className="flex flex-wrap gap-1 justify-center items-center">
                  <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-secondary/10 text-secondary text-[10px] font-sans font-bold uppercase tracking-wider select-none">
                    {person.category}
                  </span>

                  {person.favoriteColor && (
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-outline/25"
                      style={{
                        backgroundColor: person.favoriteColor.includes('#')
                          ? person.favoriteColor.split(' ')[0]
                          : '#535845',
                      }}
                      title={`Likes: ${person.favoriteColor}`}
                    />
                  )}
                </div>

                {/* Micro display logs snippet */}
                {person.petsInfo && person.petsInfo.trim() !== '' && (
                  <p className="font-sans text-[10px] text-on-surface-variant/75 mt-2 max-w-xs line-clamp-1 italic px-2">
                    🐾 {person.petsInfo}
                  </p>
                )}

                {/* Divider */}
                <p className="font-sans text-xs text-on-surface-variant/60 mt-3 border-t border-outline-variant/15 pt-3 w-full flex items-center justify-center gap-1.5 leading-none">
                  <span className="material-symbols-outlined text-xs text-outline opacity-70">
                    chat_bubble_outline
                  </span>
                  Last spoke: {person.lastSpoke}
                </p>
              </div>
            ))}

            {filteredPeople.length === 0 && (
              <div className="col-span-full py-12 text-center bg-surface-container-low/45 border border-dashed border-outline-variant/40 rounded-2xl text-sm italic text-on-surface-variant/70">
                {t('people.noneInCategory')}
              </div>
            )}
          </div>
        </>
      ) : (
        <RelationshipMap
          people={people}
          onAddConnection={handleAddConnection}
          onRemoveConnection={handleRemoveConnection}
          onSelectPerson={(p) => {
            setSelectedPerson(p);
            setEditFormTab('connections');
          }}
        />
      )}

      {/* Person Profile Interaction Overlay Dialog Modal (Side-by-Side Dual Column) */}
      {selectedPerson &&
        createPortal(
          <div
            id="profile-details-modal"
            className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-bright max-w-4xl w-full max-h-[calc(100vh-2rem)] md:max-h-[85vh] rounded-3xl flex flex-col shadow-xl border border-outline-variant/30 overflow-hidden"
            >
              {/* Modal Header */}
              <header className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/15 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl">
                    account_circle
                  </span>
                  <h3 className="font-sans text-sm font-bold text-primary uppercase tracking-widest leading-none">
                    {t('people.diaryProfileInspector')}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedPerson(null)}
                  className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container transition-all cursor-pointer select-none"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </header>

              {/* Double-Column Inspector Core Frame */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
                {/* Left Column: Editable Identity Records */}
                <div className="space-y-4 border-r-0 md:border-r border-outline-variant/15 pr-0 md:pr-6">
                  <div className="flex items-center gap-4 border-b border-outline-variant/10 pb-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-surface-container-high/70 select-none shrink-0 border border-outline-variant/20">
                      {selectedPerson.avatarUrl ? (
                        <img
                          alt={selectedPerson.name}
                          className="w-full h-full object-cover"
                          src={selectedPerson.avatarUrl}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="font-sans font-bold text-base text-primary">
                          {selectedPerson.initials || getInitials(selectedPerson.name)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={t('people.namePlaceholder')}
                        className="w-full bg-transparent border-none text-lg font-bold text-on-surface focus:outline-none focus:ring-0 select-text font-sans p-0 m-0"
                      />
                      <div className="flex flex-col gap-1.5 items-start mt-1">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="bg-secondary/10 text-secondary text-[10px] font-sans font-bold uppercase tracking-wider rounded-lg px-2 py-0.5 border border-transparent focus:ring-0 cursor-pointer focus:outline-none"
                        >
                          <option value="Family">{t('people.family')}</option>
                          <option value="Friends">{t('people.friends')}</option>
                          <option value="Colleagues">{t('people.colleagues')}</option>
                          {customCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                          <option value="__custom__">{t('people.createCustom')}</option>
                        </select>

                        {editCategory === '__custom__' && (
                          <input
                            type="text"
                            required
                            value={editCustomCategoryInput}
                            onChange={(e) => setEditCustomCategoryInput(e.target.value)}
                            placeholder={t('people.categoryName')}
                            className="w-full max-w-[150px] bg-surface-container border border-outline-variant/20 px-2 py-1 rounded-md text-[10px] font-sans focus:outline-primary text-on-surface"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Small tabs for Switching inside Editing */}
                  <div className="flex flex-wrap gap-1 bg-surface-container p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setEditFormTab('meetups_general')}
                      className={`flex-1 min-w-[70px] text-center py-1.5 rounded-lg text-[11px] font-sans font-bold transition-all cursor-pointer ${
                        editFormTab === 'meetups_general'
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {t('people.meetupsBio')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditFormTab('contact')}
                      className={`flex-1 min-w-[70px] text-center py-1.5 rounded-lg text-[11px] font-sans font-bold transition-all cursor-pointer ${
                        editFormTab === 'contact'
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {t('people.contact')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditFormTab('hobbies')}
                      className={`flex-1 min-w-[70px] text-center py-1.5 rounded-lg text-[11px] font-sans font-bold transition-all cursor-pointer ${
                        editFormTab === 'hobbies'
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {t('people.hobbies')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditFormTab('connections')}
                      className={`flex-1 min-w-[70px] text-center py-1.5 rounded-lg text-[11px] font-sans font-bold transition-all cursor-pointer ${
                        editFormTab === 'connections'
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {t('people.connections')}
                    </button>
                  </div>
                  {/* Profile attributes inputs grouped by active tab */}
                  <div className="space-y-4 text-xs font-sans min-h-[220px]">
                    {editFormTab === 'meetups_general' && (
                      <>
                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1.5 font-sans text-[10px]">
                            {t('people.connectionPictureUploadFromCamera')}
                          </label>
                          <div className="flex items-center gap-3 bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/15">
                            <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center bg-surface-container border border-outline-variant/20 shrink-0 select-none">
                              {editAvatarUrl ? (
                                <img
                                  alt={t('people.avatarPreview')}
                                  className="w-full h-full object-cover"
                                  src={editAvatarUrl}
                                />
                              ) : (
                                <span className="material-symbols-outlined text-lg text-on-surface-variant/55">
                                  person
                                </span>
                              )}
                            </div>
                            <div className="flex-1">
                              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/15 text-primary text-[11px] font-semibold rounded-lg cursor-pointer transition-colors border border-primary/10">
                                <span className="material-symbols-outlined text-xs">
                                  photo_camera
                                </span>
                                <span>{t('people.choosePicture')}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleImageUpload(e, true)}
                                  className="hidden"
                                />
                              </label>
                              {editAvatarUrl && (
                                <button
                                  type="button"
                                  onClick={() => setEditAvatarUrl('')}
                                  className="ml-2.5 text-[11px] text-error font-semibold hover:underline"
                                >
                                  {t('people.remove')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.biographicalConnectionNotes')}
                          </label>
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder={t('people.tellHisStoryEG')}
                            rows={3}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface leading-normal text-on-surface"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.meetupPlanFutureMeetupIdeas')}
                          </label>
                          <textarea
                            value={editMeetupPlan}
                            onChange={(e) => setEditMeetupPlan(e.target.value)}
                            placeholder={t('people.eGPlanToMeet2')}
                            rows={3}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface leading-normal font-medium text-on-surface"
                          />
                        </div>
                      </>
                    )}

                    {editFormTab === 'contact' && (
                      <>
                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.emailAddress')}
                          </label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder={t('people.emailPlaceholder')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.jobOccupationRole')}
                          </label>
                          <input
                            type="text"
                            value={editJob}
                            onChange={(e) => setEditJob(e.target.value)}
                            placeholder={t('people.eGLeadArchitectCraft')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.phoneNumber')}
                          </label>
                          <input
                            type="tel"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="e.g. +49 170 1234567"
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.postalAddress')}
                          </label>
                          <textarea
                            value={editAddress}
                            onChange={(e) => setEditAddress(e.target.value)}
                            placeholder={t('people.123WhisperWoodLane')}
                            rows={2}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface leading-normal font-medium"
                          />
                        </div>
                      </>
                    )}

                    {editFormTab === 'hobbies' && (
                      <>
                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.hobbiesWhatTheyLike')}
                          </label>
                          <input
                            value={editLikes}
                            onChange={(e) => setEditLikes(e.target.value)}
                            placeholder={t('people.matchaPowderRawWoodworkingRunning')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.favouriteColorSlogan')}
                          </label>
                          <input
                            value={editFavoriteColor}
                            onChange={(e) => setEditFavoriteColor(e.target.value)}
                            placeholder={t('people.sageWoodDeepBlue')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.petsProfileCompanionInfo')}
                          </label>
                          <input
                            value={editPetsInfo}
                            onChange={(e) => setEditPetsInfo(e.target.value)}
                            placeholder={t('people.eGATinyFerret')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.coffeeTeaDrinkPreference')}
                          </label>
                          <input
                            value={editCoffeePreference}
                            onChange={(e) => setEditCoffeePreference(e.target.value)}
                            placeholder={t('people.eGFlatWhiteWith')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.personalityTypeMbtiVibeSlogan')}
                          </label>
                          <input
                            value={editPersonalityType}
                            onChange={(e) => setEditPersonalityType(e.target.value)}
                            placeholder={t('people.eGInfjThoughtfulHelper')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.birthdayAnniversary')}
                          </label>
                          <input
                            value={editBirthday}
                            onChange={(e) => setEditBirthday(e.target.value)}
                            placeholder={t('people.eGNovember23rd05')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.giftIdeasWishlist')}
                          </label>
                          <textarea
                            value={editGiftIdeas}
                            onChange={(e) => setEditGiftIdeas(e.target.value)}
                            placeholder={t('people.eGLovesCustomFountain')}
                            rows={2}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium leading-normal"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.favoriteFoodCuisine')}
                          </label>
                          <input
                            value={editFavoriteFood}
                            onChange={(e) => setEditFavoriteFood(e.target.value)}
                            placeholder={t('people.eGHomemadeSourdoughVegan')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.topicsToAvoidSensitiveTopics')}
                          </label>
                          <input
                            value={editSensitiveTopics}
                            onChange={(e) => setEditSensitiveTopics(e.target.value)}
                            placeholder={t('people.eGWorkStressPolitical')}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                            {t('people.sharedMilestonesLifeGoalsTogether')}
                          </label>
                          <textarea
                            value={editSharedGoals}
                            onChange={(e) => setEditSharedGoals(e.target.value)}
                            placeholder={t('people.eGTravelToNorway')}
                            rows={2}
                            className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium leading-normal"
                          />
                        </div>
                      </>
                    )}

                    {editFormTab === 'connections' && (
                      <div className="space-y-4 animate-fade-in text-xs font-sans">
                        {/* Connection List */}
                        <div>
                          <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-2 font-sans text-[10px]">
                            {t('people.establishedConnections')}
                          </label>

                          {!selectedPerson.connections ||
                          selectedPerson.connections.length === 0 ? (
                            <div className="bg-surface-container-low/50 border border-dashed border-outline-variant/30 p-4 rounded-2xl text-center text-on-surface-variant/75 italic">
                              {t('people.noRelationshipConnectionsEstablishedYet')}
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                              {selectedPerson.connections.map((conn) => {
                                const otherPerson = people.find((p) => p.id === conn.targetId);
                                if (!otherPerson) return null;
                                return (
                                  <div
                                    key={conn.targetId}
                                    className="flex items-center justify-between p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/10 hover:border-primary/10 transition-all"
                                  >
                                    <div
                                      onClick={() => {
                                        // Switch profile to connected person
                                        setSelectedPerson(otherPerson);
                                        setEditFormTab('connections');
                                      }}
                                      className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0 group"
                                      title={t('people.switchProfile')}
                                    >
                                      <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center select-none shrink-0 border border-outline-variant/15 text-[10px] font-bold text-primary group-hover:ring-2 group-hover:ring-primary/20 transition-all">
                                        {otherPerson.avatarUrl ? (
                                          <img
                                            src={otherPerson.avatarUrl}
                                            alt={otherPerson.name}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          otherPerson.initials || getInitials(otherPerson.name)
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <h5 className="font-bold text-on-surface text-xs leading-tight group-hover:text-primary transition-all truncate">
                                          {otherPerson.name}
                                        </h5>
                                        <p className="text-[10px] text-on-surface-variant/70 leading-none mt-0.5 truncate">
                                          <span className="font-semibold text-primary">
                                            {conn.type}
                                          </span>
                                          {conn.description && ` — ${conn.description}`}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoveConnection(selectedPerson.id, conn.targetId)
                                      }
                                      className="p-1.5 hover:bg-error/10 hover:text-error text-on-surface-variant/60 rounded-lg transition-all cursor-pointer shrink-0"
                                      title={t('people.unlinkConnection')}
                                    >
                                      <span className="material-symbols-outlined text-base">
                                        link_off
                                      </span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Add Connection Form inside Modal */}
                        <div className="bg-surface-container-low/55 p-3.5 rounded-2xl border border-outline-variant/15 space-y-3">
                          <span className="text-[10px] font-bold uppercase text-primary/80 tracking-wider block">
                            {t('people.linkNewRelationship')}
                          </span>

                          {people.filter(
                            (p) =>
                              p.id !== selectedPerson.id &&
                              !selectedPerson.connections?.some((c) => c.targetId === p.id),
                          ).length === 0 ? (
                            <p className="text-[11px] text-on-surface-variant/70 italic">
                              {t('people.alreadyConnectedToAllOther')}
                            </p>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                {/* Dropdown for other people */}
                                <div>
                                  <label className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                                    {t('people.targetPerson')}
                                  </label>
                                  <select
                                    value={modalConnectTargetId}
                                    onChange={(e) => setModalConnectTargetId(e.target.value)}
                                    required
                                    className="w-full bg-surface-bright border border-outline-variant/20 px-2 py-1.5 rounded-lg text-[11px] font-sans focus:outline-primary text-on-surface"
                                  >
                                    <option value="">{t('people.choosePerson')}</option>
                                    {people
                                      .filter(
                                        (p) =>
                                          p.id !== selectedPerson.id &&
                                          !selectedPerson.connections?.some(
                                            (c) => c.targetId === p.id,
                                          ),
                                      )
                                      .map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name}
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                {/* Relationship Type Selection */}
                                <div>
                                  <label className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                                    {t('people.relationshipType')}
                                  </label>
                                  <select
                                    value={modalConnectType}
                                    onChange={(e) => setModalConnectType(e.target.value)}
                                    className="w-full bg-surface-bright border border-outline-variant/20 px-2 py-1.5 rounded-lg text-[11px] font-sans focus:outline-primary text-on-surface"
                                  >
                                    <option value="Friend">{t('people.friend')}</option>
                                    <option value="Colleague">{t('people.colleague')}</option>
                                    <option value="Family">{t('people.family')}</option>
                                    <option value="Mentor">{t('people.mentor')}</option>
                                    <option value="Partner">{t('people.partner')}</option>
                                    <option value="Custom">{t('people.customType')}</option>
                                  </select>
                                </div>
                              </div>

                              {/* Custom type input */}
                              {modalConnectType === 'Custom' && (
                                <div>
                                  <input
                                    type="text"
                                    value={modalConnectCustomType}
                                    onChange={(e) => setModalConnectCustomType(e.target.value)}
                                    required
                                    placeholder={t('people.eGCoAuthorCousin')}
                                    className="w-full bg-surface-bright border border-outline-variant/20 px-2.5 py-1.5 rounded-lg text-[11px] font-sans focus:outline-primary text-on-surface"
                                  />
                                </div>
                              )}

                              {/* Connection Details description */}
                              <div>
                                <label className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                                  {t('people.connectionDetailsOptional')}
                                </label>
                                <input
                                  type="text"
                                  value={modalConnectDesc}
                                  onChange={(e) => setModalConnectDesc(e.target.value)}
                                  placeholder={t('people.eGMetAtBerlin')}
                                  className="w-full bg-surface-bright border border-outline-variant/20 px-2.5 py-1.5 rounded-lg text-[11px] font-sans focus:outline-primary text-on-surface"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  if (!modalConnectTargetId) return;
                                  const finalType =
                                    modalConnectType === 'Custom'
                                      ? modalConnectCustomType.trim() || 'Connection'
                                      : modalConnectType;
                                  handleAddConnection(
                                    selectedPerson.id,
                                    modalConnectTargetId,
                                    finalType,
                                    modalConnectDesc.trim() || undefined,
                                  );

                                  // Reset fields
                                  setModalConnectTargetId('');
                                  setModalConnectCustomType('');
                                  setModalConnectDesc('');
                                }}
                                disabled={!modalConnectTargetId}
                                className="w-full bg-primary disabled:opacity-50 hover:bg-primary/95 text-on-primary text-[11px] font-bold py-2 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">link</span>
                                {t('people.linkConnection')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleSaveProfileChanges}
                      className="bg-primary/10 hover:bg-primary/15 text-primary text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">save_as</span>
                      {t('people.saveBioRecords')}
                    </button>
                  </div>
                </div>

                {/* Right Column: Interactive Dialog Logs */}
                <div className="space-y-4 flex flex-col justify-between h-full">
                  {/* Form to log dialogue */}
                  <form
                    onSubmit={handleAddConversationLog}
                    className="space-y-3 bg-surface-container-low/50 p-4 rounded-2xl border border-outline-variant/10"
                  >
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider font-sans leading-none flex items-center gap-1 select-none">
                      <span className="material-symbols-outlined text-sm">chat</span>
                      {t('people.logDialoguesMoments')}
                    </h4>

                    <textarea
                      required
                      value={logNoteInput}
                      onChange={(e) => setLogNoteInput(e.target.value)}
                      placeholder={t('people.weTalkedAboutSourdoughBread')}
                      rows={2}
                      className="w-full bg-surface-bright border border-outline-variant/20 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/40 select-text text-on-surface"
                    />

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-sans">
                      <div className="w-full flex items-center gap-1.5 bg-surface-bright px-2 py-1.5 rounded-xl border border-outline-variant/15">
                        <span className="material-symbols-outlined text-[13px] text-outline">
                          calendar_month
                        </span>
                        <input
                          type="datetime-local"
                          value={logCustomDate}
                          onChange={(e) => setLogCustomDate(e.target.value)}
                          className="bg-transparent border-none text-[10px] w-full p-0 m-0 focus:outline-none focus:ring-0 text-on-surface scroll-m-1"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full sm:w-auto self-end bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold px-4 py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-1 shrink-0"
                      >
                        <span className="material-symbols-outlined text-xs">add</span>
                        {t('people.logMomento')}
                      </button>
                    </div>
                  </form>

                  {/* Scrolled Feed representing historic dialogue logs */}
                  <div className="flex-1 flex flex-col min-h-0 space-y-1">
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-sans select-none border-b border-outline-variant/10 pb-1 shrink-0">
                      {t('people.chronologicalLogHistory')}
                    </label>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                      {selectedPerson.interactionLogs &&
                      selectedPerson.interactionLogs.length > 0 ? (
                        selectedPerson.interactionLogs.map((log) => (
                          <div
                            key={log.id}
                            className="p-3 bg-surface-container-low/70 border border-outline-variant/10 rounded-xl flex items-start gap-2.5 group/log transition-all"
                          >
                            <span className="material-symbols-outlined text-primary text-xs mt-0.5">
                              rss_feed
                            </span>
                            <div className="flex-1 min-w-0 font-sans text-xs">
                              <p className="text-[10px] font-bold text-on-surface-variant">
                                {formatTimestamp(log.timestamp)}
                              </p>
                              <p className="text-on-surface mt-1 leading-relaxed select-text font-serif">
                                {log.note}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteLogItem(log.id)}
                              className="opacity-0 group-hover/log:opacity-100 p-1 hover:bg-error/10 hover:text-error rounded-full text-on-surface-variant/40 transition-all cursor-pointer flex items-center justify-center"
                              title={t('people.deleteMemo')}
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="py-6 text-center text-on-surface-variant/50 text-xs italic">
                          {t('people.noDialogueHistoriesArchivedUse')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Dialog Footer Controls */}
              <footer className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/15 flex items-center justify-between shrink-0">
                {showProfileDeleteConfirm ? (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <span className="text-[10px] font-sans font-bold text-error uppercase tracking-wider">
                      {t('people.permanentDelete')}
                    </span>
                    <button
                      onClick={() => {
                        onDeletePerson(selectedPerson.id);
                        setSelectedPerson(null);
                      }}
                      className="bg-error hover:bg-error/95 text-on-error py-1.5 px-3.5 rounded-xl font-sans text-xs font-bold select-none cursor-pointer transition-all active:scale-95 duration-100"
                    >
                      {t('people.confirmDelete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowProfileDeleteConfirm(false)}
                      className="bg-surface-bright hover:bg-surface-container-high border border-outline-variant/35 py-1.5 px-3 rounded-xl font-sans text-xs font-semibold select-none cursor-pointer text-on-surface"
                    >
                      {t('people.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowProfileDeleteConfirm(true)}
                    className="text-error/85 hover:text-error bg-error/10 hover:bg-error/15 py-2 px-3.5 rounded-xl font-sans text-xs font-semibold select-none flex items-center gap-1 cursor-pointer transition-all active:scale-95 duration-100"
                  >
                    <span className="material-symbols-outlined text-sm">delete_forever</span>
                    {t('people.deleteProfile')}
                  </button>
                )}

                <button
                  onClick={() => setSelectedPerson(null)}
                  className="text-on-surface text-xs font-bold bg-surface-bright hover:bg-surface-container-high border border-outline-variant/35 px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  {t('people.finishedInspection')}
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}

      {showScheduleMeetupForm &&
        createPortal(
          <div className="fixed inset-0 bg-background/85 backdrop-blur-xs flex items-center justify-center p-4 z-[70] animate-fade-in select-none">
            <form
              onSubmit={handleMeetupFormSubmit}
              className="w-full max-w-md bg-surface-bright border border-outline-variant/25 rounded-3xl p-6 space-y-4 shadow-xl text-left animate-scale-up"
            >
              <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3">
                <h3 className="font-serif text-lg font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">event</span>
                  {editingMeetup
                    ? t('people.modifyScheduledMeetup')
                    : t('people.scheduleNewMeetup')}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleMeetupForm(false);
                    setEditingMeetup(null);
                  }}
                  className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('people.meetupTitleObjective')}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('people.eGTeaSourdoughTasting')}
                    value={meetupTitle}
                    onChange={(e) => setMeetupTitle(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-primary placeholder:text-on-surface-variant/30 font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider block">
                    {t('people.withNetworkConnectionsSelectOne')}
                  </label>
                  <div className="max-h-36 overflow-y-auto border border-outline-variant/30 rounded-xl bg-surface-container p-2 space-y-1 scrollbar-thin">
                    {people.length === 0 ? (
                      <p className="text-[11px] text-on-surface-variant italic p-2">
                        {t('people.noConnectionsAvailablePleaseAdd')}
                      </p>
                    ) : (
                      people.map((p) => {
                        const isChecked = meetupPersonIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setMeetupPersonIds((prev) => prev.filter((id) => id !== p.id));
                                } else {
                                  setMeetupPersonIds((prev) => [...prev, p.id]);
                                }
                              }}
                              className="rounded border-outline-variant/30 text-primary focus:ring-primary/20 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-xs truncate">{p.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                      {t('people.date')}
                    </label>
                    <input
                      type="date"
                      required
                      value={meetupDate}
                      onChange={(e) => setMeetupDate(e.target.value)}
                      className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-primary font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                      {t('people.time')}
                    </label>
                    <input
                      type="time"
                      value={meetupTime}
                      onChange={(e) => setMeetupTime(e.target.value)}
                      className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-primary font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('people.meetupLocation')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('people.cottageCoffeeRoom4Or')}
                    value={meetupLocation}
                    onChange={(e) => setMeetupLocation(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-primary placeholder:text-on-surface-variant/30 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('people.preparationNotesObjectives')}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={t('people.whatItemsShouldYouBring')}
                    value={meetupPrepNotes}
                    onChange={(e) => setMeetupPrepNotes(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-primary placeholder:text-on-surface-variant/30 font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/15">
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleMeetupForm(false);
                    setEditingMeetup(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-outline-variant text-xs text-on-surface hover:bg-surface-container transition-all cursor-pointer"
                >
                  {t('people.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary hover:bg-primary/95 text-on-primary rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
                >
                  {editingMeetup ? t('people.saveChanges') : t('people.scheduleMeetup')}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
