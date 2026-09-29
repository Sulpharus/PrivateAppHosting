import type React from 'react';
import { MediaTile } from '../components/MediaTile';
import type { MediaItem } from '../types';

interface StartViewProps {
  items: MediaItem[];
  onSelectItem: (item: MediaItem) => void;
  onOpenAddModal: () => void;
  onNavigateToSammlung: (filterStatus?: string) => void;
}

export const StartView: React.FC<StartViewProps> = ({
  items,
  onSelectItem,
  onOpenAddModal,
  onNavigateToSammlung,
}) => {
  const activeItems = items.filter((i) => i.status === 'active');
  const doneItems = items.filter((i) => i.status === 'done');
  const wishlistItems = items.filter((i) => i.status === 'wishlist');

  return (
    <div className="grid gap-8">
      {/* Top KPIs overview */}
      <div className="mn-kpis">
        <div className="mn-kpi">
          <b>{activeItems.length}</b>
          <span>Aktuell im Gange</span>
        </div>
        <div className="mn-kpi">
          <b>{doneItems.length}</b>
          <span>Bereits beendet</span>
        </div>
        <div className="mn-kpi">
          <b>{wishlistItems.length}</b>
          <span>Auf der Wunschliste</span>
        </div>
        <div className="mn-kpi">
          <b>{items.length}</b>
          <span>Medien im Archiv</span>
        </div>
      </div>

      {/* Section 1: Am Lesen, Schauen & Spielen */}
      <section>
        <div className="mn-sect">
          <h2>
            Am Lesen & Schauen
            <small>{activeItems.length}</small>
          </h2>
          {activeItems.length > 0 && (
            <button
              type="button"
              className="mn-link"
              onClick={() => onNavigateToSammlung('active')}
            >
              Alle anzeigen
            </button>
          )}
        </div>

        {activeItems.length > 0 ? (
          <div className="mn-tiles">
            {activeItems.slice(0, 6).map((item) => (
              <MediaTile key={item.id} item={item} onClick={() => onSelectItem(item)} />
            ))}
          </div>
        ) : (
          <div className="mn-empty">
            <div className="mn-empty-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <h3>Gerade nichts im Gange</h3>
            <p>Erfasse das Buch, die Serie oder das Spiel, das du gerade liest oder schaust.</p>
            <button type="button" className="mn-btn mn-btn--primary" onClick={onOpenAddModal}>
              Medium erfassen
            </button>
          </div>
        )}
      </section>

      {/* Section 2: Zuletzt beendet */}
      <section>
        <div className="mn-sect">
          <h2>
            Zuletzt beendet
            <small>{doneItems.length}</small>
          </h2>
          {doneItems.length > 0 && (
            <button type="button" className="mn-link" onClick={() => onNavigateToSammlung('done')}>
              Alle beendeten
            </button>
          )}
        </div>

        {doneItems.length > 0 ? (
          <div className="mn-tiles">
            {doneItems.slice(0, 4).map((item) => (
              <MediaTile key={item.id} item={item} onClick={() => onSelectItem(item)} />
            ))}
          </div>
        ) : (
          <p className="mn-note">Noch keine beendeten Werke verzeichnet.</p>
        )}
      </section>

      {/* Section 3: Wunschliste */}
      {wishlistItems.length > 0 && (
        <section>
          <div className="mn-sect">
            <h2>
              Wunschliste & Gemerkt
              <small>{wishlistItems.length}</small>
            </h2>
            <button
              type="button"
              className="mn-link"
              onClick={() => onNavigateToSammlung('wishlist')}
            >
              Wunschliste öffnen
            </button>
          </div>

          <div className="mn-tiles">
            {wishlistItems.slice(0, 4).map((item) => (
              <MediaTile key={item.id} item={item} onClick={() => onSelectItem(item)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
