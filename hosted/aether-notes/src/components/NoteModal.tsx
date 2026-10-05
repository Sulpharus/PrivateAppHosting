/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import type { Note, TagType } from '../types';

interface NoteModalProps {
  note: Note | null; // Null means creating a new note
  isOpen: boolean;
  onClose: () => void;
  onSave: (noteData: {
    id?: string;
    title: string;
    content: string;
    tags: TagType[];
    type: 'text' | 'checklist';
    checklistItems?: { id: string; text: string; completed: boolean }[];
  }) => void;
  onDelete?: (id: string) => void;
}

const AVAILABLE_TAGS: TagType[] = [
  'Creative',
  'Journal',
  'Work',
  'Planning',
  'Personal',
  'Idea',
  'Draft',
];

export default function NoteModal({ note, isOpen, onClose, onSave, onDelete }: NoteModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<TagType[]>([]);
  const [type, setType] = useState<'text' | 'checklist'>('text');

  // Checklist-specific states
  const [checklistItems, setChecklistItems] = useState<
    { id: string; text: string; completed: boolean }[]
  >([]);
  const [newCheckItemText, setNewCheckItemText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Hydrate states when modal opens or note changes
  useEffect(() => {
    setShowDeleteConfirm(false);
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setSelectedTags(note.tags);
      setType(note.type);
      setChecklistItems(note.checklistItems || []);
    } else {
      // Clear for new note
      setTitle('');
      setContent('');
      setSelectedTags(['Creative']); // Default tag
      setType('text');
      setChecklistItems([]);
    }
  }, [note, isOpen]);

  if (!isOpen) return null;

  // Toggle tag selection
  const handleTagToggle = (tag: TagType) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // Add checklist item
  const handleAddChecklistItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCheckItemText.trim()) return;

    const newItem = {
      id: `cli-${Date.now()}`,
      text: newCheckItemText.trim(),
      completed: false,
    };

    setChecklistItems([...checklistItems, newItem]);
    setNewCheckItemText('');
  };

  // Toggle single checklist item status
  const handleToggleItemStatus = (itemId: string) => {
    setChecklistItems(
      checklistItems.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  // Delete single checklist item
  const handleDeleteItem = (itemId: string) => {
    setChecklistItems(checklistItems.filter((item) => item.id !== itemId));
  };

  // Handle saving
  const handleSaveClick = () => {
    const finalContent =
      type === 'checklist'
        ? checklistItems.map((item) => `[${item.completed ? 'x' : ' '}] ${item.text}`).join('\n')
        : content;

    onSave({
      id: note?.id,
      title: title.trim() || t('note.untitledReflection'),
      content: finalContent,
      tags: selectedTags.length > 0 ? selectedTags : ['Journal'],
      type,
      checklistItems: type === 'checklist' ? checklistItems : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/30 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-bright max-w-2xl w-full rounded-2xl flex flex-col max-h-[90vh] shadow-xl border border-outline-variant/30 overflow-hidden"
      >
        {/* Modal Header */}
        <header className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/15 flex items-center justify-between">
          <h3 className="font-sans text-sm font-bold text-primary uppercase tracking-widest leading-none">
            {note ? t('noteModal.reviewing') : t('noteModal.drafting')}
          </h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container transition-all cursor-pointer select-none"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </header>

        {/* Modal Core Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Note Title Input with Underline styling */}
          <div className="border-b border-outline-variant/20 pb-2 focus-within:border-primary transition-colors">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('note.giveYourThoughtAName')}
              className="w-full bg-transparent border-none text-xl md:text-2xl font-sans font-bold text-on-surface focus:outline-none placeholder:text-on-surface-variant/30 select-text leading-tight"
            />
          </div>

          {/* Form settings: tags & type toggle */}
          <div className="flex flex-col sm:flex-row gap-5 justify-between">
            {/* Tag Badges Selectors */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider font-sans leading-none">
                {t('note.reflectiveTags')}
              </label>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {AVAILABLE_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => handleTagToggle(tag)}
                      className={`px-3 py-1 text-[10px] font-sans font-bold uppercase tracking-wider rounded-full transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-secondary/15 text-primary border-transparent'
                          : 'border-outline-variant/35 text-on-surface-variant hover:bg-surface-container-low'
                      }`}
                    >
                      {tag === 'Creative'
                        ? t('note.creative')
                        : tag === 'Journal'
                          ? t('note.journal')
                          : tag === 'Work'
                            ? t('note.work')
                            : tag === 'Planning'
                              ? t('note.planning')
                              : tag === 'Personal'
                                ? t('note.personal')
                                : tag === 'Idea'
                                  ? t('note.idea')
                                  : tag === 'Draft'
                                    ? t('note.draft')
                                    : tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note Type switcher ('text' vs 'checklist') */}
            <div className="space-y-1.5 shrink-0">
              <label className="block text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider font-sans leading-none">
                {t('note.thoughtMedium')}
              </label>
              <div className="inline-flex rounded-xl bg-surface-container-low p-1 border border-outline-variant/10">
                <button
                  type="button"
                  onClick={() => setType('text')}
                  className={`px-3 py-1 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer select-none ${
                    type === 'text'
                      ? 'bg-surface-bright text-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('note.freeJournal')}
                </button>
                <button
                  type="button"
                  onClick={() => setType('checklist')}
                  className={`px-3 py-1 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer select-none ${
                    type === 'checklist'
                      ? 'bg-surface-bright text-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('note.flowChecklist')}
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Editor Content Section */}
          <div className="space-y-2">
            {type === 'text' ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('note.letYourThoughtsUnfoldOnto')}
                rows={10}
                className="w-full bg-transparent border-none font-serif text-sm md:text-base leading-relaxed text-on-surface focus:outline-none placeholder:text-on-surface-variant/40 select-text resize-none"
              />
            ) : (
              <div className="space-y-4">
                {/* Checklist task list */}
                <ul className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {checklistItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/10 group select-none"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleItemStatus(item.id)}
                          className="mt-0.5 text-primary active:scale-95 transition-transform"
                        >
                          <span
                            className={`material-symbols-outlined text-lg ${item.completed ? 'text-primary' : 'text-outline-variant'}`}
                          >
                            {item.completed ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                        </button>
                        <span
                          className={`font-sans text-sm select-text truncate ${
                            item.completed
                              ? 'text-on-surface-variant/50 line-through'
                              : 'text-on-surface font-medium'
                          }`}
                        >
                          {item.text}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-on-surface-variant/60 hover:text-error p-1 rounded-full hover:bg-surface transition-all active:scale-90"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </li>
                  ))}

                  {checklistItems.length === 0 && (
                    <li className="p-8 text-center bg-surface-container-low/40 rounded-xl border border-dashed border-outline-variant/35 text-xs text-on-surface-variant">
                      {t('note.noMilestonesRecordedInThis')}
                    </li>
                  )}
                </ul>

                {/* Checklist item adder */}
                <form onSubmit={handleAddChecklistItem} className="flex gap-2.5">
                  <input
                    value={newCheckItemText}
                    onChange={(e) => setNewCheckItemText(e.target.value)}
                    placeholder={t('note.addItemMilestone')}
                    className="flex-1 bg-surface-container-low border border-outline-variant/20 px-4 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40"
                  />
                  <button
                    type="submit"
                    className="bg-primary/10 hover:bg-primary/15 text-primary font-sans text-xs font-semibold px-4 rounded-xl transition-all cursor-pointer"
                  >
                    {t('note.addBlock')}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions Footer */}
        <footer className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/15 flex items-center justify-between flex-wrap gap-3">
          {/* Delete Button shown if editing existing note */}
          {note && onDelete ? (
            showDeleteConfirm ? (
              <div className="flex items-center gap-1.5 animate-fade-in">
                <span className="text-[10px] font-sans font-bold text-error uppercase tracking-wider">
                  {t('note.areYouSure')}
                </span>
                <button
                  onClick={() => onDelete(note.id)}
                  className="bg-error hover:bg-error/95 text-on-error py-1.5 px-3 rounded-xl font-sans text-xs font-bold select-none cursor-pointer transition-all active:scale-95 duration-100"
                >
                  {t('note.yesFadeAway')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="bg-surface hover:bg-surface-container border border-outline-variant/35 py-1.5 px-3 rounded-xl font-sans text-xs font-semibold select-none cursor-pointer"
                >
                  {t('note.cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-error/85 hover:text-error bg-error/10 hover:bg-error/15 py-2 px-3.5 rounded-xl font-sans text-xs font-semibold select-none flex items-center gap-1 cursor-pointer transition-all active:scale-95 duration-100"
              >
                <span className="material-symbols-outlined text-sm">delete_forever</span>
                {t('note.fadeAwayThought')}
              </button>
            )
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-on-surface-variant hover:bg-surface border border-outline-variant/35 font-sans text-xs font-semibold py-2 px-4 rounded-xl transition-all cursor-pointer"
            >
              {t('note.discardChanges')}
            </button>
            <button
              onClick={handleSaveClick}
              className="bg-primary hover:bg-primary/95 text-on-primary font-sans text-xs font-semibold py-2 px-4.5 rounded-xl transition-all shadow-sm cursor-pointer select-none active:scale-95 duration-100"
            >
              {t('note.preserveReflection')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
