import { Icon } from '../components/Icon';
import { ItemRow, ItemTile } from '../components/ItemViews';
import { t } from '../i18n';
import { EMPTY_FILTERS, filterItems, filtersActive } from '../lib/domain';
import { categoryLabel, roomLabel } from '../lib/format';
import { CATEGORIES, type CategoryId, type Filters, type Item } from '../types';

interface Props {
  items: Item[];
  rooms: string[];
  owners: string[];
  filters: Filters;
  viewMode: 'grid' | 'list';
  onFilters: (filters: Filters) => void;
  onViewMode: (mode: 'grid' | 'list') => void;
  onOpen: (item: Item) => void;
  onAdd: () => void;
  onExport: () => void;
}

export function InventoryView({
  items,
  rooms,
  owners,
  filters,
  viewMode,
  onFilters,
  onViewMode,
  onOpen,
  onAdd,
  onExport,
}: Props) {
  const shown = filterItems(items, filters, new Date());
  const set = (changes: Partial<Filters>) => onFilters({ ...filters, ...changes });

  return (
    <main className="mn-main">
      <div className="mn-search">
        <Icon name="search" />
        <input
          type="search"
          value={filters.query}
          placeholder={t('inventory.searchPlaceholder')}
          aria-label={t('inventory.searchLabel')}
          onChange={(event) => set({ query: event.target.value })}
        />
      </div>

      <fieldset className="mn-chips" aria-label={t('inventory.roomFilter')}>
        <button
          className="mn-filter"
          type="button"
          aria-pressed={filters.room === 'all'}
          onClick={() => set({ room: 'all' })}
        >
          {t('inventory.allRooms')}
        </button>
        {rooms.map((room) => (
          <button
            key={room}
            className="mn-filter"
            type="button"
            aria-pressed={filters.room === room}
            onClick={() => set({ room })}
          >
            {roomLabel(room)}
          </button>
        ))}
      </fieldset>

      <fieldset className="mn-chips" aria-label={t('inventory.categoryFilter')}>
        <button
          className="mn-filter"
          type="button"
          aria-pressed={filters.category === 'all'}
          onClick={() => set({ category: 'all' })}
        >
          {t('inventory.allCategories')}
        </button>
        {CATEGORIES.map((category: CategoryId) => (
          <button
            key={category}
            className="mn-filter"
            type="button"
            aria-pressed={filters.category === category}
            onClick={() => set({ category })}
          >
            {categoryLabel(category)}
          </button>
        ))}
      </fieldset>

      <div className="mn-grid-2">
        <label className="mn-field">
          {t('inventory.warrantyFilter')}
          <select
            value={filters.warranty}
            onChange={(event) => set({ warranty: event.target.value as Filters['warranty'] })}
          >
            <option value="all">{t('inventory.warrantyAll')}</option>
            <option value="active">{t('inventory.warrantyActive')}</option>
            <option value="soon">{t('inventory.warrantySoon')}</option>
            <option value="expired">{t('inventory.warrantyExpired')}</option>
          </select>
        </label>
        {owners.length > 0 && (
          <label className="mn-field">
            {t('inventory.ownerFilter')}
            <select value={filters.owner} onChange={(event) => set({ owner: event.target.value })}>
              <option value="all">{t('inventory.allOwners')}</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mn-chips">
        <fieldset className="mn-seg mn-seg--icons" aria-label={t('inventory.viewMode')}>
          <button
            type="button"
            aria-pressed={viewMode === 'grid'}
            aria-label={t('inventory.viewGrid')}
            onClick={() => onViewMode('grid')}
          >
            <Icon name="grid" />
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'list'}
            aria-label={t('inventory.viewList')}
            onClick={() => onViewMode('list')}
          >
            <Icon name="list" />
          </button>
        </fieldset>
        {filtersActive(filters) && (
          <button
            className="mn-btn mn-btn--ghost"
            type="button"
            onClick={() => onFilters({ ...EMPTY_FILTERS, householdId: filters.householdId })}
          >
            {t('inventory.resetFilters')}
          </button>
        )}
        <button className="mn-btn" type="button" onClick={onExport}>
          <Icon name="download" />
          {t('inventory.exportExcel')}
        </button>
      </div>

      <p className="mn-note" role="status">
        {t('inventory.count', { n: shown.length })}
      </p>

      {shown.length === 0 ? (
        <div className="mn-empty">
          <div className="mn-empty-icon">
            <Icon name="box" size={28} />
          </div>
          {items.length === 0 ? (
            <>
              <h3>{t('inventory.emptyTitle')}</h3>
              <p>{t('inventory.emptyText')}</p>
              <button className="mn-btn mn-btn--primary" type="button" onClick={onAdd}>
                {t('nav.addItem')}
              </button>
            </>
          ) : (
            <>
              <h3>{t('inventory.noMatchTitle')}</h3>
              <p>{t('inventory.noMatchText')}</p>
              <button
                className="mn-btn"
                type="button"
                onClick={() => onFilters({ ...EMPTY_FILTERS, householdId: filters.householdId })}
              >
                {t('inventory.resetFilters')}
              </button>
            </>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="mn-tiles">
          {shown.map((item) => (
            <ItemTile key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="mn-list">
          {shown.map((item) => (
            <ItemRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
      )}
    </main>
  );
}
