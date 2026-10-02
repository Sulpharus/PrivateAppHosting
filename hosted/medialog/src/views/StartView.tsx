import type React from 'react';
import { MediaTile } from '../components/MediaTile';
import { t } from '../i18n';
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
          <span>{t('start.kpiActive')}</span>
        </div>
        <div className="mn-kpi">
          <b>{doneItems.length}</b>
          <span>{t('start.kpiDone')}</span>
        </div>
        <div className="mn-kpi">
          <b>{wishlistItems.length}</b>
          <span>{t('start.kpiWishlist')}</span>
        </div>
        <div className="mn-kpi">
          <b>{items.length}</b>
          <span>{t('start.kpiTotal')}</span>
        </div>
      </div>

      {/* Section 1: Am Lesen, Schauen & Spielen */}
      <section>
        <div className="mn-sect">
          <h2>
            {t('start.activeTitle')}
            <small>{activeItems.length}</small>
          </h2>
          {activeItems.length > 0 && (
            <button
              type="button"
              className="mn-link"
              onClick={() => onNavigateToSammlung('active')}
            >
              {t('common.showAll')}
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
            <h3>{t('start.emptyTitle')}</h3>
            <p>{t('start.emptyText')}</p>
            <button type="button" className="mn-btn mn-btn--primary" onClick={onOpenAddModal}>
              {t('start.addMedium')}
            </button>
          </div>
        )}
      </section>

      {/* Section 2: Zuletzt beendet */}
      <section>
        <div className="mn-sect">
          <h2>
            {t('start.recentDone')}
            <small>{doneItems.length}</small>
          </h2>
          {doneItems.length > 0 && (
            <button type="button" className="mn-link" onClick={() => onNavigateToSammlung('done')}>
              {t('start.allDone')}
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
          <p className="mn-note">{t('start.noneDone')}</p>
        )}
      </section>

      {/* Section 3: Wunschliste */}
      {wishlistItems.length > 0 && (
        <section>
          <div className="mn-sect">
            <h2>
              {t('start.wishlistTitle')}
              <small>{wishlistItems.length}</small>
            </h2>
            <button
              type="button"
              className="mn-link"
              onClick={() => onNavigateToSammlung('wishlist')}
            >
              {t('start.openWishlist')}
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
