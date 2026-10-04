import type React from 'react';
import { useEffect, useRef } from 'react';

// One dialog on top of the page (App Kit sheet): Escape closes the topmost dialog only, focus
// moves into it, stays inside while Tab cycles, and returns to the opener; a click on the
// backdrop closes it.

const stack: (() => void)[] = [];
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || stack.length === 0) return;
  event.preventDefault();
  stack[stack.length - 1]?.();
}

type OverlayProps = {
  onClose: () => void;
  sheetClassName?: string;
  children: React.ReactNode;
} & (
  | { /** id of the heading that names the dialog. */ labelledBy: string; label?: never }
  | { /** Name when there is no heading. */ label: string; labelledBy?: never }
);

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside the dialog. */
function trapTab(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Tab') return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  );
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export const Overlay: React.FC<OverlayProps> = ({
  onClose,
  labelledBy,
  label,
  sheetClassName = 'mn-sheet',
  children,
}) => {
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const handler = () => close.current();
    stack.push(handler);
    if (stack.length === 1) document.addEventListener('keydown', onKey);
    sheet.current?.focus({ preventScroll: true });
    return () => {
      stack.splice(stack.indexOf(handler), 1);
      if (stack.length === 0) document.removeEventListener('keydown', onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop only adds closing by mouse; Escape closes by keyboard
    // biome-ignore lint/a11y/noStaticElementInteractions: see above
    <div
      className="mn-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) close.current();
      }}
    >
      <div
        ref={sheet}
        className={sheetClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        {children}
      </div>
    </div>
  );
};
