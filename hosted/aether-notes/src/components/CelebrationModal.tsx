/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { useTranslation } from '../contexts/TranslationContext';

interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  streakDays: number;
}

export default function CelebrationModal({ isOpen, onClose, streakDays }: CelebrationModalProps) {
  const { language } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      // Optional: triggering a small soft sound or visual feedback
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-55 animate-fade-in select-none">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-bright max-w-sm w-full rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl border border-primary/20 animate-scale-up"
      >
        {/* Pulsing Ember Glow */}
        <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-6 relative animate-pulse">
          <span
            className="material-symbols-outlined text-3xl font-bold"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            local_fire_department
          </span>
          <div className="absolute inset-0 rounded-full border-2 border-secondary/35 animate-ping opacity-25"></div>
        </div>

        {/* Celebratory Message */}
        <h3 className="font-sans text-xl font-bold text-primary tracking-tight">
          {language === 'de' ? 'Ein perfekter Rhythmus' : 'A Perfect Rhythm'}
        </h3>
        <p className="font-serif text-sm text-on-surface-variant mt-2 leading-relaxed">
          {language === 'de'
            ? 'Die Rhythmen von heute sind wunderbar ausgeglichen. Jede Routine wurde mit stiller Präsenz erfüllt.'
            : 'The rhythms of today are beautifully balanced. Every routine has been met with quiet presence.'}
        </p>

        {/* Streak Counter display */}
        <div className="my-6 px-6 py-3 bg-primary/5 border border-primary/20 rounded-2xl w-full">
          <p className="text-[10px] font-sans font-bold uppercase tracking-widest text-primary">
            {language === 'de' ? 'Klarheits-Serie' : 'Clarity Streak'}
          </p>
          <p className="text-3xl font-sans font-black text-primary mt-1">
            {streakDays}{' '}
            {language === 'de'
              ? streakDays === 1
                ? 'Tag'
                : 'Tage'
              : streakDays === 1
                ? 'Day'
                : 'Days'}
          </p>
        </div>

        <p className="font-serif text-xs text-on-surface-variant/70 italic px-4 leading-normal mb-6">
          {language === 'de'
            ? '"Geduld ist das ruhige Akzeptieren, dass die Dinge in einer anderen Reihenfolge geschehen können als der, die man sich vorgestellt hat."'
            : '"Patience is the calm acceptance that things can happen in a different order than the one you have in mind."'}
        </p>

        {/* Action button */}
        <button
          onClick={onClose}
          className="w-full bg-primary hover:bg-primary/95 text-on-primary font-sans text-xs font-semibold py-3 px-6 rounded-xl transition-all shadow-sm cursor-pointer select-none hover:scale-[1.02] active:scale-95 duration-100"
        >
          {language === 'de'
            ? 'Achtsam durchatmen & fortfahren'
            : 'Take a Mindful Breath & Continue'}
        </button>
      </div>
    </div>
  );
}
