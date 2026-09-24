import { type ReactNode, useEffect, useId, useRef } from 'react';

/** Accessible modal built on <dialog> (focus trap, Escape to close handled by the browser). */
export function Dialog(props: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={props.onClose}>
      <div className="dialog-head">
        <h2 id={titleId}>{props.title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Schließen"
          onClick={props.onClose}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="stack">{props.children}</div>
    </dialog>
  );
}
