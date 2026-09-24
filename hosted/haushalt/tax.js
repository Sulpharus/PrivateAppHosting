// Tax side of the household book: which booking goes into which field of the German income tax
// return (Einkommensteuererklärung), plus the flat rates and caps per tax year. Pure functions,
// amounts in cents. The app prepares values for ELSTER; it never files anything.

export const FORMS = [
  { id: 'N', title: 'Anlage N', sub: 'Werbungskosten aus nichtselbständiger Arbeit' },
  { id: 'SA', title: 'Anlage Sonderausgaben', sub: 'Kirchensteuer, Spenden, Erstausbildung' },
  { id: 'VA', title: 'Anlage Vorsorgeaufwand', sub: 'Selbst gezahlte Versicherungsbeiträge' },
  { id: 'KIND', title: 'Anlage Kind', sub: 'Kinderbetreuung und Schulgeld' },
  { id: 'HH', title: 'Anlage Haushaltsnahe Aufwendungen', sub: 'Steuerermäßigung nach § 35a EStG' },
  { id: 'AB', title: 'Anlage Außergewöhnliche Belastungen', sub: 'Krankheits- und Pflegekosten' },
];

/** Fields a category or a single booking can be mapped to. */
export const FIELDS = {
  wk_arbeitsmittel: {
    form: 'N',
    label: 'Arbeitsmittel',
    hint: 'Laptop, Fachliteratur, Berufskleidung. Über 800 € netto über die Nutzungsdauer verteilen (Computer: 1 Jahr).',
  },
  wk_fortbildung: { form: 'N', label: 'Fortbildungskosten' },
  wk_arbeitszimmer: {
    form: 'N',
    label: 'Häusliches Arbeitszimmer',
    hint: 'Nur wenn es der Mittelpunkt der Tätigkeit ist; dann statt der Homeoffice-Pauschale.',
  },
  wk_bewerbung: { form: 'N', label: 'Bewerbungskosten' },
  wk_kontofuehrung: { form: 'N', label: 'Kontoführungsgebühren' },
  wk_weitere: { form: 'N', label: 'Weitere Werbungskosten' },
  sa_kirchensteuer: {
    form: 'SA',
    label: 'Gezahlte Kirchensteuer',
    hint: 'Nur was nicht schon über den Lohn einbehalten wurde (Nachzahlungen, Kirchgeld).',
  },
  sa_spenden: {
    form: 'SA',
    label: 'Spenden und Mitgliedsbeiträge an gemeinnützige Organisationen',
  },
  sa_parteien: { form: 'SA', label: 'Spenden und Beiträge an politische Parteien' },
  sa_ausbildung: { form: 'SA', label: 'Kosten der eigenen Erstausbildung' },
  va_kv: {
    form: 'VA',
    label: 'Kranken- und Pflegeversicherung (selbst gezahlt)',
    hint: 'Beiträge, die nicht schon über den Lohn laufen, z. B. private Zusatzbeiträge.',
  },
  va_ruerup: { form: 'VA', label: 'Beiträge zur Basisrente (Rürup)' },
  va_weitere: {
    form: 'VA',
    label: 'Haftpflicht-, Unfall-, Berufsunfähigkeits- und Risikolebensversicherungen',
  },
  kind_betreuung: {
    form: 'KIND',
    label: 'Kinderbetreuungskosten',
    hint: 'Kita, Tagesmutter, Hort. Nur unbar bezahlt; Verpflegung zählt nicht.',
  },
  kind_schulgeld: {
    form: 'KIND',
    label: 'Schulgeld',
    hint: 'Privatschule, ohne Beherbergung, Betreuung und Verpflegung.',
  },
  hh_minijob: { form: 'HH', label: 'Minijob im Privathaushalt' },
  hh_dienstleistungen: {
    form: 'HH',
    label: 'Haushaltsnahe Dienstleistungen',
    hint: 'Reinigung, Gartenpflege, Hausmeister, Treppenhaus (auch aus der Nebenkostenabrechnung).',
  },
  hh_handwerker: {
    form: 'HH',
    label: 'Handwerkerleistungen',
    hint: 'Nur Arbeits-, Fahrt- und Maschinenkosten, kein Material. Gib bei der Buchung den Lohnanteil an.',
  },
  ab_krankheit: {
    form: 'AB',
    label: 'Krankheitskosten',
    hint: 'Zuzahlungen, Brille, Zahnersatz, verordnete Medikamente.',
  },
  ab_pflege: { form: 'AB', label: 'Pflegekosten' },
  ab_sonstige: { form: 'AB', label: 'Sonstige außergewöhnliche Belastungen' },
};

/** Flat rates and caps of the tax year. */
export function params(year) {
  return {
    // § 9a EStG
    arbeitnehmerPauschbetrag: year >= 2023 ? 123000 : 120000,
    // § 4 Abs. 5 Nr. 6c EStG: per day, capped days
    homeofficeRate: year >= 2023 ? 600 : 500,
    homeofficeMaxDays: year >= 2023 ? 210 : 120,
    // § 9 Abs. 1 Nr. 4 EStG, cents per km of the one-way distance and working day.
    // 2026: 38 ct from the first kilometre (Steueränderungsgesetz 2025).
    kmRateFirst20: year >= 2026 ? 38 : 30,
    kmRateFrom21: year >= 2022 ? 38 : year === 2021 ? 35 : 30,
    kmCap: 450000,
    // § 10 Abs. 1 Nr. 5 EStG, per child
    betreuungQuote: year >= 2025 ? 0.8 : 2 / 3,
    betreuungMax: year >= 2025 ? 480000 : 400000,
    // § 10 Abs. 1 Nr. 9 EStG, per child
    schulgeldQuote: 0.3,
    schulgeldMax: 500000,
    // § 10 Abs. 1 Nr. 7 EStG
    ausbildungMax: 600000,
    // § 35a EStG: 20 % of the costs, capped reduction of the tax
    hh: { hh_minijob: 51000, hh_dienstleistungen: 400000, hh_handwerker: 120000 },
    kontofuehrungPauschale: 1600,
  };
}

/** Distance allowance for the tax year, in cents. */
export function entfernungspauschale(year, km, days) {
  const p = params(year);
  const k = Math.max(0, Math.floor(km || 0));
  const d = Math.max(0, Math.floor(days || 0));
  const perDay = Math.min(k, 20) * p.kmRateFirst20 + Math.max(0, k - 20) * p.kmRateFrom21;
  return Math.min(perDay * d, p.kmCap);
}

/** Home office allowance, in cents. */
export function homeofficePauschale(year, days) {
  const p = params(year);
  return Math.min(Math.max(0, Math.floor(days || 0)), p.homeofficeMaxDays) * p.homeofficeRate;
}

/**
 * Reasonable burden (§ 33 Abs. 3 EStG, stepped since BFH VI R 75/14) in cents.
 * income: Gesamtbetrag der Einkünfte in cents; married: joint assessment; children: count.
 */
export function zumutbareBelastung(income, married, children) {
  const rates =
    children >= 3 ? [1, 1, 2] : children >= 1 ? [2, 3, 4] : married ? [4, 5, 6] : [5, 6, 7];
  const bounds = [1534000, 5113000, Number.POSITIVE_INFINITY];
  let sum = 0;
  let lower = 0;
  for (let i = 0; i < 3; i++) {
    const part = Math.max(0, Math.min(income, bounds[i]) - lower);
    sum += (part * rates[i]) / 100;
    lower = bounds[i];
  }
  return Math.floor(sum);
}

/**
 * Builds the filled forms for one year.
 * bookings: [{ id, date, cents, kind, text, taxField, taxCents }] where taxField is already
 * resolved (booking override, else category default) and taxCents the eligible amount.
 * Income bookings on a tax field (e.g. a refund) reduce that field.
 */
export function buildReturn(year, bookings, profile = {}) {
  const p = params(year);
  const sums = new Map();
  const items = new Map();
  for (const b of bookings) {
    if (!b.taxField || !FIELDS[b.taxField] || !b.date.startsWith(`${year}-`)) continue;
    const amount = (b.kind === 'income' ? -1 : 1) * (b.taxCents ?? b.cents);
    sums.set(b.taxField, (sums.get(b.taxField) ?? 0) + amount);
    if (!items.has(b.taxField)) items.set(b.taxField, []);
    items.get(b.taxField).push(b);
  }
  const field = (key) => ({
    key,
    label: FIELDS[key].label,
    hint: FIELDS[key].hint,
    cents: Math.max(0, sums.get(key) ?? 0),
    items: items.get(key) ?? [],
  });
  const fieldsOf = (form) =>
    Object.keys(FIELDS)
      .filter((key) => FIELDS[key].form === form)
      .map(field);
  const children = Math.max(0, Math.floor(profile.children || 0));
  const forms = [];

  // Anlage N
  {
    const rows = [];
    const km = entfernungspauschale(year, profile.commuteKm, profile.commuteDays);
    if (profile.commuteKm && profile.commuteDays)
      rows.push({
        key: 'wk_entfernung',
        label: 'Wege zur ersten Tätigkeitsstätte (Entfernungspauschale)',
        hint: `${profile.commuteDays} Tage × ${profile.commuteKm} km einfache Strecke`,
        cents: km,
        computed: true,
      });
    const ho = homeofficePauschale(year, profile.homeofficeDays);
    if (profile.homeofficeDays)
      rows.push({
        key: 'wk_homeoffice',
        label: 'Tagespauschale für Tätigkeit in der häuslichen Wohnung',
        hint: `${Math.min(profile.homeofficeDays, p.homeofficeMaxDays)} Tage × ${euro(p.homeofficeRate)}`,
        cents: ho,
        computed: true,
      });
    const own = fieldsOf('N');
    const konto = own.find((row) => row.key === 'wk_kontofuehrung');
    if (konto && konto.cents === 0 && profile.employee !== false) {
      konto.cents = p.kontofuehrungPauschale;
      konto.hint = 'Pauschale, wird ohne Nachweis üblicherweise anerkannt.';
      konto.computed = true;
    }
    rows.push(...own);
    const total = rows.reduce((s, r) => s + r.cents, 0);
    const over = total - p.arbeitnehmerPauschbetrag;
    forms.push({
      ...FORMS[0],
      rows,
      total,
      summary:
        over > 0
          ? `${euro(total)} Werbungskosten, ${euro(over)} mehr als der Arbeitnehmer-Pauschbetrag von ${euro(p.arbeitnehmerPauschbetrag)}.`
          : `${euro(total)} Werbungskosten. Das Finanzamt setzt ohnehin den Pauschbetrag von ${euro(p.arbeitnehmerPauschbetrag)} an; Einzelnachweise lohnen sich erst darüber.`,
    });
  }

  // Sonderausgaben
  {
    const rows = fieldsOf('SA');
    const aus = rows.find((row) => row.key === 'sa_ausbildung');
    if (aus && aus.cents > p.ausbildungMax) {
      aus.hint = `Abziehbar höchstens ${euro(p.ausbildungMax)}.`;
      aus.deductible = p.ausbildungMax;
    }
    forms.push({ ...FORMS[1], rows, total: rows.reduce((s, r) => s + r.cents, 0) });
  }

  // Vorsorgeaufwand
  {
    const rows = fieldsOf('VA');
    forms.push({
      ...FORMS[2],
      rows,
      total: rows.reduce((s, r) => s + r.cents, 0),
      summary:
        'Pflichtbeiträge über den Arbeitgeber stehen auf der Lohnsteuerbescheinigung und werden automatisch übernommen.',
    });
  }

  // Anlage Kind
  {
    const rows = fieldsOf('KIND');
    const n = Math.max(1, children);
    const care = rows.find((row) => row.key === 'kind_betreuung');
    if (care?.cents)
      care.deductible = Math.min(Math.round(care.cents * p.betreuungQuote), p.betreuungMax * n);
    const school = rows.find((row) => row.key === 'kind_schulgeld');
    if (school?.cents)
      school.deductible = Math.min(Math.round(school.cents * p.schulgeldQuote), p.schulgeldMax * n);
    const quote = p.betreuungQuote === 0.8 ? '80 %' : 'zwei Drittel';
    forms.push({
      ...FORMS[3],
      rows,
      total: rows.reduce((s, r) => s + r.cents, 0),
      summary: `Abziehbar: ${quote} der Betreuungskosten, höchstens ${euro(p.betreuungMax)} je Kind; 30 % des Schulgelds, höchstens ${euro(p.schulgeldMax)} je Kind. Trage die Kosten je Kind in der Anlage Kind ein.`,
    });
  }

  // Haushaltsnahe Aufwendungen
  {
    const rows = fieldsOf('HH');
    let reduction = 0;
    for (const row of rows) {
      row.reduction = Math.min(Math.round(row.cents * 0.2), p.hh[row.key]);
      reduction += row.reduction;
    }
    forms.push({
      ...FORMS[4],
      rows,
      total: rows.reduce((s, r) => s + r.cents, 0),
      reduction,
      summary: `20 % der Kosten werden direkt von der Steuer abgezogen: voraussichtlich ${euro(reduction)}. Nur unbar bezahlte Rechnungen zählen.`,
    });
  }

  // Außergewöhnliche Belastungen
  {
    const rows = fieldsOf('AB');
    const total = rows.reduce((s, r) => s + r.cents, 0);
    let summary =
      'Das Finanzamt zieht eine zumutbare Belastung ab. Trage unter „Angaben“ den Gesamtbetrag der Einkünfte ein, dann rechnet die App sie aus.';
    let deductible;
    if (profile.income) {
      const own = zumutbareBelastung(Math.round(profile.income), !!profile.married, children);
      deductible = Math.max(0, total - own);
      summary = `Zumutbare Belastung ${euro(own)}: voraussichtlich wirken sich ${euro(deductible)} aus.`;
    }
    forms.push({ ...FORMS[5], rows, total, deductible, summary });
  }

  return forms;
}

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
/** Formats cents as euros, e.g. 123456 → "1.234,56 €". */
export const euro = (cents) => euroFormat.format((cents || 0) / 100);
