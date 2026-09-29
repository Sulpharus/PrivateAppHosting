import type React from 'react';

interface StarRatingProps {
  value?: number; // 1 to 10
  onChange?: (val: number | undefined) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const StarRating: React.FC<StarRatingProps> = ({ value, onChange, readOnly = false }) => {
  const currentRating = value ?? 0;

  if (readOnly) {
    if (!value) {
      return <span className="mn-muted mn-fs-sm">Keine Bewertung</span>;
    }
    return (
      <div className="flex items-center gap-1.5">
        <span className="sr-only">Bewertung: {value} von 10 Sternen</span>
        <span className="font-bold text-[var(--mn-ink)] mn-num" aria-hidden="true">
          ★ {value}/10
        </span>
        <div className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                n <= value
                  ? 'bg-[var(--mn-accent)]'
                  : 'bg-[var(--mn-surface-2)] border border-[var(--mn-line)]'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--mn-muted)]">
          {currentRating > 0 ? (
            <span className="text-[var(--mn-ink)] font-bold">★ {currentRating} von 10 Sternen</span>
          ) : (
            'Noch nicht bewertet'
          )}
        </span>
        {currentRating > 0 && onChange && (
          <button type="button" className="mn-link text-xs" onClick={() => onChange(undefined)}>
            Bewertung löschen
          </button>
        )}
      </div>

      <fieldset className="mn-rating-strip" aria-label="Bewertung in 1 bis 10 Sternen">
        {Array.from({ length: 10 }).map((_, i) => {
          const starVal = i + 1;
          const isSelected = starVal === currentRating;
          const isFilled = starVal <= currentRating;

          return (
            <button
              key={starVal}
              type="button"
              className="mn-star-btn"
              aria-pressed={isSelected}
              aria-label={`${starVal} von 10 Sternen`}
              onClick={() => onChange?.(starVal === currentRating ? undefined : starVal)}
            >
              <svg
                viewBox="0 0 24 24"
                fill={isFilled ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>{starVal}</span>
            </button>
          );
        })}
      </fieldset>
    </div>
  );
};
