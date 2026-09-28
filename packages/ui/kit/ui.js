// MiniNode App Kit helpers, served as /_mininode/ui.js next to ui.css. Plain script, no build
// step, works with React too: everything hangs off window.mnui.
//   mnui.sheet.open(content, { tall, label, modal, onClose }) → the .mn-sheet element
//     content: a Node (preferred, e.g. template.content.cloneNode(true)) or an HTML string that
//     the caller has escaped. Traps focus, makes the page behind inert, closes on Escape and on
//     the backdrop (unless modal), restores focus. Opening another sheet closes this one and
//     calls its onClose.
//   mnui.sheet.close()
//   mnui.toast('Gespeichert')
//   mnui.theme.set('light' | 'dark' | 'system'), mnui.theme.get()
//   mnui.select(button) marks one button of a group as aria-pressed / aria-current
(() => {
  const THEME_KEY = 'mn-theme';
  const root = document.documentElement;

  const theme = {
    get() {
      try {
        return localStorage.getItem(THEME_KEY) || 'system';
      } catch {
        return 'system';
      }
    },
    set(value) {
      if (value === 'light' || value === 'dark') root.dataset.theme = value;
      else delete root.dataset.theme;
      try {
        if (value === 'light' || value === 'dark') localStorage.setItem(THEME_KEY, value);
        else localStorage.removeItem(THEME_KEY);
      } catch {}
    },
  };
  // A remembered choice applies before first paint when ui.js loads in <head> without defer.
  const saved = theme.get();
  if (saved !== 'system' && !root.dataset.theme) root.dataset.theme = saved;

  const FOCUSABLE = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    '[contenteditable="true"]',
    '[tabindex]',
  ]
    .map((s) => `${s}:not([tabindex="-1"])`)
    .join(',');
  let current = null;

  const focusables = (sheet) =>
    [...sheet.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.disabled && el.getClientRects().length,
    );

  function onKey(e) {
    if (!current || e.defaultPrevented || e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCurrent(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(current.sheet);
    if (!items.length) {
      e.preventDefault();
      current.sheet.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    // Focus that slipped outside (a click on the backdrop of a modal sheet) comes back in.
    if (!current.sheet.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && (active === first || active === current.sheet)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open(content, options = {}) {
    if (current) closeCurrent(false);
    const overlay = document.createElement('div');
    overlay.className = 'mn-overlay';
    const sheet = document.createElement('div');
    sheet.className = `mn-sheet${options.tall ? ' mn-sheet--tall' : ''}`;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.tabIndex = -1;
    if (typeof content === 'string') sheet.innerHTML = content;
    else if (content) sheet.append(content);
    if (options.label) sheet.setAttribute('aria-label', options.label);
    else {
      const heading = sheet.querySelector('h1, h2');
      if (heading) {
        heading.id ||= `mn-sheet-title-${Date.now()}`;
        sheet.setAttribute('aria-labelledby', heading.id);
      }
    }
    overlay.append(sheet);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !options.modal) closeCurrent(false);
    });
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-mn-close]')) closeCurrent(false);
    });
    // Screen readers and Tab must not reach the page behind the sheet.
    const inerted = [...document.body.children].filter((el) => !el.inert && el !== toastEl);
    for (const el of inerted) el.inert = true;
    current = {
      overlay,
      sheet,
      inerted,
      back: document.activeElement,
      overflow: document.body.style.overflow,
      onClose: options.onClose,
    };
    document.body.append(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    sheet.focus({ preventScroll: true });
    return sheet;
  }

  function closeCurrent() {
    if (!current) return;
    const { overlay, inerted, back, overflow, onClose } = current;
    current = null;
    for (const el of inerted) el.inert = false;
    overlay.remove();
    document.body.style.overflow = overflow;
    document.removeEventListener('keydown', onKey);
    if (back && back.isConnected) back.focus({ preventScroll: true });
    if (onClose) onClose();
  }

  // The live region exists before the first message, so screen readers announce it.
  let toastEl = null;
  let toastTimer = 0;
  function toastRegion() {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'mn-toast';
      toastEl.setAttribute('role', 'status');
      document.body.append(toastEl);
    }
    return toastEl;
  }
  if (document.body) toastRegion();
  else document.addEventListener('DOMContentLoaded', toastRegion, { once: true });

  function toast(message) {
    const el = toastRegion();
    el.textContent = '';
    el.classList.remove('show');
    // Next frame: the cleared region makes a repeated message count as new, and the transition runs.
    requestAnimationFrame(() => {
      el.textContent = message;
      el.classList.add('show');
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function select(button) {
    const group = button.parentElement;
    if (!group) return;
    const current = group.classList.contains('mn-tabs') || group.classList.contains('mn-steps');
    const value = group.classList.contains('mn-steps') ? 'step' : 'page';
    for (const b of group.children) {
      if (current) {
        if (b === button) b.setAttribute('aria-current', value);
        else b.removeAttribute('aria-current');
      } else b.setAttribute('aria-pressed', String(b === button));
    }
  }

  window.mnui = { sheet: { open, close: () => closeCurrent() }, toast, theme, select };
})();
