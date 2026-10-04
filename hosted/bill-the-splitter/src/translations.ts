export interface AppTranslations {
  appName: string;
  dashboard: string;
  groups: string;
  activity: string;
  settings: string;
  addBill: string;
  joinGroup: string;
  newGroup: string;
  totalBalance: string;
  youAreOwed: string;
  youOwe: string;
  settledUp: string;
  noGroupsYet: string;
  createGroupDesc: string;
  allGroups: string;
  roomCode: string;
  liveMultiplayer: string;
  localStorageOnly: string;
  onlineNow: string;
  quickSplitAI: string;
  aiDesc: string;
  aiPlaceholder: string;
  quickParse: string;
  parsing: string;
  parsedPreview: string;
  cancel: string;
  confirmAndSplit: string;
  description: string;
  amount: string;
  paidBy: string;
  splittingWith: string;
  allMembers: string;
  recentExpenses: string;
  settleUp: string;
  markPaid: string;
  balances: string;
  members: string;
  noExpensesYet: string;
  inviteMember: string;
  name: string;
  email: string;
  addExpense: string;
  payer: string;
  splitType: string;
  equal: string;
  percentage: string;
  exact: string;
  save: string;
  groupDetails: string;
  location: string;
  category: string;
  groupCreated: string;
  newBillAdded: string;
  settlementMade: string;
  searchPlaceholder: string;
  theme: string;
  light: string;
  dark: string;
  language: string;
  systemOperational: string;
  backToDashboard: string;
  groupName: string;
  selectCategory: string;
  travel: string;
  rentUtilities: string;
  diningOut: string;
  general: string;
  placeholderInvite: string;
  placeholderEmail: string;
  noActivitiesYet: string;
  currencySymbol: string;
  activeLanguage: string;
  allActivityLogs: string;
  activityLogsDesc: string;
  searchExpenses: string;
  searchPlaceholderFull: string;
  typeToBeginSearch: string;
  noExpensesFound: string;
  roomCodeDesc: string;
  copiedJoinCode: string;
  quickInsightAlert: string;
  infoLabel: string;
  defaultCurrency: string;
  defaultCurrencyDesc: string;
  activeNow: string;
  recordPayment: string;
  settleUpLedger: string;
  settleCashWireDesc: string;
  sendInvitation: string;
  invitationSent: string;
  inviteSuccessMsg: string;
  createSharedGroup: string;
  locationFocus: string;
  editGroupDetails: string;
  saveChanges: string;
  roomCodeCopied: string;
  welcomeBack: string;
  roomCodeLabel: string;
  onlineNowShort: string;
  totalAmount: string;
  whatWasThisFor: string;
  editSplit: string;
  saveSplit: string;
  splitMethod: string;
  recurrent: string;
  receipt: string;
  today: string;
  newBillAddedWithDesc: string;
  settlementRegistered: string;
  receiptUpload: string;
  receiptPhoto: string;
  receiptAttached: string;
  viewReceipt: string;
  removeReceipt: string;
  dropReceiptHere: string;
  sampleReceipt: string;
  deadline: string;
  setDeadline: string;
  noDeadline: string;
  dueInDays: string;
  dueToday: string;
  overdue: string;
  daysAgo: string;
  sendReminder: string;
  reminderSent: string;
  reminderSuccessMsg: string;
  remindAllDebtors: string;
  upcomingDeadlines: string;
  daysLeft: string;
  noUpcomingDeadlines: string;
  receiptPreview: string;
  close: string;
  download: string;
  in3Days: string;
  in1Week: string;
  in2Weeks: string;
  endOfMonth: string;
  reminderLogged: string;
  directPay: string;
  payShare: string;
  paymentMethods: string;
  paypalDirect: string;
  paypalDesc: string;
  openPaypal: string;
  copyPaypalLink: string;
  copied: string;
  bankTransfer: string;
  iban: string;
  bic: string;
  accountHolder: string;
  reference: string;
  copyIban: string;
  ibanCopied: string;
  giroCode: string;
  enableDirectPay: string;
  directPayHint: string;
  defaultPaymentInfo: string;
  defaultPaymentInfoDesc: string;
  markPaidAfterTransfer: string;
  savePaymentInfo: string;
  shareDirectPay: string;
  shareWhatsApp: string;
  copyShareText: string;
  editDirectPay: string;
  scanBankingApp: string;
  scanBankingAppDesc: string;
  directPayActive: string;
  previewDirectPay: string;
  saveAsDefault: string;
  allPaymentMethods: string;
}

export const TRANSLATIONS: { de: AppTranslations; en: AppTranslations } = {
  de: {
    appName: 'Bill the Splitter',
    dashboard: 'Dashboard',
    groups: 'Gruppen',
    activity: 'Aktivität',
    settings: 'Einstellungen',
    addBill: 'Rechnung hinzufügen',
    joinGroup: 'Gruppe beitreten',
    newGroup: 'Neue Gruppe',
    totalBalance: 'Gesamtbilanz',
    youAreOwed: 'Du bekommst',
    youOwe: 'Du schuldest',
    settledUp: 'Ausgeglichen',
    noGroupsYet: 'Noch keine Gruppen vorhanden',
    createGroupDesc: 'Erstelle eine neue Gruppe, um Ausgaben zu teilen.',
    allGroups: 'Alle geteilten Gruppen',
    roomCode: 'Raum-Code',
    liveMultiplayer: 'Live-Multiplayer',
    localStorageOnly: 'Nur lokaler Speicher',
    onlineNow: 'Jetzt online',
    quickSplitAI: 'Schnell-Aufteilung mit KI',
    aiDesc:
      'Gib einfach auf Deutsch oder Englisch ein, wer was bezahlt hat und wer es aufteilen soll. Unsere KI übernimmt den Rest.',
    aiPlaceholder: 'z.B. Sarah hat 85,50 € für das Abendessen mit Elena und Jordan bezahlt',
    quickParse: 'Schnell-Analyse',
    parsing: 'Analysiere...',
    parsedPreview: 'Vorschau des Ergebnisses',
    cancel: 'Abbrechen',
    confirmAndSplit: 'Bestätigen & Aufteilen',
    description: 'Beschreibung',
    amount: 'Betrag',
    paidBy: 'Bezahlt von',
    splittingWith: 'Aufgeteilt mit',
    allMembers: 'Alle Mitglieder',
    recentExpenses: 'Kürzliche Ausgaben',
    settleUp: 'Abrechnen',
    markPaid: 'Als bezahlt markieren',
    balances: 'Bilanzen',
    members: 'Mitglieder',
    noExpensesYet: 'Noch keine Ausgaben in dieser Gruppe.',
    inviteMember: 'Mitglied einladen',
    name: 'Name',
    email: 'E-Mail',
    addExpense: 'Ausgabe hinzufügen',
    payer: 'Zahler',
    splitType: 'Aufteilungsart',
    equal: 'Gleichmäßig',
    percentage: 'Prozentual',
    exact: 'Genaue Beträge',
    save: 'Speichern',
    groupDetails: 'Gruppen-Details',
    location: 'Ort',
    category: 'Kategorie',
    groupCreated: 'Gruppe erstellt',
    newBillAdded: 'Neue Rechnung hinzugefügt',
    settlementMade: 'Zahlung erfolgt',
    searchPlaceholder: 'Ausgaben durchsuchen...',
    theme: 'Design',
    light: 'Hell',
    dark: 'Dunkel',
    language: 'Sprache',
    systemOperational: 'Alle Systeme betriebsbereit.',
    backToDashboard: 'Zurück zum Dashboard',
    groupName: 'Gruppenname',
    selectCategory: 'Kategorie auswählen',
    travel: 'Reisen',
    rentUtilities: 'Miete & Nebenkosten',
    diningOut: 'Restaurant & Essen',
    general: 'Allgemein',
    placeholderInvite: 'z.B. Max Mustermann',
    placeholderEmail: 'max@beispiel.de',
    noActivitiesYet: 'Noch keine Aktivitäten aufgezeichnet.',
    currencySymbol: '€',
    activeLanguage: 'Aktive Sprache',
    allActivityLogs: 'Alle Aktivitätsprotokolle',
    activityLogsDesc: 'Verfolge Zahlungen, neu erfasste Ausgaben und Änderungen.',
    searchExpenses: 'Ausgaben durchsuchen',
    searchPlaceholderFull: 'Suche Ausgaben nach Titel oder Zahler...',
    typeToBeginSearch: 'Tippe, um mit der Suche zu beginnen...',
    noExpensesFound: 'Keine Ausgaben gefunden für',
    roomCodeDesc:
      'Gib den Raumcode ein, um der Gruppe deines Freundes beizutreten. Live-Multiplayer-Daten werden automatisch synchronisiert!',
    copiedJoinCode: 'Beitrittscode in die Zwischenablage kopiert!',
    quickInsightAlert:
      'Die meisten Ausgaben in dieser Gruppe entfallen auf Restaurant-Besuche und Unterkünfte. Teile fleißig weiter!',
    infoLabel: 'Information',
    defaultCurrency: 'Standardwährung',
    defaultCurrencyDesc: 'Berechnungen werden standardmäßig in Euro (€) angezeigt.',
    activeNow: 'Aktiv',
    recordPayment: 'Zahlung erfassen',
    settleUpLedger: 'Ledger ausgleichen',
    settleCashWireDesc:
      'Dies zeichnet eine Bar- oder Überweisungsausgleichung auf. Die Bilanzen werden sofort angepasst.',
    sendInvitation: 'Einladung senden',
    invitationSent: 'Einladung gesendet!',
    inviteSuccessMsg: 'wurde erfolgreich zur Gruppe hinzugefügt.',
    createSharedGroup: 'Gemeinsame Gruppe erstellen',
    locationFocus: 'Ort / Fokus',
    editGroupDetails: 'Gruppendetails bearbeiten',
    saveChanges: 'Änderungen speichern',
    roomCodeCopied: 'Raumcode kopiert!',
    welcomeBack: 'Willkommen zurück',
    roomCodeLabel: 'Raum-Code',
    onlineNowShort: 'Online',
    totalAmount: 'Gesamtbetrag',
    whatWasThisFor: 'Wofür war das?',
    editSplit: 'Teilung bearbeiten',
    saveSplit: 'Teilung speichern',
    splitMethod: 'Aufteilungsmethode',
    recurrent: 'Wiederkehrend',
    receipt: 'Beleg',
    today: 'Heute',
    newBillAddedWithDesc: 'hinzugefügt via AI',
    settlementRegistered: 'hat ausgeglichen mit',
    receiptUpload: 'Beleg hochladen',
    receiptPhoto: 'Belegfoto / Quittung',
    receiptAttached: 'Beleg angehängt',
    viewReceipt: 'Beleg ansehen',
    removeReceipt: 'Beleg entfernen',
    dropReceiptHere: 'Bild hierher ziehen oder durchsuchen',
    sampleReceipt: 'Muster-Quittung verwenden',
    deadline: 'Zahlungsziel',
    setDeadline: 'Frist setzen',
    noDeadline: 'Kein Zahlungsziel',
    dueInDays: 'Fällig in',
    dueToday: 'Heute fällig',
    overdue: 'Überfällig',
    daysAgo: 'Tage her',
    sendReminder: 'Erinnerung senden',
    reminderSent: 'Erinnerung gesendet!',
    reminderSuccessMsg: 'Zahlungserinnerung wurde erfolgreich per Push-Mitteilung verschickt.',
    remindAllDebtors: 'Alle Schuldner erinnern',
    upcomingDeadlines: 'Bevorstehende Fristen',
    daysLeft: 'Tage übrig',
    noUpcomingDeadlines: 'Keine offenen Zahlungsfristen',
    receiptPreview: 'Beleg-Vorschau',
    close: 'Schließen',
    download: 'Herunterladen',
    in3Days: 'In 3 Tagen',
    in1Week: 'In 1 Woche',
    in2Weeks: 'In 2 Wochen',
    endOfMonth: 'Monatsende',
    reminderLogged: 'hat eine Zahlungserinnerung gesendet für',
    directPay: 'Direkt bezahlen',
    payShare: 'Anteil direkt zahlen',
    paymentMethods: 'Zahlungsmethoden',
    paypalDirect: 'PayPal Direktlink',
    paypalDesc: 'Betrag wird automatisch im Link übergeben',
    openPaypal: 'Mit PayPal bezahlen',
    copyPaypalLink: 'PayPal-Link kopieren',
    copied: 'Kopiert!',
    bankTransfer: 'Banküberweisung (SEPA)',
    iban: 'IBAN',
    bic: 'BIC / SWIFT',
    accountHolder: 'Kontoinhaber',
    reference: 'Verwendungszweck',
    copyIban: 'IBAN kopieren',
    ibanCopied: 'IBAN in Zwischenablage kopiert!',
    giroCode: 'SEPA Überweisungscode',
    enableDirectPay: 'Direkt-Zahlungslink aktivieren',
    directPayHint:
      'Ermöglicht anderen Mitgliedern, ihren Anteil mit 1 Klick an dich per PayPal oder SEPA zu überweisen.',
    defaultPaymentInfo: 'Meine Zahlungsdaten für Rückzahlungen',
    defaultPaymentInfoDesc:
      'Hinterlege dein PayPal.me oder deine IBAN, damit Direkt-Zahlungslinks bei neuen Rechnungen automatisch erstellt werden.',
    markPaidAfterTransfer: 'Als bezahlt verbuchen',
    savePaymentInfo: 'Zahlungsdaten speichern',
    shareDirectPay: 'Zahlungsaufforderung teilen',
    shareWhatsApp: 'Über WhatsApp senden',
    copyShareText: 'Text kopieren',
    editDirectPay: 'Direct-Pay-Link anpassen',
    scanBankingApp: 'Mit Banking-App scannen',
    scanBankingAppDesc:
      'GiroCode / EPC-QR: Öffne deine Banking-App (Sparkasse, N26, DKB, Volksbank, ING etc.) und scanne den Code zur automatischen Überweisung.',
    directPayActive: 'Direct Pay aktiv',
    previewDirectPay: 'Zahlungslink testen',
    saveAsDefault: 'Als Standard für mein Profil merken',
    allPaymentMethods: 'Alle Methoden',
  },
  en: {
    appName: 'Bill the Splitter',
    dashboard: 'Dashboard',
    groups: 'Groups',
    activity: 'Activity',
    settings: 'Settings',
    addBill: 'Add Bill',
    joinGroup: 'Join Group',
    newGroup: 'New Group',
    totalBalance: 'Total Balance',
    youAreOwed: 'You are owed',
    youOwe: 'You owe',
    settledUp: 'Settled up',
    noGroupsYet: 'No groups here yet',
    createGroupDesc: 'Create a new group to start sharing expenses.',
    allGroups: 'All Shared Groups',
    roomCode: 'Room Code',
    liveMultiplayer: 'Live Multiplayer',
    localStorageOnly: 'Local Storage Only',
    onlineNow: 'Online now',
    quickSplitAI: 'Quick Split with AI',
    aiDesc:
      'Type who paid, what they bought, and who should split it in simple plain English or German. Our AI will split it intelligently.',
    aiPlaceholder: 'e.g., Sarah paid 85.50 € for dinner with Elena and Jordan',
    quickParse: 'Quick Parse',
    parsing: 'Parsing...',
    parsedPreview: 'Parsed Result Preview',
    cancel: 'Cancel',
    confirmAndSplit: 'Confirm & Split',
    description: 'Description',
    amount: 'Amount',
    paidBy: 'Paid By',
    splittingWith: 'Splitting With',
    allMembers: 'All Members',
    recentExpenses: 'Recent Expenses',
    settleUp: 'Settle Up',
    markPaid: 'Mark paid',
    balances: 'Balances',
    members: 'Members',
    noExpensesYet: 'No expenses in this group yet.',
    inviteMember: 'Invite Member',
    name: 'Name',
    email: 'Email',
    addExpense: 'Add Expense',
    payer: 'Payer',
    splitType: 'Split Type',
    equal: 'Equally',
    percentage: 'Percentage',
    exact: 'Exact amounts',
    save: 'Save',
    groupDetails: 'Group Details',
    location: 'Location',
    category: 'Category',
    groupCreated: 'Group Created',
    newBillAdded: 'New Bill Added',
    settlementMade: 'Settlement Made',
    searchPlaceholder: 'Search expenses...',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    systemOperational: 'All systems operational.',
    backToDashboard: 'Back to Dashboard',
    groupName: 'Group Name',
    selectCategory: 'Select Category',
    travel: 'Travel',
    rentUtilities: 'Rent, Utilities',
    diningOut: 'Dining Out',
    general: 'General',
    placeholderInvite: 'e.g., Max Mustermann',
    placeholderEmail: 'max@example.com',
    noActivitiesYet: 'No activities logged yet.',
    currencySymbol: '€',
    activeLanguage: 'Active Language',
    allActivityLogs: 'All Activity Logs',
    activityLogsDesc: 'Keep track of settlements, newly recorded expenses, and audit logs.',
    searchExpenses: 'Search Expenses',
    searchPlaceholderFull: 'Search expenses by title or who paid...',
    typeToBeginSearch: 'Type to begin searching expenses...',
    noExpensesFound: 'No expenses found matching',
    roomCodeDesc:
      "Enter the room join code provided by your friends. If the room has active multiplayer ledger status, we'll sync it automatically!",
    copiedJoinCode: 'Copied Join Code!',
    quickInsightAlert:
      'Most of the expenses in this ledger have been for Dining and Accommodation. Keep splitting cleanly!',
    infoLabel: 'Info',
    defaultCurrency: 'Default Currency',
    defaultCurrencyDesc: 'Calculations display in Euro (€) by default.',
    activeNow: 'Active',
    recordPayment: 'Record Payment',
    settleUpLedger: 'Settle Up Ledger',
    settleCashWireDesc:
      'This records a cash/wire payment. Outstanding balances will instantly adjust.',
    sendInvitation: 'Send Invitation',
    invitationSent: 'Invitation sent!',
    inviteSuccessMsg: 'was invited and joined successfully.',
    createSharedGroup: 'Create Shared Group',
    locationFocus: 'Location / Focus',
    editGroupDetails: 'Edit Group Details',
    saveChanges: 'Save Changes',
    roomCodeCopied: 'Room Code Copied!',
    welcomeBack: 'Welcome back',
    roomCodeLabel: 'Room Code',
    onlineNowShort: 'Online',
    totalAmount: 'Total Amount',
    whatWasThisFor: 'What was this for?',
    editSplit: 'Edit Split',
    saveSplit: 'Save Split',
    splitMethod: 'Split Method',
    recurrent: 'Recurrent',
    receipt: 'Receipt',
    today: 'Today',
    newBillAddedWithDesc: 'added via AI',
    settlementRegistered: 'settled with',
    receiptUpload: 'Upload Receipt',
    receiptPhoto: 'Receipt Photo',
    receiptAttached: 'Receipt Attached',
    viewReceipt: 'View Receipt',
    removeReceipt: 'Remove Receipt',
    dropReceiptHere: 'Drag & drop image here or click to browse',
    sampleReceipt: 'Use sample receipt',
    deadline: 'Payment Deadline',
    setDeadline: 'Set Deadline',
    noDeadline: 'No deadline',
    dueInDays: 'Due in',
    dueToday: 'Due today',
    overdue: 'Overdue',
    daysAgo: 'days ago',
    sendReminder: 'Send Reminder',
    reminderSent: 'Reminder sent!',
    reminderSuccessMsg: 'Payment reminder notification has been pushed successfully.',
    remindAllDebtors: 'Remind All Debtors',
    upcomingDeadlines: 'Upcoming Deadlines',
    daysLeft: 'days left',
    noUpcomingDeadlines: 'No open payment deadlines',
    receiptPreview: 'Receipt Preview',
    close: 'Close',
    download: 'Download',
    in3Days: 'In 3 Days',
    in1Week: 'In 1 Week',
    in2Weeks: 'In 2 Weeks',
    endOfMonth: 'End of Month',
    reminderLogged: 'sent a payment reminder for',
    directPay: 'Direct Pay',
    payShare: 'Pay my share directly',
    paymentMethods: 'Payment Methods',
    paypalDirect: 'PayPal Direct Link',
    paypalDesc: 'Exact share amount is automatically included in link',
    openPaypal: 'Pay with PayPal',
    copyPaypalLink: 'Copy PayPal Link',
    copied: 'Copied!',
    bankTransfer: 'Bank Transfer (SEPA)',
    iban: 'IBAN',
    bic: 'BIC / SWIFT',
    accountHolder: 'Account Holder',
    reference: 'Payment Reference',
    copyIban: 'Copy IBAN',
    ibanCopied: 'IBAN copied to clipboard!',
    giroCode: 'SEPA GiroCode',
    enableDirectPay: 'Enable Direct Payment Link',
    directPayHint:
      'Allows other members to pay their share directly to you via PayPal or SEPA in 1 click.',
    defaultPaymentInfo: 'My Refund Payment Details',
    defaultPaymentInfoDesc:
      'Save your PayPal.me handle or IBAN so direct payment links are automatically created when you pay a bill.',
    markPaidAfterTransfer: 'Record as settled',
    savePaymentInfo: 'Save Payment Details',
    shareDirectPay: 'Share Payment Link',
    shareWhatsApp: 'Send via WhatsApp',
    copyShareText: 'Copy Text',
    editDirectPay: 'Configure Direct Pay',
    scanBankingApp: 'Scan with Banking App',
    scanBankingAppDesc:
      'EPC GiroCode: Open your banking app (Sparkasse, N26, DKB, Volksbank, ING etc.) to scan and prefill recipient, IBAN, and amount.',
    directPayActive: 'Direct Pay Active',
    previewDirectPay: 'Test Payment Link',
    saveAsDefault: 'Save as my default payment details',
    allPaymentMethods: 'All Methods',
  },
};
