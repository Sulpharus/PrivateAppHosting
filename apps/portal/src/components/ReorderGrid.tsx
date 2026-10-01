import { type ReactNode, useState } from 'react';
import { moveItem } from '../lib/arrange.ts';

/**
 * A grid whose entries can be rearranged. While `editing`, every entry can be dragged (mouse)
 * and has "nach vorn" / "nach hinten" buttons (keyboard, touch, screen reader). The parent
 * saves what `onReorder` reports.
 */
export function ReorderGrid<T extends { slug: string }>(props: {
  items: T[];
  editing: boolean;
  label(item: T): string;
  render(item: T): ReactNode;
  onReorder(slugs: string[]): void;
  className?: string;
}) {
  const { items, editing } = props;
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const slugs = items.map((item) => item.slug);

  const move = (slug: string, to: number) => {
    const from = slugs.indexOf(slug);
    if (from < 0 || to === from) return;
    const clamped = Math.min(Math.max(to, 0), slugs.length - 1);
    props.onReorder(moveItem(slugs, from, clamped));
    const item = items[from];
    if (item)
      setMessage(`${props.label(item)} ist jetzt an Position ${clamped + 1} von ${slugs.length}.`);
  };

  return (
    <div className={props.className ?? 'tiles'}>
      {items.map((item, index) => (
        <div
          key={item.slug}
          className={`reorder-item${editing ? ' editing' : ''}${dragging === item.slug ? ' dragging' : ''}`}
          draggable={editing}
          onDragStart={(event) => {
            if (!editing) return;
            setDragging(item.slug);
            event.dataTransfer.effectAllowed = 'move';
            // Firefox only starts a drag when data is set.
            event.dataTransfer.setData('text/plain', item.slug);
          }}
          onDragOver={(event) => {
            if (editing && dragging) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!editing || !dragging) return;
            event.preventDefault();
            move(dragging, index);
            setDragging(null);
          }}
          onDragEnd={() => setDragging(null)}
        >
          {props.render(item)}
          {editing && (
            <div className="reorder-controls">
              <button
                type="button"
                className="pin"
                aria-label={`${props.label(item)} nach vorn`}
                disabled={index === 0}
                onClick={() => move(item.slug, index - 1)}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d="M11 4L6 9l5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="pin"
                aria-label={`${props.label(item)} nach hinten`}
                disabled={index === items.length - 1}
                onClick={() => move(item.slug, index + 1)}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d="M7 4l5 5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
