/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { mininode } from '../mininode';
import type { Contact, Interaction, Meetup, Note } from '../types';
import RelationshipMap from './RelationshipMap';

interface KontakteViewProps {
  contacts: Contact[];
  interactions: Interaction[];
  meetups: Meetup[];
  notes: Note[];
  onAddContact: (contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  onUpdateContact: (contact: Contact) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
  onAddInteraction: (interaction: Omit<Interaction, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteInteraction: (id: string) => Promise<void>;
  onAddMeetup: (meetup: Omit<Meetup, 'id' | 'createdAt'>) => Promise<void>;
  onCompleteFollowUp: (contact: Contact) => void;
  onOpenNote: (note: Note) => void;
  newContactTrigger?: number;
  initialSelectedContactId?: string | null;
}

export default function KontakteView({
  contacts,
  interactions,
  meetups,
  notes,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  onAddInteraction,
  onDeleteInteraction,
  onAddMeetup,
  onCompleteFollowUp,
  onOpenNote,
  newContactTrigger,
  initialSelectedContactId,
}: KontakteViewProps) {
  // Search, filter, sorting, view mode
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('Alle');
  const [sortBy, setSortBy] = useState<'name' | 'followUp' | 'recent'>('name');
  const [viewMode, setViewMode] = useState<'liste' | 'netzwerk'>('liste');

  // Sheet / Modal states
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New interaction form state
  const [newInteractionChannel, setNewInteractionChannel] = useState<
    'call' | 'meeting' | 'email' | 'message'
  >('meeting');
  const [newInteractionSummary, setNewInteractionSummary] = useState('');
  const [newInteractionDate, setNewInteractionDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  // File upload state for contact
  const [isUploading, setIsUploading] = useState(false);

  // Form states for contact editor
  const [formName, setFormName] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBirthday, setFormBirthday] = useState('');
  const [formCategory, setFormCategory] = useState('Freunde');
  const [formTagsStr, setFormTagsStr] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCoffee, setFormCoffee] = useState('');
  const [formLikes, setFormLikes] = useState('');
  const [formFollowUpDate, setFormFollowUpDate] = useState('');
  const [formFollowUpNote, setFormFollowUpNote] = useState('');

  // Extract all unique tags
  const allTags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => c.tags?.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [contacts]);

  // Open editor for new contact
  const handleOpenNew = () => {
    setEditingContact(null);
    setFormName('');
    setFormCompany('');
    setFormRole('');
    setFormEmail('');
    setFormPhone('');
    setFormAddress('');
    setFormBirthday('');
    setFormCategory('Freunde');
    setFormTagsStr('');
    setFormNotes('');
    setFormCoffee('');
    setFormLikes('');
    setFormFollowUpDate('');
    setFormFollowUpNote('');
    setIsEditorOpen(true);
  };

  useEffect(() => {
    if (newContactTrigger && newContactTrigger > 0) {
      handleOpenNew();
    }
  }, [newContactTrigger]);

  useEffect(() => {
    if (initialSelectedContactId) {
      const found = contacts.find((c) => c.id === initialSelectedContactId);
      if (found) {
        setSelectedContact(found);
      }
    }
  }, [initialSelectedContactId, contacts]);

  // Open editor for editing
  const handleOpenEdit = (c: Contact) => {
    setEditingContact(c);
    setFormName(c.name);
    setFormCompany(c.company || '');
    setFormRole(c.role || '');
    setFormEmail(c.email || '');
    setFormPhone(c.phone || '');
    setFormAddress(c.address || '');
    setFormBirthday(c.birthday || '');
    setFormCategory(c.category || 'Freunde');
    setFormTagsStr(c.tags ? c.tags.join(', ') : '');
    setFormNotes(c.notes || '');
    setFormCoffee(c.coffeePreference || '');
    setFormLikes(c.likes || '');
    setFormFollowUpDate(c.followUpDate || '');
    setFormFollowUpNote(c.followUpNote || '');
    setIsEditorOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const tags = formTagsStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (editingContact) {
      const updated: Contact = {
        ...editingContact,
        name: formName.trim(),
        company: formCompany.trim() || undefined,
        role: formRole.trim() || undefined,
        email: formEmail.trim() || undefined,
        phone: formPhone.trim() || undefined,
        address: formAddress.trim() || undefined,
        birthday: formBirthday.trim() || undefined,
        category: formCategory,
        tags,
        notes: formNotes.trim() || undefined,
        coffeePreference: formCoffee.trim() || undefined,
        likes: formLikes.trim() || undefined,
        followUpDate: formFollowUpDate || null,
        followUpNote: formFollowUpNote.trim() || undefined,
        updatedAt: Date.now(),
      };
      await onUpdateContact(updated);
      setSelectedContact(updated);
      if (window.mnui?.toast) window.mnui.toast('Kontakt aktualisiert');
    } else {
      const id = await onAddContact({
        name: formName.trim(),
        company: formCompany.trim() || undefined,
        role: formRole.trim() || undefined,
        email: formEmail.trim() || undefined,
        phone: formPhone.trim() || undefined,
        address: formAddress.trim() || undefined,
        birthday: formBirthday.trim() || undefined,
        category: formCategory,
        tags,
        notes: formNotes.trim() || undefined,
        coffeePreference: formCoffee.trim() || undefined,
        likes: formLikes.trim() || undefined,
        followUpDate: formFollowUpDate || null,
        followUpNote: formFollowUpNote.trim() || undefined,
      });
      const newlyAdded =
        contacts.find((c) => c.id === id) ||
        ({
          id,
          name: formName.trim(),
          company: formCompany.trim() || undefined,
          role: formRole.trim() || undefined,
          tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as Contact);
      setSelectedContact(newlyAdded);
      if (window.mnui?.toast) window.mnui.toast('Kontakt angelegt');
    }

    setIsEditorOpen(false);
  };

  // Upload photo / file to contact via mn.files
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedContact || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (file.size > 20 * 1024 * 1024) {
      alert('Dateien dürfen maximal 20 MB groß sein.');
      return;
    }

    try {
      setIsUploading(true);
      const mn = await mininode();
      const path = `kontakte/${selectedContact.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      await mn.files.upload(path, file);
      const url = await mn.files.url(path);

      const existingPhotos = selectedContact.photos || [];
      const updated: Contact = {
        ...selectedContact,
        avatarUrl: selectedContact.avatarUrl || url,
        photos: [...existingPhotos, url],
        updatedAt: Date.now(),
      };
      await onUpdateContact(updated);
      setSelectedContact(updated);
      if (window.mnui?.toast) window.mnui.toast('Datei hochgeladen');
    } catch (err) {
      console.error('File upload error:', err);
      alert('Upload fehlgeschlagen.');
    } finally {
      setIsUploading(false);
    }
  };

  // Add interaction
  const handleSaveInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !newInteractionSummary.trim()) return;

    await onAddInteraction({
      contactId: selectedContact.id,
      channel: newInteractionChannel,
      summary: newInteractionSummary.trim(),
      date: newInteractionDate || new Date().toISOString().slice(0, 10),
    });

    setNewInteractionSummary('');
    if (window.mnui?.toast) window.mnui.toast('Gespräch protokolliert');
  };

  // Filtered & sorted contacts
  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return contacts
      .filter((c) => {
        // Search
        const matchesSearch =
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q)) ||
          (c.role && c.role.toLowerCase().includes(q)) ||
          (c.notes && c.notes.toLowerCase().includes(q)) ||
          (c.tags && c.tags.some((t) => t.toLowerCase().includes(q)));

        // Filter
        let matchesFilter = true;
        if (activeFilter === 'Nachfassen fällig') {
          matchesFilter = !!c.followUpDate;
        } else if (activeFilter !== 'Alle') {
          matchesFilter = (c.tags && c.tags.includes(activeFilter)) || c.category === activeFilter;
        }

        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name, 'de');
        }
        if (sortBy === 'followUp') {
          if (!a.followUpDate && !b.followUpDate) return a.name.localeCompare(b.name, 'de');
          if (!a.followUpDate) return 1;
          if (!b.followUpDate) return -1;
          return a.followUpDate.localeCompare(b.followUpDate);
        }
        if (sortBy === 'recent') {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        }
        return 0;
      });
  }, [contacts, search, activeFilter, sortBy]);

  // Selected contact's interactions and notes
  const contactInteractions = useMemo(() => {
    if (!selectedContact) return [];
    return interactions
      .filter((i) => i.contactId === selectedContact.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedContact, interactions]);

  const contactMeetups = useMemo(() => {
    if (!selectedContact) return [];
    return meetups
      .filter(
        (m) =>
          m.contactId === selectedContact.id ||
          (m.contactIds && m.contactIds.includes(selectedContact.id)),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedContact, meetups]);

  const contactNotes = useMemo(() => {
    if (!selectedContact) return [];
    return notes.filter((n) => n.contactId === selectedContact.id);
  }, [selectedContact, notes]);

  // Network representation adaptation for RelationshipMap
  const peopleAdapter = useMemo(() => {
    return contacts.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category || (c.tags && c.tags[0]) || 'Kontakte',
      avatarUrl: c.avatarUrl,
      initials: c.name.slice(0, 2).toUpperCase(),
      lastSpoke: 'Kürzlich',
      lastSpokeDate: new Date(c.updatedAt).toISOString(),
      connections: c.connections || [],
    }));
  }, [contacts]);

  return (
    <div className="mn-kontakte-view">
      {/* Top Controls: Search, View switch, and Filters */}
      <div style={{ display: 'grid', gap: 'var(--mn-s3)', marginBottom: 'var(--mn-s5)' }}>
        <div
          style={{ display: 'flex', gap: 'var(--mn-s3)', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div className="mn-search" style={{ flex: '1 1 240px' }}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Name, Firma, Tag oder Notiz suchen..."
              aria-label="Kontakte durchsuchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Segmented View Switcher: Liste vs Netzwerk */}
          <div className="mn-seg" role="group" aria-label="Ansicht" style={{ minWidth: '180px' }}>
            <button
              type="button"
              aria-pressed={viewMode === 'liste'}
              onClick={() => setViewMode('liste')}
            >
              Liste
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'netzwerk'}
              onClick={() => setViewMode('netzwerk')}
            >
              Netzwerk
            </button>
          </div>

          {/* Sort selection */}
          <select
            style={{ width: 'auto', minHeight: 'var(--mn-tap)' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sortierung"
          >
            <option value="name">Name (A–Z)</option>
            <option value="followUp">Nachfassen zuerst</option>
            <option value="recent">Zuletzt aktualisiert</option>
          </select>
        </div>

        {/* Filter Chips */}
        <div className="mn-chips" role="group" aria-label="Filter">
          <button
            className="mn-filter"
            type="button"
            aria-pressed={activeFilter === 'Alle'}
            onClick={() => setActiveFilter('Alle')}
          >
            Alle ({contacts.length})
          </button>
          <button
            className="mn-filter"
            type="button"
            aria-pressed={activeFilter === 'Nachfassen fällig'}
            onClick={() => setActiveFilter('Nachfassen fällig')}
          >
            🔔 Nachfassen fällig ({contacts.filter((c) => !!c.followUpDate).length})
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className="mn-filter"
              type="button"
              aria-pressed={activeFilter === t}
              onClick={() => setActiveFilter(t)}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area: Liste vs Netzwerk */}
      {viewMode === 'netzwerk' ? (
        <div className="mn-card" style={{ padding: 'var(--mn-s2)', minHeight: '520px' }}>
          <RelationshipMap
            people={peopleAdapter as any}
            onAddConnection={(id1, id2, type, desc) => {
              const c1 = contacts.find((c) => c.id === id1);
              if (!c1) return;
              const conns = c1.connections || [];
              const updatedConns = [...conns, { targetId: id2, type, description: desc }];
              onUpdateContact({ ...c1, connections: updatedConns });
              if (window.mnui?.toast) window.mnui.toast('Verbindung hergestellt');
            }}
            onRemoveConnection={(id1, id2) => {
              const c1 = contacts.find((c) => c.id === id1);
              if (!c1) return;
              const updatedConns = (c1.connections || []).filter((cn) => cn.targetId !== id2);
              onUpdateContact({ ...c1, connections: updatedConns });
            }}
            onSelectPerson={(p) => {
              const realC = contacts.find((c) => c.id === p.id);
              if (realC) setSelectedContact(realC);
            }}
          />
        </div>
      ) : (
        /* List Mode */
        <div>
          {filteredContacts.length === 0 ? (
            <div className="mn-empty">
              <h3>Keine Kontakte gefunden</h3>
              <p>
                {search
                  ? `Keine Ergebnisse für „${search}“.`
                  : 'Noch keine Kontakte in diesem Filter.'}
              </p>
              <button className="mn-btn mn-btn--primary" type="button" onClick={handleOpenNew}>
                Kontakt hinzufügen
              </button>
            </div>
          ) : (
            <div className="mn-list">
              {filteredContacts.map((c) => {
                const initials = c.name.slice(0, 2).toUpperCase();
                return (
                  <button
                    key={c.id}
                    className="mn-row"
                    type="button"
                    onClick={() => setSelectedContact(c)}
                  >
                    <span className="mn-thumb" aria-hidden="true">
                      {c.avatarUrl ? (
                        <img
                          src={c.avatarUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        initials
                      )}
                    </span>

                    <span>
                      <span className="mn-row-title">{c.name}</span>
                      <span className="mn-row-sub">
                        {c.role ? `${c.role} ` : ''}
                        {c.role && c.company ? 'bei ' : ''}
                        {c.company ? `${c.company}` : ''}
                        {!c.role && !c.company && c.tags ? c.tags.join(', ') : ''}
                      </span>
                    </span>

                    <span className="mn-row-side">
                      {c.followUpDate ? (
                        <span
                          className="mn-chip mn-chip--warn"
                          style={{ fontSize: 'var(--mn-fs-xs)' }}
                        >
                          Nachfassen: {c.followUpDate}
                        </span>
                      ) : (
                        c.birthday && (
                          <span
                            className="mn-chip mn-chip--plain"
                            style={{ fontSize: 'var(--mn-fs-xs)' }}
                          >
                            🎂 {c.birthday}
                          </span>
                        )
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DETAIL SHEET: Contact Dossier, Timeline & Notes */}
      {selectedContact && (
        <div className="mn-overlay" onClick={() => setSelectedContact(null)}>
          <div
            className="mn-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Sheet Bar */}
            <div className="mn-sheet-bar">
              <button
                className="mn-btn mn-btn--ghost"
                type="button"
                onClick={() => setSelectedContact(null)}
              >
                Schließen
              </button>
              <h2>{selectedContact.name}</h2>
              <button
                className="mn-btn mn-btn--ghost"
                type="button"
                onClick={() => {
                  handleOpenEdit(selectedContact);
                }}
              >
                Bearbeiten
              </button>
            </div>

            {/* Sheet Body */}
            <div className="mn-sheet-body">
              {/* Profile Card Header */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--mn-s4)',
                  alignItems: 'center',
                  marginBottom: 'var(--mn-s5)',
                }}
              >
                <div
                  className="mn-thumb"
                  style={{ width: 68, height: 68, fontSize: 'var(--mn-fs-2xl)' }}
                >
                  {selectedContact.avatarUrl ? (
                    <img
                      src={selectedContact.avatarUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    selectedContact.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--mn-fs-2xl)' }}>
                    {selectedContact.name}
                  </h3>
                  <p className="mn-muted" style={{ margin: '2px 0 0' }}>
                    {selectedContact.role ? `${selectedContact.role} ` : ''}
                    {selectedContact.role && selectedContact.company ? 'bei ' : ''}
                    {selectedContact.company}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: '4px',
                      flexWrap: 'wrap',
                      marginTop: 'var(--mn-s2)',
                    }}
                  >
                    {selectedContact.category && (
                      <span className="mn-chip">{selectedContact.category}</span>
                    )}
                    {selectedContact.tags?.map((t) => (
                      <span key={t} className="mn-chip mn-chip--plain">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Follow-up reminder box */}
              {selectedContact.followUpDate && (
                <div
                  className="mn-banner mn-banner--warn"
                  style={{
                    marginBottom: 'var(--mn-s5)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <b>Nachfassen am {selectedContact.followUpDate}</b>
                    <div style={{ fontSize: 'var(--mn-fs-sm)', marginTop: 2 }}>
                      {selectedContact.followUpNote || 'Geplantes Telefonat / Kontakt aufnehmen'}
                    </div>
                  </div>
                  <button
                    className="mn-btn mn-btn--primary"
                    style={{
                      minHeight: 36,
                      padding: '0 var(--mn-s3)',
                      fontSize: 'var(--mn-fs-xs)',
                    }}
                    type="button"
                    onClick={() => {
                      onCompleteFollowUp(selectedContact);
                      setSelectedContact({
                        ...selectedContact,
                        followUpDate: null,
                        followUpNote: undefined,
                      });
                    }}
                  >
                    Erledigt
                  </button>
                </div>
              )}

              {/* Contact Facts (Phone, Email, Birthday, Preferences) */}
              <dl className="mn-facts">
                {selectedContact.email && (
                  <div>
                    <dt>E-Mail</dt>
                    <dd>
                      <a href={`mailto:${selectedContact.email}`}>{selectedContact.email}</a>
                    </dd>
                  </div>
                )}
                {selectedContact.phone && (
                  <div>
                    <dt>Telefon</dt>
                    <dd>
                      <a href={`tel:${selectedContact.phone}`}>{selectedContact.phone}</a>
                    </dd>
                  </div>
                )}
                {selectedContact.address && (
                  <div>
                    <dt>Adresse</dt>
                    <dd>{selectedContact.address}</dd>
                  </div>
                )}
                {selectedContact.birthday && (
                  <div>
                    <dt>Geburtstag</dt>
                    <dd>🎂 {selectedContact.birthday}</dd>
                  </div>
                )}
                {selectedContact.coffeePreference && (
                  <div>
                    <dt>Kaffee / Tee</dt>
                    <dd>☕ {selectedContact.coffeePreference}</dd>
                  </div>
                )}
                {selectedContact.likes && (
                  <div>
                    <dt>Interessen</dt>
                    <dd>{selectedContact.likes}</dd>
                  </div>
                )}
                {selectedContact.notes && (
                  <div>
                    <dt>Notiz</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>{selectedContact.notes}</dd>
                  </div>
                )}
              </dl>

              {/* File Attachment / Photos upload via mn.files */}
              <div style={{ marginTop: 'var(--mn-s6)' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--mn-s2)',
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: 'var(--mn-fs-md)' }}>Anhänge & Belege</h4>
                  <label
                    className="mn-btn"
                    style={{
                      minHeight: 36,
                      padding: '0 var(--mn-s3)',
                      fontSize: 'var(--mn-fs-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    {isUploading ? 'Lädt...' : '+ Datei hochladen'}
                    <input
                      type="file"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                      accept="image/*,application/pdf"
                    />
                  </label>
                </div>

                {selectedContact.photos && selectedContact.photos.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                      gap: 'var(--mn-s2)',
                    }}
                  >
                    {selectedContact.photos.map((p, idx) => (
                      <a
                        key={idx}
                        href={p}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'block',
                          borderRadius: 'var(--mn-r-md)',
                          overflow: 'hidden',
                          height: 80,
                          background: 'var(--mn-surface-2)',
                        }}
                      >
                        <img
                          src={p}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mn-note">Noch keine Dateien oder Visitenkarten angehängt.</p>
                )}
              </div>

              {/* Interactions Timeline */}
              <div style={{ marginTop: 'var(--mn-s6)' }}>
                <h4 style={{ margin: '0 0 var(--mn-s3)', fontSize: 'var(--mn-fs-md)' }}>
                  Verlauf & Gespräche
                </h4>

                {/* Quick Interaction Adder */}
                <form
                  onSubmit={handleSaveInteraction}
                  className="mn-group"
                  style={{ marginBottom: 'var(--mn-s4)' }}
                >
                  <div className="mn-grid-2">
                    <select
                      value={newInteractionChannel}
                      onChange={(e) => setNewInteractionChannel(e.target.value as any)}
                    >
                      <option value="meeting">🤝 Treffen / Gespräch</option>
                      <option value="call">📞 Telefonat</option>
                      <option value="email">✉️ E-Mail</option>
                      <option value="message">💬 Nachricht</option>
                    </select>
                    <input
                      type="date"
                      value={newInteractionDate}
                      onChange={(e) => setNewInteractionDate(e.target.value)}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Wichtigste Punkte oder Vereinbarungen eintragen..."
                    value={newInteractionSummary}
                    onChange={(e) => setNewInteractionSummary(e.target.value)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="mn-btn mn-btn--primary"
                      style={{
                        minHeight: 36,
                        padding: '0 var(--mn-s4)',
                        fontSize: 'var(--mn-fs-xs)',
                      }}
                      type="submit"
                    >
                      Eintrag speichern
                    </button>
                  </div>
                </form>

                {contactInteractions.length === 0 ? (
                  <p className="mn-note">Noch keine Gespräche protokolliert.</p>
                ) : (
                  <div className="mn-list">
                    {contactInteractions.map((int) => (
                      <div key={int.id} className="mn-row mn-row--text">
                        <span>
                          <span className="mn-row-title" style={{ fontSize: 'var(--mn-fs-md)' }}>
                            {int.channel === 'call'
                              ? '📞 Telefonat'
                              : int.channel === 'email'
                                ? '✉️ E-Mail'
                                : int.channel === 'meeting'
                                  ? '🤝 Treffen'
                                  : '💬 Nachricht'}
                          </span>
                          <span className="mn-row-sub" style={{ whiteSpace: 'normal' }}>
                            {int.summary}
                          </span>
                        </span>
                        <span className="mn-row-side">
                          <b>{int.date}</b>
                          <button
                            className="mn-link"
                            style={{ color: 'var(--mn-bad)', fontSize: 'var(--mn-fs-xs)' }}
                            type="button"
                            onClick={() => onDeleteInteraction(int.id)}
                          >
                            Löschen
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Linked Notes */}
              {contactNotes.length > 0 && (
                <div style={{ marginTop: 'var(--mn-s6)' }}>
                  <h4 style={{ margin: '0 0 var(--mn-s3)', fontSize: 'var(--mn-fs-md)' }}>
                    Verknüpfte Notizen ({contactNotes.length})
                  </h4>
                  <div className="mn-list">
                    {contactNotes.map((n) => (
                      <button
                        key={n.id}
                        className="mn-row mn-row--text"
                        type="button"
                        onClick={() => onOpenNote(n)}
                      >
                        <span>
                          <span className="mn-row-title">{n.title}</span>
                          <span className="mn-row-sub">{n.content}</span>
                        </span>
                        <span className="mn-row-side">
                          {new Date(n.createdAt).toLocaleDateString('de-DE', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Delete contact button */}
              <div
                style={{
                  marginTop: 'var(--mn-s8)',
                  borderTop: '1px solid var(--mn-line)',
                  paddingTop: 'var(--mn-s4)',
                }}
              >
                {confirmDeleteId === selectedContact.id ? (
                  <div style={{ display: 'flex', gap: 'var(--mn-s2)', alignItems: 'center' }}>
                    <span
                      className="mn-bad"
                      style={{ fontSize: 'var(--mn-fs-sm)', fontWeight: 600 }}
                    >
                      Diesen Kontakt wirklich löschen?
                    </span>
                    <button
                      className="mn-btn mn-btn--danger"
                      type="button"
                      onClick={async () => {
                        await onDeleteContact(selectedContact.id);
                        setSelectedContact(null);
                        setConfirmDeleteId(null);
                        if (window.mnui?.toast) window.mnui.toast('Kontakt gelöscht');
                      }}
                    >
                      Ja, löschen
                    </button>
                    <button
                      className="mn-btn mn-btn--ghost"
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button
                    className="mn-btn mn-btn--danger"
                    type="button"
                    onClick={() => setConfirmDeleteId(selectedContact.id)}
                  >
                    Kontakt löschen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDITOR SHEET: Add or Edit Contact */}
      {isEditorOpen && (
        <div className="mn-overlay" onClick={() => setIsEditorOpen(false)}>
          <div
            className="mn-sheet mn-sheet--tall"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mn-sheet-bar">
              <button
                className="mn-btn mn-btn--ghost"
                type="button"
                onClick={() => setIsEditorOpen(false)}
              >
                Abbrechen
              </button>
              <h2>{editingContact ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h2>
              <span />
            </div>

            <form onSubmit={handleSaveContact} className="mn-sheet-body mn-form">
              <fieldset>
                <legend>Persönliche Daten</legend>
                <label className="mn-field">
                  Name *
                  <input
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="z. B. Julia Weber"
                  />
                </label>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Firma / Organisation
                    <input
                      value={formCompany}
                      onChange={(e) => setFormCompany(e.target.value)}
                      placeholder="z. B. Atelier Grün"
                    />
                  </label>
                  <label className="mn-field">
                    Rolle / Beruf
                    <input
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      placeholder="z. B. Landschaftsarchitektin"
                    />
                  </label>
                </div>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Kategorie
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                      <option value="Freunde">Freunde</option>
                      <option value="Kollegen">Kollegen</option>
                      <option value="Familie">Familie</option>
                      <option value="Partner">Partner</option>
                      <option value="Bekannte">Bekannte</option>
                    </select>
                  </label>
                  <label className="mn-field">
                    Geburtstag
                    <input
                      type="date"
                      value={formBirthday}
                      onChange={(e) => setFormBirthday(e.target.value)}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Erreichbarkeit</legend>
                <div className="mn-grid-2">
                  <label className="mn-field">
                    E-Mail
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="julia@example.com"
                    />
                  </label>
                  <label className="mn-field">
                    Telefon
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="+49 171 1234567"
                    />
                  </label>
                </div>

                <label className="mn-field">
                  Adresse
                  <input
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Straße, PLZ Ort"
                  />
                </label>
              </fieldset>

              <fieldset>
                <legend>Erinnerung & Nachfassen</legend>
                <div className="mn-grid-2">
                  <label className="mn-field">
                    Nachfassen am
                    <input
                      type="date"
                      value={formFollowUpDate}
                      onChange={(e) => setFormFollowUpDate(e.target.value)}
                    />
                  </label>
                  <label className="mn-field">
                    Grund / Notiz
                    <input
                      value={formFollowUpNote}
                      onChange={(e) => setFormFollowUpNote(e.target.value)}
                      placeholder="z. B. Entwurf besprechen"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Tags & Notizen</legend>
                <label className="mn-field">
                  Tags (kommagetrennt)
                  <input
                    value={formTagsStr}
                    onChange={(e) => setFormTagsStr(e.target.value)}
                    placeholder="Design, München, Wichtig"
                  />
                </label>
                <label className="mn-field">
                  Kaffee- oder Teepräferenz
                  <input
                    value={formCoffee}
                    onChange={(e) => setFormCoffee(e.target.value)}
                    placeholder="z. B. Cappuccino mit Hafermilch"
                  />
                </label>
                <label className="mn-field">
                  Interessen / Themen
                  <input
                    value={formLikes}
                    onChange={(e) => setFormLikes(e.target.value)}
                    placeholder="z. B. Botanik, Keramik, Architektur"
                  />
                </label>
                <label className="mn-field">
                  Biografie & Notizen
                  <textarea
                    rows={3}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Wie habt ihr euch kennengelernt? Wichtige Meilensteine..."
                  />
                </label>
              </fieldset>

              <div className="mn-sheet-foot">
                <button
                  className="mn-btn mn-btn--ghost"
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                >
                  Abbrechen
                </button>
                <div className="mn-grow" />
                <button className="mn-btn mn-btn--primary" type="submit">
                  {editingContact ? 'Speichern' : 'Kontakt anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
