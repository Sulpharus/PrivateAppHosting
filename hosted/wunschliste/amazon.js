// Amazon links: a clean product link (…/dp/<ASIN>, without tracking parameters) and a title
// guessed from the link's readable part ("Sony-WH-1000XM5-Kopfhörer/dp/…"). Nothing is fetched:
// Amazon pages cannot be read from the browser, and the link already carries the name.

const AMAZON_HOST = /(^|\.)amazon\.(de|at|com|co\.uk|fr|it|es|nl|pl|se|com\.be|ch)$/;
const SHORT_HOST = /^(amzn\.eu|amzn\.to|a\.co)$/;
const ASIN_PATH =
  /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/asin)\/([A-Z0-9]{10})(?=[/?]|$)/i;

/** Parses a link typed or pasted by the user; null when it is no https URL at all. */
export function parseLink(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  url.protocol = 'https:';
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (SHORT_HOST.test(host)) return { url: url.toString(), amazon: true, asin: null, title: '' };
  if (!AMAZON_HOST.test(host)) return { url: url.toString(), amazon: false, asin: null, title: '' };
  const match = url.pathname.match(ASIN_PATH);
  if (!match) return { url: url.toString(), amazon: true, asin: null, title: '' };
  const asin = (match[1] ?? '').toUpperCase();
  return {
    url: `https://www.${host}/dp/${asin}`,
    amazon: true,
    asin,
    title: titleFromPath(url.pathname.slice(0, match.index)),
  };
}

/** "/Sony-WH-1000XM5-Kopfh%C3%B6rer" → "Sony WH 1000XM5 Kopfhörer". */
export function titleFromPath(path) {
  const segment = path.split('/').filter(Boolean).pop() ?? '';
  let text;
  try {
    text = decodeURIComponent(segment);
  } catch {
    text = segment;
  }
  if (!/[a-zäöüß]/i.test(text) || /^(gp|dp|s)$|^ref=/i.test(text)) return '';
  // Dashes join the words; model numbers lose theirs too (the title stays editable).
  return text
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * "12,99" / "1.234,5" / "20" → cents; null when empty or not a price. In English (`en-GB`) the
 * grouping comma is read too: "1,234.50".
 */
export function parsePrice(input, language = 'de-DE') {
  const text = String(input ?? '')
    .replace(/[€\s]/g, '')
    .trim();
  if (!text) return null;
  if (language.startsWith('en') && /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text))
    return Math.round(Number(text.replace(/,/g, '')) * 100);
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([,.]\d{1,2})?$/.test(text)) return Number.NaN;
  const normal = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  return Math.round(Number(normal) * 100);
}

/** The language of the page (kit/i18n.js); German when it is not there (tests, other hosts). */
const locale = () => globalThis.window?.mnI18n?.locale ?? 'de-DE';

export const euro = (cents) =>
  (cents / 100).toLocaleString(locale(), { style: 'currency', currency: 'EUR' });
