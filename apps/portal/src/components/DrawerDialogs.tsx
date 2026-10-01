import { useEffect, useState } from 'react';
import { type Drawer, MAX_DRAWER_NAME } from '../lib/drawers.ts';
import { Dialog } from './Dialog.tsx';

/** Asks for a drawer name (new or rename). */
export function NameDialog(props: {
  open: boolean;
  title: string;
  initial?: string | undefined;
  confirm: string;
  onSubmit(name: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState(props.initial ?? '');
  useEffect(() => {
    if (props.open) setName(props.initial ?? '');
  }, [props.open, props.initial]);
  return (
    <Dialog open={props.open} title={props.title} onClose={props.onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) props.onSubmit(name.trim());
        }}
      >
        <label className="field">
          Name
          <input
            value={name}
            maxLength={MAX_DRAWER_NAME}
            // The dialog opens for exactly this field.
            // biome-ignore lint/a11y/noAutofocus: a one-field dialog
            autoFocus
            placeholder="z. B. Alltag"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="row row-end">
          <button type="button" className="button" onClick={props.onClose}>
            Abbrechen
          </button>
          <button type="submit" className="button primary" disabled={!name.trim()}>
            {props.confirm}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Which apps (or games) belong to a drawer. */
export function DrawerContentDialog(props: {
  open: boolean;
  drawer: Drawer | null;
  options: { slug: string; name: string }[];
  onSave(slugs: string[]): void;
  onClose(): void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (props.open) setPicked(new Set(props.drawer?.apps ?? []));
  }, [props.open, props.drawer]);
  const toggle = (slug: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  return (
    <Dialog
      open={props.open}
      title={props.drawer ? `„${props.drawer.name}“ füllen` : 'Schublade füllen'}
      onClose={props.onClose}
    >
      <fieldset className="check-list">
        <legend className="sr-only">Auswahl</legend>
        {props.options.map((option) => (
          <label key={option.slug} className="check-row">
            <input
              type="checkbox"
              checked={picked.has(option.slug)}
              onChange={() => toggle(option.slug)}
            />
            {option.name}
          </label>
        ))}
        {props.options.length === 0 && <p className="muted">Nichts zum Auswählen.</p>}
      </fieldset>
      <div className="row row-end">
        <button type="button" className="button" onClick={props.onClose}>
          Abbrechen
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() =>
            props.onSave(props.options.filter((o) => picked.has(o.slug)).map((o) => o.slug))
          }
        >
          Speichern
        </button>
      </div>
    </Dialog>
  );
}

/** Which drawers an app (or game) is in; a new drawer can be made on the spot. */
export function AppDrawersDialog(props: {
  open: boolean;
  appName: string;
  slug: string;
  drawers: Drawer[];
  onToggle(drawer: Drawer, member: boolean): void;
  onCreate(name: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (props.open) setName('');
  }, [props.open]);
  return (
    <Dialog open={props.open} title={`${props.appName} in Schubladen`} onClose={props.onClose}>
      <fieldset className="check-list">
        <legend className="sr-only">Schubladen</legend>
        {props.drawers.map((drawer) => (
          <label key={drawer.id} className="check-row">
            <input
              type="checkbox"
              checked={drawer.apps.includes(props.slug)}
              onChange={(event) => props.onToggle(drawer, event.target.checked)}
            />
            {drawer.name}
          </label>
        ))}
        {props.drawers.length === 0 && (
          <p className="muted">Du hast noch keine Schublade. Lege unten die erste an.</p>
        )}
      </fieldset>
      <form
        className="row"
        style={{ alignItems: 'flex-end' }}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) props.onCreate(name.trim());
          setName('');
        }}
      >
        <label className="field" style={{ flex: 1 }}>
          Neue Schublade
          <input
            value={name}
            maxLength={MAX_DRAWER_NAME}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="button" disabled={!name.trim()}>
          Anlegen
        </button>
      </form>
      <div className="row row-end">
        <button type="button" className="button primary" onClick={props.onClose}>
          Fertig
        </button>
      </div>
    </Dialog>
  );
}
