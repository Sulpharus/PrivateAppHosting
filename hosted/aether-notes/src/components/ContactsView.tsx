/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import type { Contact, Interaction, Meetup, Note } from '../types';
import BirthdayField from './BirthdayField';

interface ContactsViewProps {
  contacts: Contact[];
  interactions: Interaction[];
  notes: Note[];
  meetups: Meetup[];
  onAddContact: (contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  onUpdateContact: (contact: Contact) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
  onAddInteraction: (interaction: Omit<Interaction, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteInteraction: (id: string) => Promise<void>;
  onLinkNoteToContact: (noteId: string, contactId: string | undefined) => Promise<void>;
  onAddMeetup: (meetup: Omit<Meetup, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateMeetup: (meetup: Meetup) => Promise<void>;
  onDeleteMeetup: (id: string) => Promise<void>;
}

export default function ContactsView({
  contacts,
  interactions,
  notes,
  meetups,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  onAddInteraction,
  onDeleteInteraction,
  onLinkNoteToContact,
  onAddMeetup,
  onUpdateMeetup,
  onDeleteMeetup,
}: ContactsViewProps) {
  const { t } = useTranslation();
  // Search and Filter State for Contacts
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [selectedCompany, setSelectedCompany] = useState<string>('All');
  const [followUpFilter, setFollowUpFilter] = useState<'all' | 'reminders'>('all');

  // Active contact for detail view
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Modal / Form state for Contacts
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [showAddInteractionForm, setShowAddInteractionForm] = useState(false);

  // Meetups Form / Modal State
  const [showScheduleMeetupForm, setShowScheduleMeetupForm] = useState(false);
  const [editingMeetup, setEditingMeetup] = useState<Meetup | null>(null);

  // Form Fields for Contact (Add & Edit)
  const [contactName, setContactName] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [contactTags, setContactTags] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [contactFollowUpDate, setContactFollowUpDate] = useState('');
  const [contactFollowUpNote, setContactFollowUpNote] = useState('');
  const [contactBirthday, setContactBirthday] = useState('');
  const [contactBirthdayShared, setContactBirthdayShared] = useState(true);

  // Form Fields for Interaction
  const [interactionDate, setInteractionDate] = useState(() =>
    new Date().toLocaleDateString('sv-SE').slice(0, 10),
  );
  const [interactionChannel, setInteractionChannel] = useState<
    'call' | 'email' | 'meeting' | 'message'
  >('meeting');
  const [interactionSummary, setInteractionSummary] = useState('');

  // Form Fields for Meetup Scheduling & Editing
  const [meetupTitle, setMeetupTitle] = useState('');
  const [meetupContactIds, setMeetupContactIds] = useState<string[]>([]);
  const [meetupDate, setMeetupDate] = useState(() =>
    new Date().toLocaleDateString('sv-SE').slice(0, 10),
  );
  const [meetupTime, setMeetupTime] = useState('14:00');
  const [meetupLocation, setMeetupLocation] = useState('');
  const [meetupPrepNotes, setMeetupPrepNotes] = useState('');

  // Dropdown for linking existing notes
  const [selectedNoteIdToLink, setSelectedNoteIdToLink] = useState('');

  // Helpers to check follow-up dates (Local Time sv-SE is YYYY-MM-DD)
  const getFollowUpStatus = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { type: 'overdue', text: t('contacts.overdue') };
    if (diffDays === 0) return { type: 'today', text: t('contacts.today') };
    if (diffDays === 1) return { type: 'tomorrow', text: t('contacts.tomorrow') };
    if (diffDays <= 14)
      return {
        type: 'upcoming',
        text: t('contacts.inD', { diffDays }),
      };
    return { type: 'future', text: dateStr };
  };

  // Get list of unique tags and companies for filter dropdowns
  const uniqueTags = useMemo(() => {
    const tagsSet = new Set<string>();
    contacts.forEach((c) => c.tags?.forEach((t) => tagsSet.add(t)));
    return ['All', ...Array.from(tagsSet)];
  }, [contacts]);

  const uniqueCompanies = useMemo(() => {
    const cosSet = new Set<string>();
    contacts.forEach((c) => {
      if (c.company?.trim()) cosSet.add(c.company.trim());
    });
    return ['All', ...Array.from(cosSet)];
  }, [contacts]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.company && c.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.role && c.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesTag = selectedTag === 'All' || c.tags?.includes(selectedTag);
      const matchesCompany = selectedCompany === 'All' || c.company === selectedCompany;
      const matchesFollowUp = followUpFilter === 'all' || !!c.followUpDate;
      return matchesSearch && matchesTag && matchesCompany && matchesFollowUp;
    });
  }, [contacts, searchQuery, selectedTag, selectedCompany, followUpFilter]);

  // Selected contact's interactions sorted chronologically (newest first)
  const contactInteractions = useMemo(() => {
    if (!selectedContact) return [];
    return interactions
      .filter((i) => i.contactId === selectedContact.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [selectedContact, interactions]);

  // Selected contact's linked notes
  const contactLinkedNotes = useMemo(() => {
    if (!selectedContact) return [];
    return notes.filter((n) => n.contactId === selectedContact.id);
  }, [selectedContact, notes]);

  // List of notes available to be linked (not currently linked to this contact)
  const linkableNotes = useMemo(() => {
    if (!selectedContact) return [];
    return notes.filter((n) => n.contactId !== selectedContact.id);
  }, [selectedContact, notes]);

  // Init Form for adding new contact
  const handleOpenAddContact = () => {
    setContactName('');
    setContactCompany('');
    setContactRole('');
    setContactEmail('');
    setContactPhone('');
    setContactAddress('');
    setContactTags('');
    setContactNotes('');
    setContactFollowUpDate('');
    setContactFollowUpNote('');
    setContactBirthday('');
    setContactBirthdayShared(true);
    setIsEditingContact(false);
    setShowAddContactForm(true);
  };

  // Init Form for editing existing contact
  const handleOpenEditContact = (c: Contact) => {
    setContactName(c.name);
    setContactCompany(c.company || '');
    setContactRole(c.role || '');
    setContactEmail(c.email || '');
    setContactPhone(c.phone || '');
    setContactAddress(c.address || '');
    setContactTags(c.tags?.join(', ') || '');
    setContactNotes(c.notes || '');
    setContactFollowUpDate(c.followUpDate || '');
    setContactFollowUpNote(c.followUpNote || '');
    setContactBirthday(c.birthday || '');
    setContactBirthdayShared(c.birthdayShared !== false);
    setIsEditingContact(true);
    setShowAddContactForm(true);
  };

  // Submit Contact (Add or Edit)
  const handleContactFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim()) return;

    const tagsArray = contactTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const contactData = {
      name: contactName.trim(),
      company: contactCompany.trim() || undefined,
      role: contactRole.trim() || undefined,
      email: contactEmail.trim() || undefined,
      phone: contactPhone.trim() || undefined,
      address: contactAddress.trim() || undefined,
      tags: tagsArray,
      notes: contactNotes.trim() || undefined,
      followUpDate: contactFollowUpDate || null,
      followUpNote: contactFollowUpNote.trim() || undefined,
      birthday: contactBirthday || undefined,
      birthdayShared: contactBirthday ? contactBirthdayShared : undefined,
    };

    if (isEditingContact && selectedContact) {
      const updated: Contact = {
        ...selectedContact,
        ...contactData,
        updatedAt: Date.now(),
      };
      await onUpdateContact(updated);
      setSelectedContact(updated);
    } else {
      const newId = await onAddContact(contactData);
      const createdContact: Contact = {
        id: newId,
        ...contactData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSelectedContact(createdContact);
    }

    setShowAddContactForm(false);
  };

  // Delete current selected contact
  const handleDeleteCurrentContact = async () => {
    if (!selectedContact) return;
    if (
      window.confirm(
        `Are you sure you want to delete ${selectedContact.name}? This will also delete their interaction logs and any associated meetups.`,
      )
    ) {
      await onDeleteContact(selectedContact.id);
      setSelectedContact(null);
    }
  };

  // Log a new interaction
  const handleInteractionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !interactionSummary.trim()) return;

    await onAddInteraction({
      contactId: selectedContact.id,
      date: interactionDate,
      channel: interactionChannel,
      summary: interactionSummary.trim(),
    });

    setInteractionSummary('');
    setShowAddInteractionForm(false);
  };

  // Link selected note
  const handleLinkNote = async () => {
    if (!selectedContact || !selectedNoteIdToLink) return;
    await onLinkNoteToContact(selectedNoteIdToLink, selectedContact.id);
    setSelectedNoteIdToLink('');
  };

  // Meetup helper functions
  const handleOpenScheduleMeetup = () => {
    setMeetupTitle('');
    setMeetupContactIds(contacts[0] ? [contacts[0].id] : []);
    setMeetupDate(new Date().toLocaleDateString('sv-SE').slice(0, 10));
    setMeetupTime('14:00');
    setMeetupLocation('');
    setMeetupPrepNotes('');
    setEditingMeetup(null);
    setShowScheduleMeetupForm(true);
  };

  const handleOpenEditMeetup = (meetup: Meetup) => {
    setMeetupTitle(meetup.title);
    setMeetupContactIds(meetup.contactIds || (meetup.contactId ? [meetup.contactId] : []));
    setMeetupDate(meetup.date);
    setMeetupTime(meetup.time || '12:00');
    setMeetupLocation(meetup.location || '');
    setMeetupPrepNotes(meetup.preparationNotes || '');
    setEditingMeetup(meetup);
    setShowScheduleMeetupForm(true);
  };

  const handleMeetupFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetupTitle.trim() || meetupContactIds.length === 0) return;

    const meetupData = {
      title: meetupTitle.trim(),
      contactIds: meetupContactIds,
      contactId: meetupContactIds[0] || '', // Fallback for backwards compatibility
      date: meetupDate,
      time: meetupTime || undefined,
      location: meetupLocation.trim() || undefined,
      preparationNotes: meetupPrepNotes.trim() || undefined,
      completed: editingMeetup ? editingMeetup.completed : false,
    };

    if (editingMeetup) {
      await onUpdateMeetup({
        ...editingMeetup,
        ...meetupData,
      });
    } else {
      await onAddMeetup(meetupData);
    }

    setShowScheduleMeetupForm(false);
    setEditingMeetup(null);
  };

  const handleToggleMeetupCompleted = async (meetup: Meetup) => {
    await onUpdateMeetup({
      ...meetup,
      completed: !meetup.completed,
    });
  };

  const handleDeleteMeetupItem = async (id: string) => {
    if (window.confirm('Delete this meetup from your schedule?')) {
      await onDeleteMeetup(id);
    }
  };

  // Get Channel Icon/Name
  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'call':
        return 'call';
      case 'email':
        return 'mail';
      case 'meeting':
        return 'groups';
      case 'message':
        return 'chat';
      default:
        return 'forum';
    }
  };

  return (
    <div id="contacts-workspace-root" className="animate-fade-in space-y-6">
      {/* Title Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-on-background">
            {t('contacts.clientContactsCrm')}
          </h1>
          <p className="font-serif text-xs italic text-on-surface-variant mt-1.5 leading-normal max-w-xl">
            {t('contacts.keepTrackOfSlowConversations')}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenScheduleMeetup}
            disabled={contacts.length === 0}
            className="bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/20 disabled:opacity-50 text-xs font-semibold px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
          >
            <span className="material-symbols-outlined text-base">calendar_today</span>
            {t('contacts.scheduleMeetup')}
          </button>
          <button
            onClick={handleOpenAddContact}
            className="bg-primary hover:bg-primary/95 text-on-primary disabled:opacity-50 text-xs font-semibold px-4.5 py-3 rounded-xl transition-all shadow-sm active:scale-95 duration-100 flex items-center justify-center gap-2 cursor-pointer select-none"
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            {t('contacts.addNewContact')}
          </button>
        </div>
      </header>

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
            <h2 className="font-serif text-base font-bold text-on-surface">
              {t('contacts.meetupPlannerPreparationBoard')}
            </h2>
          </div>
          {meetups.length > 0 && (
            <span className="font-mono text-[10px] bg-primary/10 text-primary font-bold px-2.5 py-0.5 rounded-full">
              {meetups.filter((m) => !m.completed).length} {t('contacts.pending')}
            </span>
          )}
        </div>

        <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-thin scroll-smooth select-none min-h-[170px]">
          {meetups.length === 0 ? (
            <div className="w-full flex flex-col items-center justify-center py-6 border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-lowest text-center">
              <span className="material-symbols-outlined text-on-surface-variant/40 text-3xl mb-1.5">
                groups_3
              </span>
              <p className="font-serif text-xs text-on-surface-variant/75">
                {t('contacts.noScheduledMeetupsFound')}
              </p>
              <button
                onClick={handleOpenScheduleMeetup}
                disabled={contacts.length === 0}
                className="mt-2 text-primary hover:underline text-[11px] font-bold flex items-center gap-1"
              >
                {t('contacts.scheduleYourFirstMeetupWith')}
              </button>
            </div>
          ) : (
            meetups
              .sort(
                (a, b) =>
                  a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''),
              )
              .map((m) => {
                const linkedIds = m.contactIds || (m.contactId ? [m.contactId] : []);
                const linkedContacts = contacts.filter((c) => linkedIds.includes(c.id));

                return (
                  <div
                    key={m.id}
                    className={`w-80 shrink-0 rounded-2xl border p-4.5 flex flex-col justify-between gap-3.5 transition-all text-left bg-surface-container-lowest ${
                      m.completed
                        ? 'border-outline-variant/20 opacity-65 grayscale-30 shadow-xs'
                        : 'border-primary/20 shadow-sm hover:border-primary/45 hover:shadow-md'
                    }`}
                  >
                    {/* Top Header */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3
                          className={`font-serif text-xs font-bold leading-tight truncate text-on-surface ${m.completed ? 'line-through text-on-surface-variant' : ''}`}
                        >
                          {m.title}
                        </h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleOpenEditMeetup(m)}
                            className="p-1 hover:bg-surface-container rounded text-on-surface-variant/70 hover:text-primary transition-all cursor-pointer"
                            title={t('meetups.edit')}
                          >
                            <span className="material-symbols-outlined text-xs">edit</span>
                          </button>
                          <button
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

                    {/* Contact Info Row */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold uppercase text-on-surface-variant/75 tracking-wider block">
                        Connections ({linkedContacts.length})
                      </span>
                      {linkedContacts.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-[76px] overflow-y-auto pr-1">
                          {linkedContacts.map((lc) => {
                            const initials = lc.name
                              ? lc.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()
                              : '??';
                            return (
                              <div
                                key={lc.id}
                                className="flex items-center gap-1.5 p-1.5 pl-2 pr-2.5 bg-surface-container/50 hover:bg-surface-container rounded-lg cursor-pointer duration-100 border border-outline-variant/10 min-w-0 max-w-full"
                                onClick={() => {
                                  setSelectedContact(lc);
                                  setShowAddContactForm(false);
                                }}
                                title={`View Profile for ${lc.name}`}
                              >
                                <div className="w-5 h-5 shrink-0 rounded-full bg-primary-container/40 text-primary flex items-center justify-center font-bold text-[8px] uppercase">
                                  {initials}
                                </div>
                                <span className="text-[10px] font-bold text-on-surface truncate leading-none">
                                  {lc.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-[9px] text-error/85 bg-error/5 border border-error/10 p-2 rounded-xl">
                          {t('meetups.contactsDeleted')}
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
                            'No notes added. Click edit to compile what you might need to prepare for this meetup.'}
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

      {/* MEETUP FORM MODAL DIALOG */}
      {showScheduleMeetupForm && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <form
            onSubmit={handleMeetupFormSubmit}
            className="w-full max-w-md bg-surface-container-low border border-outline-variant/25 rounded-3xl p-6 space-y-4 shadow-xl text-left animate-scale-up"
          >
            <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3">
              <h3 className="font-serif text-lg font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">event</span>
                {editingMeetup ? 'Modify Scheduled Meetup' : 'Schedule New Meetup'}
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
                  {t('meetups.titleLabel')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('meetups.titlePlaceholder')}
                  value={meetupTitle}
                  onChange={(e) => setMeetupTitle(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider block">
                  {t('meetups.withLabel')}
                </label>
                <div className="max-h-36 overflow-y-auto border border-outline-variant/30 rounded-xl bg-surface-container p-2 space-y-1 scrollbar-thin">
                  {contacts.length === 0 ? (
                    <p className="text-[11px] text-on-surface-variant italic p-2">
                      {t('meetups.noContacts')}
                    </p>
                  ) : (
                    contacts.map((c) => {
                      const isChecked = meetupContactIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
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
                                setMeetupContactIds((prev) => prev.filter((id) => id !== c.id));
                              } else {
                                setMeetupContactIds((prev) => [...prev, c.id]);
                              }
                            }}
                            className="rounded border-outline-variant/30 text-primary focus:ring-primary/20 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="text-xs truncate">
                            {c.name} {c.company ? `(${c.company})` : ''}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('meetups.dateLabel')}
                  </label>
                  <input
                    type="date"
                    required
                    value={meetupDate}
                    onChange={(e) => setMeetupDate(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('meetups.timeLabel')}
                  </label>
                  <input
                    type="time"
                    value={meetupTime}
                    onChange={(e) => setMeetupTime(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                  {t('meetups.locationLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('meetups.locationPlaceholder')}
                  value={meetupLocation}
                  onChange={(e) => setMeetupLocation(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                  {t('meetups.notesLabel')}
                </label>
                <textarea
                  rows={3}
                  placeholder={t('meetups.notesPlaceholder')}
                  value={meetupPrepNotes}
                  onChange={(e) => setMeetupPrepNotes(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/30"
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
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-primary hover:bg-primary/95 text-on-primary rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer animate-fade-in"
              >
                {editingMeetup ? 'Save Changes' : 'Schedule Meetup'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Workspace split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Filters & Directory Grid */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/20 space-y-3.5 text-left">
            {/* Search Bar */}
            <div className="relative">
              <span className="absolute left-3 top-2.5 material-symbols-outlined text-on-surface-variant/70 text-lg font-sans">
                search
              </span>
              <input
                type="text"
                placeholder={t('contacts.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/30 rounded-xl py-2 pl-9.5 pr-4 text-xs font-sans placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 text-on-surface"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-wider">
                  {t('contacts.tag')}
                </label>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-lg p-1.5 text-xs text-on-surface focus:outline-none"
                >
                  {uniqueTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-wider">
                  {t('contacts.company')}
                </label>
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-lg p-1.5 text-xs text-on-surface focus:outline-none"
                >
                  {uniqueCompanies.map((co) => (
                    <option key={co} value={co}>
                      {co}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Segmented Filter: All vs Reminders */}
            <div className="flex bg-surface-container border border-outline-variant/20 p-1 rounded-xl gap-1 items-center text-[10px] font-bold select-none">
              <button
                type="button"
                onClick={() => setFollowUpFilter('all')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                  followUpFilter === 'all'
                    ? 'bg-surface-bright text-primary font-bold shadow-2xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {t('contacts.allContacts')} ({contacts.length})
              </button>
              <button
                type="button"
                onClick={() => setFollowUpFilter('reminders')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                  followUpFilter === 'reminders'
                    ? 'bg-surface-bright text-primary font-bold shadow-2xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[13px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  notifications_active
                </span>
                <span>{t('contacts.reminders')}</span>
                <span className="bg-primary/10 text-primary px-1.5 py-0.2 rounded-full text-[9px] leading-tight font-extrabold">
                  {contacts.filter((c) => !!c.followUpDate).length}
                </span>
              </button>
            </div>
          </div>

          {/* Contact Cards List */}
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {filteredContacts.length === 0 ? (
              <div className="text-center py-12 bg-surface-container-lowest border border-dashed border-outline-variant/30 rounded-2xl">
                <span className="material-symbols-outlined text-on-surface-variant/40 text-4xl mb-2">
                  person_search
                </span>
                <p className="font-serif text-xs text-on-surface-variant/70">
                  {t('contacts.noMatch')}
                </p>
              </div>
            ) : (
              filteredContacts.map((c) => {
                const isSelected = selectedContact?.id === c.id;
                const status = getFollowUpStatus(c.followUpDate);
                const initials = c.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedContact(c);
                      setShowAddContactForm(false);
                    }}
                    className={`p-4 rounded-2xl border text-left cursor-pointer transition-all flex items-start gap-3.5 select-none ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/10 shadow-sm'
                        : 'border-outline-variant/20 bg-surface-container-lowest hover:bg-surface-container-low'
                    }`}
                  >
                    {/* Initials Avatar */}
                    <div className="w-10 h-10 rounded-full bg-primary-container/45 text-primary flex items-center justify-center font-bold text-sm shrink-0 uppercase tracking-wider">
                      {initials}
                    </div>

                    {/* Meta info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-sans text-xs font-bold text-on-surface leading-tight truncate">
                          {c.name}
                        </h3>

                        {/* Follow up badge */}
                        {status && (
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full select-none ${
                              status.type === 'overdue'
                                ? 'bg-error-container text-on-error-container'
                                : 'bg-secondary-container text-on-secondary-container'
                            }`}
                          >
                            {status.text}
                          </span>
                        )}
                      </div>

                      {/* Role & Company (Job details) */}
                      {(c.role || c.company) && (
                        <p className="text-[10px] text-on-surface-variant/80 truncate font-sans">
                          {c.role} {c.role && c.company ? 'at' : ''} {c.company}
                        </p>
                      )}

                      {/* Short Address Preview */}
                      {c.address && (
                        <p className="text-[9px] text-on-surface-variant/60 truncate font-sans flex items-center gap-0.5 mt-0.5">
                          <span className="material-symbols-outlined text-[10px] shrink-0">
                            pin_drop
                          </span>
                          <span className="truncate">{c.address}</span>
                        </p>
                      )}

                      {/* Tag chips */}
                      {c.tags && c.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {c.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] font-medium bg-surface-container-high px-1.5 py-0.5 rounded-md text-on-surface-variant"
                            >
                              {tag}
                            </span>
                          ))}
                          {c.tags.length > 3 && (
                            <span className="text-[9px] text-on-surface-variant/60">
                              +{c.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column: Action Panel (Detail Inspector / Form) */}
        <div className="lg:col-span-7">
          {showAddContactForm ? (
            /* Add / Edit Contact Form */
            <form
              onSubmit={handleContactFormSubmit}
              className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/25 space-y-4 animate-fade-in text-left"
            >
              <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3">
                <h2 className="font-serif text-lg font-bold text-on-surface">
                  {isEditingContact ? 'Modify Contact Details' : 'Onboard New Contact'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddContactForm(false)}
                  className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('contacts.fullName')}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('contacts.fullNamePlaceholder')}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('contacts.company')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('contacts.companyPlaceholder')}
                    value={contactCompany}
                    onChange={(e) => setContactCompany(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('contacts.role')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('contacts.rolePlaceholder')}
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('contacts.email')}
                  </label>
                  <input
                    type="email"
                    placeholder={t('contacts.emailPlaceholder')}
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('contacts.phone')}
                  </label>
                  <input
                    type="tel"
                    placeholder={t('contacts.phonePlaceholder')}
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('contacts.addressLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder="10 St James's Square, London, SW1"
                    value={contactAddress}
                    onChange={(e) => setContactAddress(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <BirthdayField
                  value={contactBirthday}
                  shared={contactBirthdayShared}
                  onChange={(value, shared) => {
                    setContactBirthday(value);
                    setContactBirthdayShared(shared);
                  }}
                />

                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('contacts.tagsLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('contacts.tagsPlaceholder')}
                    value={contactTags}
                    onChange={(e) => setContactTags(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                  {t('contacts.notesLabel')}
                </label>
                <textarea
                  rows={3}
                  placeholder={t('contacts.notesPlaceholder')}
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30"
                />
              </div>

              {/* Follow-up configurations */}
              <div className="p-4 bg-surface-container rounded-2xl border border-outline-variant/20 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-secondary">
                      notifications
                    </span>
                    {t('contacts.followUpDate')}
                  </label>
                  <input
                    type="date"
                    value={contactFollowUpDate}
                    onChange={(e) => setContactFollowUpDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                    {t('contacts.followUpNote')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('contacts.followUpPlaceholder')}
                    value={contactFollowUpNote}
                    onChange={(e) => setContactFollowUpNote(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2 text-xs text-on-surface focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/15">
                <button
                  type="button"
                  onClick={() => setShowAddContactForm(false)}
                  className="px-4 py-2 rounded-xl border border-outline-variant text-xs text-on-surface hover:bg-surface-container hover:border-on-surface transition-all cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary hover:bg-primary/95 text-on-primary rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
                >
                  {t('contacts.saveProfile')}
                </button>
              </div>
            </form>
          ) : selectedContact ? (
            /* Contact Detail Inspector */
            <div className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/20 space-y-6 animate-fade-in text-left">
              {/* Profile Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/15 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary-container/40 text-primary flex items-center justify-center font-bold text-xl uppercase tracking-wider">
                    {selectedContact.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-serif text-xl font-bold text-on-surface">
                      {selectedContact.name}
                    </h2>
                    {(selectedContact.role || selectedContact.company) && (
                      <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                        {selectedContact.role}{' '}
                        {selectedContact.role && selectedContact.company ? 'at' : ''}{' '}
                        {selectedContact.company}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  <button
                    onClick={() => handleOpenEditContact(selectedContact)}
                    className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-xl transition-all cursor-pointer border border-outline-variant/10"
                    title={t('contacts.edit')}
                  >
                    <span className="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button
                    onClick={handleDeleteCurrentContact}
                    className="p-2 text-on-surface-variant hover:text-error hover:bg-error/5 rounded-xl transition-all cursor-pointer border border-outline-variant/10"
                    title={t('contacts.delete')}
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              </div>

              {/* Bio & Contact Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {selectedContact.email && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/75 tracking-wider block">
                      {t('contacts.emailShort')}
                    </span>
                    <a
                      href={`mailto:${selectedContact.email}`}
                      className="text-primary hover:underline font-sans flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">mail</span>
                      {selectedContact.email}
                    </a>
                  </div>
                )}

                {selectedContact.phone && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/75 tracking-wider block">
                      {t('contacts.phoneShort')}
                    </span>
                    <a
                      href={`tel:${selectedContact.phone}`}
                      className="text-on-surface font-sans flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">phone</span>
                      {selectedContact.phone}
                    </a>
                  </div>
                )}

                {selectedContact.address && (
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/75 tracking-wider block">
                      {t('contacts.addressShort')}
                    </span>
                    <div className="text-on-surface font-sans flex items-start gap-1 p-2.5 rounded-xl bg-surface-container/30 border border-outline-variant/10">
                      <span className="material-symbols-outlined text-sm text-secondary shrink-0 mt-0.5">
                        pin_drop
                      </span>
                      <span className="leading-relaxed">{selectedContact.address}</span>
                    </div>
                  </div>
                )}

                {selectedContact.birthday && (
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/75 tracking-wider block">
                      {t('birthday.label')}
                    </span>
                    <div className="text-on-surface font-sans p-2.5 rounded-xl bg-surface-container/30 border border-outline-variant/10">
                      {selectedContact.birthday}
                      {selectedContact.birthdayShared === false
                        ? ` · ${t('birthday.private')}`
                        : ` · ${t('birthday.sharedShort')}`}
                    </div>
                  </div>
                )}

                {selectedContact.tags && selectedContact.tags.length > 0 && (
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/75 tracking-wider block">
                      {t('contacts.tags')}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedContact.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-0.5 rounded-lg bg-surface-container-high border border-outline-variant/15 text-[10px] font-medium text-on-surface"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedContact.notes && (
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/75 tracking-wider block">
                      {t('contacts.background')}
                    </span>
                    <p className="text-on-surface-variant leading-relaxed font-serif bg-surface-container/30 p-3 rounded-xl border border-outline-variant/10 whitespace-pre-line">
                      {selectedContact.notes}
                    </p>
                  </div>
                )}

                {selectedContact.followUpDate && (
                  <div className="sm:col-span-2 p-3.5 bg-primary/5 rounded-2xl border border-primary/15 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="material-symbols-outlined text-primary text-xl mt-0.5 shrink-0"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        notifications_active
                      </span>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-[11px] font-bold text-on-surface uppercase tracking-wider">
                            {t('contacts.scheduledFollowUpReminder')}
                          </h4>
                          {(() => {
                            const st = getFollowUpStatus(selectedContact.followUpDate);
                            return st ? (
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                                  st.type === 'overdue'
                                    ? 'bg-error-container text-on-error-container'
                                    : 'bg-primary text-on-primary'
                                }`}
                              >
                                {st.text}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <p className="text-xs text-on-surface-variant font-medium truncate">
                          <strong className="text-primary">{selectedContact.followUpDate}</strong> —{' '}
                          {selectedContact.followUpNote || t('contacts.touchBase')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = {
                          ...selectedContact,
                          followUpDate: null,
                          followUpNote: undefined,
                          updatedAt: Date.now(),
                        };
                        onUpdateContact(updated);
                        setSelectedContact(updated);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-primary text-on-primary hover:bg-primary/95 text-[10px] font-bold transition-all shrink-0 cursor-pointer shadow-2xs flex items-center gap-1 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-xs">done</span>
                      <span>{t('contacts.markCompleted')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Linked Notes Section */}
              <div className="border-t border-outline-variant/15 pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-sm font-bold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-base">
                      sticky_note
                    </span>
                    Linked Notes ({contactLinkedNotes.length})
                  </h3>
                </div>

                {contactLinkedNotes.length === 0 ? (
                  <p className="text-[11px] italic text-on-surface-variant/70">
                    {t('contacts.noLinkedNotes')}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {contactLinkedNotes.map((note) => (
                      <div
                        key={note.id}
                        className="p-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <h4 className="text-[11px] font-bold text-on-surface truncate">
                            {note.title}
                          </h4>
                          <p className="text-[10px] text-on-surface-variant/70 truncate">
                            {note.content.substring(0, 45)}...
                          </p>
                        </div>
                        <button
                          onClick={() => onLinkNoteToContact(note.id, undefined)}
                          className="text-on-surface-variant hover:text-error p-1 rounded-lg hover:bg-surface-container duration-100 cursor-pointer"
                          title={t('contacts.unlinkNote')}
                        >
                          <span className="material-symbols-outlined text-sm">link_off</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Link Note Selector */}
                {linkableNotes.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={selectedNoteIdToLink}
                      onChange={(e) => setSelectedNoteIdToLink(e.target.value)}
                      className="flex-1 bg-surface-container border border-outline-variant/30 rounded-xl p-2 text-[11px] text-on-surface focus:outline-none"
                    >
                      <option value="">-- Link an existing note --</option>
                      {linkableNotes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleLinkNote}
                      disabled={!selectedNoteIdToLink}
                      className="px-3 py-2 bg-primary text-on-primary disabled:opacity-55 text-[11px] font-bold rounded-xl hover:bg-primary/95 transition-all cursor-pointer whitespace-nowrap"
                    >
                      {t('contacts.linkNote')}
                    </button>
                  </div>
                )}
              </div>

              {/* Interaction Log Chronology */}
              <div className="border-t border-outline-variant/15 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-sm font-bold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-base">
                      history
                    </span>
                    Interaction Logs ({contactInteractions.length})
                  </h3>

                  {!showAddInteractionForm && (
                    <button
                      onClick={() => setShowAddInteractionForm(true)}
                      className="px-3 py-1.5 border border-primary/20 text-primary hover:bg-primary/5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      {t('contacts.logInteraction')}
                    </button>
                  )}
                </div>

                {/* Add Interaction Form overlay inline */}
                {showAddInteractionForm && (
                  <form
                    onSubmit={handleInteractionSubmit}
                    className="p-4 bg-surface-container border border-outline-variant/20 rounded-2xl space-y-3.5 animate-slide-down"
                  >
                    <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
                      <span className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">
                        {t('contacts.recordInteraction')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddInteractionForm(false)}
                        className="text-on-surface-variant hover:text-on-surface"
                      >
                        <span className="material-symbols-outlined text-xs">close</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-on-surface-variant/80 tracking-wider">
                          {t('contacts.date')}
                        </label>
                        <input
                          type="date"
                          required
                          value={interactionDate}
                          onChange={(e) => setInteractionDate(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-1.5 text-[11px] text-on-surface focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-on-surface-variant/80 tracking-wider">
                          {t('contacts.channel')}
                        </label>
                        <select
                          value={interactionChannel}
                          onChange={(e) => setInteractionChannel(e.target.value as any)}
                          className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-1.5 text-[11px] text-on-surface focus:outline-none"
                        >
                          <option value="meeting">Meeting (In person)</option>
                          <option value="call">Phone Call</option>
                          <option value="email">Email Thread</option>
                          <option value="message">Chat / Message</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-on-surface-variant/80 tracking-wider">
                        {t('contacts.summary')}
                      </label>
                      <textarea
                        rows={2}
                        required
                        placeholder={t('contacts.summaryPlaceholder')}
                        value={interactionSummary}
                        onChange={(e) => setInteractionSummary(e.target.value)}
                        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2 text-[11px] text-on-surface focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddInteractionForm(false)}
                        className="px-3 py-1.5 border border-outline-variant rounded-lg text-[10px] text-on-surface hover:bg-surface-container-low cursor-pointer"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 bg-primary text-on-primary rounded-lg text-[10px] font-semibold hover:bg-primary/95 transition-all cursor-pointer"
                      >
                        {t('contacts.recordLogs')}
                      </button>
                    </div>
                  </form>
                )}

                {/* List of logged interactions */}
                {contactInteractions.length === 0 ? (
                  <p className="text-[11px] italic text-on-surface-variant/60">
                    {t('contacts.noLogs')}
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-1">
                    {contactInteractions.map((int) => (
                      <div
                        key={int.id}
                        className="p-3.5 rounded-xl border border-outline-variant/15 bg-surface-container-lowest/80 flex items-start gap-3 relative group"
                      >
                        <span className="material-symbols-outlined text-primary bg-primary/5 p-1.5 rounded-lg text-sm shrink-0">
                          {getChannelIcon(int.channel)}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-sans">
                            <span className="font-bold text-on-surface capitalize">
                              {int.channel} conversation
                            </span>
                            <span className="text-on-surface-variant/80 font-mono">{int.date}</span>
                          </div>
                          <p className="text-[11px] font-serif text-on-surface-variant leading-relaxed">
                            {int.summary}
                          </p>
                        </div>
                        <button
                          onClick={() => onDeleteInteraction(int.id)}
                          className="opacity-0 group-hover:opacity-100 hover:text-error transition-opacity duration-150 p-1 rounded-md shrink-0 self-start cursor-pointer font-sans"
                          title={t('contacts.deleteLog')}
                        >
                          <span className="material-symbols-outlined text-xs">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center p-12 bg-surface-container-lowest border border-dashed border-outline-variant/25 rounded-3xl min-h-[45vh]">
              <span
                className="material-symbols-outlined text-primary/30 text-5xl mb-4"
                style={{ fontVariationSettings: "'FILL' 0" }}
              >
                contact_page
              </span>
              <h3 className="font-serif text-base font-bold text-on-surface">
                {t('contacts.noneSelected')}
              </h3>
              <p className="font-serif text-xs text-on-surface-variant/75 text-center mt-1.5 leading-normal max-w-sm">
                {t('contacts.noneSelectedHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
