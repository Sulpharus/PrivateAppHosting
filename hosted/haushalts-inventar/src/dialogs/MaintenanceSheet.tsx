import { useState } from 'react';
import { Overlay } from '../components/Overlay';
import { t } from '../i18n';
import type { Item } from '../types';

interface Props {
  item: Item;
  suggestion: string;
  onClose: () => void;
  onSave: (item: Item, title: string) => Promise<boolean>;
}

/** Records a service that was done; the next date follows from the item's interval. */
export function MaintenanceSheet({ item, suggestion, onClose, onSave }: Props) {
  const [title, setTitle] = useState(suggestion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(true);
      return;
    }
    setSaving(true);
    const ok = await onSave(item, title.trim());
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Overlay onClose={onClose} labelledBy="maintenance-title">
      <div className="mn-sheet-bar">
        <button className="mn-btn mn-btn--ghost" type="button" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <h2 id="maintenance-title">{t('maintenance.sheetTitle')}</h2>
        <span />
      </div>
      <form className="mn-sheet-body mn-form" onSubmit={submit} noValidate>
        <p className="mn-note">{item.name}</p>
        <label className="mn-field">
          {t('maintenance.whatDone')}
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(false);
            }}
            aria-invalid={error}
            aria-describedby={error ? 'maintenance-error' : undefined}
          />
        </label>
        {error && (
          <p className="mn-error" id="maintenance-error" role="alert">
            {t('maintenance.titleRequired')}
          </p>
        )}
        <button className="mn-btn mn-btn--primary mn-btn--block" type="submit" disabled={saving}>
          {t('maintenance.save')}
        </button>
      </form>
    </Overlay>
  );
}
