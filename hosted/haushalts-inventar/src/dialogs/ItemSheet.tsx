import type { CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import { WarrantyChip } from '../components/ItemViews';
import { Overlay } from '../components/Overlay';
import { useFileUrl } from '../components/StoredImage';
import { TwoTap } from '../components/TwoTap';
import { t } from '../i18n';
import { daysUntil, maintenanceRule, warrantyRemaining, warrantyState } from '../lib/domain';
import { categoryLabel, formatDate, formatMoney, roomLabel } from '../lib/format';
import { speakItem } from '../lib/speech';
import type { Household, Item } from '../types';

interface Props {
  item: Item;
  households: Household[];
  onClose: () => void;
  onEdit: (item: Item) => void;
  onLogMaintenance: (item: Item, suggestion?: string) => void;
  onDelete: (item: Item) => void;
}

const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;

export function ItemSheet({
  item,
  households,
  onClose,
  onEdit,
  onLogMaintenance,
  onDelete,
}: Props) {
  const photo = useFileUrl(item.photoPath);
  const receipt = useFileUrl(item.receiptPath);
  const today = new Date();
  const state = warrantyState(item, today);
  const days = daysUntil(item.warrantyExpiry, today);
  const household = households.find((entry) => entry.id === item.householdId);
  const rule = maintenanceRule(item.name, item.category);
  const facts: [string, string | undefined][] = [
    [t('item.price'), item.purchasePrice ? formatMoney(item.purchasePrice) : undefined],
    [t('item.purchaseDate'), formatDate(item.purchaseDate) || undefined],
    [t('item.store'), item.store],
    [t('item.payment'), item.paymentMethod],
    [t('item.serial'), item.serialNumber],
    [t('item.color'), item.color],
    [t('item.capacity'), item.capacity],
    [t('item.household'), household?.name],
    [t('item.notes'), item.notes],
  ];

  return (
    <Overlay onClose={onClose} labelledBy="item-title">
      {photo ? (
        <>
          <div className="mn-sheet-bar mn-sheet-bar--float">
            <button
              className="mn-icon-btn"
              type="button"
              aria-label={t('common.close')}
              onClick={onClose}
            >
              <Icon name="x" />
            </button>
            <button className="mn-btn" type="button" onClick={() => onEdit(item)}>
              <Icon name="edit" />
              {t('common.edit')}
            </button>
          </div>
          <img className="mn-sheet-hero" src={photo} alt="" />
        </>
      ) : (
        <div className="mn-sheet-bar">
          <button
            className="mn-icon-btn"
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
          <h2>{t('item.details')}</h2>
          <button className="mn-btn" type="button" onClick={() => onEdit(item)}>
            <Icon name="edit" />
            {t('common.edit')}
          </button>
        </div>
      )}

      <div className="mn-sheet-body">
        <h2 className="mn-sheet-title" id="item-title">
          {item.name}
        </h2>
        <div className="mn-chips">
          <WarrantyChip item={item} />
          <span className="mn-chip mn-chip--plain">{categoryLabel(item.category)}</span>
          <span className="mn-chip mn-chip--plain">{roomLabel(item.location)}</span>
          {item.owner && <span className="mn-chip mn-chip--plain">{item.owner}</span>}
        </div>

        <div className="mn-sect">
          <h2>{t('item.warranty')}</h2>
        </div>
        {days === null ? (
          <p className="mn-note">{t('item.noWarranty')}</p>
        ) : (
          <div className="mn-card">
            <p className="mn-big mn-num">
              {state === 'expired' ? t('item.expired') : t('item.daysLeft', { n: days })}
            </p>
            <span
              className="mn-meter"
              role="img"
              aria-label={t('item.remainingShare', { n: warrantyRemaining(item, today) })}
            >
              <i style={{ '--mn-value': warrantyRemaining(item, today) } as CSSProperties} />
            </span>
            <dl className="mn-facts">
              <div>
                <dt>{t('item.expiry')}</dt>
                <dd>{formatDate(item.warrantyExpiry)}</dd>
              </div>
              {item.warrantyProvider && (
                <div>
                  <dt>{t('item.warrantyProvider')}</dt>
                  <dd>{item.warrantyProvider}</dd>
                </div>
              )}
              {item.policyNumber && (
                <div>
                  <dt>{t('item.policyNumber')}</dt>
                  <dd>{item.policyNumber}</dd>
                </div>
              )}
              {item.warrantyWhereApplies && (
                <div>
                  <dt>{t('item.warrantyWhere')}</dt>
                  <dd>{item.warrantyWhereApplies}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <div className="mn-sect">
          <h2>{t('item.facts')}</h2>
        </div>
        <dl className="mn-facts">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>

        <div className="mn-sect">
          <h2>{t('item.receipt')}</h2>
        </div>
        {item.receiptPath ? (
          <div className="mn-card">
            {receipt && IMAGE.test(item.receiptPath) && (
              <img
                className="mn-sheet-hero"
                src={receipt}
                alt={t('item.receiptAlt', { name: item.name })}
              />
            )}
            {receipt && (
              <a className="mn-btn" href={receipt} target="_blank" rel="noopener noreferrer">
                <Icon name="file" />
                {t('item.openReceipt')}
              </a>
            )}
          </div>
        ) : (
          <p className="mn-note">{t('item.noReceipt')}</p>
        )}

        <div className="mn-sect">
          <h2>
            {t('item.maintenance')}
            <small>{item.maintenanceLog?.length ?? 0}</small>
          </h2>
          <button
            className="mn-link"
            type="button"
            onClick={() => onLogMaintenance(item, t(`maintenance.${rule.id}`))}
          >
            {t('item.logMaintenance')}
          </button>
        </div>
        {item.nextMaintenanceDate && (
          <p className="mn-note">
            {t('item.nextMaintenance', {
              date: formatDate(item.nextMaintenanceDate),
              task: t(`maintenance.${rule.id}`),
            })}
          </p>
        )}
        {item.maintenanceLog && item.maintenanceLog.length > 0 ? (
          <div className="mn-list">
            {[...item.maintenanceLog].reverse().map((entry) => (
              <div className="mn-row mn-row--text" key={entry.id}>
                <span>
                  <span className="mn-row-title">{entry.title}</span>
                </span>
                <span className="mn-row-side">{formatDate(entry.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mn-note">{t('item.noMaintenance')}</p>
        )}

        <div className="mn-chips">
          <button className="mn-btn" type="button" onClick={() => speakItem(item)}>
            <Icon name="volume" />
            {t('item.readAloud')}
          </button>
          <TwoTap
            label={t('common.delete')}
            confirmLabel={t('common.deleteConfirm')}
            onConfirm={() => onDelete(item)}
          />
        </div>
      </div>
    </Overlay>
  );
}
