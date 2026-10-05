/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Haushaltsinventar – Garantien, Belege, Haushalte
 * MiniNode App Kit (data-accent="beige")
 */

import {
  AlertTriangle,
  Barcode,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Home,
  Info,
  Layers,
  LayoutGrid,
  List as ListIcon,
  MapPin,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Share2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getMiniNode, type MiniNodeClient, type MiniNodeUser } from './mininode';
import type { AppSettings, Household, HouseholdMember, InventoryItem } from './types';
import {
  exportToCsv,
  exportToJson,
  formatCurrency,
  formatDate,
  getWarrantyInfo,
  parseToCents,
} from './utils/dataHelper';

// Default preset categories and rooms
const DEFAULT_CATEGORIES = [
  'Elektronik & Computer',
  'Haushaltsgeräte',
  'Möbel & Wohnen',
  'Werkzeuge & Garten',
  'Audio & TV',
  'Freizeit & Sport',
  'Sonstiges',
];

const DEFAULT_ROOMS = [
  'Wohnzimmer',
  'Küche',
  'Schlafzimmer',
  'Arbeitszimmer',
  'Keller',
  'Garage',
  'Badezimmer',
];

export function App() {
  const [mn, setMn] = useState<MiniNodeClient | null>(null);
  const [currentUser, setCurrentUser] = useState<MiniNodeUser | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  // App navigation tabs
  const [activeTab, setActiveTab] = useState<'start' | 'inventar' | 'statistik' | 'einstellungen'>(
    'start',
  );

  // Core Data
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    activeHouseholdId: 'hh-main',
    insuranceLimitEur: 35000,
    rooms: DEFAULT_ROOMS,
    categories: DEFAULT_CATEGORIES,
  });

  // UI & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  const [selectedRoom, setSelectedRoom] = useState('Alle');
  const [selectedWarrantyStatus, setSelectedWarrantyStatus] = useState<
    'Alle' | 'Aktiv' | 'Läuft bald ab' | 'Abgelaufen'
  >('Alle');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState('Alle');
  const [viewLayout, setViewLayout] = useState<'tiles' | 'list'>('tiles');
  const [sortOption, setSortOption] = useState<'newest' | 'name' | 'warranty' | 'priceDesc'>(
    'newest',
  );

  // Collapsible Filter & Table Sections
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);
  const [isOwnersOpen, setIsOwnersOpen] = useState(false);

  // Collapsible Statistics Sections
  const [statCategoriesOpen, setStatCategoriesOpen] = useState(true);
  const [statRoomsOpen, setStatRoomsOpen] = useState(false);
  const [statOwnersOpen, setStatOwnersOpen] = useState(false);

  // Modals & Sheets
  const [sheetMode, setSheetMode] = useState<
    'none' | 'add' | 'edit' | 'detail' | 'households' | 'receiptZoom' | 'trash'
  >('none');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [formRoom, setFormRoom] = useState(DEFAULT_ROOMS[0]);
  const [formPriceInput, setFormPriceInput] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formWarrantyMonths, setFormWarrantyMonths] = useState<number>(24);
  const [formWarrantyExpiry, setFormWarrantyExpiry] = useState('');
  const [formWhereApplies, setFormWhereApplies] = useState('');
  const [formHouseholdId, setFormHouseholdId] = useState('hh-main');
  const [formOwnerName, setFormOwnerName] = useState('Ich');
  const [formSerialNumber, setFormSerialNumber] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPhotoFile, setFormPhotoFile] = useState<File | null>(null);
  const [formPhotoPreview, setFormPhotoPreview] = useState<string>('');
  const [formReceiptFile, setFormReceiptFile] = useState<File | null>(null);
  const [formReceiptPreview, setFormReceiptPreview] = useState<string>('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Household Manager Form State
  const [newHhName, setNewHhName] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'editor' | 'viewer'>('editor');

  // Toast & Undo
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [undoItem, setUndoItem] = useState<InventoryItem | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  // File Inputs
  const photoInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const csvImportInputRef = useRef<HTMLInputElement>(null);
  const jsonImportInputRef = useRef<HTMLInputElement>(null);

  // Initialize MiniNode SDK
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    async function init() {
      try {
        const client = await getMiniNode();
        setMn(client);

        const user = await client.auth.requireLogin();
        setCurrentUser(user);

        setIsOnline(client.offline.online());
        unsubs.push(client.offline.onChange((online) => setIsOnline(online)));
        unsubs.push(
          client.offline.onSynced(() => {
            showToast('Daten synchronisiert');
            loadAllData(client);
          }),
        );

        // Subscribe to realtime updates
        const rt = client.realtime('household').on('broadcast', { event: 'update' }, () => {
          loadAllData(client);
        });
        if (rt?.subscribe) {
          unsubs.push(rt.subscribe());
        }

        await loadAllData(client);
      } catch (err) {
        console.error('Failed to initialize MiniNode app', err);
      } finally {
        setLoading(false);
      }
    }

    init();

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  // Load all items, households and settings from mn.kv
  const loadAllData = async (client: MiniNodeClient) => {
    try {
      // 1. Load Items
      const rawItems = await client.kv.list<InventoryItem>('item:');
      const loadedItems = rawItems
        .map((r) => r.value)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setItems(loadedItems);

      // Check warranties and notify
      checkAndNotifyExpiring(client, loadedItems);

      // 2. Load Households
      const savedHh = await client.kv.get<Household[]>('households:list');
      if (savedHh && Array.isArray(savedHh) && savedHh.length > 0) {
        setHouseholds(savedHh);
      } else {
        const defaultHh: Household = {
          id: 'hh-main',
          name: 'Hauptwohnung',
          members: [
            { id: 'm-1', name: 'Ich', role: 'admin', isMiniNodeUser: true },
            { id: 'm-2', name: 'Familie', role: 'editor', isMiniNodeUser: false },
          ],
          createdAt: Date.now(),
        };
        await client.kv.set('households:list', [defaultHh]);
        setHouseholds([defaultHh]);
      }

      // 3. Load Settings
      const savedSettings = await client.kv.get<AppSettings>('settings');
      if (savedSettings) {
        setSettings((prev) => ({ ...prev, ...savedSettings }));
      }
    } catch (err) {
      console.error('Error loading data from mn.kv', err);
    }
  };

  // Evaluate upcoming warranty expirations
  const checkAndNotifyExpiring = async (client: MiniNodeClient, allItems: InventoryItem[]) => {
    const activeItems = allItems.filter((i) => !i.deletedAt);
    const expiring = activeItems.filter((item) => {
      const info = getWarrantyInfo(item.warrantyExpiry);
      return info.status === 'expiring';
    });

    if (expiring.length > 0) {
      const first = expiring[0];
      const info = getWarrantyInfo(first.warrantyExpiry);
      await client.notify(
        'Garantie-Alarm',
        `Garantie für „${first.name}“ endet in ${info.daysLeft} Tagen.`,
        '/',
      );
    }
  };

  const showToast = (msg: string, itemForUndo?: InventoryItem) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    setUndoItem(itemForUndo || null);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      setUndoItem(null);
    }, 6000);
  };

  // Current active household
  const currentHousehold = useMemo(() => {
    return (
      households.find((h) => h.id === settings.activeHouseholdId) ||
      households[0] || {
        id: 'hh-main',
        name: 'Hauptwohnung',
        members: [{ id: 'm-1', name: 'Ich', role: 'admin', isMiniNodeUser: true }],
        createdAt: Date.now(),
      }
    );
  }, [households, settings.activeHouseholdId]);

  // Active (non-deleted) items in the selected household or all
  const activeItems = useMemo(() => {
    return items.filter((item) => {
      if (item.deletedAt) return false;
      if (settings.activeHouseholdId && settings.activeHouseholdId !== 'all') {
        return (item.householdId || 'hh-main') === settings.activeHouseholdId;
      }
      return true;
    });
  }, [items, settings.activeHouseholdId]);

  // Deleted items in trash
  const trashItems = useMemo(() => {
    return items.filter((item) => item.deletedAt);
  }, [items]);

  // Available unique owners for filtering
  const availableOwners = useMemo(() => {
    const set = new Set<string>();
    currentHousehold.members.forEach((m) => set.add(m.name));
    activeItems.forEach((i) => {
      if (i.ownerName) set.add(i.ownerName);
    });
    return Array.from(set);
  }, [currentHousehold, activeItems]);

  // Filtered & sorted items
  const displayedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = activeItems.filter((item) => {
      // Search
      if (q) {
        const matchName = (item.name || '').toLowerCase().includes(q);
        const matchCategory = (item.category || '').toLowerCase().includes(q);
        const matchRoom = (item.room || '').toLowerCase().includes(q);
        const matchNotes = (item.notes || '').toLowerCase().includes(q);
        const matchWhere = (item.whereApplies || '').toLowerCase().includes(q);
        const matchOwner = (item.ownerName || '').toLowerCase().includes(q);
        if (
          !matchName &&
          !matchCategory &&
          !matchRoom &&
          !matchNotes &&
          !matchWhere &&
          !matchOwner
        ) {
          return false;
        }
      }

      // Category
      if (selectedCategory !== 'Alle' && item.category !== selectedCategory) {
        return false;
      }

      // Room
      if (selectedRoom !== 'Alle' && item.room !== selectedRoom) {
        return false;
      }

      // Owner filter
      if (selectedOwnerFilter !== 'Alle' && item.ownerName !== selectedOwnerFilter) {
        return false;
      }

      // Warranty Status
      if (selectedWarrantyStatus !== 'Alle') {
        const info = getWarrantyInfo(item.warrantyExpiry);
        if (selectedWarrantyStatus === 'Aktiv' && info.status !== 'active') return false;
        if (selectedWarrantyStatus === 'Läuft bald ab' && info.status !== 'expiring') return false;
        if (selectedWarrantyStatus === 'Abgelaufen' && info.status !== 'expired') return false;
      }

      return true;
    });

    // Sorting
    return filtered.sort((a, b) => {
      if (sortOption === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortOption === 'name') return (a.name || '').localeCompare(b.name || '', 'de');
      if (sortOption === 'priceDesc')
        return (b.purchasePriceCents || 0) - (a.purchasePriceCents || 0);
      if (sortOption === 'warranty') {
        return (a.warrantyExpiry || '9999').localeCompare(b.warrantyExpiry || '9999');
      }
      return 0;
    });
  }, [
    activeItems,
    searchQuery,
    selectedCategory,
    selectedRoom,
    selectedOwnerFilter,
    selectedWarrantyStatus,
    sortOption,
  ]);

  // Overall KPIs
  const totalValueCents = useMemo(() => {
    return activeItems.reduce((acc, i) => acc + (i.purchasePriceCents || 0), 0);
  }, [activeItems]);

  const expiringCount = useMemo(() => {
    return activeItems.filter((i) => getWarrantyInfo(i.warrantyExpiry).status === 'expiring')
      .length;
  }, [activeItems]);

  const activeWarrantyCount = useMemo(() => {
    return activeItems.filter((i) => getWarrantyInfo(i.warrantyExpiry).status === 'active').length;
  }, [activeItems]);

  // Category breakdown for statistics
  const categoryStats = useMemo(() => {
    const map = new Map<string, { count: number; totalCents: number }>();
    activeItems.forEach((i) => {
      const cat = i.category || 'Sonstiges';
      const current = map.get(cat) || { count: 0, totalCents: 0 };
      map.set(cat, {
        count: current.count + 1,
        totalCents: current.totalCents + (i.purchasePriceCents || 0),
      });
    });

    const arr = Array.from(map.entries()).map(([cat, data]) => ({
      category: cat,
      ...data,
      percent: totalValueCents > 0 ? Math.round((data.totalCents / totalValueCents) * 100) : 0,
    }));

    return arr.sort((a, b) => b.totalCents - a.totalCents);
  }, [activeItems, totalValueCents]);

  // Tabular statistics for Categories (for expandable filter table)
  const categoriesTableData = useMemo(() => {
    return settings.categories.map((cat) => {
      const catItems = activeItems.filter((i) => i.category === cat);
      const count = catItems.length;
      const totalCents = catItems.reduce((sum, i) => sum + (i.purchasePriceCents || 0), 0);
      const activeWarranties = catItems.filter(
        (i) => getWarrantyInfo(i.warrantyExpiry).status === 'active',
      ).length;
      const expiringWarranties = catItems.filter(
        (i) => getWarrantyInfo(i.warrantyExpiry).status === 'expiring',
      ).length;
      const percent = totalValueCents > 0 ? Math.round((totalCents / totalValueCents) * 100) : 0;
      const itemPercent =
        activeItems.length > 0 ? Math.round((count / activeItems.length) * 100) : 0;
      return {
        name: cat,
        count,
        totalCents,
        activeWarranties,
        expiringWarranties,
        percent,
        itemPercent,
      };
    });
  }, [settings.categories, activeItems, totalValueCents]);

  // Tabular statistics for Rooms (for expandable filter table)
  const roomsTableData = useMemo(() => {
    return settings.rooms.map((room) => {
      const roomItems = activeItems.filter((i) => i.room === room);
      const count = roomItems.length;
      const totalCents = roomItems.reduce((sum, i) => sum + (i.purchasePriceCents || 0), 0);
      const activeWarranties = roomItems.filter(
        (i) => getWarrantyInfo(i.warrantyExpiry).status === 'active',
      ).length;
      const percent = totalValueCents > 0 ? Math.round((totalCents / totalValueCents) * 100) : 0;
      const itemPercent =
        activeItems.length > 0 ? Math.round((count / activeItems.length) * 100) : 0;
      return {
        name: room,
        count,
        totalCents,
        activeWarranties,
        percent,
        itemPercent,
      };
    });
  }, [settings.rooms, activeItems, totalValueCents]);

  // Tabular statistics for Owners (for expandable filter table)
  const ownersTableData = useMemo(() => {
    return availableOwners.map((owner) => {
      const ownerItems = activeItems.filter((i) => (i.ownerName || 'Ich') === owner);
      const count = ownerItems.length;
      const totalCents = ownerItems.reduce((sum, i) => sum + (i.purchasePriceCents || 0), 0);
      const activeWarranties = ownerItems.filter(
        (i) => getWarrantyInfo(i.warrantyExpiry).status === 'active',
      ).length;
      const member = currentHousehold.members.find((m) => m.name === owner);
      const percent = totalValueCents > 0 ? Math.round((totalCents / totalValueCents) * 100) : 0;
      const itemPercent =
        activeItems.length > 0 ? Math.round((count / activeItems.length) * 100) : 0;
      return {
        name: owner,
        role: member
          ? member.role === 'admin'
            ? 'Admin'
            : member.role === 'editor'
              ? 'Bearbeiter'
              : 'Leser'
          : 'Zugewiesen',
        count,
        totalCents,
        activeWarranties,
        percent,
        itemPercent,
      };
    });
  }, [availableOwners, activeItems, currentHousehold, totalValueCents]);

  // Auto calculate expiration date from purchaseDate and warrantyMonths
  const recalculateExpiry = (dateStr: string, months: number) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        d.setMonth(d.getMonth() + months);
        return d.toISOString().split('T')[0];
      }
    } catch (e) {}
    return '';
  };

  // Open Add Sheet
  const openNewItem = () => {
    setSelectedItem(null);
    setFormName('');
    setFormCategory(settings.categories[0] || DEFAULT_CATEGORIES[0]);
    setFormRoom(settings.rooms[0] || DEFAULT_ROOMS[0]);
    setFormPriceInput('');
    const today = new Date().toISOString().split('T')[0];
    setFormDate(today);
    setFormWarrantyMonths(24);
    setFormWarrantyExpiry(recalculateExpiry(today, 24));
    setFormWhereApplies('Herstellergarantie Deutschland');
    setFormHouseholdId(settings.activeHouseholdId || 'hh-main');
    setFormOwnerName(currentHousehold.members[0]?.name || 'Ich');
    setFormSerialNumber('');
    setFormNotes('');
    setFormPhotoFile(null);
    setFormPhotoPreview('');
    setFormReceiptFile(null);
    setFormReceiptPreview('');
    setFormError('');
    setSheetMode('add');
  };

  // Open Edit Sheet
  const openEditItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormName(item.name || '');
    setFormCategory(item.category || DEFAULT_CATEGORIES[0]);
    setFormRoom(item.room || DEFAULT_ROOMS[0]);
    setFormPriceInput(((item.purchasePriceCents || 0) / 100).toFixed(2).replace('.', ','));
    setFormDate(item.purchaseDate || new Date().toISOString().split('T')[0]);
    setFormWarrantyMonths(item.warrantyMonths || 24);
    setFormWarrantyExpiry(item.warrantyExpiry || '');
    setFormWhereApplies(item.whereApplies || '');
    setFormHouseholdId(item.householdId || 'hh-main');
    setFormOwnerName(item.ownerName || 'Ich');
    setFormSerialNumber(item.serialNumber || '');
    setFormNotes(item.notes || '');
    setFormPhotoFile(null);
    setFormPhotoPreview(item.photoUrl || '');
    setFormReceiptFile(null);
    setFormReceiptPreview(item.receiptUrl || '');
    setFormError('');
    setSheetMode('edit');
  };

  // Handle Photo selection & camera
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setFormError('Bild ist größer als 20 MB.');
      return;
    }
    setFormPhotoFile(file);
    const url = URL.createObjectURL(file);
    setFormPhotoPreview(url);
    setFormError('');
  };

  // Handle Receipt selection & camera
  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setFormError('Belegdatei ist größer als 20 MB.');
      return;
    }
    setFormReceiptFile(file);
    const url = URL.createObjectURL(file);
    setFormReceiptPreview(url);
    setFormError('');
  };

  // Try barcode scanning with BarcodeDetector
  const handleScanBarcode = async () => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const imgBitmap = await createImageBitmap(file);
          const detector = new (window as any).BarcodeDetector({
            formats: ['qr_code', 'ean_13', 'ean_8', 'code_128'],
          });
          const barcodes = await detector.detect(imgBitmap);
          if (barcodes.length > 0) {
            setFormSerialNumber(barcodes[0].rawValue);
            showToast(`Barcode erkannt: ${barcodes[0].rawValue}`);
          } else {
            showToast('Kein Barcode auf Foto gefunden');
          }
        };
        input.click();
      } catch (err) {
        showToast('Barcode-Erkennung nicht möglich');
      }
    } else {
      showToast('Barcode-Scanner wird im Browser manuell eingegeben');
    }
  };

  // Save Item (Add or Update)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Bitte gib einen Namen für den Gegenstand an.');
      return;
    }

    if (!mn) return;
    setIsSubmitting(true);
    setFormError('');

    try {
      const id = selectedItem ? selectedItem.id : crypto.randomUUID();
      let photoPath = selectedItem?.photoPath;
      let photoUrl = selectedItem?.photoUrl;
      let receiptPath = selectedItem?.receiptPath;
      let receiptUrl = selectedItem?.receiptUrl;
      let receiptName = selectedItem?.receiptName;

      // Upload item photo if selected
      if (formPhotoFile) {
        const pPath = `fotos/${id}/${Date.now()}_thumb.jpg`;
        await mn.files.upload(pPath, formPhotoFile, { contentType: formPhotoFile.type });
        photoPath = pPath;
        photoUrl = await mn.files.url(pPath);
      }

      // Upload bill/receipt if selected
      if (formReceiptFile) {
        const rPath = `belege/${id}/${Date.now()}_${formReceiptFile.name}`;
        await mn.files.upload(rPath, formReceiptFile, { contentType: formReceiptFile.type });
        receiptPath = rPath;
        receiptUrl = await mn.files.url(rPath);
        receiptName = formReceiptFile.name;
      }

      const expiry = formWarrantyExpiry || recalculateExpiry(formDate, formWarrantyMonths);

      const itemRecord: InventoryItem = {
        id,
        name: formName.trim(),
        category: formCategory,
        room: formRoom,
        purchasePriceCents: parseToCents(formPriceInput),
        purchaseDate: formDate,
        warrantyMonths: formWarrantyMonths,
        warrantyExpiry: expiry,
        whereApplies: formWhereApplies.trim() || 'Herstellergarantie',
        householdId: formHouseholdId || 'hh-main',
        ownerName: formOwnerName.trim() || 'Ich',
        photoPath,
        photoUrl,
        receiptPath,
        receiptUrl,
        receiptName,
        serialNumber: formSerialNumber.trim() || undefined,
        notes: formNotes.trim() || undefined,
        deletedAt: null,
        createdAt: selectedItem ? selectedItem.createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      // Store in mn.kv
      await mn.kv.set(`item:${id}`, itemRecord);

      // Update state
      setItems((prev) => {
        const filtered = prev.filter((i) => i.id !== id);
        return [itemRecord, ...filtered];
      });

      // Schedule reminder if warranty is active
      const wInfo = getWarrantyInfo(expiry);
      if (wInfo.daysLeft > 0) {
        const warnDate = new Date(new Date(expiry).getTime() - 30 * 24 * 60 * 60 * 1000);
        await mn.push.schedule({
          key: `warranty:${id}`,
          at: warnDate,
          title: `Garantie für „${itemRecord.name}“ läuft bald ab`,
          path: '/',
        });
      }

      showToast(selectedItem ? 'Gegenstand aktualisiert' : 'Gegenstand gespeichert');
      setSheetMode('none');
    } catch (err: any) {
      console.error('Save error', err);
      setFormError('Fehler beim Speichern des Gegenstands.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Soft delete item with undo toast
  const handleDeleteItem = async (item: InventoryItem) => {
    if (!mn) return;
    try {
      const updated: InventoryItem = {
        ...item,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      };
      await mn.kv.set(`item:${item.id}`, updated);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));

      if (sheetMode === 'detail') setSheetMode('none');
      showToast(`„${item.name}“ in Papierkorb verschoben`, item);
    } catch (err) {
      console.error('Delete error', err);
      showToast('Löschen fehlgeschlagen');
    }
  };

  // Undo delete
  const handleUndo = async () => {
    if (!undoItem || !mn) return;
    try {
      const restored: InventoryItem = {
        ...undoItem,
        deletedAt: null,
        updatedAt: Date.now(),
      };
      await mn.kv.set(`item:${restored.id}`, restored);
      setItems((prev) => prev.map((i) => (i.id === restored.id ? restored : i)));
      showToast('Gegenstand wiederhergestellt');
      setUndoItem(null);
    } catch (err) {
      console.error('Undo error', err);
    }
  };

  // Restore from trash
  const handleRestoreFromTrash = async (item: InventoryItem) => {
    if (!mn) return;
    try {
      const restored: InventoryItem = {
        ...item,
        deletedAt: null,
        updatedAt: Date.now(),
      };
      await mn.kv.set(`item:${item.id}`, restored);
      setItems((prev) => prev.map((i) => (i.id === item.id ? restored : i)));
      showToast(`„${item.name}“ wiederhergestellt`);
    } catch (e) {
      showToast('Wiederherstellen fehlgeschlagen');
    }
  };

  // Permanent delete from trash
  const handlePurgeItem = async (item: InventoryItem) => {
    if (!mn) return;
    try {
      await mn.kv.delete(`item:${item.id}`);
      if (item.photoPath) await mn.files.delete(item.photoPath).catch(() => {});
      if (item.receiptPath) await mn.files.delete(item.receiptPath).catch(() => {});
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      showToast(`„${item.name}“ endgültig gelöscht`);
    } catch (e) {
      showToast('Endgültiges Löschen fehlgeschlagen');
    }
  };

  // Share item externally (Web Share API or Clipboard)
  const handleShareItem = async (item: InventoryItem) => {
    const text = [
      `Gegenstand: ${item.name}`,
      `Kaufpreis: ${formatCurrency(item.purchasePriceCents)}`,
      `Kaufdatum: ${formatDate(item.purchaseDate)}`,
      `Garantie: ${item.warrantyExpiry ? formatDate(item.warrantyExpiry) : 'Keine'}`,
      `Geltungsbereich: ${item.whereApplies || 'Hersteller'}`,
      `Besitzer: ${item.ownerName || '–'}`,
      item.serialNumber ? `Seriennummer: ${item.serialNumber}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: item.name,
          text,
        });
        return;
      } catch (err) {
        // Fallback to clipboard
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      showToast('Gegenstands-Daten in Zwischenablage kopiert');
    }
  };

  // Household Management: Create new household
  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHhName.trim() || !mn) return;

    const newHh: Household = {
      id: 'hh-' + Date.now(),
      name: newHhName.trim(),
      members: [
        {
          id: 'm-' + Date.now(),
          name: currentUser?.name || 'Ich',
          role: 'admin',
          isMiniNodeUser: true,
        },
      ],
      createdAt: Date.now(),
    };

    const updated = [...households, newHh];
    await mn.kv.set('households:list', updated);
    setHouseholds(updated);
    setSettings((prev) => ({ ...prev, activeHouseholdId: newHh.id }));
    await mn.kv.set('settings', { ...settings, activeHouseholdId: newHh.id });

    setNewHhName('');
    showToast(`Haushalt „${newHh.name}“ erstellt`);
  };

  // Household Management: Add Member
  const handleAddMember = async (hhId: string) => {
    if (!newMemberName.trim() || !mn) return;

    const updated = households.map((hh) => {
      if (hh.id !== hhId) return hh;
      const newMember: HouseholdMember = {
        id: 'm-' + Date.now(),
        name: newMemberName.trim(),
        role: newMemberRole,
        isMiniNodeUser: true,
      };
      return {
        ...hh,
        members: [...hh.members, newMember],
      };
    });

    await mn.kv.set('households:list', updated);
    setHouseholds(updated);
    setNewMemberName('');
    showToast('Mitglied hinzugefügt');
  };

  // Household Management: Delete Member
  const handleDeleteMember = async (hhId: string, memberId: string) => {
    if (!mn) return;
    const hh = households.find((h) => h.id === hhId);
    if (!hh || hh.members.length <= 1) {
      showToast('Mindestens ein Mitglied muss im Haushalt bleiben');
      return;
    }

    const updated = households.map((h) => {
      if (h.id !== hhId) return h;
      return {
        ...h,
        members: h.members.filter((m) => m.id !== memberId),
      };
    });

    await mn.kv.set('households:list', updated);
    setHouseholds(updated);
    showToast('Mitglied entfernt');
  };

  // Household Management: Delete Household
  const handleDeleteHousehold = async (hhId: string) => {
    if (households.length <= 1 || !mn) {
      showToast('Der letzte Haushalt kann nicht gelöscht werden');
      return;
    }

    const updated = households.filter((h) => h.id !== hhId);
    await mn.kv.set('households:list', updated);
    setHouseholds(updated);

    if (settings.activeHouseholdId === hhId) {
      const fallbackId = updated[0].id;
      setSettings((prev) => ({ ...prev, activeHouseholdId: fallbackId }));
      await mn.kv.set('settings', { ...settings, activeHouseholdId: fallbackId });
    }
    showToast('Haushalt gelöscht');
  };

  // Import JSON Backup
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !mn) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed.items && Array.isArray(parsed.items)) {
          for (const it of parsed.items) {
            await mn.kv.set(`item:${it.id}`, it);
          }
        }
        if (parsed.households && Array.isArray(parsed.households)) {
          await mn.kv.set('households:list', parsed.households);
        }
        await loadAllData(mn);
        showToast('Sicherung erfolgreich wiederhergestellt');
      } catch (err) {
        showToast('Ungültige Sicherungsdatei');
      }
    };
    reader.readAsText(file);
  };

  // CSV Import (Semicolon or Comma separated)
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !mn) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) return;

        const sep = lines[0].includes(';') ? ';' : ',';
        let importedCount = 0;

        for (let idx = 1; idx < lines.length; idx++) {
          const cols = lines[idx].split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
          if (cols.length >= 2 && cols[1]) {
            const id = cols[0] || crypto.randomUUID();
            const newItem: InventoryItem = {
              id,
              name: cols[1],
              category: cols[2] || 'Sonstiges',
              room: cols[3] || 'Wohnzimmer',
              purchasePriceCents: parseToCents(cols[4] || '0'),
              purchaseDate: cols[5] || new Date().toISOString().split('T')[0],
              warrantyMonths: 24,
              warrantyExpiry: cols[6] || recalculateExpiry(cols[5] || '', 24),
              whereApplies: cols[7] || 'Herstellergarantie',
              ownerName: cols[8] || 'Ich',
              householdId: settings.activeHouseholdId,
              serialNumber: cols[9] || undefined,
              notes: cols[10] || undefined,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await mn.kv.set(`item:${id}`, newItem);
            importedCount++;
          }
        }

        await loadAllData(mn);
        showToast(`${importedCount} Gegenstände importiert`);
      } catch (err) {
        showToast('Fehler beim CSV-Import');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="mn-app min-h-screen flex flex-col">
      {/* 1. App Shell Side Navigation (from 960px) & Bottom Tabs (Phones) */}
      <nav className="mn-nav" aria-label="Bereiche">
        <div className="mn-brand">
          <a className="mn-home" href="https://mininode.app">
            ← Alle Apps
          </a>
          <span className="mn-brand-name">
            <span className="mn-brand-mark">
              <ShieldCheck />
            </span>
            Haushaltsinventar
          </span>
          <button className="mn-btn mn-btn--primary" type="button" onClick={openNewItem}>
            <Plus className="w-4 h-4" />
            Gegenstand erfassen
          </button>
        </div>

        <div className="mn-tabs">
          <button
            className="mn-tab"
            type="button"
            aria-current={activeTab === 'start' ? 'page' : undefined}
            onClick={() => setActiveTab('start')}
          >
            <Home className="w-5 h-5" />
            <span>Start</span>
          </button>

          <button
            className="mn-tab"
            type="button"
            aria-current={activeTab === 'inventar' ? 'page' : undefined}
            onClick={() => setActiveTab('inventar')}
          >
            <Folder className="w-5 h-5" />
            <span>Inventar</span>
          </button>

          <button
            className="mn-tab"
            type="button"
            aria-current={activeTab === 'statistik' ? 'page' : undefined}
            onClick={() => setActiveTab('statistik')}
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span>Statistik</span>
          </button>

          <button
            className="mn-tab"
            type="button"
            aria-current={activeTab === 'einstellungen' ? 'page' : undefined}
            onClick={() => setActiveTab('einstellungen')}
          >
            <SettingsIcon className="w-5 h-5" />
            <span>Einstellungen</span>
          </button>
        </div>
      </nav>

      {/* 2. Main Page Layout */}
      <div className="mn-page flex-1">
        {/* Top Header */}
        <header className="mn-top">
          <div className="mn-top-inner">
            <div className="mn-top-text">
              <a className="mn-home" href="https://mininode.app">
                ← Alle Apps
              </a>
              <h1>
                {activeTab === 'start' && 'Übersicht'}
                {activeTab === 'inventar' && 'Haushaltsinventar'}
                {activeTab === 'statistik' && 'Inventar-Statistik'}
                {activeTab === 'einstellungen' && 'Einstellungen'}
              </h1>
              <p className="mn-sub">
                {activeTab === 'start' &&
                  `${activeItems.length} Gegenstände im Haushalt · ${currentHousehold.name}`}
                {activeTab === 'inventar' &&
                  `${displayedItems.length} Treffer · Gesamtwert ${formatCurrency(totalValueCents)}`}
                {activeTab === 'statistik' &&
                  `Versicherungslimit: ${formatCurrency(settings.insuranceLimitEur * 100)}`}
                {activeTab === 'einstellungen' &&
                  `${households.length} Haushalte · ${currentHousehold.members.length} Mitglieder`}
              </p>
            </div>

            <div className="mn-top-tools">
              {/* Household Switcher Pill */}
              <button
                type="button"
                className="mn-chip mn-chip--plain cursor-pointer"
                onClick={() => setSheetMode('households')}
                title="Haushalt wechseln"
              >
                <Home className="w-3.5 h-3.5 text-accent" />
                <span>{currentHousehold.name}</span>
                <span className="text-[11px] opacity-75">({currentHousehold.members.length})</span>
              </button>

              {/* Print View Tool */}
              <button
                type="button"
                className="mn-icon-btn"
                onClick={() => window.print()}
                title="Drucken / PDF speichern"
                aria-label="Druckansicht öffnen"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Round FAB */}
            <button
              className="mn-fab"
              type="button"
              aria-label="Gegenstand hinzufügen"
              onClick={openNewItem}
            >
              <Plus />
            </button>
          </div>
        </header>

        {/* Offline Notification Banner */}
        {!isOnline && (
          <div className="max-w-[1080px] mx-auto px-4 mb-4">
            <div className="mn-banner mn-banner--warn" role="note">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                Offline-Modus: Neue Einträge werden lokal zwischengespeichert und bei
                Wiederverbindung synchronisiert.
              </span>
            </div>
          </div>
        )}

        {/* Urgent Warranty Alert Banner on Start */}
        {activeTab === 'start' && expiringCount > 0 && (
          <div className="max-w-[1080px] mx-auto px-4 mb-6">
            <div className="mn-banner mn-banner--bad flex justify-between items-center" role="note">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>
                  <strong>Aufmerksamkeit erforderlich:</strong> {expiringCount}{' '}
                  {expiringCount === 1 ? 'Garantie läuft' : 'Garantien laufen'} in den nächsten 30
                  Tagen ab!
                </span>
              </div>
              <button
                className="mn-btn mn-btn--ghost text-xs"
                type="button"
                onClick={() => {
                  setSelectedWarrantyStatus('Läuft bald ab');
                  setActiveTab('inventar');
                }}
              >
                Garantien ansehen →
              </button>
            </div>
          </div>
        )}

        {/* 3. Main Content Views */}
        <main className="mn-main">
          {loading ? (
            <div className="space-y-4">
              <span className="mn-sk" style={{ height: '120px' }}></span>
              <span className="mn-sk" style={{ height: '300px' }}></span>
            </div>
          ) : (
            <>
              {/* VIEW 1: START / ÜBERSICHT */}
              {activeTab === 'start' && (
                <div className="space-y-8">
                  {/* Key Performance Indicators */}
                  <div className="mn-kpis">
                    <div className="mn-kpi">
                      <b>{activeItems.length}</b>
                      <span>Gegenstände erfasst</span>
                    </div>

                    <div className="mn-kpi">
                      <b>{formatCurrency(totalValueCents)}</b>
                      <span>Gesamtwert im Haushalt</span>
                    </div>

                    <div className="mn-kpi">
                      <b>{activeWarrantyCount}</b>
                      <span>Garantien geschützt</span>
                    </div>

                    <div className="mn-kpi">
                      <b className={expiringCount > 0 ? 'text-bad' : 'text-ok'}>{expiringCount}</b>
                      <span>Garantien bald fällig</span>
                    </div>
                  </div>

                  {/* Insurance Coverage Audit Card */}
                  <div className="mn-card">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3>Hausrat-Versicherungsabdeckung</h3>
                        <p className="mn-note">
                          Gesamtwert deines Inventars im Vergleich zur Deckungsgrenze deiner
                          Hausratversicherung.
                        </p>
                      </div>
                      <button
                        className="mn-link text-xs"
                        type="button"
                        onClick={() => setActiveTab('einstellungen')}
                      >
                        Limit anpassen
                      </button>
                    </div>

                    <div className="mn-bar">
                      <div className="mn-bar-top">
                        <b>{formatCurrency(totalValueCents)} erfasst</b>
                        <span>Limit: {formatCurrency(settings.insuranceLimitEur * 100)}</span>
                      </div>
                      <div className="mn-meter">
                        <i
                          style={
                            {
                              '--mn-value': Math.min(
                                100,
                                Math.round(
                                  (totalValueCents / (settings.insuranceLimitEur * 100 || 1)) * 100,
                                ),
                              ),
                            } as React.CSSProperties
                          }
                        />
                      </div>
                    </div>

                    <p className="text-xs text-muted mt-2">
                      {totalValueCents > settings.insuranceLimitEur * 100 ? (
                        <span className="text-bad font-semibold">
                          Achtung: Dein dokumentierter Inventarwert übersteigt deine Deckungsgrenze
                          um {formatCurrency(totalValueCents - settings.insuranceLimitEur * 100)}!
                        </span>
                      ) : (
                        <span className="text-ok font-semibold">
                          Optimal geschützt: Dein Hausrat ist zu{' '}
                          {Math.round(
                            (totalValueCents / (settings.insuranceLimitEur * 100 || 1)) * 100,
                          )}{' '}
                          % der Deckungsgrenze abgesichert.
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Kürzlich hinzugefügte Gegenstände (Thumbnails with name below) */}
                  <div className="space-y-3">
                    <div className="mn-sect">
                      <h2>
                        Kürzlich erfasst
                        <small>{activeItems.length}</small>
                      </h2>
                      <button
                        className="mn-link"
                        type="button"
                        onClick={() => setActiveTab('inventar')}
                      >
                        Alle anzeigen
                      </button>
                    </div>

                    {activeItems.length === 0 ? (
                      <div className="mn-empty">
                        <div className="mn-empty-icon">
                          <Folder />
                        </div>
                        <h3>Noch keine Gegenstände</h3>
                        <p>
                          Dokumentiere dein Haushaltsinventar, lade Kaufbelege hoch und halte
                          Garantien im Blick.
                        </p>
                        <button
                          className="mn-btn mn-btn--primary"
                          type="button"
                          onClick={openNewItem}
                        >
                          Ersten Gegenstand erfassen
                        </button>
                      </div>
                    ) : (
                      <div className="mn-tiles">
                        {activeItems.slice(0, 6).map((item) => {
                          const wInfo = getWarrantyInfo(item.warrantyExpiry);
                          return (
                            <div key={item.id} className="mn-tile-wrap">
                              <button
                                className="mn-tile"
                                type="button"
                                onClick={() => {
                                  setSelectedItem(item);
                                  setSheetMode('detail');
                                }}
                              >
                                <span className="mn-tile-media">
                                  {item.photoUrl ? (
                                    <img src={item.photoUrl} alt={item.name} loading="lazy" />
                                  ) : (
                                    <span className="mn-tile-initials">
                                      {item.name.slice(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                  <span className="mn-tile-badge">
                                    {formatCurrency(item.purchasePriceCents)}
                                  </span>
                                  <span
                                    className={`mn-tile-status ${wInfo.status === 'expiring' ? 'bg-warn' : wInfo.status === 'expired' ? 'bg-bad' : 'bg-ok'}`}
                                  >
                                    {wInfo.status === 'expiring' && <Clock className="w-3 h-3" />}
                                    {wInfo.status === 'active' && (
                                      <CheckCircle2 className="w-3 h-3" />
                                    )}
                                    {wInfo.daysLeft > 0 ? `${wInfo.daysLeft} d` : 'Abgelaufen'}
                                  </span>
                                </span>
                                <span className="mn-tile-cap">
                                  <span className="mn-tile-title">{item.name}</span>
                                  <span className="mn-tile-sub">
                                    {item.room} · {item.ownerName || 'Ich'}
                                  </span>
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* VIEW 2: INVENTAR / SAMMLUNG */}
              {activeTab === 'inventar' && (
                <div className="space-y-6">
                  {/* Search bar with Icon */}
                  <div className="mn-search">
                    <Search />
                    <input
                      type="search"
                      placeholder="Gegenstand, Raum, Beleg oder Besitzer suchen..."
                      aria-label="Inventar durchsuchen"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* Collapsible Tabular Filter Sections: Kategorien, Räume, Besitzer */}
                  <div className="space-y-3">
                    {/* 1. KATEGORIEN (Ausklappbar & Tabellarisch formatiert) */}
                    <div className="mn-card p-0 overflow-hidden border border-line shadow-xs rounded-xl bg-surface">
                      <button
                        type="button"
                        className="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-surface-2/60 transition-colors cursor-pointer"
                        onClick={() => setIsCategoriesOpen(!isCategoriesOpen)}
                        aria-expanded={isCategoriesOpen}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-text flex items-center justify-center shrink-0 border border-accent/20">
                            <Layers className="w-5 h-5 text-accent" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-ink">Kategorien</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                {settings.categories.length}
                              </span>
                            </div>
                            <p className="text-xs text-muted truncate mt-0.5">
                              {selectedCategory === 'Alle'
                                ? `${activeItems.length} Gegenstände dokumentiert · Gesamtwert ${formatCurrency(totalValueCents)}`
                                : `Aktiv gefiltert: ${selectedCategory} (${activeItems.filter((i) => i.category === selectedCategory).length} Gegenstände)`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {selectedCategory !== 'Alle' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink shadow-xs">
                              <span>{selectedCategory}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                className="p-0.5 hover:bg-black/20 rounded-full cursor-pointer transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCategory('Alle');
                                }}
                                title="Kategorie-Filter aufheben"
                              >
                                <X className="w-3 h-3" />
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted font-medium hidden sm:inline-block">
                              Alle anzeigen
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-text px-2 py-1 rounded-md hover:bg-accent-soft/40 transition-colors">
                            <span>{isCategoriesOpen ? 'Schließen' : 'Tabelle öffnen'}</span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${isCategoriesOpen ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </div>
                      </button>

                      {isCategoriesOpen && (
                        <div className="border-t border-line bg-surface p-3 sm:p-4 animate-in fade-in duration-150">
                          <div className="mn-table-wrap">
                            <table className="mn-table">
                              <thead>
                                <tr>
                                  <th>Kategorie</th>
                                  <th className="text-right">Gegenstände</th>
                                  <th className="text-right">Gesamtwert</th>
                                  <th className="text-right">Garantie aktiv</th>
                                  <th className="text-center w-28">Auswahl</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Row: Alle Kategorien */}
                                <tr
                                  className={`cursor-pointer transition-colors ${selectedCategory === 'Alle' ? 'is-selected' : 'hover:bg-surface-2/60'}`}
                                  onClick={() => setSelectedCategory('Alle')}
                                >
                                  <td className="font-semibold flex items-center gap-2.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-accent/30 shrink-0"></span>
                                    <span>Alle Kategorien</span>
                                  </td>
                                  <td className="text-right tabular-nums">
                                    <span className="font-semibold">{activeItems.length}</span>
                                    <span className="text-xs text-muted ml-1.5 font-normal">
                                      (100 %)
                                    </span>
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-semibold text-ink">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td className="text-right tabular-nums font-medium text-ok">
                                    {activeWarrantyCount}
                                  </td>
                                  <td className="text-center">
                                    {selectedCategory === 'Alle' ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink">
                                        <Check className="w-3.5 h-3.5" /> Aktiv
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted hover:text-ink font-medium">
                                        Auswählen
                                      </span>
                                    )}
                                  </td>
                                </tr>

                                {/* Rows for each Category */}
                                {categoriesTableData.map((cat) => {
                                  const isSelected = selectedCategory === cat.name;
                                  return (
                                    <tr
                                      key={cat.name}
                                      className={`cursor-pointer transition-colors ${isSelected ? 'is-selected' : 'hover:bg-surface-2/60'}`}
                                      onClick={() =>
                                        setSelectedCategory(isSelected ? 'Alle' : cat.name)
                                      }
                                    >
                                      <td>
                                        <div className="flex items-center gap-2.5 font-medium">
                                          <div className="w-7 h-7 rounded-md bg-accent-soft/60 text-accent flex items-center justify-center shrink-0">
                                            <Folder className="w-3.5 h-3.5" />
                                          </div>
                                          <span>{cat.name}</span>
                                        </div>
                                      </td>
                                      <td className="text-right tabular-nums">
                                        <span className="font-medium">{cat.count}</span>
                                        <span className="text-xs text-muted ml-1.5 font-normal">
                                          ({cat.itemPercent} %)
                                        </span>
                                      </td>
                                      <td className="text-right tabular-nums font-mono font-medium text-ink">
                                        {formatCurrency(cat.totalCents)}
                                      </td>
                                      <td className="text-right tabular-nums">
                                        {cat.activeWarranties > 0 ? (
                                          <span className="inline-flex items-center gap-1 text-ok font-semibold">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {cat.activeWarranties}
                                          </span>
                                        ) : (
                                          <span className="text-muted">–</span>
                                        )}
                                      </td>
                                      <td className="text-center">
                                        {isSelected ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink shadow-xs">
                                            <Check className="w-3.5 h-3.5" /> Aktiv
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            className="px-2.5 py-0.5 rounded-full text-xs text-muted hover:text-ink hover:bg-surface-2 border border-line transition-colors cursor-pointer"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedCategory(cat.name);
                                            }}
                                          >
                                            Filtern
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td className="font-semibold text-muted text-xs uppercase tracking-wider">
                                    Gesamt
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">
                                    {activeItems.length}
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-bold">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td className="text-right tabular-nums font-semibold text-ok">
                                    {activeWarrantyCount}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. RÄUME & STANDORTE (Eigenes Ausklappen & Tabellarisch formatiert) */}
                    <div className="mn-card p-0 overflow-hidden border border-line shadow-xs rounded-xl bg-surface">
                      <button
                        type="button"
                        className="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-surface-2/60 transition-colors cursor-pointer"
                        onClick={() => setIsRoomsOpen(!isRoomsOpen)}
                        aria-expanded={isRoomsOpen}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-surface-2 text-ink flex items-center justify-center shrink-0 border border-line">
                            <MapPin className="w-5 h-5 text-accent" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-ink">Räume & Standorte</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                {settings.rooms.length}
                              </span>
                            </div>
                            <p className="text-xs text-muted truncate mt-0.5">
                              {selectedRoom === 'Alle'
                                ? `${activeItems.length} Gegenstände in ${settings.rooms.length} Räumen verteilt`
                                : `Aktiv gefiltert: ${selectedRoom} (${activeItems.filter((i) => i.room === selectedRoom).length} Gegenstände)`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {selectedRoom !== 'Alle' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink shadow-xs">
                              <span>{selectedRoom}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                className="p-0.5 hover:bg-black/20 rounded-full cursor-pointer transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRoom('Alle');
                                }}
                                title="Raum-Filter aufheben"
                              >
                                <X className="w-3 h-3" />
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted font-medium hidden sm:inline-block">
                              Alle anzeigen
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-text px-2 py-1 rounded-md hover:bg-accent-soft/40 transition-colors">
                            <span>{isRoomsOpen ? 'Schließen' : 'Tabelle öffnen'}</span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${isRoomsOpen ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </div>
                      </button>

                      {isRoomsOpen && (
                        <div className="border-t border-line bg-surface p-3 sm:p-4 animate-in fade-in duration-150">
                          <div className="mn-table-wrap">
                            <table className="mn-table">
                              <thead>
                                <tr>
                                  <th>Raum / Standort</th>
                                  <th className="text-right">Gegenstände</th>
                                  <th className="text-right">Gesamtwert</th>
                                  <th className="text-right">Garantie aktiv</th>
                                  <th className="text-center w-28">Auswahl</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Row: Alle Räume */}
                                <tr
                                  className={`cursor-pointer transition-colors ${selectedRoom === 'Alle' ? 'is-selected' : 'hover:bg-surface-2/60'}`}
                                  onClick={() => setSelectedRoom('Alle')}
                                >
                                  <td className="font-semibold flex items-center gap-2.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-accent/30 shrink-0"></span>
                                    <span>Alle Räume & Standorte</span>
                                  </td>
                                  <td className="text-right tabular-nums">
                                    <span className="font-semibold">{activeItems.length}</span>
                                    <span className="text-xs text-muted ml-1.5 font-normal">
                                      (100 %)
                                    </span>
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-semibold text-ink">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td className="text-right tabular-nums font-medium text-ok">
                                    {activeWarrantyCount}
                                  </td>
                                  <td className="text-center">
                                    {selectedRoom === 'Alle' ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink">
                                        <Check className="w-3.5 h-3.5" /> Aktiv
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted hover:text-ink font-medium">
                                        Auswählen
                                      </span>
                                    )}
                                  </td>
                                </tr>

                                {/* Rows for each Room */}
                                {roomsTableData.map((room) => {
                                  const isSelected = selectedRoom === room.name;
                                  return (
                                    <tr
                                      key={room.name}
                                      className={`cursor-pointer transition-colors ${isSelected ? 'is-selected' : 'hover:bg-surface-2/60'}`}
                                      onClick={() =>
                                        setSelectedRoom(isSelected ? 'Alle' : room.name)
                                      }
                                    >
                                      <td>
                                        <div className="flex items-center gap-2.5 font-medium">
                                          <div className="w-7 h-7 rounded-md bg-surface-2 text-accent flex items-center justify-center shrink-0 border border-line/60">
                                            <Home className="w-3.5 h-3.5" />
                                          </div>
                                          <span>{room.name}</span>
                                        </div>
                                      </td>
                                      <td className="text-right tabular-nums">
                                        <span className="font-medium">{room.count}</span>
                                        <span className="text-xs text-muted ml-1.5 font-normal">
                                          ({room.itemPercent} %)
                                        </span>
                                      </td>
                                      <td className="text-right tabular-nums font-mono font-medium text-ink">
                                        {formatCurrency(room.totalCents)}
                                      </td>
                                      <td className="text-right tabular-nums">
                                        {room.activeWarranties > 0 ? (
                                          <span className="inline-flex items-center gap-1 text-ok font-semibold">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {room.activeWarranties}
                                          </span>
                                        ) : (
                                          <span className="text-muted">–</span>
                                        )}
                                      </td>
                                      <td className="text-center">
                                        {isSelected ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink shadow-xs">
                                            <Check className="w-3.5 h-3.5" /> Aktiv
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            className="px-2.5 py-0.5 rounded-full text-xs text-muted hover:text-ink hover:bg-surface-2 border border-line transition-colors cursor-pointer"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedRoom(room.name);
                                            }}
                                          >
                                            Filtern
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td className="font-semibold text-muted text-xs uppercase tracking-wider">
                                    Gesamt
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">
                                    {activeItems.length}
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-bold">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td className="text-right tabular-nums font-semibold text-ok">
                                    {activeWarrantyCount}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3. BESITZER & ZUORDNUNG (Eigenes Ausklappen & Tabellarisch formatiert) */}
                    <div className="mn-card p-0 overflow-hidden border border-line shadow-xs rounded-xl bg-surface">
                      <button
                        type="button"
                        className="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-surface-2/60 transition-colors cursor-pointer"
                        onClick={() => setIsOwnersOpen(!isOwnersOpen)}
                        aria-expanded={isOwnersOpen}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-surface-2 text-ink flex items-center justify-center shrink-0 border border-line">
                            <Users className="w-5 h-5 text-accent" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-ink">
                                Besitzer & Zuordnung
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                {availableOwners.length}
                              </span>
                            </div>
                            <p className="text-xs text-muted truncate mt-0.5">
                              {selectedOwnerFilter === 'Alle'
                                ? `${availableOwners.length} Personen · Gegenstände im gesamten Haushalt`
                                : `Aktiv gefiltert: ${selectedOwnerFilter} (${activeItems.filter((i) => (i.ownerName || 'Ich') === selectedOwnerFilter).length} Gegenstände)`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {selectedOwnerFilter !== 'Alle' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink shadow-xs">
                              <span>{selectedOwnerFilter}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                className="p-0.5 hover:bg-black/20 rounded-full cursor-pointer transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOwnerFilter('Alle');
                                }}
                                title="Besitzer-Filter aufheben"
                              >
                                <X className="w-3 h-3" />
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted font-medium hidden sm:inline-block">
                              Alle anzeigen
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-text px-2 py-1 rounded-md hover:bg-accent-soft/40 transition-colors">
                            <span>{isOwnersOpen ? 'Schließen' : 'Tabelle öffnen'}</span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${isOwnersOpen ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </div>
                      </button>

                      {isOwnersOpen && (
                        <div className="border-t border-line bg-surface p-3 sm:p-4 animate-in fade-in duration-150">
                          <div className="mn-table-wrap">
                            <table className="mn-table">
                              <thead>
                                <tr>
                                  <th>Besitzer / Person</th>
                                  <th>Rolle</th>
                                  <th className="text-right">Gegenstände</th>
                                  <th className="text-right">Gesamtwert</th>
                                  <th className="text-center w-28">Auswahl</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Row: Alle Besitzer */}
                                <tr
                                  className={`cursor-pointer transition-colors ${selectedOwnerFilter === 'Alle' ? 'is-selected' : 'hover:bg-surface-2/60'}`}
                                  onClick={() => setSelectedOwnerFilter('Alle')}
                                >
                                  <td className="font-semibold flex items-center gap-2.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-accent/30 shrink-0"></span>
                                    <span>Alle Besitzer (Haushalt gesamt)</span>
                                  </td>
                                  <td>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                      Haushalt
                                    </span>
                                  </td>
                                  <td className="text-right tabular-nums">
                                    <span className="font-semibold">{activeItems.length}</span>
                                    <span className="text-xs text-muted ml-1.5 font-normal">
                                      (100 %)
                                    </span>
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-semibold text-ink">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td className="text-center">
                                    {selectedOwnerFilter === 'Alle' ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink">
                                        <Check className="w-3.5 h-3.5" /> Aktiv
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted hover:text-ink font-medium">
                                        Auswählen
                                      </span>
                                    )}
                                  </td>
                                </tr>

                                {/* Rows for each Owner */}
                                {ownersTableData.map((owner) => {
                                  const isSelected = selectedOwnerFilter === owner.name;
                                  return (
                                    <tr
                                      key={owner.name}
                                      className={`cursor-pointer transition-colors ${isSelected ? 'is-selected' : 'hover:bg-surface-2/60'}`}
                                      onClick={() =>
                                        setSelectedOwnerFilter(isSelected ? 'Alle' : owner.name)
                                      }
                                    >
                                      <td>
                                        <div className="flex items-center gap-2.5 font-medium">
                                          <div className="w-7 h-7 rounded-full bg-accent-soft text-accent-text text-xs font-bold flex items-center justify-center shrink-0 border border-accent/20">
                                            {owner.name.slice(0, 2).toUpperCase()}
                                          </div>
                                          <span>{owner.name}</span>
                                        </div>
                                      </td>
                                      <td>
                                        <span
                                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                            owner.role === 'Admin'
                                              ? 'bg-accent-soft text-accent-text font-semibold border border-accent/30'
                                              : 'bg-surface-2 text-muted border border-line'
                                          }`}
                                        >
                                          {owner.role}
                                        </span>
                                      </td>
                                      <td className="text-right tabular-nums">
                                        <span className="font-medium">{owner.count}</span>
                                        <span className="text-xs text-muted ml-1.5 font-normal">
                                          ({owner.itemPercent} %)
                                        </span>
                                      </td>
                                      <td className="text-right tabular-nums font-mono font-medium text-ink">
                                        {formatCurrency(owner.totalCents)}
                                      </td>
                                      <td className="text-center">
                                        {isSelected ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-accent-ink shadow-xs">
                                            <Check className="w-3.5 h-3.5" /> Aktiv
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            className="px-2.5 py-0.5 rounded-full text-xs text-muted hover:text-ink hover:bg-surface-2 border border-line transition-colors cursor-pointer"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedOwnerFilter(owner.name);
                                            }}
                                          >
                                            Filtern
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td
                                    className="font-semibold text-muted text-xs uppercase tracking-wider"
                                    colSpan={2}
                                  >
                                    Gesamt
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">
                                    {activeItems.length}
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-bold">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4. GARANTIE STATUS SCHNELLFILTER */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted font-semibold shrink-0">Garantie:</span>
                      <div className="mn-chips" role="group" aria-label="Garantie-Status">
                        <button
                          className="mn-filter"
                          type="button"
                          aria-pressed={selectedWarrantyStatus === 'Alle'}
                          onClick={() => setSelectedWarrantyStatus('Alle')}
                        >
                          Alle
                        </button>
                        <button
                          className="mn-filter"
                          type="button"
                          aria-pressed={selectedWarrantyStatus === 'Aktiv'}
                          onClick={() => setSelectedWarrantyStatus('Aktiv')}
                        >
                          Aktiv ({activeWarrantyCount})
                        </button>
                        <button
                          className="mn-filter"
                          type="button"
                          aria-pressed={selectedWarrantyStatus === 'Läuft bald ab'}
                          onClick={() => setSelectedWarrantyStatus('Läuft bald ab')}
                        >
                          Läuft bald ab ({expiringCount})
                        </button>
                        <button
                          className="mn-filter"
                          type="button"
                          aria-pressed={selectedWarrantyStatus === 'Abgelaufen'}
                          onClick={() => setSelectedWarrantyStatus('Abgelaufen')}
                        >
                          Abgelaufen
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* List Controls: Count, Reset, View Switcher & Sorter */}
                  <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-line">
                    <div className="text-sm font-semibold text-muted">
                      {displayedItems.length}{' '}
                      {displayedItems.length === 1 ? 'Gegenstand' : 'Gegenstände'}
                      {(selectedCategory !== 'Alle' ||
                        selectedRoom !== 'Alle' ||
                        selectedWarrantyStatus !== 'Alle' ||
                        selectedOwnerFilter !== 'Alle' ||
                        searchQuery) && (
                        <button
                          className="ml-3 text-xs text-accent underline cursor-pointer"
                          type="button"
                          onClick={() => {
                            setSelectedCategory('Alle');
                            setSelectedRoom('Alle');
                            setSelectedWarrantyStatus('Alle');
                            setSelectedOwnerFilter('Alle');
                            setSearchQuery('');
                          }}
                        >
                          Filter zurücksetzen
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Sort option */}
                      <select
                        className="text-xs py-1.5 px-2.5 rounded-lg border border-line-strong bg-surface text-ink cursor-pointer"
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value as any)}
                        aria-label="Sortierung"
                      >
                        <option value="newest">Neueste zuerst</option>
                        <option value="name">Name (A–Z)</option>
                        <option value="warranty">Garantie-Ablauf</option>
                        <option value="priceDesc">Wert absteigend</option>
                      </select>

                      {/* Segmented Layout View Switcher */}
                      <div className="mn-seg mn-seg--icons" role="group" aria-label="Ansicht">
                        <button
                          type="button"
                          aria-pressed={viewLayout === 'tiles'}
                          onClick={() => setViewLayout('tiles')}
                          title="Kachel-Ansicht"
                        >
                          <LayoutGrid />
                        </button>
                        <button
                          type="button"
                          aria-pressed={viewLayout === 'list'}
                          onClick={() => setViewLayout('list')}
                          title="Listen-Ansicht"
                        >
                          <ListIcon />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Render Items: Tiles or List */}
                  {displayedItems.length === 0 ? (
                    <div className="mn-empty">
                      <div className="mn-empty-icon">
                        <Search />
                      </div>
                      <h3>Nichts gefunden</h3>
                      <p>Für deine Such- und Filterkriterien wurden keine Gegenstände gefunden.</p>
                      <button
                        className="mn-btn mn-btn--ghost"
                        type="button"
                        onClick={() => {
                          setSelectedCategory('Alle');
                          setSelectedRoom('Alle');
                          setSelectedWarrantyStatus('Alle');
                          setSelectedOwnerFilter('Alle');
                          setSearchQuery('');
                        }}
                      >
                        Filter löschen
                      </button>
                    </div>
                  ) : viewLayout === 'tiles' ? (
                    /* Visual Tiles: Picture as Thumbnail with Name below */
                    <div className="mn-tiles">
                      {displayedItems.map((item) => {
                        const wInfo = getWarrantyInfo(item.warrantyExpiry);
                        return (
                          <div key={item.id} className="mn-tile-wrap">
                            <button
                              className="mn-tile"
                              type="button"
                              onClick={() => {
                                setSelectedItem(item);
                                setSheetMode('detail');
                              }}
                            >
                              <span className="mn-tile-media">
                                {item.photoUrl ? (
                                  <img src={item.photoUrl} alt={item.name} loading="lazy" />
                                ) : (
                                  <span className="mn-tile-initials">
                                    {item.name.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                                <span className="mn-tile-badge">
                                  {formatCurrency(item.purchasePriceCents)}
                                </span>
                                <span
                                  className={`mn-tile-status ${wInfo.status === 'expiring' ? 'bg-warn' : wInfo.status === 'expired' ? 'bg-bad' : 'bg-ok'}`}
                                >
                                  {wInfo.status === 'expiring' && <Clock className="w-3 h-3" />}
                                  {wInfo.status === 'active' && (
                                    <CheckCircle2 className="w-3 h-3" />
                                  )}
                                  {wInfo.daysLeft > 0 ? `${wInfo.daysLeft} d` : 'Abgelaufen'}
                                </span>
                              </span>
                              <span className="mn-tile-cap">
                                <span className="mn-tile-title">{item.name}</span>
                                <span className="mn-tile-sub">
                                  {item.room} · {item.ownerName || 'Ich'}
                                </span>
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Detailed Rows List */
                    <div className="mn-list">
                      {displayedItems.map((item) => {
                        const wInfo = getWarrantyInfo(item.warrantyExpiry);
                        return (
                          <button
                            key={item.id}
                            className="mn-row"
                            type="button"
                            onClick={() => {
                              setSelectedItem(item);
                              setSheetMode('detail');
                            }}
                          >
                            <span className="mn-thumb">
                              {item.photoUrl ? (
                                <img
                                  src={item.photoUrl}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                item.name.slice(0, 2).toUpperCase()
                              )}
                            </span>
                            <span>
                              <span className="mn-row-title">{item.name}</span>
                              <span className="mn-row-sub">
                                {item.category} · {item.room} · Besitzer: {item.ownerName || 'Ich'}
                              </span>
                            </span>
                            <span className="mn-row-side">
                              <b>{formatCurrency(item.purchasePriceCents)}</b>
                              <span
                                className={
                                  wInfo.status === 'expiring'
                                    ? 'text-warn'
                                    : wInfo.status === 'expired'
                                      ? 'text-bad'
                                      : 'text-ok'
                                }
                              >
                                {wInfo.daysLeft > 0 ? `Noch ${wInfo.daysLeft} Tage` : 'Abgelaufen'}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 3: STATISTIK & ANALYSE */}
              {activeTab === 'statistik' && (
                <div className="space-y-8">
                  {/* Summary KPIs */}
                  <div className="mn-kpis">
                    <div className="mn-kpi">
                      <b>{formatCurrency(totalValueCents)}</b>
                      <span>Gesamter Hausratwert</span>
                    </div>
                    <div className="mn-kpi">
                      <b>{activeItems.length}</b>
                      <span>Gegenstände dokumentiert</span>
                    </div>
                    <div className="mn-kpi">
                      <b>{formatCurrency(settings.insuranceLimitEur * 100)}</b>
                      <span>Versicherungssumme</span>
                    </div>
                    <div className="mn-kpi">
                      <b>
                        {Math.round(
                          (totalValueCents / (settings.insuranceLimitEur * 100 || 1)) * 100,
                        )}{' '}
                        %
                      </b>
                      <span>Deckungsgrad</span>
                    </div>
                  </div>

                  {/* Tabellarische Auswertungen mit eigenem Ausklappen für Kategorien, Räume und Besitzer */}
                  <div className="space-y-4">
                    {/* 1. KATEGORIEN-TABELLE (Ausklappbar) */}
                    <div className="mn-card p-0 overflow-hidden border border-line shadow-xs rounded-xl bg-surface">
                      <button
                        type="button"
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-2/60 transition-colors cursor-pointer"
                        onClick={() => setStatCategoriesOpen(!statCategoriesOpen)}
                        aria-expanded={statCategoriesOpen}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0 border border-accent/20">
                            <Layers className="w-5 h-5 text-accent" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="m-0 text-base font-bold text-ink">
                                Vermögensverteilung nach Kategorien
                              </h3>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                {settings.categories.length} Kategorien
                              </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              Tabellarische Aufstellung deines Hausrats zur Vorlage bei
                              Versicherungen und Nachweisen.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-text px-2 py-1 rounded-md hover:bg-accent-soft/40 transition-colors">
                            <span>
                              {statCategoriesOpen ? 'Tabelle schließen' : 'Tabelle öffnen'}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${statCategoriesOpen ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </div>
                      </button>

                      {statCategoriesOpen && (
                        <div className="border-t border-line bg-surface p-3 sm:p-4 animate-in fade-in duration-150">
                          <div className="mn-table-wrap">
                            <table className="mn-table">
                              <thead>
                                <tr>
                                  <th>Kategorie</th>
                                  <th className="text-right">Gegenstände</th>
                                  <th className="text-right">Gesamtwert</th>
                                  <th className="w-48 text-right">Anteil am Hausrat</th>
                                  <th className="text-right">Garantien</th>
                                  <th className="text-center w-28">Inventar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {categoriesTableData.map((cat) => (
                                  <tr
                                    key={cat.name}
                                    className="hover:bg-surface-2/60 transition-colors"
                                  >
                                    <td>
                                      <div className="flex items-center gap-2.5 font-medium">
                                        <div className="w-7 h-7 rounded-md bg-accent-soft/60 text-accent flex items-center justify-center shrink-0">
                                          <Folder className="w-3.5 h-3.5" />
                                        </div>
                                        <span>{cat.name}</span>
                                      </div>
                                    </td>
                                    <td className="text-right tabular-nums">
                                      <span className="font-semibold">{cat.count}</span>
                                      <span className="text-xs text-muted ml-1.5 font-normal">
                                        ({cat.itemPercent} %)
                                      </span>
                                    </td>
                                    <td className="text-right tabular-nums font-mono font-semibold text-ink">
                                      {formatCurrency(cat.totalCents)}
                                    </td>
                                    <td className="text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <div className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden border border-line">
                                          <div
                                            className="h-full bg-accent rounded-full"
                                            style={{ width: `${Math.min(100, cat.percent)}%` }}
                                          />
                                        </div>
                                        <span className="text-xs font-semibold tabular-nums w-10 text-right">
                                          {cat.percent} %
                                        </span>
                                      </div>
                                    </td>
                                    <td className="text-right tabular-nums">
                                      {cat.activeWarranties > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-ok font-semibold">
                                          <CheckCircle2 className="w-3 h-3" />{' '}
                                          {cat.activeWarranties} aktiv
                                        </span>
                                      ) : (
                                        <span className="text-muted">–</span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      <button
                                        type="button"
                                        className="px-2.5 py-1 rounded-full text-xs text-muted hover:text-ink hover:bg-surface-2 border border-line transition-colors cursor-pointer"
                                        onClick={() => {
                                          setSelectedCategory(cat.name);
                                          setSelectedRoom('Alle');
                                          setSelectedOwnerFilter('Alle');
                                          setActiveTab('inventar');
                                        }}
                                        title="Im Inventar filtern"
                                      >
                                        Anzeigen
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td className="font-semibold text-muted text-xs uppercase tracking-wider">
                                    Gesamt
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">
                                    {activeItems.length}
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-bold">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">100 %</td>
                                  <td className="text-right tabular-nums font-semibold text-ok">
                                    {activeWarrantyCount} aktiv
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. RÄUME-TABELLE (Eigenes Ausklappen) */}
                    <div className="mn-card p-0 overflow-hidden border border-line shadow-xs rounded-xl bg-surface">
                      <button
                        type="button"
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-2/60 transition-colors cursor-pointer"
                        onClick={() => setStatRoomsOpen(!statRoomsOpen)}
                        aria-expanded={statRoomsOpen}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-surface-2 text-ink flex items-center justify-center shrink-0 border border-line">
                            <MapPin className="w-5 h-5 text-accent" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="m-0 text-base font-bold text-ink">
                                Vermögensverteilung nach Räumen & Standorten
                              </h3>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                {settings.rooms.length} Räume
                              </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              Wo befindet sich dein Hausrat? Übersicht aller Werte und Gegenstände
                              je Standort.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-text px-2 py-1 rounded-md hover:bg-accent-soft/40 transition-colors">
                            <span>{statRoomsOpen ? 'Tabelle schließen' : 'Tabelle öffnen'}</span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${statRoomsOpen ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </div>
                      </button>

                      {statRoomsOpen && (
                        <div className="border-t border-line bg-surface p-3 sm:p-4 animate-in fade-in duration-150">
                          <div className="mn-table-wrap">
                            <table className="mn-table">
                              <thead>
                                <tr>
                                  <th>Raum / Standort</th>
                                  <th className="text-right">Gegenstände</th>
                                  <th className="text-right">Gesamtwert</th>
                                  <th className="w-48 text-right">Anteil am Hausrat</th>
                                  <th className="text-right">Garantien</th>
                                  <th className="text-center w-28">Inventar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {roomsTableData.map((room) => (
                                  <tr
                                    key={room.name}
                                    className="hover:bg-surface-2/60 transition-colors"
                                  >
                                    <td>
                                      <div className="flex items-center gap-2.5 font-medium">
                                        <div className="w-7 h-7 rounded-md bg-surface-2 text-accent flex items-center justify-center shrink-0 border border-line/60">
                                          <Home className="w-3.5 h-3.5" />
                                        </div>
                                        <span>{room.name}</span>
                                      </div>
                                    </td>
                                    <td className="text-right tabular-nums">
                                      <span className="font-semibold">{room.count}</span>
                                      <span className="text-xs text-muted ml-1.5 font-normal">
                                        ({room.itemPercent} %)
                                      </span>
                                    </td>
                                    <td className="text-right tabular-nums font-mono font-semibold text-ink">
                                      {formatCurrency(room.totalCents)}
                                    </td>
                                    <td className="text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <div className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden border border-line">
                                          <div
                                            className="h-full bg-accent rounded-full"
                                            style={{ width: `${Math.min(100, room.percent)}%` }}
                                          />
                                        </div>
                                        <span className="text-xs font-semibold tabular-nums w-10 text-right">
                                          {room.percent} %
                                        </span>
                                      </div>
                                    </td>
                                    <td className="text-right tabular-nums">
                                      {room.activeWarranties > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-ok font-semibold">
                                          <CheckCircle2 className="w-3 h-3" />{' '}
                                          {room.activeWarranties} aktiv
                                        </span>
                                      ) : (
                                        <span className="text-muted">–</span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      <button
                                        type="button"
                                        className="px-2.5 py-1 rounded-full text-xs text-muted hover:text-ink hover:bg-surface-2 border border-line transition-colors cursor-pointer"
                                        onClick={() => {
                                          setSelectedRoom(room.name);
                                          setSelectedCategory('Alle');
                                          setSelectedOwnerFilter('Alle');
                                          setActiveTab('inventar');
                                        }}
                                        title="Im Inventar filtern"
                                      >
                                        Anzeigen
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td className="font-semibold text-muted text-xs uppercase tracking-wider">
                                    Gesamt
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">
                                    {activeItems.length}
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-bold">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">100 %</td>
                                  <td className="text-right tabular-nums font-semibold text-ok">
                                    {activeWarrantyCount} aktiv
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3. BESITZER-TABELLE (Eigenes Ausklappen) */}
                    <div className="mn-card p-0 overflow-hidden border border-line shadow-xs rounded-xl bg-surface">
                      <button
                        type="button"
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-2/60 transition-colors cursor-pointer"
                        onClick={() => setStatOwnersOpen(!statOwnersOpen)}
                        aria-expanded={statOwnersOpen}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-surface-2 text-ink flex items-center justify-center shrink-0 border border-line">
                            <Users className="w-5 h-5 text-accent" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="m-0 text-base font-bold text-ink">
                                Vermögensverteilung nach Besitzern & Zuordnung
                              </h3>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                {availableOwners.length} Personen
                              </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              Zuordnung der Haushaltswerte auf einzelne Bewohner, Familienmitglieder
                              oder Mitbewohner.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-text px-2 py-1 rounded-md hover:bg-accent-soft/40 transition-colors">
                            <span>{statOwnersOpen ? 'Tabelle schließen' : 'Tabelle öffnen'}</span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${statOwnersOpen ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </div>
                      </button>

                      {statOwnersOpen && (
                        <div className="border-t border-line bg-surface p-3 sm:p-4 animate-in fade-in duration-150">
                          <div className="mn-table-wrap">
                            <table className="mn-table">
                              <thead>
                                <tr>
                                  <th>Person / Besitzer</th>
                                  <th>Rolle</th>
                                  <th className="text-right">Gegenstände</th>
                                  <th className="text-right">Gesamtwert</th>
                                  <th className="w-48 text-right">Anteil am Hausrat</th>
                                  <th className="text-center w-28">Inventar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ownersTableData.map((owner) => (
                                  <tr
                                    key={owner.name}
                                    className="hover:bg-surface-2/60 transition-colors"
                                  >
                                    <td>
                                      <div className="flex items-center gap-2.5 font-medium">
                                        <div className="w-7 h-7 rounded-full bg-accent-soft text-accent-text text-xs font-bold flex items-center justify-center shrink-0 border border-accent/20">
                                          {owner.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <span>{owner.name}</span>
                                      </div>
                                    </td>
                                    <td>
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                          owner.role === 'Admin'
                                            ? 'bg-accent-soft text-accent-text font-semibold border border-accent/30'
                                            : 'bg-surface-2 text-muted border border-line'
                                        }`}
                                      >
                                        {owner.role}
                                      </span>
                                    </td>
                                    <td className="text-right tabular-nums">
                                      <span className="font-semibold">{owner.count}</span>
                                      <span className="text-xs text-muted ml-1.5 font-normal">
                                        ({owner.itemPercent} %)
                                      </span>
                                    </td>
                                    <td className="text-right tabular-nums font-mono font-semibold text-ink">
                                      {formatCurrency(owner.totalCents)}
                                    </td>
                                    <td className="text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <div className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden border border-line">
                                          <div
                                            className="h-full bg-accent rounded-full"
                                            style={{ width: `${Math.min(100, owner.percent)}%` }}
                                          />
                                        </div>
                                        <span className="text-xs font-semibold tabular-nums w-10 text-right">
                                          {owner.percent} %
                                        </span>
                                      </div>
                                    </td>
                                    <td className="text-center">
                                      <button
                                        type="button"
                                        className="px-2.5 py-1 rounded-full text-xs text-muted hover:text-ink hover:bg-surface-2 border border-line transition-colors cursor-pointer"
                                        onClick={() => {
                                          setSelectedOwnerFilter(owner.name);
                                          setSelectedCategory('Alle');
                                          setSelectedRoom('Alle');
                                          setActiveTab('inventar');
                                        }}
                                        title="Im Inventar filtern"
                                      >
                                        Anzeigen
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td
                                    className="font-semibold text-muted text-xs uppercase tracking-wider"
                                    colSpan={2}
                                  >
                                    Gesamt
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">
                                    {activeItems.length}
                                  </td>
                                  <td className="text-right tabular-nums font-mono font-bold">
                                    {formatCurrency(totalValueCents)}
                                  </td>
                                  <td className="text-right tabular-nums font-semibold">100 %</td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Export & Print actions */}
                  <div className="mn-card flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <h3>Inventarliste drucken oder exportieren</h3>
                      <p className="mn-note">
                        Erstelle einen übersichtlichen Nachweis für deine Unterlagen oder
                        Versicherung im Schadensfall.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="mn-btn mn-btn--primary"
                        type="button"
                        onClick={() => window.print()}
                      >
                        <Printer className="w-4 h-4" />
                        Drucken / PDF
                      </button>

                      <button
                        className="mn-btn"
                        type="button"
                        onClick={() => exportToCsv(activeItems)}
                      >
                        <Download className="w-4 h-4" />
                        CSV Exportieren
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 4: EINSTELLUNGEN & HAUSHALTE */}
              {activeTab === 'einstellungen' && (
                <div className="space-y-6">
                  {/* Haushalte & Mitglieder Card */}
                  <div className="mn-card space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3>Haushalte & Mitglieder</h3>
                        <p className="mn-note">
                          Verwalte deine Haushalte (z. B. Hauptwohnung, Ferienhaus) und gib weiteren
                          MiniNode-Benutzern Zugriff.
                        </p>
                      </div>
                      <button
                        className="mn-btn mn-btn--ghost text-xs"
                        type="button"
                        onClick={() => setSheetMode('households')}
                      >
                        Haushalte verwalten →
                      </button>
                    </div>

                    <div className="p-3 bg-surface-2 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Home className="w-5 h-5 text-accent" />
                        <div>
                          <p className="font-bold text-sm text-ink">{currentHousehold.name}</p>
                          <p className="text-xs text-muted">
                            {currentHousehold.members.length} Mitglieder
                          </p>
                        </div>
                      </div>
                      <span className="mn-chip mn-chip--ok">Aktiver Haushalt</span>
                    </div>
                  </div>

                  {/* Versicherungslimit Card */}
                  <div className="mn-card space-y-3">
                    <h3>Hausrat-Versicherungssumme</h3>
                    <p className="mn-note">
                      Trage hier die vereinbarte Deckungssumme deiner Hausratversicherung in Euro
                      ein.
                    </p>

                    <div className="flex gap-2 max-w-sm">
                      <input
                        type="number"
                        min="1000"
                        step="1000"
                        value={settings.insuranceLimitEur}
                        onChange={async (e) => {
                          const val = parseInt(e.target.value) || 0;
                          const upd = { ...settings, insuranceLimitEur: val };
                          setSettings(upd);
                          if (mn) await mn.kv.set('settings', upd);
                        }}
                        className="text-base"
                      />
                      <span className="flex items-center px-3 font-bold text-muted bg-surface-2 rounded-lg">
                        €
                      </span>
                    </div>
                  </div>

                  {/* Papierkorb Card */}
                  <div className="mn-card flex justify-between items-center">
                    <div>
                      <h3>Papierkorb</h3>
                      <p className="mn-note">
                        {trashItems.length === 0
                          ? 'Keine gelöschten Gegenstände.'
                          : `${trashItems.length} Gegenstände im Papierkorb.`}
                      </p>
                    </div>
                    <button className="mn-btn" type="button" onClick={() => setSheetMode('trash')}>
                      <Trash2 className="w-4 h-4" />
                      Papierkorb öffnen ({trashItems.length})
                    </button>
                  </div>

                  {/* Datensicherung & CSV Import/Export Card */}
                  <div className="mn-card space-y-4">
                    <h3>Datensicherung & Import</h3>
                    <p className="mn-note">
                      Sichere deine Daten als JSON-Datei oder importiere bestehende Bestände per
                      CSV.
                    </p>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        className="mn-btn"
                        type="button"
                        onClick={() => exportToJson({ items, households, settings })}
                      >
                        <Download className="w-4 h-4" />
                        JSON-Sicherung exportieren
                      </button>

                      <button
                        className="mn-btn"
                        type="button"
                        onClick={() => jsonImportInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4" />
                        Sicherung importieren
                      </button>
                      <input
                        ref={jsonImportInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportJson}
                      />

                      <button
                        className="mn-btn"
                        type="button"
                        onClick={() => csvImportInputRef.current?.click()}
                      >
                        <FileText className="w-4 h-4" />
                        CSV-Tabelle importieren
                      </button>
                      <input
                        ref={csvImportInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleImportCsv}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* 4. MODALS & SHEETS */}

      {/* A. ADD / EDIT ITEM SHEET */}
      {(sheetMode === 'add' || sheetMode === 'edit') && (
        <div className="mn-overlay" onClick={() => setSheetMode('none')}>
          <div className="mn-sheet mn-sheet--tall" onClick={(e) => e.stopPropagation()}>
            <div className="mn-sheet-bar">
              <button
                className="mn-btn mn-btn--ghost"
                type="button"
                onClick={() => setSheetMode('none')}
              >
                Abbrechen
              </button>
              <h2>{sheetMode === 'add' ? 'Gegenstand erfassen' : 'Gegenstand bearbeiten'}</h2>
              <span></span>
            </div>

            <form onSubmit={handleSaveItem} className="mn-form mn-sheet-body">
              {formError && (
                <div className="mn-banner mn-banner--bad">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <fieldset>
                <legend>Allgemeine Angaben</legend>

                <label className="mn-field">
                  Name des Gegenstands (Pflicht)
                  <input
                    type="text"
                    required
                    placeholder="z. B. Samsung Kühlschrank, M1 MacBook Pro, Dyson Staubsauger"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </label>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Kategorie
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                      {settings.categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mn-field">
                    Raum / Standort
                    <select value={formRoom} onChange={(e) => setFormRoom(e.target.value)}>
                      {settings.rooms.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Kaufpreis (€)
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="z. B. 899,00"
                      value={formPriceInput}
                      onChange={(e) => setFormPriceInput(e.target.value)}
                    />
                  </label>

                  <label className="mn-field">
                    Kaufdatum
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => {
                        setFormDate(e.target.value);
                        setFormWarrantyExpiry(
                          recalculateExpiry(e.target.value, formWarrantyMonths),
                        );
                      }}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Garantie & Geltungsbereich</legend>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Garantiedauer (Monate)
                    <input
                      type="number"
                      min="0"
                      value={formWarrantyMonths}
                      onChange={(e) => {
                        const m = parseInt(e.target.value) || 0;
                        setFormWarrantyMonths(m);
                        setFormWarrantyExpiry(recalculateExpiry(formDate, m));
                      }}
                    />
                  </label>

                  <label className="mn-field">
                    Garantie-Ablaufdatum
                    <input
                      type="date"
                      value={formWarrantyExpiry}
                      onChange={(e) => setFormWarrantyExpiry(e.target.value)}
                    />
                  </label>
                </div>

                <label className="mn-field">
                  Geltungsbereich der Garantie
                  <input
                    type="text"
                    placeholder="z. B. Herstellergarantie Deutschland, MediaMarkt PlusSchutz, AppleCare+ weltweit"
                    value={formWhereApplies}
                    onChange={(e) => setFormWhereApplies(e.target.value)}
                  />
                  <p className="mn-hint">
                    Wo und wie gilt deine Garantie? z. B. Beleg bei Händler vorlegen oder
                    Hersteller-Kundendienst kontaktieren.
                  </p>
                </label>
              </fieldset>

              <fieldset>
                <legend>Haushalt & Besitzer</legend>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Haushalt
                    <select
                      value={formHouseholdId}
                      onChange={(e) => setFormHouseholdId(e.target.value)}
                    >
                      {households.map((hh) => (
                        <option key={hh.id} value={hh.id}>
                          {hh.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mn-field">
                    Besitzer (Nutzer oder Name)
                    <input
                      type="text"
                      list="membersList"
                      placeholder="z. B. Ich, Max, Anna"
                      value={formOwnerName}
                      onChange={(e) => setFormOwnerName(e.target.value)}
                    />
                    <datalist id="membersList">
                      {currentHousehold.members.map((m) => (
                        <option key={m.id} value={m.name} />
                      ))}
                    </datalist>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Foto & Kaufbeleg digitalisieren</legend>

                <div className="mn-grid-2">
                  {/* Photo of item */}
                  <div className="space-y-2">
                    <span className="font-semibold text-sm text-muted">
                      Vorschaubild des Gegenstands
                    </span>
                    {formPhotoPreview ? (
                      <div className="relative aspect-4/3 rounded-xl overflow-hidden border border-line">
                        <img
                          src={formPhotoPreview}
                          alt="Vorschau"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          className="absolute top-2 right-2 bg-bad text-white p-1 rounded-full text-xs"
                          onClick={() => {
                            setFormPhotoFile(null);
                            setFormPhotoPreview('');
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="w-full aspect-4/3 border-2 border-dashed border-line-strong rounded-xl flex flex-col items-center justify-center p-3 text-muted hover:border-accent hover:text-accent transition-colors"
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <Camera className="w-6 h-6 mb-1" />
                        <span className="text-xs font-semibold">Foto aufnehmen / hochladen</span>
                      </button>
                    )}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                  </div>

                  {/* Receipt / Invoice */}
                  <div className="space-y-2">
                    <span className="font-semibold text-sm text-muted">Kaufbeleg / Rechnung</span>
                    {formReceiptPreview ? (
                      <div className="relative aspect-4/3 rounded-xl overflow-hidden border border-line bg-surface-2 flex items-center justify-center">
                        <FileText className="w-8 h-8 text-accent mb-1" />
                        <span className="text-xs font-bold text-ink absolute bottom-2 px-2 text-center truncate max-w-full">
                          {formReceiptFile?.name || 'Kaufbeleg hinterlegt'}
                        </span>
                        <button
                          type="button"
                          className="absolute top-2 right-2 bg-bad text-white p-1 rounded-full text-xs"
                          onClick={() => {
                            setFormReceiptFile(null);
                            setFormReceiptPreview('');
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="w-full aspect-4/3 border-2 border-dashed border-line-strong rounded-xl flex flex-col items-center justify-center p-3 text-muted hover:border-accent hover:text-accent transition-colors"
                        onClick={() => receiptInputRef.current?.click()}
                      >
                        <Upload className="w-6 h-6 mb-1" />
                        <span className="text-xs font-semibold">Beleg / PDF hochladen</span>
                      </button>
                    )}
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      className="hidden"
                      onChange={handleReceiptSelect}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend>Zusatzangaben</legend>

                <div className="flex gap-2 items-center">
                  <label className="mn-field flex-1">
                    Seriennummer
                    <input
                      type="text"
                      placeholder="z. B. S/N SN12345678"
                      value={formSerialNumber}
                      onChange={(e) => setFormSerialNumber(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="mn-btn self-end"
                    onClick={handleScanBarcode}
                    title="Barcode scannen"
                  >
                    <Barcode className="w-4 h-4" />
                    Scan
                  </button>
                </div>

                <label className="mn-field">
                  Notizen & Zubehör
                  <textarea
                    placeholder="Zusätzliche Notizen, Zustand, Garantie-Bedingungen oder Kaufdetails..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </label>
              </fieldset>

              <div className="mn-sheet-foot">
                <button
                  type="button"
                  className="mn-btn mn-btn--ghost"
                  onClick={() => setSheetMode('none')}
                >
                  Abbrechen
                </button>
                <span className="flex-1"></span>
                <button type="submit" disabled={isSubmitting} className="mn-btn mn-btn--primary">
                  {isSubmitting ? 'Wird gespeichert...' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* B. DETAIL SHEET */}
      {sheetMode === 'detail' && selectedItem && (
        <div className="mn-overlay" onClick={() => setSheetMode('none')}>
          <div className="mn-sheet" onClick={(e) => e.stopPropagation()}>
            {/* Top Bar with actions */}
            <div className="mn-sheet-bar">
              <button
                className="mn-btn mn-btn--ghost text-xs"
                type="button"
                onClick={() => setSheetMode('none')}
              >
                Schließen
              </button>
              <h2>{selectedItem.name}</h2>
              <div className="flex items-center gap-1">
                <button
                  className="mn-icon-btn"
                  type="button"
                  title="Gegenstand teilen"
                  onClick={() => handleShareItem(selectedItem)}
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  className="mn-btn text-xs"
                  type="button"
                  onClick={() => openEditItem(selectedItem)}
                >
                  Bearbeiten
                </button>
              </div>
            </div>

            <div className="mn-sheet-body space-y-6">
              {/* Photo Hero Banner */}
              {selectedItem.photoUrl ? (
                <div className="aspect-16/9 rounded-2xl overflow-hidden border border-line bg-surface-2">
                  <img
                    src={selectedItem.photoUrl}
                    alt={selectedItem.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-16/9 rounded-2xl bg-accent-soft flex items-center justify-center font-bold text-3xl text-accent">
                  {selectedItem.name.slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* Title & Status Chips */}
              <div>
                <h2 className="text-2xl font-bold text-ink">{selectedItem.name}</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="mn-chip">{selectedItem.category}</span>
                  <span className="mn-chip mn-chip--plain">{selectedItem.room}</span>
                  {selectedItem.ownerName && (
                    <span className="mn-chip mn-chip--plain">
                      Besitzer: {selectedItem.ownerName}
                    </span>
                  )}
                  {(() => {
                    const info = getWarrantyInfo(selectedItem.warrantyExpiry);
                    return (
                      <span
                        className={`mn-chip ${info.status === 'expiring' ? 'mn-chip--warn' : info.status === 'expired' ? 'mn-chip--bad' : 'mn-chip--ok'}`}
                      >
                        {info.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Fact Sheet dl */}
              <dl className="mn-facts">
                <div>
                  <dt>Kaufpreis</dt>
                  <dd className="font-bold text-lg text-ink">
                    {formatCurrency(selectedItem.purchasePriceCents)}
                  </dd>
                </div>
                <div>
                  <dt>Kaufdatum</dt>
                  <dd>{formatDate(selectedItem.purchaseDate)}</dd>
                </div>
                <div>
                  <dt>Garantie bis</dt>
                  <dd className="font-semibold">{formatDate(selectedItem.warrantyExpiry)}</dd>
                </div>
                <div>
                  <dt>Geltungsbereich</dt>
                  <dd className="font-medium text-accent">
                    {selectedItem.whereApplies || 'Herstellergarantie'}
                  </dd>
                </div>
                <div>
                  <dt>Haushalt</dt>
                  <dd>
                    {households.find((h) => h.id === selectedItem.householdId)?.name ||
                      currentHousehold.name}
                  </dd>
                </div>
                <div>
                  <dt>Besitzer</dt>
                  <dd>{selectedItem.ownerName || 'Ich'}</dd>
                </div>
                {selectedItem.serialNumber && (
                  <div>
                    <dt>Seriennummer</dt>
                    <dd className="font-mono text-sm">{selectedItem.serialNumber}</dd>
                  </div>
                )}
                {selectedItem.notes && (
                  <div>
                    <dt>Notizen</dt>
                    <dd className="whitespace-pre-wrap">{selectedItem.notes}</dd>
                  </div>
                )}
              </dl>

              {/* Kaufbeleg / Digitalisierte Rechnung Section */}
              <div className="mn-card space-y-3">
                <h3 className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent" />
                  Kaufbeleg & Rechnung
                </h3>

                {selectedItem.receiptUrl ? (
                  <div className="p-3 bg-surface-2 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5 truncate">
                      <FileText className="w-5 h-5 text-accent shrink-0" />
                      <span className="text-sm font-semibold text-ink truncate">
                        {selectedItem.receiptName || 'Digitalisierter Beleg'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={selectedItem.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mn-btn text-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Öffnen
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    Noch kein Beleg hinterlegt. Tippe auf „Bearbeiten“, um den Kaufbeleg
                    abzufotografieren oder als PDF hochzuladen.
                  </p>
                )}
              </div>

              {/* Delete action */}
              <div className="pt-4 border-t border-line flex justify-end">
                <button
                  type="button"
                  className="mn-btn mn-btn--danger"
                  onClick={() => handleDeleteItem(selectedItem)}
                >
                  <Trash2 className="w-4 h-4" />
                  In Papierkorb verschieben
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* C. HOUSEHOLD & MEMBERS MANAGEMENT SHEET */}
      {sheetMode === 'households' && (
        <div className="mn-overlay" onClick={() => setSheetMode('none')}>
          <div className="mn-sheet mn-sheet--tall" onClick={(e) => e.stopPropagation()}>
            <div className="mn-sheet-bar">
              <button
                className="mn-btn mn-btn--ghost"
                type="button"
                onClick={() => setSheetMode('none')}
              >
                Fertig
              </button>
              <h2>Haushalte & Mitglieder</h2>
              <span></span>
            </div>

            <div className="mn-sheet-body space-y-6">
              {/* 1. Households List */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider">
                  Deine Haushalte
                </h3>
                <div className="space-y-2">
                  {households.map((hh) => {
                    const isActive = hh.id === settings.activeHouseholdId;
                    const hhCount = items.filter(
                      (i) => !i.deletedAt && (i.householdId || 'hh-main') === hh.id,
                    ).length;
                    return (
                      <div
                        key={hh.id}
                        className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${isActive ? 'border-accent bg-accent-soft/30 shadow-xs' : 'border-line bg-surface'}`}
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={async () => {
                            setSettings((prev) => ({ ...prev, activeHouseholdId: hh.id }));
                            if (mn)
                              await mn.kv.set('settings', {
                                ...settings,
                                activeHouseholdId: hh.id,
                              });
                            showToast(`Haushalt gewechselt: ${hh.name}`);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-base text-ink">{hh.name}</p>
                            {isActive && (
                              <span className="mn-chip mn-chip--ok text-[10px]">Aktiv</span>
                            )}
                          </div>
                          <p className="text-xs text-muted mt-0.5">
                            {hh.members.length} Mitglieder · {hhCount} Gegenstände
                          </p>
                        </div>

                        {households.length > 1 && (
                          <button
                            type="button"
                            className="p-1.5 text-muted hover:text-bad rounded-lg transition-colors cursor-pointer"
                            onClick={() => handleDeleteHousehold(hh.id)}
                            title="Haushalt löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Form: Add New Household */}
                <form onSubmit={handleCreateHousehold} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Neuer Haushalt (z. B. Ferienhaus)..."
                    value={newHhName}
                    onChange={(e) => setNewHhName(e.target.value)}
                    className="text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!newHhName.trim()}
                    className="mn-btn mn-btn--primary text-xs shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    Erstellen
                  </button>
                </form>
              </div>

              {/* 2. Members of active household */}
              <div className="space-y-3 pt-4 border-t border-line">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-muted uppercase tracking-wider">
                    Mitglieder ({currentHousehold.name})
                  </h3>
                  <span className="text-xs text-muted font-semibold">
                    {currentHousehold.members.length} Personen
                  </span>
                </div>

                <div className="space-y-2">
                  {currentHousehold.members.map((member) => (
                    <div
                      key={member.id}
                      className="p-3 bg-surface-2 rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-soft text-accent font-bold text-xs flex items-center justify-center">
                          {member.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-ink">{member.name}</p>
                          <p className="text-[11px] text-muted">
                            Rolle:{' '}
                            {member.role === 'admin'
                              ? 'Admin'
                              : member.role === 'editor'
                                ? 'Bearbeiter'
                                : 'Leser'}
                          </p>
                        </div>
                      </div>

                      {currentHousehold.members.length > 1 && (
                        <button
                          type="button"
                          className="p-1 text-muted hover:text-bad"
                          onClick={() => handleDeleteMember(currentHousehold.id, member.id)}
                          title="Mitglied entfernen"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Form: Add New Member */}
                <div className="p-3 bg-surface border border-line rounded-xl space-y-2 pt-3">
                  <span className="text-xs font-bold text-muted">Neues Mitglied hinzufügen</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Name des Mitglieds..."
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      className="text-xs flex-1"
                    />
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value as any)}
                      className="text-xs w-32"
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Bearbeiter</option>
                      <option value="viewer">Leser</option>
                    </select>
                    <button
                      type="button"
                      disabled={!newMemberName.trim()}
                      className="mn-btn mn-btn--primary text-xs shrink-0"
                      onClick={() => handleAddMember(currentHousehold.id)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Hinzufügen
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* D. TRASH / PAPIERKORB SHEET */}
      {sheetMode === 'trash' && (
        <div className="mn-overlay" onClick={() => setSheetMode('none')}>
          <div className="mn-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mn-sheet-bar">
              <button
                className="mn-btn mn-btn--ghost text-xs"
                type="button"
                onClick={() => setSheetMode('none')}
              >
                Schließen
              </button>
              <h2>Papierkorb</h2>
              <span></span>
            </div>

            <div className="mn-sheet-body space-y-4">
              {trashItems.length === 0 ? (
                <div className="mn-empty">
                  <div className="mn-empty-icon">
                    <Trash2 />
                  </div>
                  <h3>Papierkorb ist leer</h3>
                  <p>Gelöschte Gegenstände werden hier zur Wiederherstellung aufbewahrt.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trashItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-surface-2 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-bold text-sm text-ink">{item.name}</p>
                        <p className="text-xs text-muted">
                          {item.category} · {formatCurrency(item.purchasePriceCents)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          className="mn-btn text-xs"
                          onClick={() => handleRestoreFromTrash(item)}
                          title="Wiederherstellen"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Wiederherstellen
                        </button>

                        <button
                          type="button"
                          className="mn-btn mn-btn--danger text-xs"
                          onClick={() => handlePurgeItem(item)}
                          title="Endgültig löschen"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. TOAST NOTIFICATION WITH UNDO (MiniNode Standard) */}
      {toastMessage && (
        <div className="mn-toast">
          <span>{toastMessage}</span>
          {undoItem && (
            <button type="button" className="mn-toast-action" onClick={handleUndo}>
              Rückgängig
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
