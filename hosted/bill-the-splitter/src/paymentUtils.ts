import QRCode from 'qrcode';

/**
 * Utilities for direct payment links (PayPal.Me, Bank Transfer / IBAN, EPC QR)
 */

export function cleanPayPalHandle(handle: string): string {
  if (!handle) return '';
  return handle
    .trim()
    .replace(/^https?:\/\/(www\.)?paypal\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .trim();
}

export function generatePayPalUrl(handle: string, amount: number, currency = 'EUR'): string {
  const clean = cleanPayPalHandle(handle);
  if (!clean) return '';
  // PayPal.me format: https://paypal.me/username/12.50EUR
  return `https://paypal.me/${clean}/${amount.toFixed(2)}${currency}`;
}

export function formatIban(iban: string): string {
  if (!iban) return '';
  const clean = iban.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  // Group into blocks of 4
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

export function cleanIban(iban: string): string {
  return (iban || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Standard EPC (European Payments Council) QR Data String for SEPA Credit Transfer (GiroCode)
 */
export function generateEpcPayload(
  recipientName: string,
  ibanStr: string,
  amount: number,
  reference: string,
  bicStr = '',
): string {
  const iban = cleanIban(ibanStr);
  const bic = (bicStr || '').trim().toUpperCase();
  const name = recipientName.trim().slice(0, 70);
  const ref = (reference || 'Bill the Splitter Settlement').trim().slice(0, 140);
  const formattedAmount = `EUR${amount.toFixed(2)}`;

  // EPC069-08 Quick Response Code Guidelines
  return [
    'BCD',
    '002',
    '1',
    'SCT',
    bic,
    name,
    iban,
    formattedAmount,
    '', // Purpose code
    ref, // Remittance info (unstructured)
    '', // Beneficiary to originator info
  ].join('\n');
}

/**
 * Generates an actual scannable EPC QR / GiroCode Data URL for banking apps
 */
export async function generateEpcQrDataUrl(
  recipientName: string,
  ibanStr: string,
  amount: number,
  reference: string,
  bicStr = '',
): Promise<string> {
  const payload = generateEpcPayload(recipientName, ibanStr, amount, reference, bicStr);
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 6,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Failed to generate EPC QR code', err);
    return '';
  }
}

/**
 * Generates formatted invitation / payment reminder text for WhatsApp or Messenger
 */
export function generateSharePaymentText(options: {
  description: string;
  amount: number;
  recipientName: string;
  paypalHandle?: string;
  iban?: string;
  bic?: string;
  accountHolder?: string;
  lang?: 'de' | 'en';
}): string {
  const {
    description,
    amount,
    recipientName,
    paypalHandle,
    iban,
    bic,
    accountHolder,
    lang = 'de',
  } = options;
  const paypalUrl = paypalHandle ? generatePayPalUrl(paypalHandle, amount) : '';
  const formattedAmount = `${amount.toFixed(2)} €`;

  if (lang === 'de') {
    let msg = `👋 Hi! Hier ist der Zahlungslink für deinen Anteil an "${description}" (${formattedAmount}) von ${recipientName}:\n\n`;
    if (paypalUrl) {
      msg += `⚡ Direkt per PayPal zahlen:\n${paypalUrl}\n\n`;
    }
    if (iban) {
      msg += `🏦 Oder per Banküberweisung:\nKontoinhaber: ${accountHolder || recipientName}\nIBAN: ${formatIban(iban)}\n`;
      if (bic) msg += `BIC: ${bic}\n`;
      msg += `Verwendungszweck: Bill the Splitter - ${description.slice(0, 30)}\n\n`;
    }
    msg += `Vielen Dank! 🚀`;
    return msg;
  } else {
    let msg = `👋 Hi! Here is the direct payment link for your share of "${description}" (${formattedAmount}) from ${recipientName}:\n\n`;
    if (paypalUrl) {
      msg += `⚡ Pay instantly with PayPal:\n${paypalUrl}\n\n`;
    }
    if (iban) {
      msg += `🏦 Or via Bank Transfer:\nAccount Holder: ${accountHolder || recipientName}\nIBAN: ${formatIban(iban)}\n`;
      if (bic) msg += `BIC: ${bic}\n`;
      msg += `Reference: Bill the Splitter - ${description.slice(0, 30)}\n\n`;
    }
    msg += `Thank you! 🚀`;
    return msg;
  }
}

/**
 * Generates an SVG EPC QR / GiroCode preview representation
 */
export function generateBankingQrSvg(
  recipientName: string,
  iban: string,
  amount: number,
  reference: string,
): string {
  const formattedAmount = amount.toFixed(2);
  const formattedIbanStr = formatIban(iban);

  // Clean, modern visual GiroCard / Banking QR illustration
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="240" viewBox="0 0 340 240">
    <defs>
      <linearGradient id="bankGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#006C49"/>
        <stop offset="100%" stop-color="#044E36"/>
      </linearGradient>
    </defs>
    <!-- Card Frame -->
    <rect width="340" height="240" rx="16" fill="url(#bankGrad)"/>
    <rect x="1" y="1" width="338" height="238" rx="15" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
    
    <!-- Chip & GiroCode badge -->
    <rect x="24" y="24" width="40" height="30" rx="6" fill="#FBBF24" opacity="0.9"/>
    <line x1="24" y1="39" x2="64" y2="39" stroke="#D97706" stroke-width="1"/>
    <line x1="44" y1="24" x2="44" y2="54" stroke="#D97706" stroke-width="1"/>
    
    <text x="295" y="44" font-family="system-ui, sans-serif" font-size="12" font-weight="900" fill="#A7F3D0" text-anchor="end" letter-spacing="1">SEPA GIROCODE</text>
    <text x="295" y="58" font-family="system-ui, sans-serif" font-size="9" fill="rgba(255,255,255,0.7)" text-anchor="end">EPC STANDARD</text>
    
    <!-- Amount display -->
    <text x="24" y="95" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="rgba(255,255,255,0.6)" letter-spacing="1">BETRAG / AMOUNT</text>
    <text x="24" y="125" font-family="monospace" font-size="26" font-weight="900" fill="#FFFFFF">${formattedAmount} €</text>
    
    <!-- IBAN details -->
    <text x="24" y="155" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="rgba(255,255,255,0.6)" letter-spacing="1">IBAN</text>
    <text x="24" y="175" font-family="monospace" font-size="13" font-weight="bold" fill="#FFFFFF" letter-spacing="1.5">${formattedIbanStr}</text>
    
    <!-- Account holder & Purpose -->
    <text x="24" y="205" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#E2E8F0">${recipientName}</text>
    <text x="24" y="220" font-family="system-ui, sans-serif" font-size="9" fill="rgba(255,255,255,0.7)">Ref: ${reference.slice(0, 28)}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
