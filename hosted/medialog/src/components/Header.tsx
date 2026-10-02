import type React from 'react';
import { t } from '../i18n';

interface HeaderProps {
  title: string;
  subtitle: string;
  tools?: React.ReactNode;
  onOpenAddModal: () => void;
  isOffline?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  tools,
  onOpenAddModal,
  isOffline = false,
}) => {
  return (
    <header className="mn-top">
      {isOffline && (
        <div className="mn-banner mn-banner--warn no-print" role="status">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4 shrink-0 mt-0.5"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span className="text-xs font-semibold">{t('header.offline')}</span>
        </div>
      )}

      <div className="mn-top-inner">
        <div className="mn-top-text">
          <a className="mn-home" href="https://mininode.app">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('nav.allApps')}
          </a>
          <h1>{title}</h1>
          <p className="mn-sub">{subtitle}</p>
        </div>

        {tools && <div className="mn-top-tools">{tools}</div>}

        <button
          className="mn-fab"
          type="button"
          aria-label={t('nav.addMedium')}
          onClick={onOpenAddModal}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
};
