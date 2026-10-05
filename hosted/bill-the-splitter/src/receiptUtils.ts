/**
 * Utility helpers for receipts, deadline formatting, and push reminders
 */

export interface DeadlineStatus {
  status: 'none' | 'today' | 'upcoming' | 'overdue';
  badgeColor: string;
  label: { de: string; en: string };
  daysDiff: number;
}

export function computeDeadlineStatus(dueDate?: string): DeadlineStatus {
  if (!dueDate) {
    return {
      status: 'none',
      badgeColor: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      label: { de: 'Keine Frist', en: 'No deadline' },
      daysDiff: 0,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  if (isNaN(due.getTime())) {
    return {
      status: 'none',
      badgeColor: 'bg-slate-100 text-slate-500',
      label: { de: 'Keine Frist', en: 'No deadline' },
      daysDiff: 0,
    };
  }

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return {
      status: 'today',
      badgeColor:
        'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
      label: { de: 'Heute fällig!', en: 'Due today!' },
      daysDiff: 0,
    };
  } else if (diffDays > 0) {
    return {
      status: 'upcoming',
      badgeColor:
        diffDays <= 3
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50'
          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50',
      label: {
        de: `Fällig in ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`,
        en: `Due in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
      },
      daysDiff: diffDays,
    };
  } else {
    const overdueDays = Math.abs(diffDays);
    return {
      status: 'overdue',
      badgeColor:
        'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-900',
      label: {
        de: `Überfällig (${overdueDays} ${overdueDays === 1 ? 'Tag' : 'Tage'})`,
        en: `Overdue (${overdueDays} ${overdueDays === 1 ? 'day' : 'days'})`,
      },
      daysDiff: overdueDays,
    };
  }
}

/**
 * Resizes and converts a File to a clean Base64 data URL
 */
export async function fileToCompressedBase64(file: File, maxDim = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Clean JPEG compression to keep localStorage payload light
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Generates an SVG Data URL mock receipt for quick demo testing
 */
export function generateSampleReceiptUrl(title: string, amount: number, dateStr: string): string {
  const formattedAmount = amount.toFixed(2);
  const tax = ((amount * 0.19) / 1.19).toFixed(2);
  const net = (amount - parseFloat(tax)).toFixed(2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520" viewBox="0 0 400 520">
    <defs>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.12"/>
      </filter>
    </defs>
    <rect width="360" height="480" x="20" y="20" rx="8" fill="#FAF9F6" stroke="#E2E8F0" stroke-width="2" filter="url(#shadow)"/>
    <!-- Serrated zig zag edges on top and bottom -->
    <path d="M 20 20 L 40 28 L 60 20 L 80 28 L 100 20 L 120 28 L 140 20 L 160 28 L 180 20 L 200 28 L 220 20 L 240 28 L 260 20 L 280 28 L 300 20 L 320 28 L 340 20 L 360 28 L 380 20" stroke="#CBD5E1" stroke-width="2" fill="none"/>
    <text x="200" y="70" font-family="Courier, monospace" font-size="20" font-weight="bold" fill="#0F172A" text-anchor="middle">RECEIPT / QUITTUNG</text>
    <text x="200" y="95" font-family="Courier, monospace" font-size="13" fill="#64748B" text-anchor="middle">BILL THE SPLITTER VERIFIED</text>
    <line x1="45" y1="115" x2="355" y2="115" stroke="#94A3B8" stroke-dasharray="4 4" stroke-width="1.5"/>
    <text x="50" y="145" font-family="Courier, monospace" font-size="14" fill="#334155">Date / Datum:</text>
    <text x="350" y="145" font-family="Courier, monospace" font-size="14" fill="#0F172A" text-anchor="end" font-weight="bold">${dateStr}</text>
    <text x="50" y="175" font-family="Courier, monospace" font-size="14" fill="#334155">Description:</text>
    <text x="350" y="175" font-family="Courier, monospace" font-size="14" fill="#0F172A" text-anchor="end" font-weight="bold">${title.slice(0, 20)}</text>
    <line x1="45" y1="205" x2="355" y2="205" stroke="#CBD5E1" stroke-width="1"/>
    <text x="50" y="235" font-family="Courier, monospace" font-size="13" fill="#64748B">Net Subtotal</text>
    <text x="350" y="235" font-family="Courier, monospace" font-size="13" fill="#334155" text-anchor="end">€ ${net}</text>
    <text x="50" y="265" font-family="Courier, monospace" font-size="13" fill="#64748B">VAT / MwSt (19%)</text>
    <text x="350" y="265" font-family="Courier, monospace" font-size="13" fill="#334155" text-anchor="end">€ ${tax}</text>
    <line x1="45" y1="295" x2="355" y2="295" stroke="#0F172A" stroke-width="2"/>
    <text x="50" y="335" font-family="Courier, monospace" font-size="18" font-weight="bold" fill="#006C49">TOTAL / GESAMT</text>
    <text x="350" y="335" font-family="Courier, monospace" font-size="22" font-weight="bold" fill="#006C49" text-anchor="end">€ ${formattedAmount}</text>
    <!-- Barcode illustration -->
    <rect x="70" y="380" width="4" height="40" fill="#334155"/>
    <rect x="80" y="380" width="8" height="40" fill="#334155"/>
    <rect x="94" y="380" width="3" height="40" fill="#334155"/>
    <rect x="103" y="380" width="6" height="40" fill="#334155"/>
    <rect x="115" y="380" width="10" height="40" fill="#334155"/>
    <rect x="132" y="380" width="4" height="40" fill="#334155"/>
    <rect x="142" y="380" width="7" height="40" fill="#334155"/>
    <rect x="155" y="380" width="3" height="40" fill="#334155"/>
    <rect x="165" y="380" width="9" height="40" fill="#334155"/>
    <rect x="180" y="380" width="4" height="40" fill="#334155"/>
    <rect x="190" y="380" width="7" height="40" fill="#334155"/>
    <rect x="204" y="380" width="5" height="40" fill="#334155"/>
    <rect x="215" y="380" width="11" height="40" fill="#334155"/>
    <rect x="233" y="380" width="4" height="40" fill="#334155"/>
    <rect x="243" y="380" width="8" height="40" fill="#334155"/>
    <rect x="257" y="380" width="3" height="40" fill="#334155"/>
    <rect x="266" y="380" width="9" height="40" fill="#334155"/>
    <rect x="281" y="380" width="6" height="40" fill="#334155"/>
    <rect x="293" y="380" width="4" height="40" fill="#334155"/>
    <rect x="303" y="380" width="10" height="40" fill="#334155"/>
    <rect x="320" y="380" width="5" height="40" fill="#334155"/>
    <text x="200" y="440" font-family="Courier, monospace" font-size="11" fill="#94A3B8" text-anchor="middle">THANK YOU FOR YOUR PAYMENT</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
