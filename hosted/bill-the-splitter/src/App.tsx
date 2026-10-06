import { AnimatePresence, motion } from 'motion/react';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  INITIAL_ACTIVITIES,
  INITIAL_EXPENSES,
  INITIAL_GROUPS,
  INITIAL_MEMBERS,
  INITIAL_SETTLEMENTS,
} from './initialData';
import {
  avatarFor,
  generateId,
  MiniNodeAPI,
  type MiniNodeUser,
  portalUrl as portalUrlOf,
} from './mininode';
import {
  cleanPayPalHandle,
  formatIban,
  generateBankingQrSvg,
  generateEpcQrDataUrl,
  generatePayPalUrl,
  generateSharePaymentText,
} from './paymentUtils';
import {
  computeDeadlineStatus,
  fileToCompressedBase64,
  generateSampleReceiptUrl,
} from './receiptUtils';
import {
  allocate,
  expenseShares,
  participantsOf,
  fromCents,
  formatMoney,
  parseAmount,
  suggestTransfers,
  type Transfer,
  toCents,
} from './splits';
import { TRANSLATIONS } from './translations';
import type { ActivityLog, Expense, Group, Member, PaymentInfo, Settlement } from './types';
import { calculateGlobalOverview, calculateGroupBalances } from './utils';

/** The categories of an expense: the stored value stays English, the label follows the language. */
const CATEGORIES = [
  'Dining',
  'Groceries',
  'Accommodation',
  'Transport',
  'Fuel',
  'Entertainment',
  'Tickets',
  'Gifts',
  'Rent, Utilities',
  'Other',
];

export default function App() {
  // Navigation & View State
  const [currentView, setCurrentView] = useState<
    'dashboard' | 'groups' | 'group-detail' | 'activity' | 'settings' | 'add-bill'
  >('dashboard');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Preference States
  const [lang, setLang] = useState<'de' | 'en'>('de'); // German as default standard language
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('bts_theme');
      if (savedTheme === 'dark') return true;
      if (savedTheme === 'light') return false;
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const t = TRANSLATIONS[lang];
  const categoryLabel = (key: string) =>
    TRANSLATIONS[lang].categories[key.replace(/[^A-Za-z]/g, '')] ?? key;
  /** An amount as money in the language of the person: 1.234,50 € in German, €1,234.50 in English. */
  const money = (amount: number) => formatMoney(amount, lang);
  const localIso = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  /** An expense date for display: "Heute", "Gestern" or the date; older records may say "Today". */
  const dayText = (value: string) => {
    if (!value || /today|just now/i.test(value)) return t.today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (value === localIso()) return t.today;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (value === localIso(yesterday)) return lang === 'de' ? 'Gestern' : 'Yesterday';
    return new Date(`${value}T12:00:00`).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };
  /** When something happened: today with the time, otherwise the date. Older records hold words like "Just now". */
  const actTime = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return dayText(value);
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return value;
    const time = at.toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dayText(localIso(at))}, ${time}`;
  };
  const [portalUrl, setPortalUrl] = useState('/');
  useEffect(() => {
    portalUrlOf()
      .then(setPortalUrl)
      .catch(() => {});
  }, []);

  // Effect to sync dark mode state with HTML document root for bulletproof Tailwind dark mode support
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Synchronize theme with Mininode settings, postMessage, and system preferences
  useEffect(() => {
    const mediaQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const savedTheme = localStorage.getItem('bts_theme');
      if (!savedTheme) {
        setIsDarkMode(e.matches);
      }
    };

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    }

    const onThemeMsg = (e: MessageEvent) => {
      const data = e.data;
      if (!data) return;
      if (
        data.type === 'mininode:theme' ||
        data.type === 'setTheme' ||
        data.action === 'setTheme' ||
        data.type === 'themeChange'
      ) {
        const tVal = data.theme || data.value;
        if (tVal === 'dark' || tVal === 'light') {
          setIsDarkMode(tVal === 'dark');
          localStorage.setItem('bts_theme', tVal);
        }
      }
    };
    window.addEventListener('message', onThemeMsg);

    return () => {
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      }
      window.removeEventListener('message', onThemeMsg);
    };
  }, []);

  // MiniNode / User State
  const [currentUser, setCurrentUser] = useState<MiniNodeUser | null>(null);
  const [joinedRoom, setJoinedRoom] = useState<any>(null);
  const [roomPlayers, setRoomPlayers] = useState<any[]>([]);
  const [isRoomConnecting, setIsRoomConnecting] = useState(false);

  // Core Data States
  const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [settlements, setSettlements] = useState<Settlement[]>(INITIAL_SETTLEMENTS);
  const [activities, setActivities] = useState<ActivityLog[]>(INITIAL_ACTIVITIES);
  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS);

  // Form & Input States
  const [joinGroupCode, setJoinGroupCode] = useState('');
  const [isJoinGroupModalOpen, setIsJoinGroupModalOpen] = useState(false);
  const [aiSentence, setAiSentence] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiParsedResult, setAiParsedResult] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Modal Control States
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [groupToDeleteId, setGroupToDeleteId] = useState<string | null>(null);
  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false);

  // Modal Inputs
  const [settleTargetMemberId, setSettleTargetMemberId] = useState<string>('');
  const [settleAmount, setSettleAmount] = useState<string>('0.00');

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLocation, setNewGroupLocation] = useState('');
  const [newGroupCategory, setNewGroupCategory] = useState('Travel');
  const [newGroupInitialMembers, setNewGroupInitialMembers] = useState('');

  const [billAmount, setBillAmount] = useState('');
  const [billDescription, setBillDescription] = useState('');
  const [billGroupId, setBillGroupId] = useState('');
  const [billCategory, setBillCategory] = useState('Dining');
  const [billSplitType, setBillSplitType] = useState<'equal' | 'percentage' | 'exact'>('equal');
  const [customSplitDetails, setCustomSplitDetails] = useState<{ [memberId: string]: number }>({});
  const [showSplitEditor, setShowSplitEditor] = useState(false);
  const [billPaidById, setBillPaidById] = useState('');
  const [billParticipants, setBillParticipants] = useState<string[]>([]);
  const [billDate, setBillDate] = useState('');
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [billError, setBillError] = useState<string | null>(null);
  /** The typed amount as a number (0 while it is empty or no amount). */
  const billAmountValue = (() => {
    const v = parseAmount(billAmount);
    return Number.isNaN(v) ? 0 : v;
  })();

  // Receipt & Deadline States
  const [billReceiptUrl, setBillReceiptUrl] = useState<string>('');
  const [billReceiptName, setBillReceiptName] = useState<string>('');
  const [billDueDate, setBillDueDate] = useState<string>('');
  const [activeReceiptModal, setActiveReceiptModal] = useState<Expense | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'receipt' | 'deadline'>('all');

  // Direct Payment States (PayPal, IBAN, Bank Details)
  const [userPaymentInfo, setUserPaymentInfo] = useState<PaymentInfo>({
    paypalHandle: '',
    iban: '',
    bic: '',
    accountHolder: '',
  });
  const [billEnablePayment, setBillEnablePayment] = useState(false);
  const [billPaypalHandle, setBillPaypalHandle] = useState('');
  const [billIban, setBillIban] = useState('');
  const [billBic, setBillBic] = useState('');
  const [billAccountHolder, setBillAccountHolder] = useState('');

  const [directPayModalData, setDirectPayModalData] = useState<{
    expense?: Expense;
    payer: Member;
    amount: number;
    reference: string;
    paymentInfo: PaymentInfo;
    groupId: string;
  } | null>(null);

  const [directPayQrDataUrl, setDirectPayQrDataUrl] = useState<string>('');
  const [directPayActiveTab, setDirectPayActiveTab] = useState<'all' | 'paypal' | 'bank'>('all');

  // Modal to edit payment info for an existing expense
  const [editingExpensePayment, setEditingExpensePayment] = useState<Expense | null>(null);
  const [editPaymentPaypal, setEditPaymentPaypal] = useState('');
  const [editPaymentIban, setEditPaymentIban] = useState('');
  const [editPaymentBic, setEditPaymentBic] = useState('');
  const [editPaymentAccountHolder, setEditPaymentAccountHolder] = useState('');
  const [editPaymentSaveAsDefault, setEditPaymentSaveAsDefault] = useState(false);

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerToast = (msg: string, action?: { label: string; run: () => void }) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    setToastAction(action ?? null);
    // A toast with an action stays long enough to use it.
    toastTimer.current = setTimeout(
      () => {
        setToastMessage(null);
        setToastAction(null);
      },
      action ? 7000 : 3000,
    );
  };

  const findMember = (id: string): Member => {
    const found = members.find((m) => m.id === id);
    if (found) return found;
    if (currentUser && (currentUser.id === id || id === 'user_me' || id === 'u1')) {
      return {
        id: currentUser.id,
        name: currentUser.username,
        email: currentUser.email || '',
        avatarUrl:
          currentUser.avatarUrl ||
          avatarFor(currentUser.username),
        isCurrentUser: true,
        paymentInfo: userPaymentInfo,
      };
    }
    return {
      id,
      name:
        id === 'u1' || id === 'user_me'
          ? currentUser?.username || (lang === 'de' ? 'Ich' : 'You')
          : 'Member',
      email: '',
      avatarUrl: avatarFor(id),
    };
  };

  // Auth, Profile Setup, Real Data Persistence & Global Language Sync Effect
  useEffect(() => {
    const handleLanguageUpdate = (rawLang: string) => {
      if (!rawLang) return;
      const lower = rawLang.toLowerCase();
      const normalized: 'de' | 'en' = lower.startsWith('de') ? 'de' : 'en';
      setLang(normalized);
    };

    const unsub = MiniNodeAPI.auth.onChange((user) => {
      if (user) {
        setCurrentUser(user);
        setMembers((prev) => {
          if (prev.some((m) => m.id === user.id)) {
            return prev.map((m) => (m.id === user.id ? { ...m, name: user.username } : m));
          } else {
            return [
              {
                id: user.id,
                name: user.username,
                email: user.email || '',
                avatarUrl:
                  user.avatarUrl ||
                  avatarFor(user.username),
                isCurrentUser: true,
              },
              ...prev,
            ];
          }
        });
      } else {
        setCurrentUser(null);
      }
    });

    async function bootstrap() {
      const user = await MiniNodeAPI.auth.requireLogin();
      setCurrentUser(user);

      const userMember: Member = {
        id: user.id,
        name: user.username,
        email: user.email || '',
        avatarUrl:
          user.avatarUrl ||
          avatarFor(user.username),
        isCurrentUser: true,
      };

      const savedMembers = await MiniNodeAPI.db.listMembers();
      if (savedMembers && savedMembers.length > 0) {
        const hasUser = savedMembers.some((m) => m.id === user.id);
        const finalMembers = hasUser ? savedMembers : [userMember, ...savedMembers];
        if (!hasUser) await MiniNodeAPI.db.saveMembers([userMember]);
        setMembers(finalMembers);
      } else {
        setMembers([userMember]);
        await MiniNodeAPI.db.saveMembers([userMember]);
      }

      const saved = await MiniNodeAPI.db.listGroups();
      if (saved && saved.length > 0) {
        setGroups(saved);
        if (saved[0]) {
          setSelectedGroupId(saved[0].id);
          setBillGroupId(saved[0].id);
        }
      }

      const savedExp = await MiniNodeAPI.db.listExpenses();
      if (savedExp && savedExp.length > 0) {
        setExpenses(savedExp);
      }

      const savedSets = await MiniNodeAPI.db.listSettlements();
      if (savedSets && savedSets.length > 0) {
        setSettlements(savedSets);
      }

      const savedActs = await MiniNodeAPI.db.listActivities();
      if (savedActs && savedActs.length > 0) {
        setActivities(savedActs);
      }

      const savedPrefs = await MiniNodeAPI.db.getPrefs();
      if (savedPrefs?.lang === 'de' || savedPrefs?.lang === 'en') {
        handleLanguageUpdate(savedPrefs.lang);
      } else if (typeof document !== 'undefined' && document.documentElement.lang) {
        handleLanguageUpdate(document.documentElement.lang);
      }

      if (savedPrefs && savedPrefs.paymentInfo) {
        setUserPaymentInfo(savedPrefs.paymentInfo);
        setBillPaypalHandle(savedPrefs.paymentInfo.paypalHandle || '');
        setBillIban(savedPrefs.paymentInfo.iban || '');
        setBillBic(savedPrefs.paymentInfo.bic || '');
        setBillAccountHolder(savedPrefs.paymentInfo.accountHolder || user.username);
        setBillEnablePayment(
          !!(savedPrefs.paymentInfo.paypalHandle || savedPrefs.paymentInfo.iban),
        );
      } else {
        setBillAccountHolder(user.username);
      }
    }

    // Global Language sync over Mininode messages
    const onGlobalMsg = (e: MessageEvent) => {
      const data = e.data;
      if (!data) return;
      if (
        data.type === 'mininode:lang' ||
        data.type === 'setLanguage' ||
        data.type === 'languageChange' ||
        data.type === 'localeChange' ||
        data.action === 'setLang' ||
        data.event === 'language'
      ) {
        const newL = data.lang || data.language || data.locale || data.value;
        if (typeof newL === 'string') {
          handleLanguageUpdate(newL);
        }
      }
    };
    window.addEventListener('message', onGlobalMsg);

    // Observer for global html lang attribute change from host container
    const observer = new MutationObserver(() => {
      if (document.documentElement.lang) {
        handleLanguageUpdate(document.documentElement.lang);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    bootstrap();
    return () => {
      unsub();
      window.removeEventListener('message', onGlobalMsg);
      observer.disconnect();
    };
  }, []);

  // Generate real EPC QR Code for Direct Pay Modal
  useEffect(() => {
    if (directPayModalData && directPayModalData.paymentInfo.iban) {
      generateEpcQrDataUrl(
        directPayModalData.paymentInfo.accountHolder || directPayModalData.payer.name,
        directPayModalData.paymentInfo.iban,
        directPayModalData.amount,
        directPayModalData.reference,
        directPayModalData.paymentInfo.bic || '',
      ).then((url) => {
        setDirectPayQrDataUrl(url);
      });
    } else {
      setDirectPayQrDataUrl('');
    }
  }, [directPayModalData]);

  // Sync with dynamic group ID changes
  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
      setBillGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  // Everything the group works on is shared in the account (mn.kv); when another person changes
  // something, or this device synced after being offline, the lists are read again.
  const reloadShared = async () => {
    const [m, g, e, st, act] = await Promise.all([
      MiniNodeAPI.db.listMembers(),
      MiniNodeAPI.db.listGroups(),
      MiniNodeAPI.db.listExpenses(),
      MiniNodeAPI.db.listSettlements(),
      MiniNodeAPI.db.listActivities(),
    ]);
    if (m.length > 0)
      setMembers((prev) => {
        const me = prev.find((x) => x.isCurrentUser && !m.some((y) => y.id === x.id));
        return me ? [me, ...m] : m;
      });
    setGroups(g);
    setExpenses(e);
    setSettlements(st);
    setActivities(act);
  };

  useEffect(
    () =>
      MiniNodeAPI.onSaveError(() =>
        triggerToast(
          lang === 'de'
            ? 'Speichern hat nicht geklappt. Prüfe die Verbindung.'
            : 'Saving failed. Check your connection.',
        ),
      ),
    [lang],
  );

  useEffect(() => {
    if (!currentUser) return;
    return MiniNodeAPI.onRemoteChange(() => {
      void reloadShared();
    });
  }, [currentUser]);

  // Calculations
  const globalOverview = useMemo(() => {
    return calculateGlobalOverview(groups, expenses, settlements, currentUser?.id || 'u1');
  }, [groups, expenses, settlements, currentUser]);

  const activeGroup = useMemo(() => {
    return groups.find((g) => g.id === selectedGroupId) || groups[0];
  }, [groups, selectedGroupId]);

  const activeGroupBalances = useMemo(() => {
    if (!activeGroup) return { totalSpent: 0, userShare: 0, userNetBalance: 0, memberBalances: {} };
    return calculateGroupBalances(activeGroup, expenses, settlements, currentUser?.id || 'u1');
  }, [activeGroup, expenses, settlements, currentUser]);

  const activeGroupExpenses = useMemo(() => {
    return expenses
      .filter((e) => e.groupId === selectedGroupId)
      .sort((a, b) => b.id.localeCompare(a.id));
  }, [expenses, selectedGroupId]);

  const displayedExpenses = useMemo(() => {
    return activeGroupExpenses.filter((exp) => {
      if (expenseFilter === 'receipt') return !!exp.receiptUrl;
      if (expenseFilter === 'deadline') return !!exp.dueDate;
      return true;
    });
  }, [activeGroupExpenses, expenseFilter]);

  const filteredSearchExpenses = useMemo(() => {
    if (!searchQuery) return [];
    return expenses.filter(
      (e) =>
        e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        findMember(e.paidById).name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [expenses, searchQuery]);

  const upcomingDeadlineExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        if (!e.dueDate) return false;
        const status = computeDeadlineStatus(e.dueDate);
        return (
          status.status === 'today' || status.status === 'upcoming' || status.status === 'overdue'
        );
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [expenses]);

  // Statistics: Calculate current month's expenses total
  const currentMonthExpensesTotal = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (5 for June)

    return expenses.reduce((acc, e) => {
      let isCurrentMonth = false;
      if (
        !e.date ||
        e.date === 'Today' ||
        e.date === 'Just now' ||
        e.date.toLowerCase().includes('today') ||
        e.date.toLowerCase().includes('just now')
      ) {
        isCurrentMonth = true;
      } else {
        try {
          const d = new Date(e.date);
          if (!isNaN(d.getTime())) {
            isCurrentMonth = d.getFullYear() === currentYear && d.getMonth() === currentMonth;
          }
        } catch (err) {
          isCurrentMonth = true;
        }
      }
      return isCurrentMonth ? acc + e.amount : acc;
    }, 0);
  }, [expenses]);

  // Statistics: Calculate dynamic 6-month historical spark bars
  const monthlySpendsLast6Months = useMemo(() => {
    const now = new Date();
    const result = [];
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();

      const total = expenses.reduce((acc, e) => {
        let isMatch = false;
        if (
          !e.date ||
          e.date === 'Today' ||
          e.date === 'Just now' ||
          e.date.toLowerCase().includes('today') ||
          e.date.toLowerCase().includes('just now')
        ) {
          isMatch = year === now.getFullYear() && month === now.getMonth();
        } else {
          try {
            const expDate = new Date(e.date);
            if (!isNaN(expDate.getTime())) {
              isMatch = expDate.getFullYear() === year && expDate.getMonth() === month;
            }
          } catch (err) {}
        }
        return isMatch ? acc + e.amount : acc;
      }, 0);

      result.push({
        label: monthNames[month],
        amount: total,
      });
    }
    return result;
  }, [expenses]);

  const sparkHeights = useMemo(() => {
    const maxAmount = Math.max(...monthlySpendsLast6Months.map((m) => m.amount), 0);
    return monthlySpendsLast6Months.map((m) => {
      if (maxAmount === 0) return 10; // minimal baseline when all are 0
      return Math.max(10, Math.round((m.amount / maxAmount) * 100));
    });
  }, [monthlySpendsLast6Months]);

  // Handler: Save Group
  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      triggerToast(
        lang === 'de'
          ? 'Bitte fülle alle Pflichtfelder aus.'
          : 'Please fill in all required fields.',
      );
      return;
    }

    const currentUserId = currentUser?.id || 'user_me';
    const extraMemberIds: string[] = [];

    if (newGroupInitialMembers.trim()) {
      const names = newGroupInitialMembers
        .split(/[,;\n]+/)
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      const newCreatedMembers: Member[] = [];
      names.forEach((name) => {
        const existing = members.find((m) => m.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          extraMemberIds.push(existing.id);
        } else {
          const mId = generateId('usr');
          const newM: Member = {
            id: mId,
            name,
            email: `${name.toLowerCase().replace(/\s+/g, '')}@billthesplitter.app`,
            avatarUrl: avatarFor(name),
          };
          newCreatedMembers.push(newM);
          extraMemberIds.push(mId);
        }
      });

      if (newCreatedMembers.length > 0) {
        const updated = [...members, ...newCreatedMembers];
        setMembers(updated);
        await MiniNodeAPI.db.saveMembers(updated);
      }
    }

    const groupCode = generateId('grp');
    const newGroup: Group = {
      id: groupCode,
      name: newGroupName.trim(),
      location: newGroupLocation.trim(),
      memberIds: Array.from(new Set([currentUserId, ...extraMemberIds])),
      category: newGroupCategory,
      createdAt: new Date().toISOString().split('T')[0],
      creatorId: currentUserId,
    };

    await MiniNodeAPI.db.saveGroup(newGroup);
    setGroups((prev) => [newGroup, ...prev]);
    setIsCreateGroupModalOpen(false);
    setNewGroupName('');
    setNewGroupLocation('');
    setNewGroupInitialMembers('');
    setSelectedGroupId(newGroup.id);
    setCurrentView('group-detail');
    triggerToast(
      lang === 'de' ? `Gruppe "${newGroup.name}" erstellt!` : `Group "${newGroup.name}" created!`,
    );
  };

  // Handler: Join Group
  const handleJoinGroupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const code = joinGroupCode.trim();
    if (!code) return;

    try {
      setIsRoomConnecting(true);
      const currentUserId = currentUser?.id || 'user_me';
      // The record is read again just now: two people joining at the same time both end up in it.
      const existing = await MiniNodeAPI.db.getGroup(code);
      if (existing) {
        const merged: Group = {
          ...existing,
          memberIds: Array.from(new Set([...existing.memberIds, currentUserId])),
        };
        await MiniNodeAPI.db.saveGroup(merged);
        setGroups((prev) =>
          prev.some((g) => g.id === code)
            ? prev.map((g) => (g.id === code ? merged : g))
            : [merged, ...prev],
        );
        setSelectedGroupId(code);
        setCurrentView('group-detail');
        setJoinGroupCode('');
        setIsJoinGroupModalOpen(false);
        triggerToast(lang === 'de' ? `Gruppe ${code} beigetreten!` : `Joined group code: ${code}!`);
        return;
      }
      const joinedGrp: Group = {
        id: code,
        name: code,
        location: 'Shared Ledger',
        category: 'General',
        memberIds: [currentUserId],
        createdAt: new Date().toISOString().split('T')[0],
        creatorId: undefined,
      };

      await MiniNodeAPI.db.saveGroup(joinedGrp);
      setGroups((prev) => {
        if (prev.some((g) => g.id === code)) return prev;
        return [joinedGrp, ...prev];
      });

      setSelectedGroupId(code);
      setCurrentView('group-detail');
      setJoinGroupCode('');
      setIsJoinGroupModalOpen(false);
      triggerToast(lang === 'de' ? `Gruppe ${code} beigetreten!` : `Joined group code: ${code}!`);
    } catch (err) {
      triggerToast(lang === 'de' ? 'Verbindung fehlgeschlagen.' : 'Failed to join group.');
    } finally {
      setIsRoomConnecting(false);
    }
  };

  // Handler: Delete Single Group
  const handleDeleteGroup = async (groupId: string) => {
    const grp = groups.find((g) => g.id === groupId);
    if (!grp) return;

    // Check if the user is the creator.
    // If grp has creatorId and it is NOT currentUser.id, block deletion!
    const isCreator = !grp.creatorId || (currentUser && grp.creatorId === currentUser.id);
    if (!isCreator) {
      triggerToast(
        lang === 'de'
          ? 'Nur der Ersteller der Gruppe kann diese löschen.'
          : 'Only the group creator is allowed to delete this group.',
      );
      return;
    }

    setGroupToDeleteId(groupId);
  };

  const handleConfirmDeleteGroup = async () => {
    if (!groupToDeleteId) return;
    const groupId = groupToDeleteId;
    const grp = groups.find((g) => g.id === groupId);
    if (grp) {
      await MiniNodeAPI.db.removeGroup(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      setExpenses((prev) => prev.filter((e) => e.groupId !== groupId));
      setSettlements((prev) => prev.filter((s) => s.groupId !== groupId));
      setActivities((prev) => prev.filter((a) => a.groupId !== groupId));

      triggerToast(
        lang === 'de' ? `Gruppe "${grp.name}" gelöscht.` : `Group "${grp.name}" deleted.`,
      );
      setCurrentView('groups');
    }
    setGroupToDeleteId(null);
  };

  // Handler: Delete All Active Groups
  const handleDeleteAllGroups = async () => {
    setIsConfirmDeleteAllOpen(true);
  };

  const handleConfirmDeleteAllGroups = async () => {
    // Only delete groups created by current user
    const userGroups = groups.filter(
      (grp) => !grp.creatorId || (currentUser && grp.creatorId === currentUser.id),
    );

    if (userGroups.length === 0) {
      triggerToast(
        lang === 'de'
          ? 'Keine von Ihnen erstellten Gruppen vorhanden.'
          : 'No groups created by you to delete.',
      );
      setIsConfirmDeleteAllOpen(false);
      return;
    }

    for (const grp of userGroups) {
      await MiniNodeAPI.db.removeGroup(grp.id);
    }

    const deletedIds = new Set(userGroups.map((g) => g.id));
    setGroups((prev) => prev.filter((g) => !deletedIds.has(g.id)));
    setExpenses((prev) => prev.filter((e) => !deletedIds.has(e.groupId)));
    setSettlements((prev) => prev.filter((s) => !deletedIds.has(s.groupId)));
    setActivities((prev) => prev.filter((a) => !deletedIds.has(a.groupId)));

    triggerToast(
      lang === 'de'
        ? 'Alle von Ihnen erstellten Gruppen gelöscht!'
        : 'All groups created by you deleted!',
    );

    setCurrentView('groups');
    setIsConfirmDeleteAllOpen(false);
  };

  // Handler: Parse Expense via AI
  const handleParseAiExpense = async () => {
    if (!aiSentence.trim() || !activeGroup) return;

    setIsAiParsing(true);
    try {
      const memberNames = activeGroup.memberIds.map((mId) => findMember(mId).name);
      const result = await MiniNodeAPI.ai.parseExpense(aiSentence, memberNames);
      setAiParsedResult(result);
      triggerToast(lang === 'de' ? 'KI-Analyse erfolgreich!' : 'AI successfully parsed statement!');
    } catch (err) {
      triggerToast(lang === 'de' ? 'KI-Analyse fehlgeschlagen.' : 'AI parsing failed.');
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleConfirmAiParsedExpense = () => {
    if (!aiParsedResult || !activeGroup) return;

    const parsedAmount = aiParsedResult.amount;
    const parsedDesc = aiParsedResult.desc;

    let payerId = currentUser?.id || 'u1';
    const matchedPayer = activeGroup.memberIds
      .map((mId) => findMember(mId))
      .find((m) => m.name.toLowerCase().includes(aiParsedResult.paidBy.toLowerCase()));
    if (matchedPayer) payerId = matchedPayer.id;

    const splitWithNames = aiParsedResult.with || [];
    const splitWithIds: string[] = [];
    activeGroup.memberIds.forEach((mId) => {
      const m = findMember(mId);
      if (
        splitWithNames.length === 0 ||
        splitWithNames.some((name: string) => m.name.toLowerCase().includes(name.toLowerCase()))
      ) {
        splitWithIds.push(mId);
      }
    });
    if (splitWithIds.length === 0) splitWithIds.push(...activeGroup.memberIds);

    const splitDetails: { [memberId: string]: number } = {};
    const shareValue = 100 / splitWithIds.length;
    splitWithIds.forEach((mId) => {
      splitDetails[mId] = shareValue;
    });

    const newExpense: Expense = {
      id: `e_new_${Date.now()}`,
      groupId: selectedGroupId,
      description: parsedDesc,
      amount: parsedAmount,
      paidById: payerId,
      date: 'Today',
      category: 'Dining',
      splitType: 'equal',
      splitDetails,
    };

    const newActivity: ActivityLog = {
      id: `act_new_${Date.now()}`,
      groupId: selectedGroupId,
      memberId: payerId,
      type: 'expense_added',
      title: `${findMember(payerId).name} ${t.expenseAddedLog} "${parsedDesc}" (${t.newBillAddedWithDesc})`,
      amount: -(parsedAmount / splitWithIds.length),
      date: new Date().toISOString(),
    };

    if (joinedRoom) {
      joinedRoom.setState({
        expenses: { ...(joinedRoom.state.expenses || {}), [newExpense.id]: newExpense },
        activities: { ...(joinedRoom.state.activities || {}), [newActivity.id]: newActivity },
      });
    } else {
      setExpenses([newExpense, ...expenses]);
      setActivities([newActivity, ...activities]);
    }

    triggerToast(
      lang === 'de' ? `Rechnung "${parsedDesc}" hinzugefügt!` : `Added "${parsedDesc}"!`,
    );
    setAiSentence('');
    setAiParsedResult(null);
  };

  // Handlers for Receipt Upload & Deadlines
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingReceipt(true);
    try {
      const base64 = await fileToCompressedBase64(file);
      setBillReceiptUrl(base64);
      setBillReceiptName(file.name);
      triggerToast(lang === 'de' ? 'Belegfoto erfolgreich geladen!' : 'Receipt image uploaded!');
    } catch (err) {
      triggerToast(
        lang === 'de' ? 'Fehler beim Laden des Belegs.' : 'Error loading receipt image.',
      );
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleUseSampleReceipt = () => {
    const amountVal = billAmountValue || 28.5;
    const descVal =
      billDescription.trim() || (lang === 'de' ? 'Restaurant & Ausgaben' : 'Restaurant & Dining');
    const sample = generateSampleReceiptUrl(
      descVal,
      amountVal,
      new Date().toISOString().split('T')[0],
    );
    setBillReceiptUrl(sample);
    setBillReceiptName('sample_receipt.svg');
    triggerToast(lang === 'de' ? 'Muster-Beleg generiert!' : 'Sample receipt attached!');
  };

  const handleSetQuickDeadline = (daysAhead: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysAhead);
    setBillDueDate(target.toISOString().split('T')[0]);
  };

  const handleSetEndOfMonthDeadline = () => {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setBillDueDate(endOfMonth.toISOString().split('T')[0]);
  };

  // Push Reminder Handlers
  const handleSendExpenseReminder = async (exp: Expense) => {
    const targetGrp = groups.find((g) => g.id === exp.groupId);
    const grpName = targetGrp ? targetGrp.name : 'Shared Ledger';
    const payer = findMember(exp.paidById);
    const deadlineNotice = exp.dueDate
      ? lang === 'de'
        ? `Zahlungsziel: ${exp.dueDate}`
        : `Due by: ${exp.dueDate}`
      : '';
    const title =
      lang === 'de'
        ? `Zahlungserinnerung: ${exp.description}`
        : `Payment Reminder: ${exp.description}`;
    const body =
      lang === 'de'
        ? `${currentUser?.username || payer.name} erinnert an die Rechnung über ${money(exp.amount)} in "${grpName}". ${deadlineNotice}`
        : `${currentUser?.username || payer.name} sent a reminder for ${money(exp.amount)} in "${grpName}". ${deadlineNotice}`;

    await MiniNodeAPI.notify(title, body);

    const nowIso = new Date().toISOString();
    setExpenses((prev) => {
      const updated = prev.map((e) => (e.id === exp.id ? { ...e, remindedAt: nowIso } : e));
      MiniNodeAPI.db.saveExpenses(updated);
      return updated;
    });

    const currentUserId = currentUser?.id || 'user_me';
    const currentUserName = currentUser?.username || (lang === 'de' ? 'Ich' : 'You');
    const newActivity: ActivityLog = {
      id: `act_${Date.now()}`,
      groupId: exp.groupId,
      memberId: currentUserId,
      type: 'reminder_sent',
      title: `${currentUserName} ${t.reminderLogged} "${exp.description}"`,
      amount: exp.amount,
      date: new Date().toISOString(),
    };
    setActivities((prev) => {
      const updated = [newActivity, ...prev];
      MiniNodeAPI.db.saveActivities(updated);
      return updated;
    });

    if (joinedRoom && exp.groupId === selectedGroupId) {
      joinedRoom.setState({
        expenses: {
          ...(joinedRoom.state.expenses || {}),
          [exp.id]: { ...exp, remindedAt: nowIso },
        },
        activities: { ...(joinedRoom.state.activities || {}), [newActivity.id]: newActivity },
      });
    }

    triggerToast(t.reminderSuccessMsg);
  };

  const handleRemindDebtor = async (memberId: string, balance: number) => {
    const mem = findMember(memberId);
    const grpName = activeGroup ? activeGroup.name : 'Shared Ledger';
    const currentUserName = currentUser?.username || (lang === 'de' ? 'Ich' : 'You');
    const currentUserId = currentUser?.id || 'user_me';
    const title =
      lang === 'de'
        ? `Abrechnungserinnerung von ${currentUserName}`
        : `Balance Reminder from ${currentUserName}`;
    const body =
      lang === 'de'
        ? `Hallo ${mem.name}, bitte gleiche deinen offenen Betrag von ${money(Math.abs(balance))} in "${grpName}" aus.`
        : `Hi ${mem.name}, please settle your outstanding balance of ${money(Math.abs(balance))} in "${grpName}".`;

    await MiniNodeAPI.notify(title, body);

    const newActivity: ActivityLog = {
      id: `act_${Date.now()}`,
      groupId: selectedGroupId,
      memberId: currentUserId,
      type: 'reminder_sent',
      title: `${currentUserName} ${t.reminderLogged} ${mem.name} (${money(Math.abs(balance))})`,
      amount: Math.abs(balance),
      date: new Date().toISOString(),
    };
    setActivities((prev) => {
      const updated = [newActivity, ...prev];
      MiniNodeAPI.db.saveActivities(updated);
      return updated;
    });

    if (joinedRoom) {
      joinedRoom.setState({
        activities: { ...(joinedRoom.state.activities || {}), [newActivity.id]: newActivity },
      });
    }

    triggerToast(
      lang === 'de' ? `Erinnerung an ${mem.name} verschickt!` : `Reminder pushed to ${mem.name}!`,
    );
  };

  const handleRemindAllDebtors = async () => {
    if (!activeGroup) return;
    const debtorIds = activeGroup.memberIds.filter((id) => {
      if (id === (currentUser?.id || 'u1')) return false;
      const b = activeGroupBalances.memberBalances[id] || 0;
      return b < 0;
    });

    if (debtorIds.length === 0) {
      triggerToast(
        lang === 'de'
          ? 'Keine ausstehenden Salden zum Erinnern.'
          : 'No outstanding balances to remind.',
      );
      return;
    }

    for (const dId of debtorIds) {
      const b = activeGroupBalances.memberBalances[dId] || 0;
      await handleRemindDebtor(dId, b);
    }

    triggerToast(
      lang === 'de'
        ? `Erinnerungen an ${debtorIds.length} Mitglieder gesendet!`
        : `Reminders sent to ${debtorIds.length} members!`,
    );
  };

  // ---- Add, change and delete an expense ----
  const meId = currentUser?.id || 'user_me';

  const resetBillForm = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    setBillGroupId(groupId);
    setBillAmount('');
    setBillDescription('');
    setBillCategory('Dining');
    setBillSplitType('equal');
    setCustomSplitDetails({});
    setBillPaidById(group?.memberIds.includes(meId) ? meId : (group?.memberIds[0] ?? meId));
    setBillParticipants(group?.memberIds ?? []);
    setBillDate(localIso());
    setBillDueDate('');
    setBillReceiptUrl('');
    setBillReceiptName('');
    setBillEnablePayment(false);
    setBillError(null);
    setShowSplitEditor(false);
  };

  /** Opens the form for a new expense (in the given or the current group). */
  const startNewBill = (groupId?: string) => {
    const id = groupId || selectedGroupId || groups[0]?.id || '';
    setEditingExpenseId(null);
    resetBillForm(id);
    setCurrentView('add-bill');
    window.scrollTo(0, 0);
  };

  /** Opens the form with an existing expense, to change it. */
  const startEditBill = (exp: Expense) => {
    const group = groups.find((g) => g.id === exp.groupId);
    resetBillForm(exp.groupId);
    setEditingExpenseId(exp.id);
    setBillAmount(String(exp.amount).replace('.', lang === 'de' ? ',' : '.'));
    setBillDescription(exp.description);
    setBillCategory(exp.category);
    setBillSplitType(exp.splitType);
    setCustomSplitDetails(exp.splitDetails ?? {});
    setBillPaidById(exp.paidById);
    setBillParticipants(group ? participantsOf(exp, group.memberIds) : (exp.participantIds ?? []));
    setBillDate(/^\d{4}-\d{2}-\d{2}$/.test(exp.date) ? exp.date : localIso());
    setBillDueDate(exp.dueDate ?? '');
    setBillReceiptUrl(exp.receiptUrl ?? '');
    setBillReceiptName(exp.receiptName ?? '');
    setBillEnablePayment(Boolean(exp.paymentInfo));
    setBillPaypalHandle(exp.paymentInfo?.paypalHandle ?? '');
    setBillIban(exp.paymentInfo?.iban ?? '');
    setBillBic(exp.paymentInfo?.bic ?? '');
    setBillAccountHolder(exp.paymentInfo?.accountHolder ?? '');
    setShowSplitEditor(exp.splitType !== 'equal');
    setCurrentView('add-bill');
    window.scrollTo(0, 0);
  };

  /** A different group was chosen in the form: everybody takes part again, the payer is checked. */
  const changeBillGroup = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    setBillGroupId(groupId);
    setBillParticipants(group?.memberIds ?? []);
    setCustomSplitDetails({});
    setBillSplitType('equal');
    setBillPaidById(group?.memberIds.includes(meId) ? meId : (group?.memberIds[0] ?? meId));
  };

  /** The shares each method starts with, so the numbers are never empty. */
  const defaultSplitValues = (method: Expense['splitType'], who: string[], amount: number) => {
    const values: { [memberId: string]: number } = {};
    if (who.length === 0) return values;
    if (method === 'percentage') {
      const parts = allocate(10000, who.map(() => 1));
      who.forEach((id, i) => {
        values[id] = fromCents(parts[i] ?? 0);
      });
    } else if (method === 'exact') {
      const parts = allocate(Number.isFinite(amount) ? toCents(amount) : 0, who.map(() => 1));
      who.forEach((id, i) => {
        values[id] = fromCents(parts[i] ?? 0);
      });
    } else if (method === 'shares') {
      for (const id of who) values[id] = 1;
    }
    return values;
  };

  const chooseSplitMethod = (method: Expense['splitType']) => {
    setBillSplitType(method);
    setCustomSplitDetails(defaultSplitValues(method, billParticipants, parseAmount(billAmount)));
  };

  const toggleParticipant = (id: string) => {
    const next = billParticipants.includes(id)
      ? billParticipants.filter((x) => x !== id)
      : [...billParticipants, id];
    setBillParticipants(next);
    if (billSplitType !== 'equal')
      setCustomSplitDetails(defaultSplitValues(billSplitType, next, parseAmount(billAmount)));
  };

  const handleAddBillSubmit = (e: FormEvent) => {
    e.preventDefault();
    const fail = (de: string, en: string) => {
      setBillError(lang === 'de' ? de : en);
      return;
    };
    const amount = parseAmount(billAmount);
    if (Number.isNaN(amount) || amount <= 0) return fail('Bitte gib einen Betrag über 0 ein.', 'Please enter an amount above 0.');
    if (!billDescription.trim()) return fail('Wofür war die Ausgabe? Bitte gib eine Beschreibung ein.', 'What was the expense for? Please add a description.');

    const targetGroup = groups.find((g) => g.id === billGroupId) || activeGroup;
    if (!targetGroup) return;
    if (billParticipants.length === 0)
      return fail('Mindestens eine Person muss dabei sein.', 'At least one person has to take part.');

    // The numbers of the chosen method, only for the people who take part.
    const splitDetails: { [memberId: string]: number } = {};
    if (billSplitType !== 'equal') {
      for (const id of billParticipants) splitDetails[id] = customSplitDetails[id] ?? 0;
      const sum = billParticipants.reduce((a, id) => a + (splitDetails[id] ?? 0), 0);
      if (billSplitType === 'percentage' && Math.abs(sum - 100) > 0.01)
        return fail(
          `Die Prozente ergeben ${String(Math.round(sum * 100) / 100).replace('.', ',')} %, es müssen 100 % sein.`,
          `The percentages add up to ${Math.round(sum * 100) / 100} %, they must be 100 %.`,
        );
      if (billSplitType === 'exact' && toCents(sum) !== toCents(amount))
        return fail(
          `Die Beträge ergeben ${money(sum)}, die Ausgabe hat ${money(amount)}.`,
          `The amounts add up to ${money(sum)}, the expense is ${money(amount)}.`,
        );
      if (billSplitType === 'shares' && sum <= 0)
        return fail('Mindestens ein Anteil muss größer als 0 sein.', 'At least one share must be above 0.');
    }

    const existing = editingExpenseId ? expenses.find((x) => x.id === editingExpenseId) : undefined;
    const payerId = billPaidById || meId;
    const paymentInfoData: PaymentInfo | undefined = billEnablePayment
      ? {
          paypalHandle: cleanPayPalHandle(billPaypalHandle),
          iban: billIban.trim(),
          bic: billBic.trim(),
          accountHolder: billAccountHolder.trim() || findMember(payerId).name,
        }
      : undefined;

    const expense: Expense = {
      ...(existing ?? {}),
      id: existing?.id ?? `exp_${Date.now()}`,
      groupId: targetGroup.id,
      description: billDescription.trim(),
      amount,
      paidById: payerId,
      date: billDate || localIso(),
      dueDate: billDueDate || undefined,
      category: billCategory,
      splitType: billSplitType,
      participantIds: billParticipants,
      splitDetails,
      receiptUrl: billReceiptUrl || undefined,
      receiptName: billReceiptName || undefined,
      paymentInfo: paymentInfoData,
    };

    MiniNodeAPI.db.saveExpense(expense);
    if (existing) {
      setExpenses((prev) => prev.map((x) => (x.id === expense.id ? expense : x)));
    } else {
      setExpenses((prev) => [expense, ...prev]);
      const newActivity: ActivityLog = {
        id: `act_${Date.now()}`,
        groupId: targetGroup.id,
        memberId: payerId,
        type: 'expense_added',
        title: `${findMember(payerId).name} ${t.expenseAddedLog} "${expense.description}"`,
        amount: -(amount / billParticipants.length),
        date: new Date().toISOString(),
      };
      setActivities((prev) => {
        const updated = [newActivity, ...prev];
        MiniNodeAPI.db.saveActivities(updated);
        return updated;
      });
    }

    triggerToast(
      existing
        ? lang === 'de'
          ? `„${expense.description}“ geändert.`
          : `Changed "${expense.description}".`
        : lang === 'de'
          ? `„${expense.description}“ gespeichert.`
          : `Saved "${expense.description}".`,
    );
    setEditingExpenseId(null);
    resetBillForm(targetGroup.id);
    setSelectedGroupId(targetGroup.id);
    setCurrentView('group-detail');
    window.scrollTo(0, 0);
  };

  /** Deletes an expense; the toast offers to bring it back. */
  const deleteExpense = (exp: Expense) => {
    void MiniNodeAPI.db.removeExpense(exp.id);
    setExpenses((prev) => prev.filter((x) => x.id !== exp.id));
    triggerToast(lang === 'de' ? `„${exp.description}“ gelöscht.` : `Deleted "${exp.description}".`, {
      label: lang === 'de' ? 'Rückgängig' : 'Undo',
      run: () => {
        MiniNodeAPI.db.saveExpense(exp);
        setExpenses((prev) => (prev.some((x) => x.id === exp.id) ? prev : [exp, ...prev]));
      },
    });
  };

  /** Books one of the suggested payments ("Bea pays Lisa 12,40 €") as done. */
  const recordTransfer = (transfer: Transfer) => {
    const amount = fromCents(transfer.amount);
    const settlement: Settlement = {
      id: `set_${Date.now()}_${transfer.from}`,
      groupId: selectedGroupId,
      fromMemberId: transfer.from,
      toMemberId: transfer.to,
      amount,
      date: localIso(),
      verified: true,
    };
    const activity: ActivityLog = {
      id: `act_${Date.now()}`,
      groupId: selectedGroupId,
      memberId: meId,
      type: 'settlement_made',
      title: `${findMember(transfer.from).name} → ${findMember(transfer.to).name}`,
      amount,
      date: new Date().toISOString(),
    };
    setSettlements((prev) => {
      const updated = [...prev, settlement];
      MiniNodeAPI.db.saveSettlements(updated);
      return updated;
    });
    setActivities((prev) => {
      const updated = [activity, ...prev];
      MiniNodeAPI.db.saveActivities(updated);
      return updated;
    });
    triggerToast(lang === 'de' ? 'Zahlung verbucht.' : 'Payment recorded.');
  };

  const openSettleForMember = (mId: string, balance: number) => {
    setSettleTargetMemberId(mId);
    setSettleAmount(Math.abs(balance).toFixed(2).replace('.', lang === 'de' ? ',' : '.'));
    setIsSettleModalOpen(true);
  };

  const handleSettleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(settleAmount);
    if (Number.isNaN(amount) || amount <= 0) return;

    const currentPayerId = currentUser?.id || 'user_me';
    const isUserOwes = activeGroupBalances.memberBalances[settleTargetMemberId] > 0;

    const newSettlement: Settlement = {
      id: `set_${Date.now()}`,
      groupId: selectedGroupId,
      fromMemberId: isUserOwes ? currentPayerId : settleTargetMemberId,
      toMemberId: isUserOwes ? settleTargetMemberId : currentPayerId,
      amount,
      date: 'Today',
      verified: true,
    };

    const targetName = findMember(settleTargetMemberId).name;
    const logTitle = isUserOwes
      ? `You settled with ${targetName}`
      : `${targetName} settled with you`;

    const newActivity: ActivityLog = {
      id: `act_${Date.now()}`,
      groupId: selectedGroupId,
      memberId: currentPayerId,
      type: 'settlement_made',
      title: logTitle,
      amount: isUserOwes ? -amount : amount,
      date: new Date().toISOString(),
    };

    setSettlements((prev) => {
      const updated = [...prev, newSettlement];
      MiniNodeAPI.db.saveSettlements(updated);
      return updated;
    });

    setActivities((prev) => {
      const updated = [newActivity, ...prev];
      MiniNodeAPI.db.saveActivities(updated);
      return updated;
    });

    if (joinedRoom) {
      joinedRoom.setState({
        settlements: { ...(joinedRoom.state.settlements || {}), [newSettlement.id]: newSettlement },
        activities: { ...(joinedRoom.state.activities || {}), [newActivity.id]: newActivity },
      });
    }

    setIsSettleModalOpen(false);
    triggerToast(lang === 'de' ? 'Zahlung verbucht!' : 'Payment recorded successfully!');
  };

  // Direct Pay Handlers (PayPal / Bank Transfer)
  const handleOpenDirectPay = (expense: Expense, specificAmount?: number) => {
    const payer = findMember(expense.paidById);
    const pInfo = expense.paymentInfo || payer.paymentInfo || userPaymentInfo;
    const grp = groups.find((g) => g.id === expense.groupId) || activeGroup;
    const share =
      specificAmount !== undefined ? specificAmount : expense.amount / (grp?.memberIds.length || 1);

    setDirectPayActiveTab('all');
    setDirectPayModalData({
      expense,
      payer,
      amount: share,
      reference: `${t.appName}: ${expense.description}`,
      paymentInfo: pInfo,
      groupId: expense.groupId,
    });
  };

  const handleOpenDirectPayForMember = (targetMemberId: string, balance: number) => {
    const targetMember = findMember(targetMemberId);
    const pInfo = targetMember.paymentInfo || {
      paypalHandle: '',
      iban: '',
      bic: '',
      accountHolder: targetMember.name,
    };

    setDirectPayActiveTab('all');
    setDirectPayModalData({
      payer: targetMember,
      amount: Math.abs(balance),
      reference: `${t.appName}: Ausgleich an ${targetMember.name}`,
      paymentInfo: pInfo,
      groupId: selectedGroupId,
    });
  };

  const handleShareDirectPay = (expense: Expense, specificAmount?: number) => {
    const payer = findMember(expense.paidById);
    const pInfo = expense.paymentInfo || payer.paymentInfo || userPaymentInfo;
    const grp = groups.find((g) => g.id === expense.groupId) || activeGroup;
    const share =
      specificAmount !== undefined ? specificAmount : expense.amount / (grp?.memberIds.length || 1);

    const text = generateSharePaymentText({
      description: expense.description,
      amount: share,
      recipientName: payer.name,
      paypalHandle: pInfo.paypalHandle,
      iban: pInfo.iban,
      bic: pInfo.bic,
      accountHolder: pInfo.accountHolder || payer.name,
      lang,
    });

    if (navigator.share) {
      navigator
        .share({
          title: `${t.appName}: ${expense.description}`,
          text,
        })
        .catch(() => {
          handleCopyText(text, t.shareDirectPay);
        });
    } else {
      handleCopyText(text, t.shareDirectPay);
    }
  };

  const handleOpenEditExpensePayment = (expense: Expense) => {
    const pInfo = expense.paymentInfo || userPaymentInfo;
    setEditPaymentPaypal(pInfo.paypalHandle || '');
    setEditPaymentIban(pInfo.iban || '');
    setEditPaymentBic(pInfo.bic || '');
    setEditPaymentAccountHolder(pInfo.accountHolder || findMember(expense.paidById).name);
    setEditPaymentSaveAsDefault(false);
    setEditingExpensePayment(expense);
  };

  const handleSaveExpensePaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingExpensePayment) return;

    const newPaymentInfo: PaymentInfo = {
      paypalHandle: cleanPayPalHandle(editPaymentPaypal),
      iban: editPaymentIban.trim(),
      bic: editPaymentBic.trim(),
      accountHolder:
        editPaymentAccountHolder.trim() || findMember(editingExpensePayment.paidById).name,
    };

    const updatedExpense: Expense = {
      ...editingExpensePayment,
      paymentInfo: newPaymentInfo,
    };

    setExpenses((prev) => {
      const updated = prev.map((e) => (e.id === editingExpensePayment.id ? updatedExpense : e));
      MiniNodeAPI.db.saveExpenses(updated);
      return updated;
    });

    if (joinedRoom && editingExpensePayment.groupId === selectedGroupId) {
      joinedRoom.setState({
        expenses: { ...(joinedRoom.state.expenses || {}), [updatedExpense.id]: updatedExpense },
      });
    }

    if (editPaymentSaveAsDefault) {
      setUserPaymentInfo(newPaymentInfo);
      setBillPaypalHandle(newPaymentInfo.paypalHandle || '');
      setBillIban(newPaymentInfo.iban || '');
      setBillBic(newPaymentInfo.bic || '');
      setBillAccountHolder(newPaymentInfo.accountHolder || '');
      const currPrefs = (await MiniNodeAPI.db.getPrefs()) || {};
      await MiniNodeAPI.db.setPrefs({ ...currPrefs, paymentInfo: newPaymentInfo });
    }

    setEditingExpensePayment(null);
    triggerToast(
      lang === 'de' ? 'Direct-Pay Zahlungsdaten aktualisiert!' : 'Direct payment details updated!',
    );
  };

  const handlePreviewBillDirectPay = () => {
    const parsedAmount = billAmountValue;
    const targetGroup = groups.find((g) => g.id === billGroupId) || activeGroup;
    const memberCount = targetGroup?.memberIds.length || 1;
    const share = parsedAmount > 0 ? parsedAmount / memberCount : 25;

    const currentPayerId = currentUser?.id || 'user_me';
    const payer = findMember(currentPayerId);
    const pInfo: PaymentInfo = {
      paypalHandle: cleanPayPalHandle(billPaypalHandle),
      iban: billIban.trim(),
      bic: billBic.trim(),
      accountHolder: billAccountHolder.trim() || payer.name,
    };

    setDirectPayActiveTab('all');
    setDirectPayModalData({
      expense: {
        id: 'preview',
        groupId: billGroupId,
        description: billDescription || (lang === 'de' ? 'Neue Rechnung' : 'New Bill'),
        amount: parsedAmount || share * memberCount,
        paidById: currentPayerId,
        date: 'Today',
        category: billCategory,
        splitType: billSplitType,
        splitDetails: {},
        paymentInfo: pInfo,
      },
      payer,
      amount: share,
      reference: `${t.appName}: ${billDescription || 'Split Bill'}`,
      paymentInfo: pInfo,
      groupId: billGroupId,
    });
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    triggerToast(`${label} ${t.copied}`);
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleMarkDirectPaymentSettled = () => {
    if (!directPayModalData) return;
    const { payer, amount, groupId } = directPayModalData;
    const currentUserId = currentUser?.id || 'user_me';

    const newSettlement: Settlement = {
      id: `set_${Date.now()}`,
      groupId,
      fromMemberId: currentUserId,
      toMemberId: payer.id,
      amount,
      date: 'Today',
      verified: true,
    };

    const newActivity: ActivityLog = {
      id: `act_${Date.now()}`,
      groupId,
      memberId: currentUserId,
      type: 'settlement_made',
      title: `${currentUser?.username || (lang === 'de' ? 'Ich' : 'You')} ${t.settlementRegistered} ${payer.name} (${money(amount)})`,
      amount: -amount,
      date: new Date().toISOString(),
    };

    setSettlements((prev) => {
      const updated = [...prev, newSettlement];
      MiniNodeAPI.db.saveSettlements(updated);
      return updated;
    });

    setActivities((prev) => {
      const updated = [newActivity, ...prev];
      MiniNodeAPI.db.saveActivities(updated);
      return updated;
    });

    if (joinedRoom && groupId === selectedGroupId) {
      joinedRoom.setState({
        settlements: { ...(joinedRoom.state.settlements || {}), [newSettlement.id]: newSettlement },
        activities: { ...(joinedRoom.state.activities || {}), [newActivity.id]: newActivity },
      });
    }

    setDirectPayModalData(null);
    triggerToast(
      lang === 'de'
        ? `Zahlung über ${money(amount)} verbucht!`
        : `Payment of ${money(amount)} recorded!`,
    );
  };

  const handleSavePaymentPreferences = async () => {
    try {
      const currentUserName = currentUser?.username || (lang === 'de' ? 'Ich' : 'You');
      const updatedInfo: PaymentInfo = {
        paypalHandle: cleanPayPalHandle(userPaymentInfo.paypalHandle || ''),
        iban: userPaymentInfo.iban?.trim() || '',
        bic: userPaymentInfo.bic?.trim() || '',
        accountHolder: userPaymentInfo.accountHolder?.trim() || currentUserName,
      };
      setUserPaymentInfo(updatedInfo);
      setBillPaypalHandle(updatedInfo.paypalHandle || '');
      setBillIban(updatedInfo.iban || '');
      setBillBic(updatedInfo.bic || '');
      setBillAccountHolder(updatedInfo.accountHolder || '');

      const currPrefs = (await MiniNodeAPI.db.getPrefs()) || {};
      await MiniNodeAPI.db.setPrefs({ ...currPrefs, paymentInfo: updatedInfo });
      triggerToast(lang === 'de' ? 'Zahlungsdaten gespeichert!' : 'Payment details saved!');
    } catch (err) {
      triggerToast(lang === 'de' ? 'Fehler beim Speichern.' : 'Failed to save.');
    }
  };

  const handleInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim()) return;

    const newMemberId = generateId('usr');
    const newMember: Member = {
      id: newMemberId,
      name: inviteName.trim(),
      email:
        inviteEmail.trim() ||
        `${inviteName.trim().toLowerCase().replace(/\s+/g, '')}@billthesplitter.app`,
      avatarUrl: avatarFor(inviteName.trim()),
    };

    const updatedMembers = [...members, newMember];
    setMembers(updatedMembers);
    await MiniNodeAPI.db.saveMembers(updatedMembers);

    const updatedGroups = groups.map((g) => {
      if (g.id === selectedGroupId) {
        const updatedG = { ...g, memberIds: Array.from(new Set([...g.memberIds, newMember.id])) };
        MiniNodeAPI.db.saveGroup(updatedG);
        return updatedG;
      }
      return g;
    });
    setGroups(updatedGroups);

    if (joinedRoom) {
      const updatedMemberIds = Array.from(
        new Set([...(joinedRoom.state.memberIds || []), newMemberId]),
      );
      joinedRoom.setState({
        members: { ...(joinedRoom.state.members || {}), [newMember.id]: newMember },
        memberIds: updatedMemberIds,
      });
    }

    setIsInviteModalOpen(false);
    setInviteName('');
    setInviteEmail('');
    triggerToast(
      lang === 'de' ? `${inviteName} wurde hinzugefügt!` : `${inviteName} invited successfully!`,
    );
  };

  return (
    <div
      className={
        isDarkMode
          ? 'dark bg-slate-950 text-slate-100 min-h-screen transition-colors duration-200'
          : 'bg-slate-50 text-slate-800 min-h-screen transition-colors duration-200'
      }
    >
      {/* Dynamic Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-6 py-3.5 rounded-full shadow-lg flex items-center gap-2 font-bold text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{toastMessage}</span>
            {toastAction && (
              <button
                type="button"
                onClick={() => {
                  toastAction.run();
                  setToastMessage(null);
                  setToastAction(null);
                }}
                className="ml-2 min-h-9 px-3 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-sm underline-offset-2"
              >
                {toastAction.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex h-screen overflow-hidden">
        {/* SIDE BAR NAVIGATION */}
        <aside className="hidden md:flex flex-col h-screen w-72 flex-shrink-0 bg-slate-100/80 dark:bg-slate-900/90 py-10 px-6 border-r border-slate-200 dark:border-slate-800 transition-colors">
          <a
            href={portalUrl}
            className="mb-4 -mt-4 ml-2 inline-flex min-h-11 items-center gap-1.5 self-start text-xs font-bold text-slate-500 hover:text-[#006c49] dark:text-slate-400 focus-visible:outline-2 focus-visible:outline-[#006c49]"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              arrow_back
            </span>
            {lang === 'de' ? 'Alle Apps' : 'All apps'}
          </a>
          {/* Logo Brand Frame */}
          <div className="mb-10 pl-2">
            <h1 className="font-display text-[#006c49] dark:text-[#10b981] font-black tracking-tight text-2xl flex items-center gap-2">
              <span className="material-symbols-outlined text-[28px]">payments</span>
              <span>{t.appName}</span>
            </h1>
            <p className="text-slate-400 dark:text-slate-500 font-bold text-[9px] mt-2 tracking-widest uppercase">
              {lang === 'de' ? 'FINANZ-AUFTEILER' : 'FINANCIAL SPLITTER'}
            </p>
          </div>

          <nav className="flex-1 space-y-2">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center gap-4 px-4 py-3.5 transition-all rounded-xl text-left font-bold text-sm ${
                currentView === 'dashboard'
                  ? 'bg-white dark:bg-slate-800 text-[#006c49] dark:text-[#10b981] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/30'
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontVariationSettings: currentView === 'dashboard' ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                dashboard
              </span>
              <span>{t.dashboard}</span>
            </button>

            <button
              onClick={() => setCurrentView('groups')}
              className={`w-full flex items-center gap-4 px-4 py-3.5 transition-all rounded-xl text-left font-bold text-sm ${
                currentView === 'groups' || currentView === 'group-detail'
                  ? 'bg-white dark:bg-slate-800 text-[#006c49] dark:text-[#10b981] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/30'
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontVariationSettings:
                    currentView === 'groups' || currentView === 'group-detail'
                      ? "'FILL' 1"
                      : "'FILL' 0",
                }}
              >
                group
              </span>
              <span>{t.groups}</span>
            </button>

            <button
              onClick={() => setCurrentView('activity')}
              className={`w-full flex items-center gap-4 px-4 py-3.5 transition-all rounded-xl text-left font-bold text-sm ${
                currentView === 'activity'
                  ? 'bg-white dark:bg-slate-800 text-[#006c49] dark:text-[#10b981] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/30'
              }`}
            >
              <span className="material-symbols-outlined">receipt_long</span>
              <span>{t.activity}</span>
            </button>

            <button
              onClick={() => setCurrentView('settings')}
              className={`w-full flex items-center gap-4 px-4 py-3.5 transition-all rounded-xl text-left font-bold text-sm ${
                currentView === 'settings'
                  ? 'bg-white dark:bg-slate-800 text-[#006c49] dark:text-[#10b981] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/30'
              }`}
            >
              <span className="material-symbols-outlined">settings</span>
              <span>{t.settings}</span>
            </button>
          </nav>

          {/* Bottom Left Navigation Area with Controls */}
          <div className="pt-8 border-t border-slate-200/60 dark:border-slate-800/60">
            <button
              onClick={() => startNewBill()}
              className="w-full bg-[#006c49] hover:bg-[#005236] dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white py-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>{t.addBill}</span>
            </button>
          </div>
        </aside>

        {/* MAIN DISPLAY CANVAS */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Mobile Navigation Header */}
          <header className="md:hidden flex justify-between items-center px-6 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-40 fixed top-0 w-full">
            <h1 className="font-display text-[#006c49] dark:text-[#10b981] font-black text-lg tracking-tight flex items-center gap-2">
              <a
                href={portalUrl}
                aria-label={lang === 'de' ? 'Alle Apps' : 'All apps'}
                className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 focus-visible:outline-2 focus-visible:outline-[#006c49]"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </a>
              <span className="material-symbols-outlined">payments</span>
              <span>{t.appName}</span>
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isDarkMode ? 'dark_mode' : 'light_mode'}
                </span>
              </button>
            </div>
          </header>

          {/* Core Content Viewer (Scrollable) */}
          <main className="flex-1 overflow-y-auto pt-20 md:pt-10 pb-24 md:pb-10 px-6 md:px-10 max-w-7xl w-full mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView + (currentView === 'group-detail' ? selectedGroupId : '')}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.15 }}
                className="space-y-8"
              >
                {/* 1. DASHBOARD VIEW */}
                {currentView === 'dashboard' && (
                  <div className="space-y-8">
                    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                      <div>
                        <h2 className="font-display text-3xl font-black text-black dark:text-white tracking-tight">
                          {t.welcomeBack},{' '}
                          {currentUser?.username || (lang === 'de' ? 'Hallo' : 'Hello')}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                          {lang === 'de'
                            ? 'Deine finanzielle Übersicht über alle aktiven Gruppen.'
                            : 'Your financial standing across all shared ledgers.'}
                        </p>
                      </div>
                    </header>

                    {/* Balance Cards Frame */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Live Total Balance Panel */}
                      <div className="lg:col-span-2 bg-[#10b981]/5 dark:bg-[#10b981]/10 border border-[#10b981]/20 dark:border-[#10b981]/30 rounded-2xl p-6 flex flex-col justify-between space-y-6">
                        <div className="space-y-4">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#006c49] dark:text-[#10b981] bg-[#006c49]/10 dark:bg-[#10b981]/10 px-3 py-1.5 rounded-full">
                            {t.totalBalance}
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-5xl font-black text-[#006c49] dark:text-[#10b981]">
                              {globalOverview.totalBalance >= 0 ? '+' : '-'}
                              {money(Math.abs(globalOverview.totalBalance))}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400 font-bold text-sm">
                              {globalOverview.totalBalance >= 0 ? t.youAreOwed : t.youOwe}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                              {t.youAreOwed}
                            </span>
                            <p className="font-mono text-xl font-bold text-[#006c49] dark:text-[#10b981] mt-0.5">
                              {money(globalOverview.owedToYou)}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                              {t.youOwe}
                            </span>
                            <p className="font-mono text-xl font-bold text-rose-500 dark:text-rose-400 mt-0.5">
                              {money(globalOverview.youOwe)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Visual Monthly spend panel */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                              {lang === 'de' ? 'Ausgaben diesen Monat' : 'Monthly Spend'}
                            </span>
                            <h4 className="font-mono text-2xl font-black text-slate-900 dark:text-white mt-1">
                              {money(currentMonthExpensesTotal)}
                            </h4>
                          </div>
                          <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981] bg-emerald-50 dark:bg-emerald-950 p-2 rounded-xl">
                            analytics
                          </span>
                        </div>

                        {/* Spark Bar chart layout */}
                        <div className="h-20 w-full flex items-end gap-2 pt-2">
                          {monthlySpendsLast6Months.map((item, idx) => {
                            const val = sparkHeights[idx];
                            const isCurrentMonth = idx === 5;
                            return (
                              <div
                                key={idx}
                                className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
                                title={`${item.label}: ${money(item.amount)}`}
                              >
                                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t h-16 relative overflow-hidden">
                                  <div
                                    style={{ height: `${val}%` }}
                                    className={`absolute bottom-0 left-0 w-full rounded-t transition-all ${isCurrentMonth ? 'bg-[#006c49] dark:bg-[#10b981]' : 'bg-slate-300 dark:bg-slate-700'}`}
                                  />
                                </div>
                                <span className="text-[8px] text-slate-400 font-bold uppercase">
                                  {item.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Upcoming Deadlines Alert Banner if active */}
                    {upcomingDeadlineExpenses.length > 0 && (
                      <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs uppercase font-extrabold tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">alarm</span>
                            <span>
                              {t.upcomingDeadlines} ({upcomingDeadlineExpenses.length})
                            </span>
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {upcomingDeadlineExpenses.slice(0, 3).map((exp) => {
                            const grp = groups.find((g) => g.id === exp.groupId);
                            const deadlineInfo = computeDeadlineStatus(exp.dueDate);
                            return (
                              <div
                                key={exp.id}
                                className="bg-white dark:bg-slate-900 border border-amber-200/60 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-2xs"
                              >
                                <div className="min-w-0 pr-2">
                                  <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                                    {exp.description}
                                  </p>
                                  <p className="text-[10px] text-slate-400 truncate">
                                    {grp?.name || 'Shared Group'}
                                  </p>
                                  <span
                                    className={`inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-bold ${deadlineInfo.badgeColor}`}
                                  >
                                    {deadlineInfo.label[lang]}
                                  </span>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                    {money(exp.amount)}
                                  </p>
                                  <button
                                    onClick={() => handleSendExpenseReminder(exp)}
                                    className="mt-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-900 dark:text-amber-200 rounded text-[10px] font-bold flex items-center gap-1"
                                    title={t.sendReminder}
                                  >
                                    <span className="material-symbols-outlined text-[11px]">
                                      notifications
                                    </span>
                                    <span>{lang === 'de' ? 'Erinnern' : 'Remind'}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Split Sections lists */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                      {/* Active groups frame (8 columns) */}
                      <div className="lg:col-span-8 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
                            {lang === 'de' ? 'Aktive Gruppen' : 'Active Groups'}
                          </h3>
                          <button
                            onClick={() => setCurrentView('groups')}
                            className="text-[#006c49] dark:text-[#10b981] hover:underline text-xs font-bold flex items-center gap-1"
                          >
                            {lang === 'de' ? 'Alle ansehen' : 'View All'}{' '}
                            <span className="material-symbols-outlined text-xs">arrow_forward</span>
                          </button>
                        </div>

                        {groups.length === 0 ? (
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
                            <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-700">
                              group_off
                            </span>
                            <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold">
                              {t.noGroupsYet}
                            </p>
                            <button
                              onClick={() => setIsCreateGroupModalOpen(true)}
                              className="px-5 py-2 bg-[#006c49] dark:bg-emerald-600 text-white rounded-xl text-xs font-bold"
                            >
                              {t.newGroup}
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {groups.map((grp) => {
                              const stats = calculateGroupBalances(
                                grp,
                                expenses,
                                settlements,
                                currentUser?.id || 'u1',
                              );
                              return (
                                <div
                                  key={grp.id}
                                  onClick={() => {
                                    setSelectedGroupId(grp.id);
                                    setCurrentView('group-detail');
                                  }}
                                  className="bg-white dark:bg-slate-900 border border-[#c2c2c2] dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:border-[#006c49] dark:hover:border-emerald-500 transition-all cursor-pointer flex flex-col justify-between h-44"
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-emerald-950/50 border border-[#c2c2c2] dark:border-transparent text-[#006c49] dark:text-[#10b981] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-[18px]">
                                          folder_shared
                                        </span>
                                      </div>
                                      <div>
                                        <h4 className="font-bold text-black dark:text-slate-100 text-sm">
                                          {grp.name}
                                        </h4>
                                        <p className="text-xs text-slate-400">
                                          {grp.memberIds.length} {t.members}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-1.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-slate-400 font-bold">
                                        {lang === 'de' ? 'Dein Saldo' : 'Your standing'}
                                      </span>
                                      <span
                                        className={`font-mono font-bold ${stats.userNetBalance > 0 ? 'text-[#006c49] dark:text-[#10b981]' : stats.userNetBalance < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400'}`}
                                      >
                                        {stats.userNetBalance > 0 ? `+${money(stats.userNetBalance)}` : money(stats.userNetBalance)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Recent log updates timeline (4 columns) */}
                      <div className="lg:col-span-4 space-y-4">
                        <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
                          {t.activity}
                        </h3>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
                          {activities.length === 0 ? (
                            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">
                              {t.noActivitiesYet}
                            </p>
                          ) : (
                            activities.slice(0, 4).map((act) => (
                              <div
                                key={act.id}
                                className="py-3 first:pt-0 last:pb-0 flex items-start gap-3"
                              >
                                <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 mt-0.5">
                                  {act.type === 'settlement_made' ? 'check_circle' : 'receipt'}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight truncate">
                                    {act.title}
                                  </p>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {actTime(act.date)}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. GROUPS VIEW */}
                {currentView === 'groups' && (
                  <div className="space-y-6">
                    <header className="flex items-center justify-between">
                      <div>
                        <h2 className="font-display text-3xl font-black text-black dark:text-white">
                          {t.allGroups}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                          {lang === 'de'
                            ? 'Verwalte deine geteilten Rechnungen und Reisekosten.'
                            : 'Manage your sharing agreements and trip ledgers.'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {groups.some(
                          (grp) =>
                            !grp.creatorId || (currentUser && grp.creatorId === currentUser.id),
                        ) && (
                          <button
                            onClick={handleDeleteAllGroups}
                            className="border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/20 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              delete_sweep
                            </span>
                            <span>{lang === 'de' ? 'Alle löschen' : 'Delete All'}</span>
                          </button>
                        )}
                        <button
                          onClick={() => setIsJoinGroupModalOpen(true)}
                          className="border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">group_work</span>
                          <span>{t.joinGroup}</span>
                        </button>
                        <button
                          onClick={() => setIsCreateGroupModalOpen(true)}
                          className="bg-[#006c49] dark:bg-emerald-600 text-white hover:bg-[#005236] px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>
                          <span>{t.newGroup}</span>
                        </button>
                      </div>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {groups.map((grp) => {
                        const stats = calculateGroupBalances(
                          grp,
                          expenses,
                          settlements,
                          currentUser?.id || 'u1',
                        );
                        return (
                          <div
                            key={grp.id}
                            onClick={() => {
                              setSelectedGroupId(grp.id);
                              setCurrentView('group-detail');
                            }}
                            className="bg-white dark:bg-slate-900 border border-[#c2c2c2] dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-[#006c49] transition-all cursor-pointer flex flex-col justify-between h-48"
                          >
                            <div className="space-y-2">
                              <span className="text-[9px] uppercase font-bold tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 px-2.5 py-1 rounded-full">
                                {grp.category}
                              </span>
                              <h3 className="font-bold text-black dark:text-white text-base mt-2">
                                {grp.name}
                              </h3>
                              <p className="text-xs text-slate-400">{grp.location}</p>
                            </div>

                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                              <span className="text-xs text-slate-400">
                                {grp.memberIds.length} {t.members}
                              </span>
                              <p
                                className={`text-sm font-mono font-bold ${stats.userNetBalance > 0 ? 'text-[#006c49] dark:text-[#10b981]' : stats.userNetBalance < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400'}`}
                              >
                                {stats.userNetBalance > 0 ? `+${money(stats.userNetBalance)}` : money(stats.userNetBalance)}
                              </p>
                            </div>
                          </div>
                        );
                      })}

                      {/* Quick Add Block */}
                      <div
                        onClick={() => setIsCreateGroupModalOpen(true)}
                        className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-[#006c49] rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all h-48 text-slate-400 hover:text-[#006c49] dark:hover:text-[#10b981]"
                      >
                        <span className="material-symbols-outlined text-4xl">add_circle</span>
                        <span className="font-bold text-sm">{t.newGroup}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. GROUP DETAIL VIEW */}
                {currentView === 'group-detail' && activeGroup && (
                  <div className="space-y-6">
                    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentView('groups')}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            <span className="material-symbols-outlined">arrow_back</span>
                          </button>
                          <h2 className="font-display text-3xl font-black text-black dark:text-white tracking-tight">
                            {activeGroup.name}
                          </h2>
                        </div>
                        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1 pl-8">
                          {[activeGroup.location, `${activeGroup.memberIds.length} ${t.members}`]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>

                        {/* Multiplayer status badge */}
                        <div className="flex items-center gap-2 mt-3 pl-8">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(activeGroup.id);
                              triggerToast(t.copiedJoinCode);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#006c49] rounded-full text-[10px] font-bold shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[12px]">
                              content_copy
                            </span>
                            <span>
                              {t.roomCode}: <span className="font-mono">{activeGroup.id}</span>
                            </span>
                          </button>

                          {joinedRoom && (
                            <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-[#006c49] dark:text-[#10b981] rounded-full text-[10px] font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>
                                {t.liveMultiplayer} ({roomPlayers.length} {t.onlineNow})
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 md:self-end">
                        {(!activeGroup.creatorId ||
                          (currentUser && activeGroup.creatorId === currentUser.id)) && (
                          <button
                            onClick={() => handleDeleteGroup(activeGroup.id)}
                            className="p-2.5 border border-rose-200 dark:border-rose-900/40 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 transition-all"
                            title={lang === 'de' ? 'Gruppe löschen' : 'Delete Group'}
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setNewGroupName(activeGroup.name);
                            setNewGroupLocation(activeGroup.location);
                            setNewGroupCategory(activeGroup.category);
                            setIsEditGroupModalOpen(true);
                          }}
                          className="p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        >
                          <span className="material-symbols-outlined text-[18px]">settings</span>
                        </button>
                        <button
                          onClick={() => startNewBill(activeGroup.id)}
                          className="bg-[#006c49] dark:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow"
                        >
                          {t.addExpense}
                        </button>
                      </div>
                    </header>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                      {/* Left Block: Split with AI and Expenses */}
                      <div className="lg:col-span-8 space-y-6">
                        {/* Intelligent Quick split */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                          <h4 className="font-bold text-sm text-slate-850 dark:text-slate-100 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981]">
                              magic_button
                            </span>
                            <span>{t.quickSplitAI}</span>
                          </h4>
                          <p className="text-xs text-slate-400 dark:text-slate-400 leading-relaxed">
                            {t.aiDesc}
                          </p>

                          <div className="space-y-3">
                            <textarea
                              value={aiSentence}
                              onChange={(e) => setAiSentence(e.target.value)}
                              placeholder={t.aiPlaceholder}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-[#006c49] h-20 resize-none"
                            />
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                                {lang === 'de' ? 'Gruppenmitglieder' : 'Members'}:{' '}
                                {activeGroup.memberIds.map((id) => findMember(id).name).join(', ')}
                              </span>
                              <button
                                onClick={handleParseAiExpense}
                                disabled={isAiParsing || !aiSentence.trim()}
                                className="bg-[#006c49] dark:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {isAiParsing ? t.parsing : t.quickParse}
                              </button>
                            </div>
                          </div>

                          {/* AI preview box */}
                          {aiParsedResult && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-4 space-y-3"
                            >
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] uppercase font-bold text-[#006c49] dark:text-[#10b981]">
                                  {t.parsedPreview}
                                </span>
                                <button
                                  onClick={() => setAiParsedResult(null)}
                                  className="text-xs text-slate-400 hover:text-slate-600"
                                >
                                  {t.cancel}
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <span className="text-slate-400 font-bold block text-[10px]">
                                    {t.description}
                                  </span>
                                  <span className="font-bold dark:text-white">
                                    {aiParsedResult.desc}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 font-bold block text-[10px]">
                                    {t.amount}
                                  </span>
                                  <span className="font-mono font-bold text-[#006c49] dark:text-[#10b981]">
                                    {money(aiParsedResult.amount)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 font-bold block text-[10px]">
                                    {t.paidBy}
                                  </span>
                                  <span className="font-bold dark:text-white">
                                    {aiParsedResult.paidBy}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={handleConfirmAiParsedExpense}
                                className="w-full py-2.5 bg-[#006c49] dark:bg-emerald-600 text-white rounded-xl text-xs font-bold"
                              >
                                {t.confirmAndSplit}
                              </button>
                            </motion.div>
                          )}
                        </div>

                        {/* Recent Expenses List with Receipt Thumbnails, Deadlines & Reminders */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                              {t.recentExpenses}
                            </h3>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setExpenseFilter('all')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${expenseFilter === 'all' ? 'bg-[#006c49] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                              >
                                {lang === 'de' ? 'Alle' : 'All'}
                              </button>
                              <button
                                onClick={() => setExpenseFilter('receipt')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${expenseFilter === 'receipt' ? 'bg-[#006c49] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                              >
                                <span className="material-symbols-outlined text-[13px]">image</span>
                                <span>{lang === 'de' ? 'Mit Beleg' : 'With Receipt'}</span>
                              </button>
                              <button
                                onClick={() => setExpenseFilter('deadline')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${expenseFilter === 'deadline' ? 'bg-[#006c49] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                              >
                                <span className="material-symbols-outlined text-[13px]">event</span>
                                <span>{lang === 'de' ? 'Mit Frist' : 'With Deadline'}</span>
                              </button>
                            </div>
                          </div>

                          {displayedExpenses.length === 0 ? (
                            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-10">
                              {expenseFilter === 'all'
                                ? t.noExpensesYet
                                : lang === 'de'
                                  ? 'Keine Ausgaben mit diesem Filter gefunden.'
                                  : 'No expenses match this filter.'}
                            </p>
                          ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                              {displayedExpenses.map((exp) => {
                                const isUserPayer = exp.paidById === (currentUser?.id || 'u1');
                                const myId = currentUser?.id || 'u1';
                                const partCount = participantsOf(exp, activeGroup.memberIds).length;
                                // What the signed-in person owes for this expense (0: not part of it).
                                const share = fromCents(
                                  expenseShares(exp, activeGroup.memberIds)[myId] ?? 0,
                                );
                                // The average part, for the link the payer shares with the others.
                                const perHead = fromCents(
                                  Math.round(toCents(exp.amount) / Math.max(1, partCount)),
                                );
                                const deadlineInfo = computeDeadlineStatus(exp.dueDate);

                                return (
                                  <div
                                    key={exp.id}
                                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                                  >
                                    <div className="flex items-start gap-3">
                                      {/* Receipt Thumbnail or Category Icon */}
                                      {exp.receiptUrl ? (
                                        <div
                                          onClick={() => setActiveReceiptModal(exp)}
                                          className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer relative group flex-shrink-0 shadow-sm"
                                          title={t.viewReceipt}
                                        >
                                          <img
                                            src={exp.receiptUrl}
                                            alt="Receipt thumbnail"
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                          />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <span className="material-symbols-outlined text-white text-[16px]">
                                              visibility
                                            </span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="material-symbols-outlined text-[20px] text-[#006c49] dark:text-[#10b981] bg-[#006c49]/10 dark:bg-[#10b981]/10 p-2.5 rounded-xl flex-shrink-0">
                                          receipt
                                        </span>
                                      )}

                                      <div className="space-y-1">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                                          {exp.description}
                                        </h4>
                                        <p className="text-xs text-slate-400">
                                          {findMember(exp.paidById).name} • {dayText(exp.date)}
                                          {partCount < activeGroup.memberIds.length &&
                                            ` • ${t.splitWith.replace('{n}', String(partCount))}`}
                                        </p>

                                        {/* Status Tags Row: Receipts, Deadlines, Reminders, Direct Pay */}
                                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                          {exp.receiptUrl && (
                                            <button
                                              onClick={() => setActiveReceiptModal(exp)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-[#006c49] dark:text-[#10b981] border border-emerald-200/60 dark:border-emerald-900/60 hover:bg-emerald-100"
                                            >
                                              <span className="material-symbols-outlined text-[12px]">
                                                receipt
                                              </span>
                                              <span>{t.receipt}</span>
                                            </button>
                                          )}

                                          {exp.dueDate && (
                                            <span
                                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${deadlineInfo.badgeColor}`}
                                            >
                                              <span className="material-symbols-outlined text-[11px]">
                                                schedule
                                              </span>
                                              <span>{deadlineInfo.label[lang]}</span>
                                            </span>
                                          )}

                                          {exp.remindedAt && (
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 flex items-center gap-1">
                                              <span className="material-symbols-outlined text-[11px]">
                                                notifications_active
                                              </span>
                                              <span>{lang === 'de' ? 'Erinnert' : 'Reminded'}</span>
                                            </span>
                                          )}

                                          {(exp.paymentInfo?.paypalHandle ||
                                            exp.paymentInfo?.iban) && (
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/70 dark:border-sky-900/60 flex items-center gap-1">
                                              <span className="material-symbols-outlined text-[11px] text-sky-600">
                                                bolt
                                              </span>
                                              <span>Direct Pay</span>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Right Side: Amounts & Actions */}
                                    <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                                      <div className="text-left sm:text-right">
                                        <p className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                                          {money(exp.amount)}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-bold">
                                          {isUserPayer
                                            ? `${lang === 'de' ? 'Du verleihst' : 'You lent'} ${money(exp.amount - share)}`
                                            : share > 0
                                              ? `${lang === 'de' ? 'Du schuldest' : 'You owe'} ${money(share)}`
                                              : t.notInvolved}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                        {isUserPayer ? (
                                          <>
                                            {/* Payer Actions: Share payment link, edit payment info, remind */}
                                            <button
                                              onClick={() => handleShareDirectPay(exp, perHead)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#006c49]/10 hover:bg-[#006c49]/20 text-[#006c49] dark:text-[#10b981] transition-colors"
                                              title={
                                                lang === 'de'
                                                  ? 'Zahlungslink mit Anteil teilen'
                                                  : 'Share direct payment link with members'
                                              }
                                            >
                                              <span className="material-symbols-outlined text-[13px]">
                                                share
                                              </span>
                                              <span>
                                                {lang === 'de' ? 'Link teilen' : 'Share Link'}
                                              </span>
                                            </button>

                                            <button
                                              onClick={() => handleOpenEditExpensePayment(exp)}
                                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors"
                                              title={t.editDirectPay}
                                            >
                                              <span className="material-symbols-outlined text-[13px]">
                                                contactless
                                              </span>
                                              <span>
                                                {exp.paymentInfo?.paypalHandle ||
                                                exp.paymentInfo?.iban
                                                  ? 'Direct Pay'
                                                  : '+ Direct Pay'}
                                              </span>
                                            </button>

                                            <button
                                              onClick={() => handleSendExpenseReminder(exp)}
                                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors"
                                              title={t.sendReminder}
                                            >
                                              <span className="material-symbols-outlined text-[13px]">
                                                notifications
                                              </span>
                                            </button>
                                          </>
                                        ) : share <= 0 ? null : (
                                          <>
                                            {/* Debtor Actions: Direct Pay button & fast PayPal button */}
                                            <button
                                              onClick={() => handleOpenDirectPay(exp, share)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#006c49] dark:bg-emerald-600 hover:bg-[#005236] text-white transition-colors shadow-2xs"
                                              title={
                                                lang === 'de'
                                                  ? 'Anteil direkt per PayPal oder Banküberweisung begleichen'
                                                  : 'Pay share via PayPal or Bank Transfer'
                                              }
                                            >
                                              <span className="material-symbols-outlined text-[13px]">
                                                payments
                                              </span>
                                              <span>
                                                {t.directPay} ({money(share)})
                                              </span>
                                            </button>

                                            {(exp.paymentInfo?.paypalHandle ||
                                              userPaymentInfo.paypalHandle) && (
                                              <a
                                                href={generatePayPalUrl(
                                                  exp.paymentInfo?.paypalHandle ||
                                                    userPaymentInfo.paypalHandle ||
                                                    '',
                                                  share,
                                                )}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-7 h-7 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs transition-colors"
                                                title="PayPal 1-Klick Zahlung"
                                              >
                                                P
                                              </a>
                                            )}

                                            <button
                                              onClick={() => handleSendExpenseReminder(exp)}
                                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors shadow-2xs"
                                              title={
                                                lang === 'de'
                                                  ? 'Zahlungserinnerung an Gruppe senden'
                                                  : 'Send payment reminder'
                                              }
                                            >
                                              <span className="material-symbols-outlined text-[13px]">
                                                notifications
                                              </span>
                                            </button>
                                          </>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => startEditBill(exp)}
                                          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300"
                                          title={t.editBill}
                                          aria-label={`${t.editBill}: ${exp.description}`}
                                        >
                                          <span className="material-symbols-outlined text-[16px]">edit</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteExpense(exp)}
                                          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 text-slate-500 hover:text-rose-600"
                                          title={t.deleteExpense}
                                          aria-label={`${t.deleteExpense}: ${exp.description}`}
                                        >
                                          <span className="material-symbols-outlined text-[16px]">delete</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Block: Stats and Balances */}
                      <div className="lg:col-span-4 space-y-6">
                        {/* Group Stats card */}
                        <div className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-4 shadow-sm">
                          <h4 className="text-[9px] uppercase font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                            {lang === 'de' ? 'GRUPPENBILANZ' : 'GROUP STANDING'}
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 text-xs font-semibold">
                                {lang === 'de' ? 'Ausgaben gesamt' : 'Total Spent'}
                              </span>
                              <span className="font-mono text-xl font-black text-slate-900 dark:text-white">
                                {money(activeGroupBalances.totalSpent)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                              <span className="text-slate-400 text-xs font-semibold">
                                {lang === 'de' ? 'Dein Anteil' : 'Your share'}
                              </span>
                              <span className="font-mono text-xl font-black text-slate-900 dark:text-white">
                                {money(activeGroupBalances.userShare)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Who pays whom: the fewest payments that settle the group */}
                        {(() => {
                          const cents: { [id: string]: number } = {};
                          for (const [id, value] of Object.entries(
                            activeGroupBalances.memberBalances,
                          ))
                            cents[id] = toCents(Number(value));
                          const transfers = suggestTransfers(cents);
                          return (
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                              <div>
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                                  {t.howToSettle}
                                </h4>
                                <p className="text-xs text-slate-400 mt-0.5">{t.howToSettleHint}</p>
                              </div>
                              {transfers.length === 0 ? (
                                <p className="text-sm font-bold text-[#006c49] dark:text-[#10b981]">
                                  {t.allSettled}
                                </p>
                              ) : (
                                <ul className="space-y-2">
                                  {transfers.map((transfer) => (
                                    <li
                                      key={`${transfer.from}-${transfer.to}`}
                                      className="flex items-center justify-between gap-3"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-sm font-bold dark:text-white">
                                          {t.payerPays
                                            .replace(
                                              '{from}',
                                              transfer.from === meId
                                                ? t.you
                                                : findMember(transfer.from).name,
                                            )
                                            .replace(
                                              '{to}',
                                              transfer.to === meId
                                                ? t.youTo
                                                : findMember(transfer.to).name,
                                            )}
                                        </p>
                                        <p className="font-mono text-sm text-slate-600 dark:text-slate-300">
                                          {money(fromCents(transfer.amount))}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => recordTransfer(transfer)}
                                        className="min-h-11 px-3 rounded-xl text-xs font-bold bg-[#006c49] hover:bg-[#005236] text-white flex-shrink-0"
                                      >
                                        {t.bookAsPaid}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })()}

                        {/* Members outstanding balances list with individual reminder actions */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                              {t.members}
                            </h4>
                            <div className="flex items-center gap-2">
                              {activeGroup.memberIds.some(
                                (id) =>
                                  id !== (currentUser?.id || 'u1') &&
                                  (activeGroupBalances.memberBalances[id] || 0) < 0,
                              ) && (
                                <button
                                  onClick={handleRemindAllDebtors}
                                  className="text-[11px] text-amber-600 dark:text-amber-400 font-bold hover:underline flex items-center gap-0.5"
                                  title={t.remindAllDebtors}
                                >
                                  <span className="material-symbols-outlined text-[13px]">
                                    notifications_active
                                  </span>
                                  <span>{lang === 'de' ? 'Erinnern' : 'Remind All'}</span>
                                </button>
                              )}
                              <button
                                onClick={() => setIsInviteModalOpen(true)}
                                className="text-xs text-[#006c49] dark:text-[#10b981] font-bold"
                              >
                                + {lang === 'de' ? 'Einladen' : 'Invite'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {activeGroup.memberIds.map((id) => {
                              const m = findMember(id);
                              const balance = activeGroupBalances.memberBalances[id] || 0;
                              const isMe = id === (currentUser?.id || 'u1');

                              return (
                                <div key={id} className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <img
                                      className="w-8 h-8 rounded-full border border-slate-200"
                                      src={m.avatarUrl}
                                      alt=""
                                      referrerPolicy="no-referrer"
                                    />
                                    <div>
                                      <p className="text-xs font-bold dark:text-white">
                                        {isMe ? (lang === 'de' ? 'Du' : 'You') : m.name}
                                      </p>
                                      <p
                                        className={`text-xs font-bold ${balance > 0 ? 'text-[#006c49] dark:text-[#10b981]' : balance < 0 ? 'text-rose-500' : 'text-slate-400'}`}
                                      >
                                        {balance > 0
                                          ? `${lang === 'de' ? 'Bekommt' : 'Gets back'} ${money(balance)}`
                                          : balance < 0
                                            ? `${lang === 'de' ? 'Schuldet' : 'Owes'} ${money(Math.abs(balance))}`
                                            : t.settledUp}
                                      </p>
                                    </div>
                                  </div>

                                  {!isMe && balance !== 0 && (
                                    <div className="flex items-center gap-1.5">
                                      {balance > 0 && (
                                        <button
                                          onClick={() => handleOpenDirectPayForMember(id, balance)}
                                          className="text-[9px] font-bold uppercase tracking-wider bg-[#006c49] hover:bg-[#005236] text-white px-2 py-1 rounded flex items-center gap-1 shadow-2xs"
                                          title={t.directPay}
                                        >
                                          <span className="material-symbols-outlined text-[11px]">
                                            payments
                                          </span>
                                          <span>{t.directPay}</span>
                                        </button>
                                      )}
                                      {balance < 0 && (
                                        <>
                                          <button
                                            onClick={() => handleRemindDebtor(id, balance)}
                                            className="p-1 rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                            title={t.sendReminder}
                                          >
                                            <span className="material-symbols-outlined text-[16px]">
                                              notifications
                                            </span>
                                          </button>
                                          <button
                                            onClick={() => {
                                              const text = generateSharePaymentText({
                                                description: `Ausgleich in ${activeGroup.name}`,
                                                amount: Math.abs(balance),
                                                recipientName:
                                                  userPaymentInfo.accountHolder ||
                                                  currentUser?.username ||
                                                  (lang === 'de' ? 'Ich' : 'You'),
                                                paypalHandle: userPaymentInfo.paypalHandle,
                                                iban: userPaymentInfo.iban,
                                                bic: userPaymentInfo.bic,
                                                accountHolder: userPaymentInfo.accountHolder,
                                                lang,
                                              });
                                              handleCopyText(text, t.shareDirectPay);
                                            }}
                                            className="p-1 rounded-md text-slate-400 hover:text-[#006c49] dark:hover:text-[#10b981]"
                                            title={t.shareDirectPay}
                                          >
                                            <span className="material-symbols-outlined text-[16px]">
                                              share
                                            </span>
                                          </button>
                                        </>
                                      )}
                                      <button
                                        onClick={() => openSettleForMember(id, balance)}
                                        className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 px-2 py-1 rounded"
                                      >
                                        {t.settleUp}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Interactive Info tip box */}
                        <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex gap-3 items-start">
                          <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981] text-base mt-0.5">
                            info
                          </span>
                          <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                            {t.quickInsightAlert}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. ACTIVITY VIEW */}
                {currentView === 'activity' && (
                  <div className="space-y-6 max-w-3xl">
                    <header>
                      <h2 className="font-display text-3xl font-black text-black dark:text-white">
                        {t.allActivityLogs}
                      </h2>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        {t.activityLogsDesc}
                      </p>
                    </header>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
                      {activities.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <span className="material-symbols-outlined text-4xl mb-2">history</span>
                          <p className="text-sm font-semibold">{t.noActivitiesYet}</p>
                        </div>
                      ) : (
                        activities.map((act) => (
                          <div
                            key={act.id}
                            className="p-5 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/35"
                          >
                            <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981] bg-[#006c49]/10 p-2.5 rounded-full">
                              {act.type === 'settlement_made' ? 'handshake' : 'receipt_long'}
                            </span>
                            <div className="flex-1">
                              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">
                                {act.title}
                              </p>
                              <p className="text-xs text-slate-400 mt-1">{actTime(act.date)}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 5. SETTINGS VIEW */}
                {currentView === 'settings' && (
                  <div className="space-y-6 max-w-2xl">
                    <header>
                      <h2 className="font-display text-3xl font-black text-black dark:text-white">
                        {t.settings}
                      </h2>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        {lang === 'de'
                          ? 'Verwalte deine persönlichen Einstellungen.'
                          : 'Configure your personal dashboard setup and preferences.'}
                      </p>
                    </header>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-850 dark:text-slate-100 text-sm">
                            {lang === 'de' ? 'Echtzeit-Mitteilungen' : 'Push Notifications'}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {lang === 'de'
                              ? 'Benachrichtige mich bei Änderungen an Rechnungen & Fristen.'
                              : 'Notify me on changes to bills, deadlines, or settlements.'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await MiniNodeAPI.notify(
                                `${t.appName} Push-Test`,
                                lang === 'de'
                                  ? 'Push-Mitteilungen sind aktiv und bereit!'
                                  : 'Push notifications are active and working!',
                              );
                              triggerToast(
                                lang === 'de'
                                  ? 'Test-Mitteilung verschickt!'
                                  : 'Test notification sent!',
                              );
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#006c49]/10 text-[#006c49] dark:text-[#10b981] hover:bg-[#006c49]/20"
                          >
                            {lang === 'de' ? 'Test senden' : 'Send test'}
                          </button>
                          <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981] text-3xl font-bold cursor-pointer">
                            toggle_on
                          </span>
                        </div>
                      </div>

                      <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-850 dark:text-slate-100 text-sm">
                            {t.theme}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {lang === 'de'
                              ? 'Designfarbe wechseln.'
                              : 'Change the layout styling theme.'}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const next = !isDarkMode;
                            setIsDarkMode(next);
                            localStorage.setItem('bts_theme', next ? 'dark' : 'light');
                          }}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl"
                        >
                          {isDarkMode ? t.dark : t.light}
                        </button>
                      </div>

                      <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-850 dark:text-slate-100 text-sm">
                            {t.defaultCurrency}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{t.defaultCurrencyDesc}</p>
                        </div>
                        <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-3 py-1.5 rounded-lg">
                          EUR (€)
                        </span>
                      </div>

                      <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

                      {/* Default Payment Details Section */}
                      <div className="space-y-4 pt-1">
                        <div>
                          <p className="font-bold text-slate-850 dark:text-slate-100 text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981]">
                              account_balance_wallet
                            </span>
                            <span>{t.defaultPaymentInfo}</span>
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                            {t.defaultPaymentInfoDesc}
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                              PayPal.Me {lang === 'de' ? 'Benutzername / Link' : 'Username / Link'}
                            </label>
                            <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11">
                              <span className="text-xs text-slate-400 font-mono mr-1">
                                paypal.me/
                              </span>
                              <input
                                type="text"
                                value={userPaymentInfo.paypalHandle || ''}
                                onChange={(e) =>
                                  setUserPaymentInfo({
                                    ...userPaymentInfo,
                                    paypalHandle: e.target.value,
                                  })
                                }
                                placeholder="username"
                                className="bg-transparent border-none w-full text-xs font-mono font-bold text-slate-850 dark:text-slate-100 outline-none"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                                {t.iban}
                              </label>
                              <input
                                type="text"
                                value={userPaymentInfo.iban || ''}
                                onChange={(e) =>
                                  setUserPaymentInfo({ ...userPaymentInfo, iban: e.target.value })
                                }
                                placeholder="DE00 0000 0000 0000 0000 00"
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11 text-xs font-mono font-bold text-slate-850 dark:text-slate-100 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                                {t.bic}
                              </label>
                              <input
                                type="text"
                                value={userPaymentInfo.bic || ''}
                                onChange={(e) =>
                                  setUserPaymentInfo({ ...userPaymentInfo, bic: e.target.value })
                                }
                                placeholder="BANKDEXX"
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11 text-xs font-mono font-bold text-slate-850 dark:text-slate-100 outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                              {t.accountHolder}
                            </label>
                            <input
                              type="text"
                              value={userPaymentInfo.accountHolder || ''}
                              onChange={(e) =>
                                setUserPaymentInfo({
                                  ...userPaymentInfo,
                                  accountHolder: e.target.value,
                                })
                              }
                              placeholder={
                                currentUser?.username || (lang === 'de' ? 'Dein Name' : 'Your Name')
                              }
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11 text-xs font-bold text-slate-850 dark:text-slate-100 outline-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleSavePaymentPreferences}
                            className="w-full py-2.5 bg-[#006c49] dark:bg-emerald-600 hover:bg-[#005236] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            {t.savePaymentInfo}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. ADD BILL FORM */}
                {currentView === 'add-bill' && (
                  <form
                    onSubmit={handleAddBillSubmit}
                    noValidate
                    className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-8 pb-28 shadow-sm"
                  >
                    <header className="flex items-center gap-3 pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        aria-label={t.cancel}
                        onClick={() => {
                          setEditingExpenseId(null);
                          setCurrentView(selectedGroupId ? 'group-detail' : 'dashboard');
                        }}
                        className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <span className="material-symbols-outlined">close</span>
                      </button>
                      <h2 className="font-display text-xl font-bold dark:text-white">
                        {editingExpenseId ? t.editBill : t.addBill}
                      </h2>
                    </header>

                    <div className="space-y-6">
                      {/* The amount: big, with the comma of the language, no spinner */}
                      <div className="flex flex-col items-center py-2">
                        <label htmlFor="bill-amount" className="sr-only">
                          {t.totalAmount}
                        </label>
                        <div className="flex items-baseline justify-center gap-2 w-full">
                          <input
                            id="bill-amount"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={lang === 'de' ? '0,00' : '0.00'}
                            value={billAmount}
                            onChange={(e) => {
                              setBillAmount(e.target.value);
                              setBillError(null);
                            }}
                            className="min-w-0 w-48 bg-transparent border-none text-right font-display text-5xl font-black text-slate-900 dark:text-white focus:ring-0 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700"
                            autoFocus={!editingExpenseId}
                          />
                          <span className="text-slate-400 dark:text-slate-500 font-bold text-4xl">
                            {t.currencySymbol}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-2">
                          {t.totalAmount}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="bill-desc"
                          className="text-xs text-slate-400 font-bold uppercase tracking-wider"
                        >
                          {t.description}
                        </label>
                        <input
                          id="bill-desc"
                          type="text"
                          placeholder={t.whatWasThisFor}
                          value={billDescription}
                          onChange={(e) => {
                            setBillDescription(e.target.value);
                            setBillError(null);
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 h-14 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-[#006c49]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="bill-group"
                            className="text-xs text-slate-400 font-bold uppercase tracking-wider"
                          >
                            {t.group}
                          </label>
                          <select
                            id="bill-group"
                            value={billGroupId}
                            disabled={Boolean(editingExpenseId)}
                            onChange={(e) => changeBillGroup(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 h-14 text-sm text-slate-800 dark:text-slate-200 cursor-pointer disabled:opacity-60"
                          >
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor="bill-paidby"
                            className="text-xs text-slate-400 font-bold uppercase tracking-wider"
                          >
                            {t.paidBy}
                          </label>
                          <select
                            id="bill-paidby"
                            value={billPaidById}
                            onChange={(e) => setBillPaidById(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 h-14 text-sm text-slate-800 dark:text-slate-200 cursor-pointer"
                          >
                            {(groups.find((g) => g.id === billGroupId)?.memberIds ?? []).map((id) => (
                              <option key={id} value={id}>
                                {id === meId ? `${findMember(id).name} (${t.you})` : findMember(id).name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Who takes part: tap a name to leave it out */}
                      {(() => {
                        const group = groups.find((g) => g.id === billGroupId);
                        const everyone = group?.memberIds ?? [];
                        return (
                          <fieldset className="space-y-2">
                            <div className="flex items-center justify-between">
                              <legend className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                {t.whoIsIn}
                              </legend>
                              <button
                                type="button"
                                onClick={() => {
                                  setBillParticipants(everyone);
                                  if (billSplitType !== 'equal')
                                    setCustomSplitDetails(
                                      defaultSplitValues(billSplitType, everyone, parseAmount(billAmount)),
                                    );
                                }}
                                className="min-h-9 px-2 text-xs font-bold text-[#006c49] dark:text-[#10b981]"
                              >
                                {t.everyone}
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {everyone.map((id) => {
                                const on = billParticipants.includes(id);
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleParticipant(id)}
                                    className={`min-h-11 px-3.5 rounded-full text-sm font-bold border transition-colors ${
                                      on
                                        ? 'bg-[#006c49] text-white border-[#006c49]'
                                        : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 line-through decoration-slate-300'
                                    }`}
                                  >
                                    {id === meId ? t.you : findMember(id).name}
                                  </button>
                                );
                              })}
                            </div>
                          </fieldset>
                        );
                      })()}

                      {/* How it is split: equal by default, the rest one tap away */}
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                        <div
                          className="grid grid-cols-4 gap-1.5"
                          role="group"
                          aria-label={t.splitMethod}
                        >
                          {(
                            [
                              ['equal', t.splitEqual],
                              ['percentage', t.splitPercent],
                              ['exact', t.splitAmounts],
                              ['shares', t.splitShares],
                            ] as const
                          ).map(([method, label]) => (
                            <button
                              key={method}
                              type="button"
                              aria-pressed={billSplitType === method}
                              onClick={() => chooseSplitMethod(method)}
                              className={`min-h-11 rounded-xl text-xs font-bold px-1 ${
                                billSplitType === method
                                  ? 'bg-[#006c49] text-white'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {(() => {
                          const amount = parseAmount(billAmount);
                          const preview = expenseShares(
                            {
                              id: 'preview',
                              groupId: billGroupId,
                              description: '',
                              amount: Number.isNaN(amount) ? 0 : amount,
                              paidById: billPaidById,
                              date: '',
                              category: '',
                              splitType: billSplitType,
                              participantIds: billParticipants,
                              splitDetails: customSplitDetails,
                            },
                            billParticipants,
                          );
                          const sum = billParticipants.reduce(
                            (a, id) => a + (customSplitDetails[id] ?? 0),
                            0,
                          );
                          const unit =
                            billSplitType === 'percentage'
                              ? '%'
                              : billSplitType === 'exact'
                                ? t.currencySymbol
                                : '×';
                          const rest =
                            billSplitType === 'percentage'
                              ? 100 - sum
                              : billSplitType === 'exact'
                                ? (Number.isNaN(amount) ? 0 : amount) - sum
                                : 0;
                          return (
                            <div className="space-y-2">
                              {billParticipants.map((id) => (
                                <div key={id} className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <img
                                      className="w-7 h-7 rounded-full flex-shrink-0"
                                      src={findMember(id).avatarUrl}
                                      alt=""
                                      referrerPolicy="no-referrer"
                                    />
                                    <span className="text-sm font-bold dark:text-slate-200 truncate">
                                      {id === meId ? t.you : findMember(id).name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {billSplitType !== 'equal' && (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          aria-label={`${findMember(id).name} ${unit}`}
                                          className="w-16 min-h-11 text-sm text-center border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-lg"
                                          value={
                                            customSplitDetails[id] === undefined
                                              ? ''
                                              : String(customSplitDetails[id]).replace(
                                                  '.',
                                                  lang === 'de' ? ',' : '.',
                                                )
                                          }
                                          onChange={(e) => {
                                            const v = parseAmount(e.target.value);
                                            setCustomSplitDetails({
                                              ...customSplitDetails,
                                              [id]: Number.isNaN(v) ? 0 : v,
                                            });
                                            setBillError(null);
                                          }}
                                        />
                                        <span className="text-xs text-slate-400 font-bold w-3">
                                          {unit}
                                        </span>
                                      </div>
                                    )}
                                    <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200 w-20 text-right">
                                      {money(fromCents(preview[id] ?? 0))}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {billSplitType !== 'equal' && billSplitType !== 'shares' && (
                                <p
                                  className={`text-xs font-bold ${Math.abs(rest) < 0.005 ? 'text-[#006c49] dark:text-[#10b981]' : 'text-amber-600 dark:text-amber-400'}`}
                                  aria-live="polite"
                                >
                                  {Math.abs(rest) < 0.005
                                    ? t.splitAddsUp
                                    : billSplitType === 'percentage'
                                      ? t.splitRestPercent.replace(
                                          '{n}',
                                          String(Math.round(rest * 100) / 100).replace('.', ','),
                                        )
                                      : t.splitRestAmount.replace('{n}', money(rest))}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="bill-date"
                            className="text-xs text-slate-400 font-bold uppercase tracking-wider"
                          >
                            {t.date}
                          </label>
                          <input
                            id="bill-date"
                            type="date"
                            value={billDate}
                            max={localIso()}
                            onChange={(e) => setBillDate(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 h-14 text-sm text-slate-800 dark:text-slate-200"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor="bill-cat"
                            className="text-xs text-slate-400 font-bold uppercase tracking-wider"
                          >
                            {t.category}
                          </label>
                          <select
                            id="bill-cat"
                            value={billCategory}
                            onChange={(e) => setBillCategory(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 h-14 text-sm text-slate-800 dark:text-slate-200 cursor-pointer"
                          >
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {categoryLabel(cat)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <details className="group rounded-2xl border border-slate-200 dark:border-slate-800">
                        <summary className="min-h-12 px-4 flex items-center justify-between cursor-pointer text-sm font-bold text-slate-700 dark:text-slate-200 list-none">
                          <span>{t.moreOptions}</span>
                          <span className="text-xs text-slate-400 font-normal">{t.moreOptionsHint}</span>
                        </summary>
                        <div className="p-4 pt-0 space-y-5">
                      {/* Deadline Setting Section */}
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-[#006c49] dark:text-[#10b981]">
                              event_available
                            </span>
                            <span>{t.deadline}</span>
                          </h4>
                          {billDueDate && (
                            <button
                              type="button"
                              onClick={() => setBillDueDate('')}
                              className="text-xs text-slate-400 hover:text-rose-500 font-bold"
                            >
                              ✕ {lang === 'de' ? 'Entfernen' : 'Clear'}
                            </button>
                          )}
                        </div>

                        {/* Quick Presets */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleSetQuickDeadline(3)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#006c49] dark:hover:border-emerald-500"
                          >
                            +3 {lang === 'de' ? 'Tage' : 'Days'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetQuickDeadline(7)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#006c49] dark:hover:border-emerald-500"
                          >
                            {t.in1Week}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetQuickDeadline(14)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#006c49] dark:hover:border-emerald-500"
                          >
                            {t.in2Weeks}
                          </button>
                          <button
                            type="button"
                            onClick={handleSetEndOfMonthDeadline}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#006c49] dark:hover:border-emerald-500"
                          >
                            {t.endOfMonth}
                          </button>
                        </div>

                        {/* Custom Date Input */}
                        <div className="flex items-center gap-3 pt-1">
                          <input
                            type="date"
                            value={billDueDate}
                            onChange={(e) => setBillDueDate(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 flex-1 outline-none focus:border-[#006c49]"
                          />
                          {billDueDate && (
                            <span
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold ${computeDeadlineStatus(billDueDate).badgeColor}`}
                            >
                              {computeDeadlineStatus(billDueDate).label[lang]}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Receipt Upload & Management Section */}
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-[#006c49] dark:text-[#10b981]">
                              receipt_long
                            </span>
                            <span>{t.receiptUpload}</span>
                          </h4>
                          {!billReceiptUrl && (
                            <button
                              type="button"
                              onClick={handleUseSampleReceipt}
                              className="text-xs text-[#006c49] dark:text-[#10b981] font-bold hover:underline flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                auto_fix_high
                              </span>
                              <span>{t.sampleReceipt}</span>
                            </button>
                          )}
                        </div>

                        {!billReceiptUrl ? (
                          <div>
                            <label className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-[#006c49] dark:hover:border-emerald-500 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white dark:bg-slate-900/50 group">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileUpload}
                                className="hidden"
                                disabled={isUploadingReceipt}
                              />
                              <span className="material-symbols-outlined text-3xl text-slate-400 group-hover:text-[#006c49] dark:group-hover:text-[#10b981] transition-colors mb-2">
                                {isUploadingReceipt ? 'sync' : 'add_a_photo'}
                              </span>
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 text-center">
                                {isUploadingReceipt
                                  ? lang === 'de'
                                    ? 'Wird hochgeladen...'
                                    : 'Processing...'
                                  : t.dropReceiptHere}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {lang === 'de'
                                  ? 'PNG, JPG, SVG bis 10MB'
                                  : 'PNG, JPG, SVG up to 10MB'}
                              </p>
                            </label>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div
                                onClick={() =>
                                  setActiveReceiptModal({
                                    id: 'preview',
                                    groupId: billGroupId,
                                    description: billDescription || 'Receipt Preview',
                                    amount: billAmountValue,
                                    paidById: currentUser?.id || 'u1',
                                    date: 'Today',
                                    dueDate: billDueDate,
                                    category: billCategory,
                                    splitType: billSplitType,
                                    splitDetails: {},
                                    receiptUrl: billReceiptUrl,
                                    receiptName: billReceiptName,
                                  })
                                }
                                className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer relative group flex-shrink-0"
                              >
                                <img
                                  src={billReceiptUrl}
                                  alt="Receipt thumbnail"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <span className="material-symbols-outlined text-white text-[18px]">
                                    zoom_in
                                  </span>
                                </div>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {billReceiptName || t.receiptAttached}
                                </p>
                                <span className="inline-block mt-0.5 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-[#006c49] dark:text-[#10b981] rounded text-[10px] font-bold">
                                  ✓ {t.receiptAttached}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveReceiptModal({
                                    id: 'preview',
                                    groupId: billGroupId,
                                    description: billDescription || 'Receipt Preview',
                                    amount: billAmountValue,
                                    paidById: currentUser?.id || 'u1',
                                    date: 'Today',
                                    dueDate: billDueDate,
                                    category: billCategory,
                                    splitType: billSplitType,
                                    splitDetails: {},
                                    receiptUrl: billReceiptUrl,
                                    receiptName: billReceiptName,
                                  })
                                }
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-[#006c49] dark:hover:text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  visibility
                                </span>
                                <span>{t.viewReceipt}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBillReceiptUrl('');
                                  setBillReceiptName('');
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg"
                                title={t.removeReceipt}
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  delete
                                </span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Direct Payment Link for Split Refund Section */}
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="pr-4">
                            <h4 className="text-xs text-slate-800 dark:text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[16px] text-[#006c49] dark:text-[#10b981]">
                                contactless
                              </span>
                              <span>{t.enableDirectPay}</span>
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                              {t.directPayHint}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBillEnablePayment(!billEnablePayment)}
                            className="text-[#006c49] dark:text-[#10b981] text-3xl font-bold cursor-pointer flex-shrink-0"
                          >
                            <span className="material-symbols-outlined">
                              {billEnablePayment ? 'toggle_on' : 'toggle_off'}
                            </span>
                          </button>
                        </div>

                        {billEnablePayment && (
                          <div className="space-y-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
                            {/* Live calculation banner */}
                            {(() => {
                              const pAmount = billAmountValue;
                              const targetGrp =
                                groups.find((g) => g.id === billGroupId) || activeGroup;
                              const count = billParticipants.length || targetGrp?.memberIds.length || 1;
                              const sharePerMember = pAmount > 0 ? pAmount / count : 0;
                              return (
                                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] font-extrabold uppercase text-[#006c49] dark:text-[#10b981] flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[12px]">
                                        bolt
                                      </span>
                                      <span>
                                        {lang === 'de'
                                          ? 'Live Zahlungslink-Berechnung'
                                          : 'Dynamic Direct Pay Link'}
                                      </span>
                                    </span>
                                    <p className="text-xs text-slate-700 dark:text-slate-300">
                                      {lang === 'de'
                                        ? `Jedes Mitglied zahlt genau ${sharePerMember > 0 ? money(sharePerMember) : money(0)} direkt an dich.`
                                        : `Each member will pay exactly ${sharePerMember > 0 ? money(sharePerMember) : money(0)} directly to you.`}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handlePreviewBillDirectPay}
                                    className="px-3 py-1.5 bg-[#006c49] dark:bg-emerald-600 hover:bg-[#005236] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs flex-shrink-0"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      visibility
                                    </span>
                                    <span>{t.previewDirectPay}</span>
                                  </button>
                                </div>
                              );
                            })()}

                            {/* PayPal.Me */}
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px] text-[#006c49]">
                                    link
                                  </span>
                                  <span>{t.paypalDirect}</span>
                                </span>
                                {billPaypalHandle && (
                                  <span className="text-[#006c49] dark:text-[#10b981] font-mono text-[9px]">
                                    paypal.me/{cleanPayPalHandle(billPaypalHandle)}/
                                    {billAmountValue > 0
                                      ? (billAmountValue / (billParticipants.length || 1)).toFixed(2)
                                      : '10.00'}
                                    EUR
                                  </span>
                                )}
                              </label>
                              <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11">
                                <span className="text-xs text-slate-400 font-mono mr-1">
                                  paypal.me/
                                </span>
                                <input
                                  type="text"
                                  placeholder="deinname"
                                  value={billPaypalHandle}
                                  onChange={(e) => setBillPaypalHandle(e.target.value)}
                                  className="bg-transparent border-none w-full text-xs font-mono font-bold text-slate-850 dark:text-slate-100 outline-none"
                                />
                              </div>
                            </div>

                            {/* IBAN & Kontoinhaber */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  {t.iban}
                                </label>
                                <input
                                  type="text"
                                  placeholder="DE00 0000 0000 0000 0000 00"
                                  value={billIban}
                                  onChange={(e) => setBillIban(e.target.value)}
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11 text-xs font-mono font-bold text-slate-850 dark:text-slate-100 outline-none"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  {t.accountHolder}
                                </label>
                                <input
                                  type="text"
                                  placeholder={
                                    currentUser?.username ||
                                    (lang === 'de' ? 'Dein Name' : 'Your Name')
                                  }
                                  value={billAccountHolder}
                                  onChange={(e) => setBillAccountHolder(e.target.value)}
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11 text-xs font-bold text-slate-850 dark:text-slate-100 outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                        </div>
                      </details>

                      {billError && (
                        <p
                          role="alert"
                          className="rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm font-bold px-4 py-3"
                        >
                          {billError}
                        </p>
                      )}
                    </div>

                    {/* The save button stays in reach, also on long forms */}
                    <div className="sticky bottom-20 md:bottom-4 mt-6 flex gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingExpenseId(null);
                          setCurrentView(selectedGroupId ? 'group-detail' : 'dashboard');
                        }}
                        className="min-h-12 px-5 rounded-xl font-bold text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                      >
                        {t.cancel}
                      </button>
                      <button
                        type="submit"
                        className="flex-1 min-h-12 rounded-xl font-bold text-sm bg-[#006c49] hover:bg-[#005236] text-white"
                      >
                        {editingExpenseId ? t.saveChanges : t.save}
                      </button>
                    </div>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* FLOATING ACTION BUTTON (FAB) FOR MOBILE */}
          {currentView !== 'add-bill' && (
            <button
              onClick={() => startNewBill()}
              aria-label={t.addBill}
              className="md:hidden fixed right-6 bottom-24 w-14 h-14 bg-[#006c49] dark:bg-emerald-600 hover:bg-[#005236] text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all z-40"
            >
              <span className="material-symbols-outlined text-[28px]">add</span>
            </button>
          )}

          {/* MOBILE NAVIGATION BAR */}
          <nav className="md:hidden fixed bottom-0 left-0 w-full z-40 bg-white/95 dark:bg-slate-900/95 border-t border-slate-100 dark:border-slate-800 flex justify-around items-center h-16 pb-safe shadow-lg">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`flex flex-col items-center justify-center flex-1 py-1 ${currentView === 'dashboard' ? 'text-[#006c49] dark:text-[#10b981]' : 'text-slate-400'}`}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontVariationSettings: currentView === 'dashboard' ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                dashboard
              </span>
              <span className="text-[10px] font-bold mt-0.5">{t.dashboard}</span>
            </button>
            <button
              onClick={() => setCurrentView('groups')}
              className={`flex flex-col items-center justify-center flex-1 py-1 ${currentView === 'groups' || currentView === 'group-detail' ? 'text-[#006c49] dark:text-[#10b981]' : 'text-slate-400'}`}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontVariationSettings:
                    currentView === 'groups' || currentView === 'group-detail'
                      ? "'FILL' 1"
                      : "'FILL' 0",
                }}
              >
                group
              </span>
              <span className="text-[10px] font-bold mt-0.5">{t.groups}</span>
            </button>
            <button
              onClick={() => setCurrentView('activity')}
              className={`flex flex-col items-center justify-center flex-1 py-1 ${currentView === 'activity' ? 'text-[#006c49] dark:text-[#10b981]' : 'text-slate-400'}`}
            >
              <span className="material-symbols-outlined">receipt_long</span>
              <span className="text-[10px] font-bold mt-0.5">{t.activity}</span>
            </button>
            <button
              onClick={() => setCurrentView('settings')}
              className={`flex flex-col items-center justify-center flex-1 py-1 ${currentView === 'settings' ? 'text-[#006c49] dark:text-[#10b981]' : 'text-slate-400'}`}
            >
              <span className="material-symbols-outlined">settings</span>
              <span className="text-[10px] font-bold mt-0.5">{t.settings}</span>
            </button>
          </nav>
        </div>
      </div>

      {/* MODALS & PORTALS */}
      <AnimatePresence>
        {/* 1. Settle modal */}
        {isSettleModalOpen && activeGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-display font-bold text-lg">{t.settleUpLedger}</h3>
                <button onClick={() => setIsSettleModalOpen(false)} className="text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleSettleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">
                    {lang === 'de' ? 'Mitglied' : 'Member'}
                  </label>
                  <select
                    value={settleTargetMemberId}
                    onChange={(e) => {
                      setSettleTargetMemberId(e.target.value);
                      const bal = activeGroupBalances.memberBalances[e.target.value] || 0;
                      setSettleAmount(Math.abs(bal).toFixed(2).replace('.', lang === 'de' ? ',' : '.'));
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                  >
                    <option value="">
                      {lang === 'de' ? 'Mitglied wählen...' : 'Select member...'}
                    </option>
                    {activeGroup.memberIds
                      .filter((mId) => mId !== (currentUser?.id || 'u1'))
                      .map((mId) => (
                        <option key={mId} value={mId}>
                          {findMember(mId).name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">{t.amount}</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                      {t.currencySymbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={settleAmount}
                      onChange={(e) => setSettleAmount(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-4 h-12 text-sm text-slate-800 dark:text-white"
                      required
                    />
                  </div>
                </div>

                {settleTargetMemberId && parseAmount(settleAmount) > 0 && (
                  <div className="bg-[#006c49]/5 dark:bg-[#10b981]/10 border border-[#006c49]/20 dark:border-[#10b981]/30 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-[#006c49] dark:text-[#10b981] flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">payments</span>
                        <span>Direct Pay Link</span>
                      </span>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {lang === 'de'
                          ? 'Direkt per PayPal oder SEPA überweisen'
                          : 'Pay instantly via PayPal or SEPA'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettleModalOpen(false);
                        handleOpenDirectPayForMember(
                          settleTargetMemberId,
                          parseAmount(settleAmount) || 0,
                        );
                      }}
                      className="px-3 py-1.5 bg-[#006c49] dark:bg-emerald-600 hover:bg-[#005236] text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[13px]">payments</span>
                      <span>{t.directPay}</span>
                    </button>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsSettleModalOpen(false)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-xs font-bold"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#006c49] dark:bg-emerald-600 text-white rounded-xl py-3 text-xs font-bold"
                  >
                    {t.recordPayment}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* 2. Invite Modal */}
        {isInviteModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-display font-bold text-lg">{t.inviteMember}</h3>
                <button onClick={() => setIsInviteModalOpen(false)} className="text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">{t.name}</label>
                  <input
                    type="text"
                    placeholder="Max Mustermann"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">{t.email}</label>
                  <input
                    type="email"
                    placeholder="max@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-xs font-bold"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#006c49] dark:bg-emerald-600 text-white rounded-xl py-3 text-xs font-bold"
                  >
                    {t.sendInvitation}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* 3. Create Group modal */}
        {isCreateGroupModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-display font-bold text-lg">{t.createSharedGroup}</h3>
                <button onClick={() => setIsCreateGroupModalOpen(false)} className="text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateGroup} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">
                    {t.groupName}
                  </label>
                  <input
                    type="text"
                    placeholder={t.groupNamePlaceholder}
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">
                    {t.locationFocus}
                  </label>
                  <input
                    type="text"
                    placeholder={t.locationPlaceholder}
                    value={newGroupLocation}
                    onChange={(e) => setNewGroupLocation(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">{t.category}</label>
                  <select
                    value={newGroupCategory}
                    onChange={(e) => setNewGroupCategory(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                  >
                    <option value="Travel">{t.travel || 'Travel'}</option>
                    <option value="Rent, Utilities">{t.rentUtilities || 'Rent, Utilities'}</option>
                    <option value="Dining Out">{t.diningOut || 'Dining Out'}</option>
                    <option value="Household">{t.householdGroup}</option>
                    <option value="Event">{t.eventGroup}</option>
                    <option value="Other">{t.general || 'General'}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-400 font-bold uppercase">
                      {lang === 'de'
                        ? 'Mitglieder hinzufügen (optional)'
                        : 'Add Members (optional)'}
                    </label>
                    <span className="text-[10px] text-slate-400">
                      {lang === 'de' ? 'Kommagetrennt' : 'Comma-separated'}
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder={
                      lang === 'de' ? 'z.B. Lisa, Jonas, Sophie' : 'e.g. Lisa, John, Sarah'
                    }
                    value={newGroupInitialMembers}
                    onChange={(e) => setNewGroupInitialMembers(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                  />
                  <p className="text-[10px] text-slate-400">
                    {lang === 'de'
                      ? 'Du kannst später jederzeit weitere Personen einladen.'
                      : 'You can also invite additional people later.'}
                  </p>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateGroupModalOpen(false)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-xs font-bold"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#006c49] dark:bg-emerald-600 text-white rounded-xl py-3 text-xs font-bold"
                  >
                    {t.createGroupButton}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* 4. Edit Group modal */}
        {isEditGroupModalOpen && activeGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-display font-bold text-lg">{t.editGroupDetails}</h3>
                <button onClick={() => setIsEditGroupModalOpen(false)} className="text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setGroups(
                    groups.map((g) => {
                      if (g.id === selectedGroupId) {
                        return {
                          ...g,
                          name: newGroupName,
                          location: newGroupLocation,
                          category: newGroupCategory,
                        };
                      }
                      return g;
                    }),
                  );
                  setIsEditGroupModalOpen(false);
                  triggerToast(
                    lang === 'de'
                      ? 'Gruppeneinstellungen aktualisiert!'
                      : 'Group settings updated!',
                  );
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">
                    {t.groupName}
                  </label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">
                    {t.locationFocus}
                  </label>
                  <input
                    type="text"
                    value={newGroupLocation}
                    onChange={(e) => setNewGroupLocation(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditGroupModalOpen(false)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-xs font-bold"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#006c49] dark:bg-emerald-600 text-white rounded-xl py-3 text-xs font-bold"
                  >
                    {t.saveChanges}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* 5. Join Group modal */}
        {isJoinGroupModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-display font-bold text-lg">{t.joinGroup}</h3>
                <button onClick={() => setIsJoinGroupModalOpen(false)} className="text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleJoinGroupSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase">{t.roomCode}</label>
                  <input
                    type="text"
                    placeholder="e.g. grp-weekend-1234"
                    value={joinGroupCode}
                    onChange={(e) => setJoinGroupCode(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 text-sm text-slate-800 dark:text-white"
                    required
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-400 leading-normal">{t.roomCodeDesc}</p>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsJoinGroupModalOpen(false)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-xs font-bold"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={isRoomConnecting || !joinGroupCode.trim()}
                    className="flex-1 bg-[#006c49] dark:bg-emerald-600 text-white rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    {isRoomConnecting && (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>{t.joinGroup}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* 6. Custom Delete Group Confirmation modal */}
        {groupToDeleteId &&
          (() => {
            const grp = groups.find((g) => g.id === groupToDeleteId);
            if (!grp) return null;
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
              >
                <motion.div
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.95 }}
                  className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-slate-200 dark:border-slate-800"
                >
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-display font-bold text-lg text-rose-600 dark:text-rose-400 flex items-center gap-2">
                      <span className="material-symbols-outlined">warning</span>
                      <span>{lang === 'de' ? 'Gruppe löschen?' : 'Delete Group?'}</span>
                    </h3>
                    <button onClick={() => setGroupToDeleteId(null)} className="text-slate-400">
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  <p className="text-sm text-slate-500 dark:text-slate-300 leading-relaxed">
                    {lang === 'de'
                      ? `Willst du die Gruppe "${grp.name}" wirklich löschen? Alle zugehörigen Ausgaben und Abrechnungen gehen dauerhaft verloren.`
                      : `Are you sure you want to delete the group "${grp.name}"? All associated expenses and settlements will be permanently deleted.`}
                  </p>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setGroupToDeleteId(null)}
                      className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-xs font-bold"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteGroup}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-3 text-xs font-bold"
                    >
                      {lang === 'de' ? 'Löschen' : 'Delete'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}

        {/* 7. Custom Delete All Groups Confirmation modal */}
        {isConfirmDeleteAllOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-slate-200 dark:border-slate-800"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-display font-bold text-lg text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <span className="material-symbols-outlined">warning</span>
                  <span>{lang === 'de' ? 'Alle Gruppen löschen?' : 'Delete All Groups?'}</span>
                </h3>
                <button onClick={() => setIsConfirmDeleteAllOpen(false)} className="text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <p className="text-sm text-slate-500 dark:text-slate-300 leading-relaxed">
                {lang === 'de'
                  ? 'Willst du wirklich alle aktiven Gruppen löschen? Dies kann nicht rückgängig gemacht werden und löscht alle Ausgaben.'
                  : 'Are you sure you want to delete all active groups? This cannot be undone and will delete all expenses.'}
              </p>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfirmDeleteAllOpen(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-xs font-bold"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAllGroups}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-3 text-xs font-bold"
                >
                  {lang === 'de' ? 'Alle löschen' : 'Delete All'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 8. Receipt Lightbox Preview Modal */}
        {activeReceiptModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md p-4 flex items-center justify-center"
            onClick={() => setActiveReceiptModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981] text-2xl flex-shrink-0">
                    receipt_long
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white leading-tight truncate">
                      {activeReceiptModal.description}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {t.receiptPreview} • {activeReceiptModal.date}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveReceiptModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors flex-shrink-0 ml-2"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Main Image View */}
              <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center bg-slate-950/5 dark:bg-black/40 min-h-[300px]">
                {activeReceiptModal.receiptUrl ? (
                  <img
                    src={activeReceiptModal.receiptUrl}
                    alt={activeReceiptModal.description}
                    className="max-h-[55vh] w-auto max-w-full rounded-xl object-contain shadow-md border border-slate-200 dark:border-slate-800 bg-white"
                  />
                ) : (
                  <div className="text-center p-8 text-slate-400">
                    <span className="material-symbols-outlined text-4xl mb-2">broken_image</span>
                    <p className="text-xs font-semibold">
                      {lang === 'de' ? 'Kein Belegbild vorhanden' : 'No receipt image found'}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer info & actions */}
              <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-center sm:text-left">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {t.totalAmount}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-black text-[#006c49] dark:text-[#10b981]">
                      {money(activeReceiptModal.amount)}
                    </span>
                    {activeReceiptModal.dueDate && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${computeDeadlineStatus(activeReceiptModal.dueDate).badgeColor}`}
                      >
                        {computeDeadlineStatus(activeReceiptModal.dueDate).label[lang]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {activeReceiptModal.receiptUrl && (
                    <a
                      href={activeReceiptModal.receiptUrl}
                      download={activeReceiptModal.receiptName || 'receipt.jpg'}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>{t.download}</span>
                    </a>
                  )}
                  {activeReceiptModal.id !== 'preview' && (
                    <button
                      onClick={() => {
                        handleSendExpenseReminder(activeReceiptModal);
                        setActiveReceiptModal(null);
                      }}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-[#006c49] dark:bg-emerald-600 hover:bg-[#005236] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">notifications</span>
                      <span>{t.sendReminder}</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 9. Direct Pay Modal (PayPal.Me & Bank Transfer) */}
        {directPayModalData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md p-4 flex items-center justify-center overflow-y-auto"
            onClick={() => setDirectPayModalData(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 my-8"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#006c49]/10 text-[#006c49] dark:text-[#10b981] flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">payments</span>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white leading-tight">
                      {t.directPay}
                    </h3>
                    <p className="text-xs text-slate-400">{directPayModalData.payer.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setDirectPayModalData(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Exact Amount Banner */}
              <div className="p-6 bg-[#006c49]/5 dark:bg-[#10b981]/10 border-b border-slate-100 dark:border-slate-800 text-center space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#006c49] dark:text-[#10b981]">
                  {lang === 'de' ? 'Zu zahlender Betrag' : 'Amount to Pay'}
                </span>
                <div className="font-display font-black text-4xl text-[#006c49] dark:text-[#10b981]">
                  {money(directPayModalData.amount)}
                </div>
                {directPayModalData.expense && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'de' ? 'Für' : 'For'}:{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      "{directPayModalData.expense.description}"
                    </span>
                  </p>
                )}
              </div>

              {/* Payment Method Tabs */}
              <div className="flex items-center gap-1.5 px-6 pt-3">
                <button
                  type="button"
                  onClick={() => setDirectPayActiveTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${directPayActiveTab === 'all' ? 'bg-[#006c49] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                  {t.allPaymentMethods}
                </button>
                {directPayModalData.paymentInfo.paypalHandle && (
                  <button
                    type="button"
                    onClick={() => setDirectPayActiveTab('paypal')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${directPayActiveTab === 'paypal' ? 'bg-[#0070ba] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                  >
                    <span>PayPal</span>
                  </button>
                )}
                {directPayModalData.paymentInfo.iban && (
                  <button
                    type="button"
                    onClick={() => setDirectPayActiveTab('bank')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${directPayActiveTab === 'bank' ? 'bg-[#006c49] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                  >
                    <span>SEPA / Bank</span>
                  </button>
                )}
              </div>

              {/* Payment Methods Options */}
              <div className="p-6 space-y-5">
                {/* Method 1: PayPal.Me Direct Link */}
                {directPayModalData.paymentInfo.paypalHandle &&
                (directPayActiveTab === 'all' || directPayActiveTab === 'paypal') ? (
                  <div className="bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center font-bold text-xs">
                          P
                        </span>
                        <div>
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                            PayPal.Me {lang === 'de' ? 'Direktlink' : 'Direct Link'}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-mono">
                            paypal.me/
                            {cleanPayPalHandle(directPayModalData.paymentInfo.paypalHandle)}/
                            {money(directPayModalData.amount)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/60 px-2 py-0.5 rounded-full">
                        {lang === 'de' ? 'Sofort' : 'Instant'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <a
                        href={generatePayPalUrl(
                          directPayModalData.paymentInfo.paypalHandle,
                          directPayModalData.amount,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 px-4 bg-[#0070ba] hover:bg-[#005ea6] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        <span>
                          {t.openPaypal} ({money(directPayModalData.amount)})
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            generatePayPalUrl(
                              directPayModalData.paymentInfo.paypalHandle || '',
                              directPayModalData.amount,
                            ),
                            'PayPal Link',
                          )
                        }
                        className="py-2.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-slate-50 transition-all"
                      >
                        <span className="material-symbols-outlined text-[15px]">content_copy</span>
                        <span>{copyFeedback === 'PayPal Link' ? t.copied : t.copyPaypalLink}</span>
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Method 2: SEPA Bank Transfer & GiroCode */}
                {directPayModalData.paymentInfo.iban &&
                (directPayActiveTab === 'all' || directPayActiveTab === 'bank') ? (
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981] text-xl">
                          account_balance
                        </span>
                        <div>
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                            {t.bankTransfer}
                          </h4>
                          <p className="text-[10px] text-slate-400">
                            {lang === 'de'
                              ? 'SEPA Überweisung an Kontoinhaber'
                              : 'SEPA wire transfer'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        SEPA
                      </span>
                    </div>

                    {/* Real Scannable GiroCode / EPC QR Code */}
                    {directPayQrDataUrl && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 shadow-2xs">
                        <div className="w-28 h-28 p-1.5 bg-white border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs flex-shrink-0 flex items-center justify-center">
                          <img
                            src={directPayQrDataUrl}
                            alt="GiroCode EPC QR"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="space-y-1.5 text-center sm:text-left">
                          <div className="flex items-center justify-center sm:justify-start gap-1.5">
                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-[#006c49] dark:text-[#10b981] font-bold text-[10px] rounded">
                              GiroCode / EPC-QR
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              SEPA Standard
                            </span>
                          </div>
                          <h5 className="font-bold text-xs text-slate-900 dark:text-white">
                            {t.scanBankingApp}
                          </h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {t.scanBankingAppDesc}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 text-xs">
                      {/* Kontoinhaber */}
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                        <span className="text-slate-400 font-medium">{t.accountHolder}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-850 dark:text-slate-100">
                            {directPayModalData.paymentInfo.accountHolder ||
                              directPayModalData.payer.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(
                                directPayModalData.paymentInfo.accountHolder ||
                                  directPayModalData.payer.name,
                                t.accountHolder,
                              )
                            }
                            className="p-1 text-slate-400 hover:text-[#006c49] dark:hover:text-[#10b981]"
                            title={t.accountHolder}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              content_copy
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* IBAN */}
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                        <span className="text-slate-400 font-medium">{t.iban}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-850 dark:text-slate-100">
                            {formatIban(directPayModalData.paymentInfo.iban)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(
                                directPayModalData.paymentInfo.iban?.replace(/\s/g, '') || '',
                                'IBAN',
                              )
                            }
                            className="p-1 text-slate-400 hover:text-[#006c49] dark:hover:text-[#10b981]"
                            title={t.copyIban}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              content_copy
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* BIC (optional) */}
                      {directPayModalData.paymentInfo.bic && (
                        <div className="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                          <span className="text-slate-400 font-medium">{t.bic}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {directPayModalData.paymentInfo.bic}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyText(directPayModalData.paymentInfo.bic || '', 'BIC')
                              }
                              className="p-1 text-slate-400 hover:text-[#006c49] dark:hover:text-[#10b981]"
                              title="BIC kopieren"
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                content_copy
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Verwendungszweck */}
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-400 font-medium">{t.reference}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                            {directPayModalData.reference}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(directPayModalData.reference, t.reference)
                            }
                            className="p-1 text-slate-400 hover:text-[#006c49] dark:hover:text-[#10b981]"
                            title="Referenz kopieren"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              content_copy
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Visual SEPA GiroCard illustration */}
                    <div className="rounded-xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
                      <img
                        src={generateBankingQrSvg(
                          directPayModalData.paymentInfo.accountHolder ||
                            directPayModalData.payer.name,
                          directPayModalData.paymentInfo.iban,
                          directPayModalData.amount,
                          directPayModalData.reference,
                        )}
                        alt="SEPA GiroCard"
                        className="w-full h-auto object-cover"
                      />
                    </div>
                  </div>
                ) : null}

                {/* Quick Share via WhatsApp & Messenger */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const text = generateSharePaymentText({
                        description:
                          directPayModalData.expense?.description || 'Bill the Splitter Ausgleich',
                        amount: directPayModalData.amount,
                        recipientName:
                          directPayModalData.paymentInfo.accountHolder ||
                          directPayModalData.payer.name,
                        paypalHandle: directPayModalData.paymentInfo.paypalHandle,
                        iban: directPayModalData.paymentInfo.iban,
                        bic: directPayModalData.paymentInfo.bic,
                        accountHolder: directPayModalData.paymentInfo.accountHolder,
                        lang,
                      });
                      handleCopyText(text, t.shareDirectPay);
                    }}
                    className="flex-1 py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">content_copy</span>
                    <span>{t.copyShareText}</span>
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      generateSharePaymentText({
                        description:
                          directPayModalData.expense?.description || 'Bill the Splitter Ausgleich',
                        amount: directPayModalData.amount,
                        recipientName:
                          directPayModalData.paymentInfo.accountHolder ||
                          directPayModalData.payer.name,
                        paypalHandle: directPayModalData.paymentInfo.paypalHandle,
                        iban: directPayModalData.paymentInfo.iban,
                        bic: directPayModalData.paymentInfo.bic,
                        accountHolder: directPayModalData.paymentInfo.accountHolder,
                        lang,
                      }),
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-3 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">chat</span>
                    <span>{t.shareWhatsApp}</span>
                  </a>
                </div>

                {/* Settle Up Action */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setDirectPayModalData(null)}
                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkDirectPaymentSettled}
                    className="flex-1 py-3 bg-[#006c49] dark:bg-emerald-600 hover:bg-[#005236] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>{t.markPaidAfterTransfer}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 10. Edit Expense Payment Info Modal */}
        {editingExpensePayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm p-4 flex items-center justify-center overflow-y-auto"
            onClick={() => setEditingExpensePayment(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-2xl shadow-xl p-6 space-y-4 border border-slate-200 dark:border-slate-800 my-8"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#006c49] dark:text-[#10b981]">
                    contactless
                  </span>
                  <h3 className="font-display font-bold text-base">{t.editDirectPay}</h3>
                </div>
                <button
                  onClick={() => setEditingExpensePayment(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <p className="text-xs text-slate-400">
                {lang === 'de'
                  ? `Hinterlege dein PayPal oder Bankverbindung für "${editingExpensePayment.description}". Andere Mitglieder können ihren Anteil direkt über diesen Link begleichen.`
                  : `Configure your PayPal or bank details for "${editingExpensePayment.description}". Other members will be able to pay their share directly.`}
              </p>

              <form onSubmit={handleSaveExpensePaymentSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {t.paypalDirect}
                  </label>
                  <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11">
                    <span className="text-xs text-slate-400 font-mono mr-1">paypal.me/</span>
                    <input
                      type="text"
                      placeholder="deinname"
                      value={editPaymentPaypal}
                      onChange={(e) => setEditPaymentPaypal(e.target.value)}
                      className="bg-transparent border-none w-full text-xs font-mono font-bold text-slate-850 dark:text-slate-100 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {t.iban}
                    </label>
                    <input
                      type="text"
                      placeholder="DE00 0000 0000 0000 0000 00"
                      value={editPaymentIban}
                      onChange={(e) => setEditPaymentIban(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11 text-xs font-mono font-bold text-slate-850 dark:text-slate-100 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {t.bic}
                    </label>
                    <input
                      type="text"
                      placeholder="BANKDEXX"
                      value={editPaymentBic}
                      onChange={(e) => setEditPaymentBic(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11 text-xs font-mono font-bold text-slate-850 dark:text-slate-100 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {t.accountHolder}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      currentUser?.username || (lang === 'de' ? 'Dein Name' : 'Your Name')
                    }
                    value={editPaymentAccountHolder}
                    onChange={(e) => setEditPaymentAccountHolder(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-11 text-xs font-bold text-slate-850 dark:text-slate-100 outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="saveAsDef"
                    checked={editPaymentSaveAsDefault}
                    onChange={(e) => setEditPaymentSaveAsDefault(e.target.checked)}
                    className="rounded border-slate-300 text-[#006c49] focus:ring-[#006c49]"
                  />
                  <label
                    htmlFor="saveAsDef"
                    className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    {t.saveAsDefault}
                  </label>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingExpensePayment(null)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl py-3 text-xs font-bold"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#006c49] dark:bg-emerald-600 text-white rounded-xl py-3 text-xs font-bold"
                  >
                    {t.saveChanges}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
