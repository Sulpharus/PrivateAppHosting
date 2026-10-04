import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';
import { showToast } from '../components/Toast';
import { t } from '../i18n';
import { maintenanceRule, parseAmount, suggestMaintenance, warrantyExpiryFor } from '../lib/domain';
import { categoryLabel, formatBytes, formatDate, newId, roomLabel } from '../lib/format';
import type { Sdk } from '../lib/mininode';
import { MAX_FILE_BYTES, uploadItemFile } from '../lib/store';
import { CATEGORIES, type CategoryId, type Household, type Item } from '../types';

interface Props {
  mn: Sdk | null;
  /** The item to change, or null for a new one. */
  item: Item | null;
  rooms: string[];
  households: Household[];
  activeHouseholdId: string;
  owners: string[];
  defaultOwner: string;
  /** Opens with the receipt upload in view (the "add receipt" shortcut). */
  focusReceipt?: boolean;
  onClose: () => void;
  onSave: (item: Item, removedPaths: (string | undefined)[]) => Promise<boolean>;
  /** Deletes files that were uploaded for an item that was not saved. */
  onDiscard: (paths: string[]) => Promise<void>;
}

type FieldError = 'name' | 'price' | 'months' | null;

function readNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

export function EditorSheet({
  mn,
  item,
  rooms,
  households,
  activeHouseholdId,
  owners,
  defaultOwner,
  focusReceipt,
  onClose,
  onSave,
  onDiscard,
}: Props) {
  const id = useMemo(() => item?.id ?? newId('item-'), [item]);
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<CategoryId>(item?.category ?? 'electronics');
  const [room, setRoom] = useState(item?.location ?? rooms[0] ?? '');
  const [price, setPrice] = useState(
    item?.purchasePrice ? String(item.purchasePrice).replace('.', ',') : '',
  );
  const [purchaseDate, setPurchaseDate] = useState(item?.purchaseDate ?? '');
  const [months, setMonths] = useState(String(item ? (item.warrantyMonths ?? '') : 24));
  const [owner, setOwner] = useState(item?.owner ?? defaultOwner);
  const [householdId, setHouseholdId] = useState(
    item?.householdId ?? (activeHouseholdId || households[0]?.id || ''),
  );
  const [provider, setProvider] = useState(item?.warrantyProvider ?? '');
  const [policy, setPolicy] = useState(item?.policyNumber ?? '');
  const [where, setWhere] = useState(item?.warrantyWhereApplies ?? '');
  const [serial, setSerial] = useState(item?.serialNumber ?? '');
  const [color, setColor] = useState(item?.color ?? '');
  const [capacity, setCapacity] = useState(item?.capacity ?? '');
  const [store, setStore] = useState(item?.store ?? '');
  const [payment, setPayment] = useState(item?.paymentMethod ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [nextMaintenance, setNextMaintenance] = useState(item?.nextMaintenanceDate ?? '');
  const [maintenanceEdited, setMaintenanceEdited] = useState(Boolean(item?.nextMaintenanceDate));
  const [photo, setPhoto] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);
  const [dropReceipt, setDropReceipt] = useState(false);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState<FieldError>(null);
  const [saving, setSaving] = useState(false);
  const receiptBox = useRef<HTMLFieldSetElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const priceInput = useRef<HTMLInputElement>(null);
  const monthsInput = useRef<HTMLInputElement>(null);

  const fail = (
    field: Exclude<FieldError, null>,
    input: React.RefObject<HTMLInputElement | null>,
  ) => {
    setError(field);
    input.current?.focus();
  };

  useEffect(() => {
    if (focusReceipt) receiptBox.current?.scrollIntoView({ block: 'center' });
  }, [focusReceipt]);

  // A new item gets a suggested service date until the person types their own.
  useEffect(() => {
    if (item || maintenanceEdited || !name.trim()) return;
    setNextMaintenance(suggestMaintenance(name, category, purchaseDate, new Date()).nextDate);
  }, [item, maintenanceEdited, name, category, purchaseDate]);

  const [photoUrl, setPhotoUrl] = useState('');
  useEffect(() => {
    if (!photo) {
      setPhotoUrl('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const expiry = warrantyExpiryFor(purchaseDate, readNumber(months));

  function pick(file: File | undefined, set: (file: File | null) => void) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(t('editor.fileTooLarge', { max: formatBytes(MAX_FILE_BYTES) }));
      return;
    }
    setFileError('');
    set(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return fail('name', nameInput);
    const amount = price.trim() === '' ? 0 : parseAmount(price);
    if (amount === null || amount < 0) return fail('price', priceInput);
    if (months.trim() !== '' && readNumber(months) === undefined)
      return fail('months', monthsInput);
    setError(null);
    setSaving(true);
    const removed: (string | undefined)[] = [];
    const uploaded: string[] = [];
    let photoPath = item?.photoPath;
    let receiptPath = item?.receiptPath;
    try {
      if (photo && mn) {
        removed.push(photoPath);
        photoPath = await uploadItemFile(mn, id, 'photo', photo);
        uploaded.push(photoPath);
      } else if (dropPhoto) {
        removed.push(photoPath);
        photoPath = undefined;
      }
      if (receipt && mn) {
        removed.push(receiptPath);
        receiptPath = await uploadItemFile(mn, id, 'receipt', receipt);
        uploaded.push(receiptPath);
      } else if (dropReceipt) {
        removed.push(receiptPath);
        receiptPath = undefined;
      }
    } catch {
      await onDiscard(uploaded);
      showToast(t('editor.uploadFailed'));
      setSaving(false);
      return;
    }
    const now = Date.now();
    const clean = (text: string) => text.trim() || undefined;
    const saved: Item = {
      id,
      name: name.trim(),
      category,
      location: room,
      purchasePrice: amount,
      purchaseDate,
      warrantyMonths: readNumber(months),
      warrantyExpiry: expiry,
      warrantyProvider: clean(provider),
      warrantyWhereApplies: clean(where),
      policyNumber: clean(policy),
      owner: clean(owner),
      householdId: householdId || undefined,
      notes: clean(notes),
      photoPath,
      receiptPath,
      serialNumber: clean(serial),
      color: clean(color),
      capacity: clean(capacity),
      store: clean(store),
      paymentMethod: clean(payment),
      nextMaintenanceDate: nextMaintenance || undefined,
      maintenanceLog: item?.maintenanceLog ?? [],
      createdAt: item?.createdAt ?? now,
      updatedAt: now,
    };
    const ok = await onSave(saved, removed);
    // Files for an item that was not saved would stay in storage with no one to use them.
    if (!ok) await onDiscard(uploaded);
    setSaving(false);
    if (ok) {
      showToast(t(item ? 'editor.saved' : 'editor.created'));
      onClose();
    }
  }

  const rule = maintenanceRule(name, category);

  return (
    <Overlay onClose={onClose} labelledBy="editor-title" sheetClassName="mn-sheet mn-sheet--tall">
      <div className="mn-sheet-bar">
        <button className="mn-btn mn-btn--ghost" type="button" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <h2 id="editor-title">{item ? t('editor.editTitle') : t('editor.newTitle')}</h2>
        <span />
      </div>
      <form className="mn-sheet-body mn-form" onSubmit={submit} noValidate id="editor-form">
        <fieldset>
          <legend>{t('editor.basics')}</legend>
          <label className="mn-field">
            {t('editor.name')}
            <input
              ref={nameInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={error === 'name'}
              aria-describedby={error === 'name' ? 'err-name' : undefined}
              autoComplete="off"
              required
            />
          </label>
          {error === 'name' && (
            <p className="mn-error" id="err-name" role="alert">
              {t('editor.nameRequired')}
            </p>
          )}
          <div className="mn-grid-2">
            <label className="mn-field">
              {t('editor.category')}
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as CategoryId)}
              >
                {CATEGORIES.map((entry) => (
                  <option key={entry} value={entry}>
                    {categoryLabel(entry)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mn-field">
              {t('editor.room')}
              <select value={room} onChange={(event) => setRoom(event.target.value)}>
                {[...new Set([room, ...rooms])].map((entry) => (
                  <option key={entry} value={entry}>
                    {roomLabel(entry)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mn-grid-2">
            <label className="mn-field">
              {t('editor.price')}
              <input
                ref={priceInput}
                value={price}
                inputMode="decimal"
                onChange={(event) => setPrice(event.target.value)}
                aria-invalid={error === 'price'}
                aria-describedby={error === 'price' ? 'err-price' : undefined}
                placeholder={t('editor.pricePlaceholder')}
              />
            </label>
            <label className="mn-field">
              {t('editor.owner')}
              <input
                value={owner}
                list="owner-list"
                onChange={(event) => setOwner(event.target.value)}
                autoComplete="off"
              />
              <datalist id="owner-list">
                {owners.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </label>
          </div>
          {error === 'price' && (
            <p className="mn-error" id="err-price" role="alert">
              {t('editor.priceInvalid')}
            </p>
          )}
          {households.length > 1 && (
            <label className="mn-field">
              {t('editor.household')}
              <select value={householdId} onChange={(event) => setHouseholdId(event.target.value)}>
                {households.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>{t('editor.warrantyLegend')}</legend>
          <label className="mn-field">
            {t('editor.purchaseDate')}
            <input
              type="date"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />
          </label>
          <label className="mn-field">
            {t('editor.months')}
            <input
              ref={monthsInput}
              value={months}
              inputMode="numeric"
              onChange={(event) => setMonths(event.target.value)}
              aria-invalid={error === 'months'}
              aria-describedby={error === 'months' ? 'err-months' : 'hint-expiry'}
            />
          </label>
          {error === 'months' ? (
            <p className="mn-error" id="err-months" role="alert">
              {t('editor.monthsInvalid')}
            </p>
          ) : (
            <p className="mn-hint" id="hint-expiry">
              {expiry
                ? t('editor.expiryHint', { date: formatDate(expiry) })
                : t('editor.expiryNeedsDate')}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>{t('editor.filesLegend')}</legend>
          <label className="mn-field">
            {t('editor.photo')}
            <input
              type="file"
              accept="image/*"
              onChange={(event) => pick(event.target.files?.[0], setPhoto)}
            />
          </label>
          {photo && photoUrl && (
            <img className="mn-sheet-hero" src={photoUrl} alt={t('editor.photoPreview')} />
          )}
          {item?.photoPath && !photo && (
            <button
              className="mn-btn mn-btn--ghost"
              type="button"
              aria-pressed={dropPhoto}
              onClick={() => setDropPhoto(!dropPhoto)}
            >
              {dropPhoto ? t('editor.keepPhoto') : t('editor.removePhoto')}
            </button>
          )}
        </fieldset>
        <fieldset ref={receiptBox}>
          <legend>{t('editor.receiptLegend')}</legend>
          <label className="mn-field">
            {t('editor.receipt')}
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => pick(event.target.files?.[0], setReceipt)}
            />
          </label>
          <p className="mn-hint">{t('editor.receiptHint', { max: formatBytes(MAX_FILE_BYTES) })}</p>
          {receipt && (
            <p className="mn-note">
              <Icon name="file" /> {receipt.name}
            </p>
          )}
          {item?.receiptPath && !receipt && (
            <button
              className="mn-btn mn-btn--ghost"
              type="button"
              aria-pressed={dropReceipt}
              onClick={() => setDropReceipt(!dropReceipt)}
            >
              {dropReceipt ? t('editor.keepReceipt') : t('editor.removeReceipt')}
            </button>
          )}
          {fileError && (
            <p className="mn-error" role="alert">
              {fileError}
            </p>
          )}
        </fieldset>

        <details className="mn-more">
          <summary>{t('editor.more')}</summary>
          <div className="mn-form">
            <div className="mn-grid-2">
              <label className="mn-field">
                {t('editor.serial')}
                <input value={serial} onChange={(event) => setSerial(event.target.value)} />
              </label>
              <label className="mn-field">
                {t('editor.color')}
                <input value={color} onChange={(event) => setColor(event.target.value)} />
              </label>
            </div>
            <label className="mn-field">
              {t('editor.capacity')}
              <input value={capacity} onChange={(event) => setCapacity(event.target.value)} />
            </label>
            <div className="mn-grid-2">
              <label className="mn-field">
                {t('editor.store')}
                <input value={store} onChange={(event) => setStore(event.target.value)} />
              </label>
              <label className="mn-field">
                {t('editor.payment')}
                <input value={payment} onChange={(event) => setPayment(event.target.value)} />
              </label>
            </div>
            <div className="mn-grid-2">
              <label className="mn-field">
                {t('editor.provider')}
                <input value={provider} onChange={(event) => setProvider(event.target.value)} />
              </label>
              <label className="mn-field">
                {t('editor.policy')}
                <input value={policy} onChange={(event) => setPolicy(event.target.value)} />
              </label>
            </div>
            <label className="mn-field">
              {t('editor.warrantyWhere')}
              <input
                value={where}
                placeholder={t('editor.warrantyWherePlaceholder')}
                onChange={(event) => setWhere(event.target.value)}
              />
            </label>
            <label className="mn-field">
              {t('editor.nextMaintenance')}
              <input
                type="date"
                value={nextMaintenance}
                onChange={(event) => {
                  setNextMaintenance(event.target.value);
                  setMaintenanceEdited(true);
                }}
              />
            </label>
            {name.trim() && (
              <p className="mn-hint">
                {t('editor.maintenanceHint', {
                  task: t(`maintenance.${rule.id}`),
                  n: rule.intervalMonths,
                })}
              </p>
            )}
            <label className="mn-field">
              {t('editor.notes')}
              <textarea value={notes} rows={3} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
        </details>
      </form>
      <div className="mn-sheet-foot">
        <span className="mn-grow" />
        <button
          className="mn-btn mn-btn--primary"
          type="submit"
          form="editor-form"
          disabled={saving}
        >
          {item ? t('common.save') : t('editor.create')}
        </button>
      </div>
    </Overlay>
  );
}
