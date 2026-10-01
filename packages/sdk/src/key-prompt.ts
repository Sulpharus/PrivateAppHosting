// The popup for APIs that need a personal key (ADR 0014). It is shown by the SDK when a call is
// refused with `api_key_missing` for a personal API, so every app gets it without any code.
// Plain DOM and inline styles: apps do not all load the platform's stylesheet.

export interface KeyPromptInfo {
  service: string;
  serviceName: string;
  /** `api_key_unreadable`: a stored key no longer works and has to be entered again. */
  again?: boolean;
}

const shown = new Set<string>();
/** After "Später" the popup stays away for a while, so a retry loop does not nag. */
const dismissedUntil = new Map<string, number>();
const QUIET_MS = 10 * 60_000;

/** The account page that explains where to get the key and takes it. */
export function keySetupUrl(portalUrl: string, service: string, back = location.href): string {
  const url = new URL('/account/keys', portalUrl);
  url.searchParams.set('service', service);
  url.searchParams.set('next', back);
  return url.toString();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  style = '',
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  if (style) node.setAttribute('style', style);
  return node;
}

/** Shows the popup once per API; resolves when it is closed. Never throws. */
export function promptForKey(portalUrl: string, info: KeyPromptInfo): Promise<void> {
  if (typeof document === 'undefined' || shown.has(info.service)) return Promise.resolve();
  if ((dismissedUntil.get(info.service) ?? 0) > Date.now()) return Promise.resolve();
  shown.add(info.service);

  const dark = matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dialog = el(
    'dialog',
    { id: `mn-key-prompt-${info.service}` },
    `max-width:min(92vw,440px);padding:22px;border-radius:16px;border:1px solid ${dark ? '#3a3830' : '#dfdad0'};background:${dark ? '#1c1b18' : '#ffffff'};color:${dark ? '#ede9df' : '#17160f'};font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;`,
  );
  dialog.setAttribute('aria-labelledby', `mn-key-title-${info.service}`);
  const title = el(
    'h2',
    {
      id: `mn-key-title-${info.service}`,
      textContent: info.again ? 'Schlüssel erneuern' : 'Eigener Schlüssel nötig',
    },
    'margin:0 0 8px;font-size:20px;',
  );
  const text = el(
    'p',
    {
      textContent: info.again
        ? `Dein Schlüssel für ${info.serviceName} funktioniert nicht mehr. Trage ihn bitte neu ein.`
        : `Für ${info.serviceName} fehlt dein persönlicher API-Schlüssel. Du bekommst eine kurze Anleitung und trägst ihn dort einmal ein.`,
    },
    'margin:0 0 18px;',
  );
  const buttons = el('div', {}, 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;');
  const later = el(
    'button',
    { type: 'button', textContent: 'Später' },
    `min-height:44px;padding:0 18px;border-radius:12px;border:1px solid ${dark ? '#3a3830' : '#dfdad0'};background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;`,
  );
  const setup = el(
    'a',
    { href: keySetupUrl(portalUrl, info.service), textContent: 'Schlüssel einrichten' },
    'min-height:44px;padding:0 18px;border-radius:12px;background:#b8431a;color:#ffffff;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;',
  );
  buttons.append(later, setup);
  dialog.append(title, text, buttons);
  document.body.append(dialog);

  return new Promise((resolve) => {
    const finish = () => {
      dialog.remove();
      shown.delete(info.service);
      resolve();
    };
    later.addEventListener('click', () => {
      dismissedUntil.set(info.service, Date.now() + QUIET_MS);
      dialog.close();
    });
    // Escape and the "Später" button both end here.
    dialog.addEventListener('close', () => {
      if (!dismissedUntil.has(info.service))
        dismissedUntil.set(info.service, Date.now() + QUIET_MS);
      finish();
    });
    dialog.showModal();
    setup.focus();
  });
}

/** Tests: forget what was shown and dismissed. */
export function resetKeyPrompts(): void {
  shown.clear();
  dismissedUntil.clear();
}
