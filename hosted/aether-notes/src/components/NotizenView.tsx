/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Contact, Note } from '../types';

interface NotizenViewProps {
  notes: Note[];
  contacts: Contact[];
  onSaveNote: (noteData: {
    id?: string;
    title: string;
    content: string;
    tags: string[];
    type: 'text' | 'checklist';
    checklistItems?: { id: string; text: string; completed: boolean }[];
    contactId?: string;
  }) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onToggleChecklistItem: (noteId: string, itemId: string) => Promise<void>;
  newNoteTrigger?: number;
  initialSelectedNoteId?: string | null;
}

export default function NotizenView({
  notes,
  contacts,
  onSaveNote,
  onDeleteNote,
  onToggleChecklistItem,
  newNoteTrigger,
  initialSelectedNoteId,
}: NotizenViewProps) {
  // Search, filter, sort
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string>('Alle');
  const [sortBy, setSortBy] = useState<'recent' | 'title'>('recent');

  // Sheet states
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState<'text' | 'checklist'>('text');
  const [formTagsStr, setFormTagsStr] = useState('');
  const [formContactId, setFormContactId] = useState('');
  const [formChecklist, setFormChecklist] = useState<
    { id: string; text: string; completed: boolean }[]
  >([]);
  const [newChecklistText, setNewChecklistText] = useState('');

  // Extract all tags
  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [notes]);

  const handleOpenNew = () => {
    setEditingNote(null);
    setFormTitle('');
    setFormContent('');
    setFormType('text');
    setFormTagsStr('');
    setFormContactId('');
    setFormChecklist([]);
    setNewChecklistText('');
    setIsEditorOpen(true);
  };

  useEffect(() => {
    if (newNoteTrigger && newNoteTrigger > 0) {
      handleOpenNew();
    }
  }, [newNoteTrigger]);

  useEffect(() => {
    if (initialSelectedNoteId) {
      const found = notes.find((n) => n.id === initialSelectedNoteId);
      if (found) {
        setSelectedNote(found);
      }
    }
  }, [initialSelectedNoteId, notes]);

  const handleOpenEdit = (n: Note) => {
    setEditingNote(n);
    setFormTitle(n.title);
    setFormContent(n.content);
    setFormType(n.type);
    setFormTagsStr(n.tags ? n.tags.join(', ') : '');
    setFormContactId(n.contactId || '');
    setFormChecklist(n.checklistItems || []);
    setNewChecklistText('');
    setIsEditorOpen(true);
  };

  const handleAddChecklistItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newChecklistText.trim()) return;
    setFormChecklist([
      ...formChecklist,
      { id: `cli-${Date.now()}`, text: newChecklistText.trim(), completed: false },
    ]);
    setNewChecklistText('');
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const tags = formTagsStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    await onSaveNote({
      id: editingNote?.id,
      title: formTitle.trim(),
      content: formContent.trim(),
      tags,
      type: formType,
      checklistItems: formType === 'checklist' ? formChecklist : undefined,
      contactId: formContactId || undefined,
    });

    setIsEditorOpen(false);
    if (window.mnui?.toast) window.mnui.toast(editingNote ? 'Notiz gespeichert' : 'Notiz erstellt');
  };

  // Filter & sort
  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => {
        const matchesSearch =
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.tags && n.tags.some((t) => t.toLowerCase().includes(q)));
        const matchesTag = activeTag === 'Alle' || (n.tags && n.tags.includes(activeTag));
        return matchesSearch && matchesTag;
      })
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title, 'de');
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [notes, search, activeTag, sortBy]);

  return (
    <div className="mn-notizen-view">
      {/* Search, Filter & Controls */}
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
              placeholder="Notizen durchsuchen..."
              aria-label="Notizen durchsuchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            style={{ width: 'auto', minHeight: 'var(--mn-tap)' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sortierung"
          >
            <option value="recent">Neueste zuerst</option>
            <option value="title">Titel (A–Z)</option>
          </select>
        </div>

        {/* Tag Filters */}
        <div className="mn-chips" role="group" aria-label="Filter">
          <button
            className="mn-filter"
            type="button"
            aria-pressed={activeTag === 'Alle'}
            onClick={() => setActiveTag('Alle')}
          >
            Alle ({notes.length})
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className="mn-filter"
              type="button"
              aria-pressed={activeTag === t}
              onClick={() => setActiveTag(t)}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <div className="mn-empty">
          <h3>Keine Notizen gefunden</h3>
          <p>
            {search
              ? `Keine Ergebnisse für „${search}“.`
              : 'Erfasse deine ersten Gedanken oder erstelle eine Checkliste.'}
          </p>
          <button className="mn-btn mn-btn--primary" type="button" onClick={handleOpenNew}>
            Notiz anlegen
          </button>
        </div>
      ) : (
        <div className="mn-list">
          {filteredNotes.map((n) => {
            const linkedContact = contacts.find((c) => c.id === n.contactId);
            const isChecklist =
              n.type === 'checklist' && n.checklistItems && n.checklistItems.length > 0;
            const completedCount = isChecklist
              ? n.checklistItems!.filter((i) => i.completed).length
              : 0;
            const totalCount = isChecklist ? n.checklistItems!.length : 0;

            return (
              <div key={n.id} className="mn-row" style={{ alignItems: 'flex-start' }}>
                <span className="mn-thumb" aria-hidden="true" style={{ marginTop: 2 }}>
                  {isChecklist ? '☑️' : '📝'}
                </span>

                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => handleOpenEdit(n)}
                >
                  <span className="mn-row-title">{n.title}</span>
                  <span className="mn-row-sub" style={{ whiteSpace: 'normal', marginTop: 4 }}>
                    {linkedContact && (
                      <span
                        className="mn-chip mn-chip--plain"
                        style={{ marginRight: 6, fontSize: 'var(--mn-fs-xs)' }}
                      >
                        👤 {linkedContact.name}
                      </span>
                    )}
                    {n.content}
                  </span>

                  {/* Interactive Checklist Preview */}
                  {isChecklist && (
                    <div style={{ marginTop: 'var(--mn-s2)', display: 'grid', gap: '4px' }}>
                      <div className="mn-bar" style={{ padding: '0 0 4px', border: 0 }}>
                        <span className="mn-meter">
                          <i
                            style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
                          />
                        </span>
                      </div>
                      {n.checklistItems!.slice(0, 4).map((item) => (
                        <label
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--mn-s2)',
                            fontSize: 'var(--mn-fs-sm)',
                            cursor: 'pointer',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => onToggleChecklistItem(n.id, item.id)}
                          />
                          <span
                            style={{
                              textDecoration: item.completed ? 'line-through' : 'none',
                              color: item.completed ? 'var(--mn-muted)' : 'inherit',
                            }}
                          >
                            {item.text}
                          </span>
                        </label>
                      ))}
                      {totalCount > 4 && (
                        <small className="mn-muted">+ {totalCount - 4} weitere Punkte</small>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className="mn-row-side"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 'var(--mn-s1)',
                  }}
                >
                  {n.tags?.map((tg) => (
                    <span key={tg} className="mn-chip" style={{ fontSize: 'var(--mn-fs-xs)' }}>
                      #{tg}
                    </span>
                  ))}
                  <span style={{ fontSize: 'var(--mn-fs-xs)', color: 'var(--mn-muted)' }}>
                    {new Date(n.createdAt).toLocaleDateString('de-DE', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <button
                    className="mn-link"
                    style={{ color: 'var(--mn-bad)', fontSize: 'var(--mn-fs-xs)', marginTop: 4 }}
                    type="button"
                    onClick={() => {
                      if (confirm('Diese Notiz wirklich löschen?')) {
                        onDeleteNote(n.id);
                      }
                    }}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* EDITOR SHEET */}
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
              <h2>{editingNote ? 'Notiz bearbeiten' : 'Neue Notiz'}</h2>
              <span />
            </div>

            <form onSubmit={handleSubmitForm} className="mn-sheet-body mn-form">
              <fieldset>
                <legend>Art & Inhalt</legend>

                {/* Type switcher */}
                <div className="mn-seg" role="group" aria-label="Notizart">
                  <button
                    type="button"
                    aria-pressed={formType === 'text'}
                    onClick={() => setFormType('text')}
                  >
                    Fließtext
                  </button>
                  <button
                    type="button"
                    aria-pressed={formType === 'checklist'}
                    onClick={() => setFormType('checklist')}
                  >
                    Checkliste
                  </button>
                </div>

                <label className="mn-field">
                  Titel *
                  <input
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="z. B. Gedanken zu Holzfassaden oder Einkaufsliste"
                  />
                </label>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Mit Kontakt verknüpfen
                    <select
                      value={formContactId}
                      onChange={(e) => setFormContactId(e.target.value)}
                    >
                      <option value="">-- Keiner --</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mn-field">
                    Tags (kommagetrennt)
                    <input
                      value={formTagsStr}
                      onChange={(e) => setFormTagsStr(e.target.value)}
                      placeholder="Idee, Arbeit, Privat"
                    />
                  </label>
                </div>

                <label className="mn-field">
                  Beschreibung / Notiz
                  <textarea
                    rows={4}
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="Wichtige Punkte notieren..."
                  />
                </label>
              </fieldset>

              {/* Checklist builder if type is checklist */}
              {formType === 'checklist' && (
                <fieldset>
                  <legend>Checklisten-Einträge</legend>
                  {formChecklist.length > 0 && (
                    <div className="mn-checks" style={{ marginBottom: 'var(--mn-s3)' }}>
                      {formChecklist.map((item, idx) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 0',
                            borderBottom: '1px solid var(--mn-line)',
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              gap: 'var(--mn-s2)',
                              alignItems: 'center',
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => {
                                const updated = [...formChecklist];
                                updated[idx].completed = !updated[idx].completed;
                                setFormChecklist(updated);
                              }}
                            />
                            <span
                              style={{
                                textDecoration: item.completed ? 'line-through' : 'none',
                                color: item.completed ? 'var(--mn-muted)' : 'inherit',
                              }}
                            >
                              {item.text}
                            </span>
                          </label>
                          <button
                            className="mn-link"
                            style={{ color: 'var(--mn-bad)', fontSize: 'var(--mn-fs-xs)' }}
                            type="button"
                            onClick={() => {
                              setFormChecklist(formChecklist.filter((_, i) => i !== idx));
                            }}
                          >
                            Entfernen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 'var(--mn-s2)' }}>
                    <input
                      placeholder="Neuer Checklistenpunkt..."
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChecklistItem();
                        }
                      }}
                    />
                    <button
                      className="mn-btn"
                      type="button"
                      onClick={() => handleAddChecklistItem()}
                    >
                      Hinzufügen
                    </button>
                  </div>
                </fieldset>
              )}

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
                  {editingNote ? 'Speichern' : 'Notiz erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
