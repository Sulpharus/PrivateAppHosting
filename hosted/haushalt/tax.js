// Tax side of the household book: which booking goes into which field of the German income tax
// return (Einkommensteuererklärung), plus the flat rates and caps per tax year. Pure functions,
// amounts in cents. The app prepares values for ELSTER; it never files anything.

/** Forms of the return; title and sub are language keys (tax.form.<id>.title / .sub). */
export const FORMS = [
  { id: 'N', title: 'tax.form.N.title', sub: 'tax.form.N.sub' },
  { id: 'SA', title: 'tax.form.SA.title', sub: 'tax.form.SA.sub' },
  { id: 'VA', title: 'tax.form.VA.title', sub: 'tax.form.VA.sub' },
  { id: 'KIND', title: 'tax.form.KIND.title', sub: 'tax.form.KIND.sub' },
  { id: 'HH', title: 'tax.form.HH.title', sub: 'tax.form.HH.sub' },
  { id: 'AB', title: 'tax.form.AB.title', sub: 'tax.form.AB.sub' },
];

/** Fields a category or a single booking can be mapped to; label and hint are language keys. */
export const FIELDS = {
  wk_arbeitsmittel: {
    form: 'N',
    label: 'tax.field.wk_arbeitsmittel.label',
    hint: 'tax.field.wk_arbeitsmittel.hint',
  },
  wk_fortbildung: {
    form: 'N',
    label: 'tax.field.wk_fortbildung.label',
  },
  wk_arbeitszimmer: {
    form: 'N',
    label: 'tax.field.wk_arbeitszimmer.label',
    hint: 'tax.field.wk_arbeitszimmer.hint',
  },
  wk_bewerbung: {
    form: 'N',
    label: 'tax.field.wk_bewerbung.label',
  },
  wk_kontofuehrung: {
    form: 'N',
    label: 'tax.field.wk_kontofuehrung.label',
  },
  wk_weitere: {
    form: 'N',
    label: 'tax.field.wk_weitere.label',
  },
  sa_kirchensteuer: {
    form: 'SA',
    label: 'tax.field.sa_kirchensteuer.label',
    hint: 'tax.field.sa_kirchensteuer.hint',
  },
  sa_spenden: {
    form: 'SA',
    label: 'tax.field.sa_spenden.label',
  },
  sa_parteien: {
    form: 'SA',
    label: 'tax.field.sa_parteien.label',
  },
  sa_ausbildung: {
    form: 'SA',
    label: 'tax.field.sa_ausbildung.label',
  },
  va_kv: {
    form: 'VA',
    label: 'tax.field.va_kv.label',
    hint: 'tax.field.va_kv.hint',
  },
  va_ruerup: {
    form: 'VA',
    label: 'tax.field.va_ruerup.label',
  },
  va_weitere: {
    form: 'VA',
    label: 'tax.field.va_weitere.label',
  },
  kind_betreuung: {
    form: 'KIND',
    label: 'tax.field.kind_betreuung.label',
    hint: 'tax.field.kind_betreuung.hint',
  },
  kind_schulgeld: {
    form: 'KIND',
    label: 'tax.field.kind_schulgeld.label',
    hint: 'tax.field.kind_schulgeld.hint',
  },
  hh_minijob: {
    form: 'HH',
    label: 'tax.field.hh_minijob.label',
  },
  hh_dienstleistungen: {
    form: 'HH',
    label: 'tax.field.hh_dienstleistungen.label',
    hint: 'tax.field.hh_dienstleistungen.hint',
  },
  hh_handwerker: {
    form: 'HH',
    label: 'tax.field.hh_handwerker.label',
    hint: 'tax.field.hh_handwerker.hint',
  },
  ab_krankheit: {
    form: 'AB',
    label: 'tax.field.ab_krankheit.label',
    hint: 'tax.field.ab_krankheit.hint',
  },
  ab_pflege: {
    form: 'AB',
    label: 'tax.field.ab_pflege.label',
  },
  ab_sonstige: {
    form: 'AB',
    label: 'tax.field.ab_sonstige.label',
  },
};

/** Flat rates and caps of the tax year. */
export function params(year) {
  return {
    // § 9a EStG
    arbeitnehmerPauschbetrag: year >= 2023 ? 123000 : year === 2022 ? 120000 : 100000,
    // § 4 Abs. 5 Nr. 6c EStG: per day, capped days
    // Introduced in 2020: 5 € for at most 120 days (600 €), from 2023 6 € for 210 days (1.260 €)
    homeofficeRate: year >= 2023 ? 600 : year >= 2020 ? 500 : 0,
    homeofficeMaxDays: year >= 2023 ? 210 : year >= 2020 ? 120 : 0,
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

/** Distance allowance for the tax year, in cents. The 4.500 € cap does not apply to commuting
 * by one's own car (§ 9 Abs. 2 Satz 2 EStG). */
export function entfernungspauschale(year, km, days, car = false) {
  const p = params(year);
  const k = Math.max(0, Math.floor(km || 0));
  const d = Math.max(0, Math.floor(days || 0));
  const perDay = Math.min(k, 20) * p.kmRateFirst20 + Math.max(0, k - 20) * p.kmRateFrom21;
  return car ? perDay * d : Math.min(perDay * d, p.kmCap);
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
 * `t(key, params)` turns the language keys of labels, hints and summaries into text.
 * Income bookings on a tax field (e.g. a refund) reduce that field.
 */
export function buildReturn(year, bookings, profile = {}, t = (key) => key) {
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
    label: t(FIELDS[key].label),
    hint: FIELDS[key].hint ? t(FIELDS[key].hint) : undefined,
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
    const km = entfernungspauschale(year, profile.commuteKm, profile.commuteDays, profile.car);
    if (profile.commuteKm && profile.commuteDays)
      rows.push({
        key: 'wk_entfernung',
        label: t('tax.row.commute'),
        hint: t('tax.row.commuteHint', { days: profile.commuteDays, km: profile.commuteKm }),
        cents: km,
        computed: true,
      });
    const own = fieldsOf('N');
    // A home office room (Arbeitszimmer) replaces the daily flat rate; both cannot be claimed.
    const room = own.find((row) => row.key === 'wk_arbeitszimmer');
    const ho = homeofficePauschale(year, profile.homeofficeDays);
    if (profile.homeofficeDays && ho > 0 && !room?.cents)
      rows.push({
        key: 'wk_homeoffice',
        label: t('tax.row.homeoffice'),
        hint: t('tax.row.homeofficeHint', {
          days: Math.min(profile.homeofficeDays, p.homeofficeMaxDays),
          rate: euro(p.homeofficeRate),
        }),
        cents: ho,
        computed: true,
      });
    const konto = own.find((row) => row.key === 'wk_kontofuehrung');
    // The flat 16 € is an alternative to the booked fees: take whichever is higher.
    if (konto && konto.cents < p.kontofuehrungPauschale && profile.employee !== false) {
      konto.cents = p.kontofuehrungPauschale;
      konto.hint = t('tax.row.flatRate');
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
          ? t('tax.summary.nOver', {
              total: euro(total),
              over: euro(over),
              flat: euro(p.arbeitnehmerPauschbetrag),
            })
          : t('tax.summary.nUnder', { total: euro(total), flat: euro(p.arbeitnehmerPauschbetrag) }),
    });
  }

  // Sonderausgaben
  {
    const rows = fieldsOf('SA');
    const aus = rows.find((row) => row.key === 'sa_ausbildung');
    if (aus && aus.cents > p.ausbildungMax) {
      aus.hint = t('tax.row.trainingMax', { max: euro(p.ausbildungMax) });
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
      summary: t('tax.summary.va'),
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
    const quote = t(p.betreuungQuote === 0.8 ? 'tax.quote.80' : 'tax.quote.twoThirds');
    forms.push({
      ...FORMS[3],
      rows,
      total: rows.reduce((s, r) => s + r.cents, 0),
      summary: t('tax.summary.kind', {
        quote,
        careMax: euro(p.betreuungMax),
        schoolMax: euro(p.schulgeldMax),
      }),
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
      summary: t('tax.summary.hh', { reduction: euro(reduction) }),
    });
  }

  // Außergewöhnliche Belastungen
  {
    const rows = fieldsOf('AB');
    const total = rows.reduce((s, r) => s + r.cents, 0);
    let summary = t('tax.summary.abNoIncome');
    let deductible;
    if (profile.income) {
      const own = zumutbareBelastung(Math.round(profile.income), !!profile.married, children);
      deductible = Math.max(0, total - own);
      summary = t('tax.summary.ab', { own: euro(own), deductible: euro(deductible) });
    }
    forms.push({ ...FORMS[5], rows, total, deductible, summary });
  }

  return forms;
}

/** The language of the page (kit/i18n.js); German where it is not there (tests, other hosts). */
const locale = () => globalThis.window?.mnI18n?.locale ?? 'de-DE';
/** Formats cents as euros in the page's language: 123456 → "1.234,56 €" or "€1,234.56". */
export const euro = (cents) =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(
    (cents || 0) / 100,
  );
