import type React from 'react';
import type { MediaItem } from '../types';
import { getKindLabel, getProgressSummary } from '../utils/text';

interface MediaTileProps {
  item: MediaItem;
  onClick: () => void;
  onQuickAction?: () => void;
  quickActionLabel?: string;
  isQuickActionActive?: boolean;
}

export const MediaTile: React.FC<MediaTileProps> = ({
  item,
  onClick,
  onQuickAction,
  quickActionLabel = 'Merken',
  isQuickActionActive = false,
}) => {
  const initials = item.title.slice(0, 2).toUpperCase();
  const progressText = getProgressSummary(item);

  return (
    <div className="mn-tile-wrap" itemScope itemType="https://schema.org/CreativeWork">
      <button
        type="button"
        className="mn-tile"
        onClick={onClick}
        aria-label={`${item.title} von ${item.creator} öffnen`}
      >
        <span className="mn-tile-media">
          {item.cover ? (
            <img
              src={item.cover}
              alt={item.title}
              itemProp="image"
              loading="lazy"
              onError={(e) => {
                // If image fails to load, hide image and let initials show
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="mn-tile-initials" aria-hidden="true">
              {initials}
            </span>
          )}

          {/* Top Left Badge: Kind, Series or Rating */}
          <span className="mn-tile-badge">
            {item.isBookSeries
              ? `📚 Reihe (${item.volumes?.length || 1} Bde.)`
              : item.rating
                ? `★ ${item.rating}/10`
                : item.console
                  ? item.console
                  : getKindLabel(item.kind, item.bookSubtype)}
          </span>

          {/* Bottom Left Status if active or done */}
          {item.status === 'active' && (
            <span className="mn-tile-status">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Aktiv</span>
            </span>
          )}
          {item.status === 'done' && (
            <span className="mn-tile-status" style={{ background: 'var(--mn-ok)', color: '#fff' }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Beendet</span>
            </span>
          )}
        </span>

        <span className="mn-tile-cap">
          <span className="mn-tile-title" itemProp="name">
            {item.title}
          </span>
          {item.originalTitle && item.englishTitle && item.title !== item.originalTitle && (
            <span className="block text-[10px] text-[var(--mn-muted)] truncate -mt-0.5">
              Orig.: {item.originalTitle}
            </span>
          )}
          <span className="mn-tile-sub" itemProp="author">
            {item.creator}
            {item.year ? ` · ${item.year}` : ''}
            {item.console ? ` · 🎮 ${item.console}` : ''}
          </span>
          {progressText && (
            <span className="block mt-1 text-xs text-[var(--mn-accent-text)] font-semibold truncate">
              {progressText}
            </span>
          )}
        </span>
      </button>

      {onQuickAction && (
        <button
          type="button"
          className="mn-tile-action"
          aria-pressed={isQuickActionActive}
          aria-label={quickActionLabel}
          onClick={(e) => {
            e.stopPropagation();
            onQuickAction();
          }}
        >
          <span>
            <svg
              viewBox="0 0 24 24"
              fill={isQuickActionActive ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
};
