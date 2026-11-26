// The shared state of the running app. app.js fills it at start-up; views and sheets read it.
import { DEFAULT_NUMBER_FORMAT } from './invoice.js';

export const DEFAULT_SETTINGS = {
  reminders: true,
  push: true,
  hideAmounts: false,
  fiscalStart: 1,
  views: {},
  lastBackup: null,
};

export const DEFAULT_COMPANY = {
  name: '',
  owner: '',
  street: '',
  zip: '',
  city: '',
  country: 'DE',
  email: '',
  phone: '',
  website: '',
  tax_number: '',
  vat_id: '',
  register: '',
  bank: '',
  iban: '',
  bic: '',
  qr: true,
  small_business: false,
  logo: null,
  number_format: DEFAULT_NUMBER_FORMAT,
  payment_days: 14,
  layout: 'din',
  lang: 'de',
  intro: '',
  closing: '',
};

export const app = {
  /** @type {any} the MiniNode client */
  mn: null,
  /** @type {ReturnType<import('./store.js').createStore>} */
  store: null,
  company: { ...DEFAULT_COMPANY },
  settings: { ...DEFAULT_SETTINGS },
  online: true,
  pending: 0,
  /** Redraws the current view. */
  render: () => undefined,
  /** Opens a view: go('invoices', { id }) */
  go: (_view, _params) => undefined,
};

export async function saveSettings(patch) {
  app.settings = { ...app.settings, ...patch };
  await app.mn.kv.set('settings', app.settings);
}

export async function saveCompany(company) {
  app.company = { ...DEFAULT_COMPANY, ...company };
  await app.mn.kv.set('company', app.company);
}

/** Is the company profile filled in far enough to issue invoices? */
export function companyReady() {
  const c = app.company;
  return Boolean(c.name && c.street && c.zip && c.city);
}

/** Is a sample entry stored? */
export function hasSamples() {
  const s = app.store;
  return ['invoices', 'customers', 'items'].some((t) =>
    s.all(t, { deleted: true }).some((r) => r.is_sample),
  );
}
