import { t } from '../i18n';
import { warrantyState } from '../lib/domain';
import { categoryLabel, formatMoney, roomLabel } from '../lib/format';
import { speakItem } from '../lib/speech';
import type { Item } from '../types';
import { Icon } from './Icon';
import { StoredImage } from './StoredImage';

/** The chip that names the warranty state, in words and colour. */
export function WarrantyChip({ item }: { item: Pick<Item, 'warrantyExpiry'> }) {
  const state = warrantyState(item, new Date());
  const tone =
    state === 'expired' || state === 'critical'
      ? 'mn-chip--bad'
      : state === 'soon'
        ? 'mn-chip--warn'
        : state === 'active'
          ? 'mn-chip--ok'
          : 'mn-chip--plain';
  return <span className={`mn-chip ${tone}`}>{t(`warranty.state.${state}`)}</span>;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : name.slice(0, 2);
  return letters.toLocaleUpperCase() || '?';
}

interface ItemProps {
  item: Item;
  onOpen: (item: Item) => void;
}

export function ItemTile({ item, onOpen }: ItemProps) {
  return (
    <div className="mn-tile-wrap">
      <button className="mn-tile" type="button" onClick={() => onOpen(item)}>
        <span className="mn-tile-media">
          {item.photoPath ? (
            <StoredImage path={item.photoPath} />
          ) : (
            <span className="mn-tile-initials" aria-hidden="true">
              {initialsOf(item.name)}
            </span>
          )}
          <span className="mn-tile-badge">
            {t(`warranty.state.${warrantyState(item, new Date())}`)}
          </span>
        </span>
        <span className="mn-tile-cap">
          <span className="mn-tile-title">{item.name}</span>
          <span className="mn-tile-sub">
            {roomLabel(item.location)} · {formatMoney(item.purchasePrice)}
          </span>
        </span>
      </button>
      <button
        className="mn-tile-action"
        type="button"
        aria-label={t('item.readAloudNamed', { name: item.name })}
        onClick={() => speakItem(item)}
      >
        <span>
          <Icon name="volume" />
        </span>
      </button>
    </div>
  );
}

export function ItemRow({ item, onOpen }: ItemProps) {
  const detail = [roomLabel(item.location), categoryLabel(item.category), item.owner]
    .filter(Boolean)
    .join(' · ');
  return (
    <button className="mn-row" type="button" onClick={() => onOpen(item)}>
      <span className="mn-thumb">
        {item.photoPath ? <StoredImage path={item.photoPath} /> : initialsOf(item.name)}
      </span>
      <span>
        <span className="mn-row-title">{item.name}</span>
        <span className="mn-row-sub">{detail}</span>
      </span>
      <span className="mn-row-side">
        <b className="mn-num">{formatMoney(item.purchasePrice)}</b>
        <WarrantyChip item={item} />
      </span>
    </button>
  );
}
