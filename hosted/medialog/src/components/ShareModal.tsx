import type React from 'react';
import { useState } from 'react';
import { initials } from '../services/mininode';
import type { Person } from '../services/sharing';
import type { MediaItem, MediaList } from '../types';
import { generateListShareText, generateMediaShareText } from '../utils/text';
import { Overlay } from './Overlay';
import { showToast } from './Toast';

interface ShareModalProps {
  item?: MediaItem | null;
  list?: MediaList | null;
  linkedItems?: MediaItem[];
  /** The other people who use Medialog. */
  people: Person[];
  onClose: () => void;
  onUpdateSharedWith: (sharedWith: string[]) => Promise<void>;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  item,
  list,
  linkedItems = [],
  people,
  onClose,
  onUpdateSharedWith,
}) => {
  const title = item ? item.title : list ? list.title : 'Eintrag';
  const initialShared = item?.sharedWith || list?.sharedWith || [];
  const [sharedUsers, setSharedUsers] = useState<string[]>(initialShared);
  const [busy, setBusy] = useState(false);
  const toggleUserShare = async (person: Person) => {
    const next = sharedUsers.includes(person.id)
      ? sharedUsers.filter((id) => id !== person.id)
      : [...sharedUsers, person.id];
    setBusy(true);
    try {
      await onUpdateSharedWith(next);
      setSharedUsers(next);
      showToast(
        next.includes(person.id)
          ? `Mit ${person.name} geteilt`
          : `Freigabe für ${person.name} entfernt`,
      );
    } catch {
      showToast('Teilen hat nicht geklappt. Prüfe deine Verbindung.');
    } finally {
      setBusy(false);
    }
  };

  const handleNativeShare = async () => {
    const text = item
      ? generateMediaShareText(item)
      : list
        ? generateListShareText(list, linkedItems)
        : '';

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
        });
        return;
      } catch (_err) {
        // user cancelled or fallback
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast('In die Zwischenablage kopiert');
    } catch {
      showToast('Kopieren ist hier nicht erlaubt. Markiere den Text und kopiere ihn selbst.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Overlay onClose={onClose} labelledBy="share-title">
      <div className="mn-sheet-bar">
        <button type="button" className="mn-btn mn-btn--ghost" onClick={onClose}>
          Schließen
        </button>
        <h2 id="share-title">Teilen: {title}</h2>
        <span />
      </div>

      <div className="mn-sheet-body grid gap-6">
        {/* Section 1: Direktes Teilen mit MiniNode-Nutzern */}
        <div className="mn-card">
          <h3 className="text-base font-bold mb-1">Direkt mit MiniNode-Nutzern teilen</h3>
          <p className="text-xs text-[var(--mn-muted)] mb-3">
            Die ausgewählten Personen sehen den aktuellen Stand unter Listen → „Mit dir geteilt“.
            Änderungen, die du später machst, werden mitgeteilt. Deine Notizen und Fotos bleiben
            privat.
          </p>

          {people.length === 0 && <p className="mn-note">Noch niemand sonst nutzt Medialog.</p>}
          <div className="mn-checks">
            {people.map((person) => {
              const isShared = sharedUsers.includes(person.id);
              return (
                <div key={person.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-full bg-[var(--mn-accent-soft)] text-[var(--mn-accent-text)] font-bold text-xs flex items-center justify-center"
                      aria-hidden="true"
                    >
                      {initials(person.name)}
                    </span>
                    <span className="font-semibold text-sm">{person.name}</span>
                  </div>

                  <button
                    type="button"
                    className={`mn-btn text-xs ${isShared ? 'mn-btn--primary' : 'mn-btn--ghost'}`}
                    aria-pressed={isShared}
                    aria-label={`Mit ${person.name} teilen`}
                    disabled={busy}
                    onClick={() => toggleUserShare(person)}
                  >
                    {isShared ? '✓ Geteilt' : 'Teilen'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: PDF / Drucken */}
        <div className="mn-card">
          <h3 className="text-base font-bold mb-1">Als schönes PDF drucken</h3>
          <p className="text-xs text-[var(--mn-muted)] mb-3">
            Erzeugt eine saubere, druckoptimierte Ansicht über den Browser (DIN A4, ohne
            Navigationsleisten).
          </p>
          <button type="button" className="mn-btn mn-btn--primary w-full" onClick={handlePrint}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Drucken oder als PDF sichern</span>
          </button>
        </div>

        {/* Section 3: Weitergeben nach außen */}
        <div className="mn-card">
          <h3 className="text-base font-bold mb-1">Nach außen weitergeben</h3>
          <p className="text-xs text-[var(--mn-muted)] mb-3">
            Teile die formatierten Einträge per Messenger, E-Mail oder kopiere den Text direkt.
          </p>
          <button type="button" className="mn-btn w-full" onClick={handleNativeShare}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>Per Messenger teilen / Text kopieren</span>
          </button>
        </div>
      </div>
    </Overlay>
  );
};
