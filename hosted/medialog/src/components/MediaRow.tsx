import type React from 'react';
import { t } from '../i18n';
import type { MediaItem } from '../types';
import { getKindLabel, getProgressSummary, getStatusLabel } from '../utils/text';

interface MediaRowProps {
  item: MediaItem;
  onClick: () => void;
  searchQuery?: string;
}

export const MediaRow: React.FC<MediaRowProps> = ({ item, onClick }) => {
  const initials = item.title.slice(0, 2).toUpperCase();
  const progressText = getProgressSummary(item);

  return (
    <button
      type="button"
      className="mn-row"
      onClick={onClick}
      aria-label={t('row.view', { title: item.title, creator: item.creator })}
    >
      <span className="mn-thumb" aria-hidden="true">
        {item.cover ? (
          <img
            src={item.cover}
            alt=""
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <span>{initials}</span>
        )}
      </span>

      <span className="overflow-hidden">
        <span className="mn-row-title">
          {item.title}
          {item.isBookSeries && (
            <span className="ml-2 mn-chip mn-chip--plain text-[10px] py-0 px-1 font-semibold">
              {t('item.series', { n: item.volumes?.length || 1 })}
            </span>
          )}
        </span>
        {item.originalTitle && item.englishTitle && item.title !== item.originalTitle && (
          <span className="block text-[10px] text-[var(--mn-muted)] truncate">
            {t('item.original', { title: item.originalTitle })}
          </span>
        )}
        <span className="mn-row-sub">
          {item.creator}
          {item.year ? ` · ${item.year}` : ''}
          {item.console
            ? ` · 🎮 ${item.console}`
            : ` · ${getKindLabel(item.kind, item.bookSubtype)}`}
        </span>
        {progressText && (
          <span className="block text-xs text-[var(--mn-accent-text)] font-semibold truncate mt-0.5">
            {progressText}
          </span>
        )}
      </span>

      <span className="mn-row-side">
        <b>{item.rating ? `★ ${item.rating}/10` : getStatusLabel(item.status, item.kind)}</b>
        <span>
          {item.status === 'done' && item.finished
            ? item.finished.slice(0, 10)
            : item.genres[0] || getKindLabel(item.kind)}
        </span>
      </span>
    </button>
  );
};
