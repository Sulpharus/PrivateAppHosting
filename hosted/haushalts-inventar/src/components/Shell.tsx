import type { ReactNode } from 'react';
import { t } from '../i18n';
import { Icon, type IconName } from './Icon';

export type Tab = 'start' | 'inventory' | 'household';

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'start', icon: 'home', label: 'nav.start' },
  { id: 'inventory', icon: 'box', label: 'nav.inventory' },
  { id: 'household', icon: 'settings', label: 'nav.household' },
];

interface NavProps {
  tab: Tab;
  onSelect: (tab: Tab) => void;
  onAdd: () => void;
}

export function Navigation({ tab, onSelect, onAdd }: NavProps) {
  return (
    <nav className="mn-nav" aria-label={t('nav.sections')}>
      <div className="mn-brand">
        <a className="mn-home" href="https://mininode.app">
          <Icon name="back" />
          {t('nav.allApps')}
        </a>
        <span className="mn-brand-name">
          <span className="mn-brand-mark">
            <Icon name="box" />
          </span>
          <span>{t('app.title')}</span>
        </span>
        <button className="mn-btn mn-btn--primary" type="button" onClick={onAdd}>
          <Icon name="plus" />
          <span>{t('nav.addItem')}</span>
        </button>
      </div>
      <div className="mn-tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className="mn-tab"
            type="button"
            aria-current={tab === entry.id ? 'page' : undefined}
            onClick={() => onSelect(entry.id)}
          >
            <Icon name={entry.icon} />
            <span>{t(entry.label)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

interface HeaderProps {
  title: string;
  subtitle: string;
  tools?: ReactNode;
  offline: boolean;
  onAdd: () => void;
}

export function Header({ title, subtitle, tools, offline, onAdd }: HeaderProps) {
  return (
    <header className="mn-top">
      {offline && (
        <div className="mn-banner mn-banner--warn" role="status">
          {t('app.offline')}
        </div>
      )}
      <div className="mn-top-inner">
        <div className="mn-top-text">
          <a className="mn-home" href="https://mininode.app">
            <Icon name="back" />
            {t('nav.allApps')}
          </a>
          <h1>{title}</h1>
          <p className="mn-sub">{subtitle}</p>
        </div>
        {tools && <div className="mn-top-tools">{tools}</div>}
        <button className="mn-fab" type="button" aria-label={t('nav.addItem')} onClick={onAdd}>
          <Icon name="plus" />
        </button>
      </div>
    </header>
  );
}
