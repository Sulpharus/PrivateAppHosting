import { useEffect, useState } from 'react';
import { showToast } from '../components/Toast';
import { TwoTap } from '../components/TwoTap';
import { t } from '../i18n';
import { useApp } from '../lib/context';
import { categoryStats, toIso } from '../lib/domain';
import { formatDate, formatMoney, newId, roomLabel } from '../lib/format';
import type { Backup, Household, Item } from '../types';

interface Props {
  items: Item[];
  allItems: Item[];
  activeHouseholdId: string;
  onExport: () => void;
}

type Theme = 'system' | 'light' | 'dark';
interface Kit {
  mnui?: { theme?: { set(theme: Theme): void; get?(): Theme } };
}

function HouseholdCard({ activeHouseholdId }: { activeHouseholdId: string }) {
  const { data, mn, setHouseholds, setPrefs, moveItems } = useApp();
  const [name, setName] = useState('');
  const [member, setMember] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const households = data.households;
  // With one household it is always the active one; with several, "all" selects none of them.
  const activeId = activeHouseholdId || (households.length === 1 ? (households[0]?.id ?? '') : '');
  const active = households.find((entry) => entry.id === activeId) ?? households[0];

  useEffect(() => {
    mn?.people().then(setPeople, () => setPeople([]));
  }, [mn]);

  const update = (id: string, change: (entry: Household) => Household) =>
    setHouseholds(households.map((entry) => (entry.id === id ? change(entry) : entry)));

  async function addHousehold(event: React.FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    const created: Household = {
      id: newId('hh-'),
      name: clean,
      members: [],
      createdAt: Date.now(),
    };
    await setHouseholds([...households, created]);
    await setPrefs({ activeHouseholdId: created.id });
    setName('');
    showToast(t('household.created', { name: clean }));
  }

  async function addMember(who: string) {
    const clean = who.trim();
    if (!clean || !active) return;
    if (
      active.members.some((entry) => entry.name.toLocaleLowerCase() === clean.toLocaleLowerCase())
    ) {
      showToast(t('household.memberExists', { name: clean }));
      return;
    }
    await update(active.id, (entry) => ({
      ...entry,
      members: [...entry.members, { id: newId('m-'), name: clean }],
    }));
    setMember('');
    showToast(t('household.memberAdded', { name: clean }));
  }

  const suggestions = people.filter(
    (person) => !active?.members.some((entry) => entry.name === person.name),
  );

  return (
    <section className="mn-card" aria-labelledby="hh-title">
      <h2 id="hh-title">{t('household.title')}</h2>
      <p className="mn-note">{t('household.intro')}</p>
      <div className="mn-list">
        {households.map((entry) => (
          <div className="mn-row mn-row--text" key={entry.id}>
            <span>
              <span className="mn-row-title">{entry.name}</span>
              <span className="mn-row-sub">
                {t('household.memberCount', { n: entry.members.length })}
              </span>
            </span>
            <span className="mn-row-side">
              <button
                className="mn-btn"
                type="button"
                aria-pressed={entry.id === activeId}
                onClick={() => setPrefs({ activeHouseholdId: entry.id })}
              >
                {entry.id === activeId ? t('household.active') : t('household.activate')}
              </button>
              {households.length > 1 && (
                <TwoTap
                  label={t('common.delete')}
                  confirmLabel={t('common.deleteConfirm')}
                  onConfirm={async () => {
                    const rest = households.filter((other) => other.id !== entry.id);
                    // Its items move to the next household, so they do not disappear.
                    const target = rest[0];
                    if (target && !(await moveItems(entry.id, target.id))) return;
                    await setHouseholds(rest);
                    if (entry.id === activeId) await setPrefs({ activeHouseholdId: rest[0]?.id });
                    showToast(t('household.deleted'));
                  }}
                />
              )}
            </span>
          </div>
        ))}
      </div>
      <form className="mn-form" onSubmit={addHousehold}>
        <label className="mn-field">
          {t('household.newName')}
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button className="mn-btn" type="submit" disabled={!name.trim()}>
          {t('household.add')}
        </button>
      </form>

      {active && (
        <>
          <h3>{t('household.membersOf', { name: active.name })}</h3>
          {active.members.length === 0 ? (
            <p className="mn-note">{t('household.noMembers')}</p>
          ) : (
            <div className="mn-list">
              {active.members.map((entry) => (
                <div className="mn-row mn-row--text" key={entry.id}>
                  <span className="mn-row-title">{entry.name}</span>
                  <span className="mn-row-side">
                    <button
                      className="mn-btn mn-btn--ghost"
                      type="button"
                      aria-label={t('household.removeMember', { name: entry.name })}
                      onClick={() => {
                        update(active.id, (hh) => ({
                          ...hh,
                          members: hh.members.filter((other) => other.id !== entry.id),
                        }));
                        showToast(t('household.memberRemoved'));
                      }}
                    >
                      {t('common.remove')}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <form
            className="mn-form"
            onSubmit={(event) => {
              event.preventDefault();
              void addMember(member);
            }}
          >
            <label className="mn-field">
              {t('household.memberName')}
              <input value={member} onChange={(event) => setMember(event.target.value)} />
            </label>
            <button className="mn-btn" type="submit" disabled={!member.trim()}>
              {t('household.addMember')}
            </button>
          </form>
          {suggestions.length > 0 && (
            <>
              <p className="mn-note">{t('household.fromPeople')}</p>
              <div className="mn-chips">
                {suggestions.map((person) => (
                  <button
                    key={person.id}
                    className="mn-filter"
                    type="button"
                    aria-pressed="false"
                    onClick={() => addMember(person.name)}
                  >
                    {person.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function RoomsCard({ allItems }: { allItems: Item[] }) {
  const { data, setRooms } = useApp();
  const [name, setName] = useState('');

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    if (
      data.rooms.some((room) => roomLabel(room).toLocaleLowerCase() === clean.toLocaleLowerCase())
    ) {
      showToast(t('rooms.exists'));
      return;
    }
    await setRooms([...data.rooms, clean]);
    setName('');
    showToast(t('rooms.added', { name: clean }));
  }

  return (
    <section className="mn-card" aria-labelledby="rooms-title">
      <h2 id="rooms-title">{t('rooms.title')}</h2>
      <div className="mn-list">
        {data.rooms.map((room) => {
          const used = allItems.filter((item) => item.location === room).length;
          return (
            <div className="mn-row mn-row--text" key={room}>
              <span>
                <span className="mn-row-title">{roomLabel(room)}</span>
                <span className="mn-row-sub">{t('rooms.itemCount', { n: used })}</span>
              </span>
              <span className="mn-row-side">
                {used === 0 && data.rooms.length > 1 && (
                  <button
                    className="mn-btn mn-btn--ghost"
                    type="button"
                    aria-label={t('rooms.removeNamed', { name: roomLabel(room) })}
                    onClick={() => setRooms(data.rooms.filter((other) => other !== room))}
                  >
                    {t('common.remove')}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <form className="mn-form" onSubmit={add}>
        <label className="mn-field">
          {t('rooms.newName')}
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button className="mn-btn" type="submit" disabled={!name.trim()}>
          {t('rooms.add')}
        </button>
      </form>
    </section>
  );
}

function InsuranceCard({ items }: { items: Item[] }) {
  const { data, setSettings } = useApp();
  const total = categoryStats(items).total;
  const limit = data.settings.insuranceLimit;
  const [text, setText] = useState(limit ? String(limit).replace('.', ',') : '');
  const [error, setError] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === '') {
      await setSettings({ insuranceLimit: null });
      setError(false);
      return;
    }
    const value = Number(trimmed.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError(true);
      return;
    }
    setError(false);
    await setSettings({ insuranceLimit: Math.round(value * 100) / 100 });
    showToast(t('insurance.saved'));
  }

  return (
    <section className="mn-card" aria-labelledby="ins-title">
      <h2 id="ins-title">{t('insurance.title')}</h2>
      {limit === null ? (
        <p className="mn-note">{t('insurance.none')}</p>
      ) : (
        <>
          <p className={total > limit ? 'mn-banner mn-banner--bad' : 'mn-banner mn-banner--ok'}>
            {total > limit
              ? t('insurance.over', {
                  value: formatMoney(total, 0),
                  limit: formatMoney(limit, 0),
                  diff: formatMoney(total - limit, 0),
                })
              : t('insurance.covered', {
                  value: formatMoney(total, 0),
                  limit: formatMoney(limit, 0),
                })}
          </p>
          <div className="mn-bar">
            <span className="mn-bar-top">
              <b>{t('insurance.usage')}</b>
              <span>{Math.round((total / limit) * 100)} %</span>
            </span>
            <span className="mn-meter">
              <i
                style={
                  {
                    '--mn-value': Math.min(100, Math.round((total / limit) * 100)),
                  } as React.CSSProperties
                }
              />
            </span>
          </div>
        </>
      )}
      <form className="mn-form" onSubmit={save}>
        <label className="mn-field">
          {t('insurance.limitLabel')}
          <input
            value={text}
            inputMode="decimal"
            aria-invalid={error}
            aria-describedby={error ? 'ins-error' : 'ins-hint'}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {error ? (
          <p className="mn-error" id="ins-error" role="alert">
            {t('insurance.invalid')}
          </p>
        ) : (
          <p className="mn-hint" id="ins-hint">
            {t('insurance.hint')}
          </p>
        )}
        <button className="mn-btn" type="submit">
          {t('common.save')}
        </button>
      </form>
    </section>
  );
}

function BackupCard() {
  const { data, createBackup, restore, removeBackup } = useApp();
  const [label, setLabel] = useState('');

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const clean = label.trim();
    if (!clean) return;
    if (await createBackup(clean)) {
      setLabel('');
      showToast(t('backup.created'));
    }
  }

  const describe = (backup: Backup) =>
    t('backup.line', {
      date: formatDate(toIso(new Date(backup.savedAt))),
      n: backup.items.length,
    });

  return (
    <section className="mn-card" aria-labelledby="bk-title">
      <h2 id="bk-title">{t('backup.title')}</h2>
      <p className="mn-note">{t('backup.intro')}</p>
      <form className="mn-form" onSubmit={create}>
        <label className="mn-field">
          {t('backup.label')}
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <button className="mn-btn" type="submit" disabled={!label.trim()}>
          {t('backup.create')}
        </button>
      </form>
      {data.backups.length === 0 ? (
        <p className="mn-note">{t('backup.none')}</p>
      ) : (
        <div className="mn-list">
          {data.backups.map((backup) => (
            <div className="mn-row mn-row--text" key={backup.id}>
              <span>
                <span className="mn-row-title">{backup.label}</span>
                <span className="mn-row-sub">{describe(backup)}</span>
              </span>
              <span className="mn-row-side">
                <TwoTap
                  className="mn-btn"
                  label={t('backup.restore')}
                  confirmLabel={t('backup.restoreConfirm')}
                  onConfirm={async () => {
                    if (await restore(backup)) showToast(t('backup.restored'));
                  }}
                />
                <TwoTap
                  label={t('common.delete')}
                  confirmLabel={t('common.deleteConfirm')}
                  onConfirm={async () => {
                    if (await removeBackup(backup)) showToast(t('backup.deleted'));
                  }}
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AppearanceCard({ onExport }: { onExport: () => void }) {
  const kit = (globalThis as Kit).mnui?.theme;
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'system',
  );
  const options: Theme[] = ['system', 'light', 'dark'];
  return (
    <section className="mn-card" aria-labelledby="look-title">
      <h2 id="look-title">{t('appearance.title')}</h2>
      <fieldset className="mn-seg" aria-label={t('appearance.theme')}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={theme === option}
            onClick={() => {
              kit?.set(option);
              setTheme(option);
            }}
          >
            {t(`appearance.${option}`)}
          </button>
        ))}
      </fieldset>
      <h3>{t('export.title')}</h3>
      <p className="mn-note">{t('export.text')}</p>
      <button className="mn-btn" type="button" onClick={onExport}>
        {t('dashboard.exportExcel')}
      </button>
    </section>
  );
}

export function HouseholdView({ allItems, items, activeHouseholdId, onExport }: Props) {
  return (
    <main className="mn-main">
      <div className="mn-cols">
        <div>
          <HouseholdCard activeHouseholdId={activeHouseholdId} />
          <RoomsCard allItems={allItems} />
        </div>
        <div>
          <InsuranceCard items={items} />
          <BackupCard />
          <AppearanceCard onExport={onExport} />
        </div>
      </div>
    </main>
  );
}
