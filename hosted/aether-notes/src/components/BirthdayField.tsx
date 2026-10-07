import { useEffect, useState } from 'react';
import { parseBirthday } from '../birthdays';
import { useTranslation } from '../contexts/TranslationContext';

interface Props {
  /** `YYYY-MM-DD`, `MM-DD`, or older free text; '' for none. */
  value: string;
  /** Whether other apps (Kalender, Wunschliste) may see it. */
  shared: boolean;
  onChange: (value: string, shared: boolean) => void;
}

const input =
  'w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary/30';
const label = 'text-[10px] font-bold uppercase text-on-surface-variant tracking-wider';

const pad = (value: string) => value.padStart(2, '0');
const compose = (day: string, month: string, year: string) =>
  year ? `${year}-${pad(month)}-${pad(day)}` : `${pad(month)}-${pad(day)}`;

/**
 * A birthday as day, month and an optional year, with the choice to share it with the other apps.
 * It reports `YYYY-MM-DD` or `MM-DD`, or '' while the date is empty or impossible (30 February).
 * Older free text stays as it was until a date is typed.
 */
export default function BirthdayField({ value, shared, onChange }: Props) {
  const { t } = useTranslation();
  const parsed = parseBirthday(value);
  const full = /^(\d{4})-/.exec(value.trim())?.[1] ?? '';
  const [day, setDay] = useState(parsed ? String(parsed.day) : '');
  const [month, setMonth] = useState(parsed ? String(parsed.month) : '');
  const [year, setYear] = useState(parsed?.year ? String(parsed.year) : full);
  const legacy = value.trim() !== '' && !parsed;

  // Another contact was opened: show its date.
  useEffect(() => {
    const p = parseBirthday(value);
    setDay(p ? String(p.day) : '');
    setMonth(p ? String(p.month) : '');
    setYear(p?.year ? String(p.year) : (/^(\d{4})-/.exec(value.trim())?.[1] ?? ''));
  }, [value]);

  const typed = day !== '' || month !== '' || year !== '';
  const candidate = day && month ? compose(day, month, year) : '';
  const valid =
    candidate !== '' && parseBirthday(candidate) !== null && (year === '' || year.length === 4);
  const error = typed && !valid ? t('birthday.invalid') : null;

  const update = (d: string, m: string, y: string, s: boolean) => {
    const next = d && m ? compose(d, m, y) : '';
    const ok = next !== '' && parseBirthday(next) !== null && (y === '' || y.length === 4);
    // Nothing typed and an old free text: keep the old text.
    if (!d && !m && !y && legacy) onChange(value, s);
    else onChange(ok ? next : '', s);
  };

  const digits =
    (
      setter: (v: string) => void,
      max: number,
      d: string,
      m: string,
      y: string,
      kind: 'd' | 'm' | 'y',
    ) =>
    (raw: string) => {
      const v = raw.replace(/\D/g, '').slice(0, max);
      setter(v);
      update(kind === 'd' ? v : d, kind === 'm' ? v : m, kind === 'y' ? v : y, shared);
    };

  return (
    <div className="space-y-2 col-span-1 sm:col-span-2">
      <span className={label}>{t('birthday.label')}</span>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] text-on-surface-variant">{t('birthday.day')}</span>
          <input
            className={input}
            inputMode="numeric"
            value={day}
            onChange={(e) => digits(setDay, 2, day, month, year, 'd')(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-on-surface-variant">{t('birthday.month')}</span>
          <input
            className={input}
            inputMode="numeric"
            value={month}
            onChange={(e) => digits(setMonth, 2, day, month, year, 'm')(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-on-surface-variant">{t('birthday.year')}</span>
          <input
            className={input}
            inputMode="numeric"
            value={year}
            onChange={(e) => digits(setYear, 4, day, month, year, 'y')(e.target.value)}
          />
        </label>
      </div>
      {legacy && !typed && (
        <p className="text-[11px] text-on-surface-variant">
          {t('birthday.legacy', { text: value })}
        </p>
      )}
      {error && (
        <p className="text-[11px] text-error" role="alert">
          {error}
        </p>
      )}
      <label className="flex items-center gap-2 min-h-11 cursor-pointer">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={shared}
          onChange={(e) => {
            update(day, month, year, e.target.checked);
          }}
        />
        <span className="text-xs text-on-surface">{t('birthday.share')}</span>
      </label>
      <p className="text-[11px] text-on-surface-variant">{t('birthday.hint')}</p>
    </div>
  );
}
