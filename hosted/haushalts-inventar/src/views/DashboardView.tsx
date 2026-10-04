import type { CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import { ItemTile } from '../components/ItemViews';
import { t } from '../i18n';
import { categoryStats, maintenanceDue, maintenanceRule, warrantiesEnding } from '../lib/domain';
import { categoryLabel, formatDate, formatMoney, formatNumber, roomLabel } from '../lib/format';
import type { Item, Settings } from '../types';

interface Props {
  items: Item[];
  settings: Settings;
  onOpen: (item: Item) => void;
  onAdd: () => void;
  onAddReceipt: () => void;
  onExport: () => void;
  onShowWarranties: () => void;
  onShowInventory: () => void;
  onLogMaintenance: (item: Item) => void;
}

export function DashboardView({
  items,
  settings,
  onOpen,
  onAdd,
  onAddReceipt,
  onExport,
  onShowWarranties,
  onShowInventory,
  onLogMaintenance,
}: Props) {
  const today = new Date();
  const stats = categoryStats(items);
  const ending = warrantiesEnding(items, today, 90);
  const nearest = ending[0];
  const due = maintenanceDue(items, today).filter((entry) => entry.soon || entry.overdue);
  const over = settings.insuranceLimit !== null && stats.total > settings.insuranceLimit;

  if (items.length === 0) {
    return (
      <main className="mn-main">
        <div className="mn-empty">
          <div className="mn-empty-icon">
            <Icon name="box" size={28} />
          </div>
          <h3>{t('dashboard.emptyTitle')}</h3>
          <p>{t('dashboard.emptyText')}</p>
          <button className="mn-btn mn-btn--primary" type="button" onClick={onAdd}>
            {t('nav.addItem')}
          </button>
          <button className="mn-btn" type="button" onClick={onAddReceipt}>
            {t('dashboard.addReceipt')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mn-main">
      {nearest && nearest.days <= 60 && (
        <div className="mn-banner mn-banner--warn" role="note">
          <span>
            {t('dashboard.warrantyEnding', {
              n: ending.filter((entry) => entry.days <= 60).length,
              name: nearest.item.name,
              when: t('time.inDays', { n: nearest.days }),
            })}{' '}
            <button className="mn-link" type="button" onClick={onShowWarranties}>
              {t('dashboard.reviewWarranties')}
            </button>
          </span>
        </div>
      )}
      {over && settings.insuranceLimit !== null && (
        <div className="mn-banner mn-banner--bad" role="note">
          {t('dashboard.underinsured', {
            value: formatMoney(stats.total, 0),
            limit: formatMoney(settings.insuranceLimit, 0),
          })}
        </div>
      )}

      <div className="mn-kpis">
        <div className="mn-kpi">
          <b className="mn-num">{formatNumber(items.length)}</b>
          <span>{t('dashboard.items')}</span>
        </div>
        <div className="mn-kpi">
          <b className="mn-num">{formatMoney(stats.total, 0)}</b>
          <span>{t('dashboard.value')}</span>
        </div>
        <div className="mn-kpi">
          <b className="mn-num">{formatNumber(ending.length)}</b>
          <span>{t('dashboard.endingWarranties')}</span>
        </div>
        <div className="mn-kpi">
          <b className="mn-num">{formatNumber(due.length)}</b>
          <span>{t('dashboard.dueMaintenance')}</span>
        </div>
      </div>

      <div className="mn-sect">
        <h2>{t('dashboard.quick')}</h2>
      </div>
      <div className="hi-quick">
        <button className="mn-btn mn-btn--primary" type="button" onClick={onAdd}>
          <Icon name="plus" />
          {t('nav.addItem')}
        </button>
        <button className="mn-btn" type="button" onClick={onAddReceipt}>
          <Icon name="receipt" />
          {t('dashboard.addReceipt')}
        </button>
        <button className="mn-btn" type="button" onClick={onExport}>
          <Icon name="download" />
          {t('dashboard.exportExcel')}
        </button>
      </div>

      <div className="mn-sect">
        <h2>
          {t('dashboard.recent')}
          <small>{Math.min(items.length, 4)}</small>
        </h2>
        <button className="mn-link" type="button" onClick={onShowInventory}>
          {t('dashboard.showAll')}
        </button>
      </div>
      <div className="mn-tiles">
        {items.slice(0, 4).map((item) => (
          <ItemTile key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>

      <div className="mn-sect">
        <h2>
          {t('dashboard.maintenance')}
          <small>{due.length}</small>
        </h2>
      </div>
      {due.length === 0 ? (
        <p className="mn-note">{t('dashboard.maintenanceNone')}</p>
      ) : (
        <div className="mn-list">
          {due.slice(0, 5).map(({ item, date, days, overdue }) => (
            <div className="mn-row mn-row--text" key={item.id}>
              <button className="hi-name" type="button" onClick={() => onOpen(item)}>
                <span className="mn-row-title">{item.name}</span>
                <span className="mn-row-sub">
                  {t(`maintenance.${maintenanceRule(item.name, item.category).id}`)} ·{' '}
                  {roomLabel(item.location)}
                </span>
              </button>
              <span className="mn-row-side">
                <b>{formatDate(date)}</b>
                <span className={`mn-chip ${overdue ? 'mn-chip--bad' : 'mn-chip--warn'}`}>
                  {overdue ? t('maintenance.overdue') : t('maintenance.inDays', { n: days })}
                </span>
                <button className="mn-btn" type="button" onClick={() => onLogMaintenance(item)}>
                  {t('maintenance.markDone')}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mn-sect">
        <h2>{t('dashboard.distribution')}</h2>
      </div>
      <div className="mn-card">
        {stats.list.map((entry) => (
          <div className="mn-bar" key={entry.category}>
            <span className="mn-bar-top">
              <b>{categoryLabel(entry.category)}</b>
              <span>
                {t('dashboard.categoryLine', {
                  n: entry.count,
                  value: formatMoney(entry.value, 0),
                  share: Math.round(entry.share),
                })}
              </span>
            </span>
            <span className="mn-meter">
              <i style={{ '--mn-value': Math.round(entry.share) } as CSSProperties} />
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
