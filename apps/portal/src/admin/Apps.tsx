import { UNINSTALL_PROTECTED_SLUGS } from '@mininode/manifest';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useStepUp } from '../auth/StepUp.tsx';
import { AppIcon } from '../components/AppIcon.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { ApiError, api } from '../lib/api.ts';
import { clearAppIcon, setAppIcon } from '../lib/appIcon.ts';
import { type AppRow, listApps, tileUrl } from '../lib/apps.ts';
import { type Category, listCategories } from '../lib/catalog.ts';
import { platform } from '../lib/supabase.ts';
import { useArrangement } from '../lib/useArrangement.ts';
import { dateTime } from './AdminLayout.tsx';

const STATUS: Record<string, [string, string]> = {
  online: ['Online', 'ok'],
  degraded: ['Gestört', 'bad'],
  down: ['Down', 'bad'],
  pending: ['Noch nicht deployt', ''],
  disabled: ['Deaktiviert', ''],
};

const TARGET: Record<string, string> = {
  cloudflare: 'Cloudflare',
  vercel: 'Vercel',
  nucbox: 'Hardware-Server',
  remote: 'Remote',
  external: 'Externer Link',
};

// Same rules as the database (admin_save_link, apps.link_url).
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;
const RESERVED = new Set([
  'admin',
  'ai',
  'api',
  'auth',
  'control',
  'guac',
  'login',
  'mail',
  'proxmox',
  'remote',
  'ssh',
  'staging',
  'status',
  'www',
]);
const LINK_URL = /^https:\/\/[^\s/?#@]+\.[^\s/?#@]+(\/\S*)?$/;

interface Person {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
}

type AppSort = 'name' | 'category' | 'drawer' | 'status';
const SORTS: [AppSort, string][] = [
  ['name', 'Name'],
  ['category', 'Kategorie'],
  ['drawer', 'Schublade'],
  ['status', 'Status'],
];
const STATUS_ORDER = ['degraded', 'down', 'pending', 'online', 'disabled'];

export function Apps() {
  const { run } = useStepUp();
  const arrange = useArrangement('apps');
  const [view, setView] = useState<'apps' | 'games'>('apps');
  const [sort, setSort] = useState<AppSort>('name');
  const [drawerFilter, setDrawerFilter] = useState('');
  const [apps, setApps] = useState<AppRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [accessFor, setAccessFor] = useState<AppRow | null>(null);
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [whitelistMode, setWhitelistMode] = useState(false);
  // The app stays set while the dialog closes, so its title does not flicker.
  const [exportFor, setExportFor] = useState<AppRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ text: string; runs: string } | null>(null);
  const [removeFor, setRemoveFor] = useState<AppRow | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [purge, setPurge] = useState(true);
  const [typed, setTyped] = useState('');

  const load = useCallback(async () => {
    const [rows, cats, users] = await Promise.all([
      listApps(),
      listCategories(),
      platform().rpc('admin_list_users'),
    ]);
    setApps(rows);
    setCategories(cats);
    if (users.error) setError('Die Nutzerliste konnte nicht geladen werden.');
    setPeople(((users.data as Person[] | null) ?? []).filter((p) => p.role !== 'admin'));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const setState = async (
    slug: string,
    change: { p_disabled?: boolean; p_is_default?: boolean },
  ) => {
    setError(null);
    try {
      await run(async () => {
        const { error: rpcError } = await platform().rpc('admin_set_app_state', {
          p_slug: slug,
          ...change,
        });
        if (rpcError) throw rpcError;
      });
      await load();
    } catch {
      setError('Änderung fehlgeschlagen.');
    }
  };

  const guarded = async (action: () => Promise<void>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await run(action);
      setNotice(done);
      await load();
    } catch {
      setError('Änderung fehlgeschlagen.');
    }
  };

  const setCategory = (app: AppRow, category: string) =>
    void guarded(async () => {
      const { error: rpcError } = await platform().rpc('admin_set_app_category', {
        p_slug: app.slug,
        p_category: category || null,
      });
      if (rpcError) throw rpcError;
    }, `Kategorie von ${app.name} gespeichert.`);

  const uploadIcon = (app: AppRow, file: File) =>
    void guarded(
      () => setAppIcon(app.slug, file, app.icon_path),
      `Logo von ${app.name} gespeichert.`,
    );

  const removeIcon = (app: AppRow) =>
    void guarded(() => clearAppIcon(app.slug, app.icon_path), `Logo von ${app.name} entfernt.`);

  const saveLink = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const slug = String(data.get('slug') ?? '').trim();
    const url = String(data.get('url') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (
      !name ||
      !description ||
      !SLUG.test(slug) ||
      slug.includes('--') ||
      RESERVED.has(slug) ||
      !LINK_URL.test(url)
    ) {
      setError(
        'Name, Kurzname (klein, z. B. „werkzeug“, nicht „admin“ o. Ä.), Beschreibung und eine https-Adresse (ohne ? direkt nach der Domain) sind nötig.',
      );
      return;
    }
    const existing = apps.find((app) => app.slug === slug);
    if (existing && existing.kind !== 'link') {
      setError(`„${slug}“ ist schon eine gehostete App. Wähle einen anderen Kurznamen.`);
      return;
    }
    if (existing && !confirm(`Die Link-Kachel „${existing.name}“ wird überschrieben. Fortfahren?`))
      return;
    void guarded(async () => {
      const { error: rpcError } = await platform().rpc('admin_save_link', {
        p_slug: slug,
        p_name: name,
        p_description: description,
        p_url: url,
        p_for_all: data.get('forAll') === 'on',
      });
      if (rpcError) throw rpcError;
      form.reset();
    }, `Link-Kachel ${name} gespeichert.`);
  };

  const removeLink = (app: AppRow) => {
    if (!confirm(`Link-Kachel ${app.name} entfernen?`)) return;
    void guarded(async () => {
      const { error: rpcError } = await platform().rpc('admin_delete_link', { p_slug: app.slug });
      if (rpcError) throw rpcError;
    }, `${app.name} entfernt.`);
  };

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  const opening = useRef<string | null>(null);
  const openAccess = async (app: AppRow) => {
    opening.current = app.slug;
    setAccessFor(null);
    // An existing whitelist shows its members; switching an open app starts with nobody, so
    // every person is added on purpose.
    let current = new Set<string>();
    if (app.whitelist) {
      const { data, error: grantsError } = await platform()
        .from('app_grants')
        .select('user_id')
        .eq('app_slug', app.slug);
      // Saving an empty list would remove everyone: never open the panel on a read error.
      if (grantsError) {
        setError('Die Freigaben konnten nicht geladen werden. Versuch es noch einmal.');
        return;
      }
      current = new Set(((data ?? []) as { user_id: string }[]).map((g) => g.user_id));
    }
    // Another app was opened meanwhile.
    if (opening.current !== app.slug) return;
    setMembers(current);
    setWhitelistMode(app.whitelist);
    setAccessFor(app);
  };

  const startExport = async (form: HTMLFormElement) => {
    const app = exportFor;
    if (!app) return;
    const data = new FormData(form);
    const repo = String(data.get('repo') ?? '').trim();
    const visibility = String(data.get('visibility') ?? 'private');
    if (
      visibility === 'public' &&
      !confirm(`Das Projekt ${repo} wird öffentlich: jeder kann den Code von ${app.name} lesen.`)
    )
      return;
    setExportError(null);
    setExporting(true);
    try {
      const { runs } = await run(() =>
        api<{ runs: string }>(`/admin/apps/${app.slug}/export`, {
          method: 'POST',
          body: { repo, visibility },
        }),
      );
      setExported({
        runs,
        text: `${app.name} wird als ${repo} auf GitHub angelegt. Das dauert etwa eine Minute; wird dabei etwas Privates gefunden, bricht der Export ab.`,
      });
      setExportOpen(false);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setExporting(false);
    }
  };

  const startRemove = async () => {
    const app = removeFor;
    if (!app || typed !== app.slug) return;
    setRemoveError(null);
    setRemoving(true);
    try {
      const { manual } = await run(() =>
        api<{ manual: string | null }>(`/admin/apps/${app.slug}/uninstall`, {
          method: 'POST',
          body: { purge, confirm: typed },
        }),
      );
      setNotice(
        `${app.name} wird gelöscht und ist schon offline. ${
          purge ? 'Die Daten werden mitgelöscht. ' : 'Die Daten bleiben erhalten. '
        }Das dauert etwa eine Minute; der Code wird in einem Pull Request entfernt, den du mergen musst.${
          manual ? ` ${manual}` : ''
        }`,
      );
      setRemoveOpen(false);
      await load();
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setRemoving(false);
    }
  };

  const saveAccess = () => {
    const app = accessFor;
    if (!app) return;
    if (
      whitelistMode &&
      !app.whitelist &&
      !confirm(
        `${app.name} wird nur noch dir und den ausgewählten Personen angezeigt. Alle anderen verlieren den Zugriff.`,
      )
    )
      return;
    void guarded(
      async () => {
        const { error: rpcError } = await platform().rpc('admin_set_whitelist', {
          p_slug: app.slug,
          p_whitelist: whitelistMode,
          p_users: [...members],
        });
        if (rpcError) throw rpcError;
        setAccessFor(null);
      },
      whitelistMode ? `${app.name}: nur noch für die Whitelist.` : `${app.name}: wieder offen.`,
    );
  };

  const gameCount = apps.filter((app) => app.game_genre).length;
  const visible = useMemo(() => {
    const text = (a: string, b: string) => a.localeCompare(b, 'de');
    const drawerName = (app: AppRow) =>
      arrange.drawers.find((d) => d.apps.includes(app.slug))?.name ?? '\uffff';
    const categoryOf = (app: AppRow) =>
      categories.find((c) => c.id === app.category_id)?.name ?? '\uffff';
    const inDrawer = arrange.drawers.find((d) => d.id === drawerFilter);
    return apps
      .filter((app) => (view === 'games' ? Boolean(app.game_genre) : !app.game_genre))
      .filter((app) => !inDrawer || inDrawer.apps.includes(app.slug))
      .sort((a, b) => {
        if (sort === 'category') return text(categoryOf(a), categoryOf(b)) || text(a.name, b.name);
        if (sort === 'drawer') return text(drawerName(a), drawerName(b)) || text(a.name, b.name);
        if (sort === 'status')
          return (
            STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || text(a.name, b.name)
          );
        return text(a.name, b.name);
      });
  }, [apps, categories, arrange.drawers, drawerFilter, sort, view]);

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 6, flex: 1, minWidth: 260 }}>
          <h1 style={{ fontSize: 36 }}>Apps</h1>
          <p className="muted" style={{ margin: 0 }}>
            Hier steuerst du Sichtbarkeit und Standard-Freigabe. Neue Apps und Programme lädst du
            über „Hochladen“ hoch.
          </p>
        </div>
        <Link to="/admin/upload" className="button primary">
          Hochladen
        </Link>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <fieldset className="chip-scroll" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Ansicht</legend>
          <button
            type="button"
            className="chip"
            aria-pressed={view === 'apps'}
            onClick={() => setView('apps')}
          >
            Apps <span className="count">{apps.length - gameCount}</span>
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={view === 'games'}
            onClick={() => setView('games')}
          >
            Gaming Hub <span className="count">{gameCount}</span>
          </button>
        </fieldset>
        <span className="spacer" />
        <label className="row" style={{ gap: 8 }}>
          <span className="muted">Sortieren nach</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as AppSort)}>
            {SORTS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {arrange.drawers.length > 0 && (
          <label className="row" style={{ gap: 8 }}>
            <span className="muted">Schublade</span>
            <select value={drawerFilter} onChange={(event) => setDrawerFilter(event.target.value)}>
              <option value="">Alle</option>
              {arrange.drawers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {exported && (
        <p className="muted" role="status">
          {exported.text}{' '}
          <a href={exported.runs} target="_blank" rel="noopener noreferrer">
            Fortschritt auf GitHub
          </a>
        </p>
      )}
      {apps.length === 0 && <p className="empty">Noch keine Apps veröffentlicht.</p>}
      {apps.length > 0 && visible.length === 0 && (
        <p className="empty">
          {view === 'games' ? 'Noch keine Spiele veröffentlicht.' : 'Keine Apps in dieser Auswahl.'}
        </p>
      )}
      {visible.length > 0 && (
        <div className="table-wrap">
          <table className="table table--cards">
            <thead>
              <tr>
                <th>App</th>
                <th>Status</th>
                <th>Host</th>
                <th>Zugriff</th>
                <th>Kategorie</th>
                <th>Version</th>
                <th>Für alle neuen Nutzer</th>
                <th>
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((app) => {
                const [label, tone] = STATUS[app.status] ?? [app.status, ''];
                return (
                  <tr key={app.slug}>
                    <td>
                      <div className="row">
                        <AppIcon app={app} size={32} fontSize={12} />
                        <div>
                          <a
                            href={tileUrl(app)}
                            target={app.link_url ? '_blank' : undefined}
                            rel={app.link_url ? 'noopener noreferrer' : undefined}
                          >
                            {app.name}
                          </a>
                          <div className="muted mono">
                            {app.link_url ?? `${app.slug}.mininode.app`}
                          </div>
                          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            <label className="button small ghost" style={{ cursor: 'pointer' }}>
                              {app.icon_path ? 'Logo ändern' : 'Logo hochladen'}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                className="sr-only"
                                aria-label={`Logo für ${app.name} wählen`}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  if (file) uploadIcon(app, file);
                                }}
                              />
                            </label>
                            {app.icon_path && (
                              <button
                                type="button"
                                className="button small ghost"
                                onClick={() => removeIcon(app)}
                              >
                                Logo entfernen
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`pill ${tone}`}>
                        <span className="dot" />
                        {label}
                      </span>
                    </td>
                    <td data-label="Host">{TARGET[app.target] ?? app.target}</td>
                    <td data-label="Zugriff">
                      <button
                        type="button"
                        className="button small"
                        aria-label={`Zugriff auf ${app.name} verwalten`}
                        onClick={() => void openAccess(app)}
                      >
                        {app.whitelist ? 'Nur Whitelist' : 'Freigegeben'}
                      </button>
                    </td>
                    <td data-label="Kategorie">
                      <select
                        aria-label={`Kategorie von ${app.name}`}
                        value={app.category_manual ? (app.category_id ?? '') : ''}
                        onChange={(event) => setCategory(app, event.target.value)}
                      >
                        <option value="">
                          Automatisch
                          {!app.category_manual && app.category_id
                            ? ` (${categoryName(app.category_id) ?? app.category_id})`
                            : ''}
                        </option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono" data-label="Version">
                      {app.deployed_version ?? '–'}
                      <div className="muted">{dateTime(app.deployed_at)}</div>
                    </td>
                    <td data-label="Für alle neuen Nutzer">
                      <input
                        type="checkbox"
                        aria-label={`${app.name} automatisch für neue Nutzer freigeben`}
                        checked={app.is_default}
                        disabled={app.whitelist}
                        onChange={(event) =>
                          void setState(app.slug, { p_is_default: event.target.checked })
                        }
                      />
                    </td>
                    <td className="table-actions">
                      {app.kind === 'link' && (
                        <button
                          type="button"
                          className="button small danger"
                          onClick={() => removeLink(app)}
                        >
                          Entfernen
                        </button>
                      )}
                      {app.kind !== 'link' && !app.library && (
                        <button
                          type="button"
                          className="button small"
                          aria-label={`${app.name} als GitHub-Projekt exportieren`}
                          onClick={() => {
                            setExportError(null);
                            setExportFor(app);
                            setExportOpen(true);
                          }}
                        >
                          Als GitHub-Projekt
                        </button>
                      )}
                      <button
                        type="button"
                        className="button small"
                        onClick={() =>
                          void setState(app.slug, { p_disabled: app.status !== 'disabled' })
                        }
                      >
                        {app.status === 'disabled' ? 'Aktivieren' : 'Deaktivieren'}
                      </button>
                      {app.kind !== 'link' &&
                        !(UNINSTALL_PROTECTED_SLUGS as readonly string[]).includes(app.slug) && (
                          <button
                            type="button"
                            className="button small danger"
                            aria-label={`${app.name} löschen`}
                            onClick={() => {
                              setRemoveError(null);
                              setPurge(true);
                              setTyped('');
                              setRemoveFor(app);
                              setRemoveOpen(true);
                            }}
                          >
                            Löschen
                          </button>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {accessFor && (
        <section className="card" aria-labelledby="access-title">
          <h2 id="access-title" className="section-title">
            Zugriff auf {accessFor.name}
          </h2>
          <fieldset className="access-mode">
            <legend className="sr-only">Zugriff</legend>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="radio"
                name="access"
                checked={!whitelistMode}
                onChange={() => setWhitelistMode(false)}
              />
              Freigegeben: wie bisher über Freigaben und „Für alle neuen Nutzer“
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="radio"
                name="access"
                checked={whitelistMode}
                onChange={() => setWhitelistMode(true)}
              />
              Nur Whitelist: nur du und die ausgewählten Personen sehen die App
            </label>
          </fieldset>
          {whitelistMode && (
            <fieldset className="catalog-apps">
              <legend>Personen auf der Whitelist</legend>
              {people.length === 0 && <p className="muted">Noch keine weiteren Nutzer.</p>}
              {people.map((person) => (
                <label key={person.user_id} className="row" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={members.has(person.user_id)}
                    onChange={(event) => {
                      const next = new Set(members);
                      if (event.target.checked) next.add(person.user_id);
                      else next.delete(person.user_id);
                      setMembers(next);
                    }}
                  />
                  {person.display_name}
                  <span className="muted">{person.email}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="row row-end">
            <button type="button" className="button small" onClick={() => setAccessFor(null)}>
              Abbrechen
            </button>
            <button type="button" className="button small primary" onClick={saveAccess}>
              Zugriff speichern
            </button>
          </div>
        </section>
      )}

      <Dialog
        open={exportOpen}
        title={`${exportFor?.name ?? ''} als GitHub-Projekt`}
        onClose={() => setExportOpen(false)}
      >
        {exportFor && (
          <form
            key={exportFor.slug}
            className="stack"
            style={{ gap: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              void startExport(event.currentTarget);
            }}
          >
            <p className="muted">
              Der Code der App, wie er gerade läuft, wird zu einem eigenen GitHub-Projekt, das
              andere in ihr MiniNode übernehmen können. Nutzerdaten, Schlüssel und Daten dieser
              Installation kommen nicht mit; findet die Prüfung etwas davon, bricht der Export ab.
            </p>
            <label className="field">
              Projektname
              <input
                name="repo"
                defaultValue={`mininode-${exportFor.slug}`}
                required
                maxLength={100}
                pattern="[A-Za-z0-9_\-][A-Za-z0-9._\-]*"
                spellCheck={false}
                autoCapitalize="off"
              />
            </label>
            <fieldset className="access-mode">
              <legend>Sichtbarkeit (nur beim ersten Export)</legend>
              <label className="row" style={{ gap: 8 }}>
                <input type="radio" name="visibility" value="private" defaultChecked />
                Privat: nur du und wen du auf GitHub einlädst
              </label>
              <label className="row" style={{ gap: 8 }}>
                <input type="radio" name="visibility" value="public" />
                Öffentlich: jeder kann den Code sehen und übernehmen
              </label>
            </fieldset>
            {exportError && (
              <p className="error" role="alert">
                {exportError}
              </p>
            )}
            <div className="row row-end">
              <button type="button" className="button small" onClick={() => setExportOpen(false)}>
                Abbrechen
              </button>
              <button type="submit" className="button small primary" disabled={exporting}>
                {exporting ? 'Wird gestartet …' : 'Exportieren'}
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={removeOpen}
        title={`${removeFor?.name ?? ''} löschen`}
        onClose={() => setRemoveOpen(false)}
      >
        {removeFor && (
          <form
            key={removeFor.slug}
            className="stack"
            style={{ gap: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              void startRemove();
            }}
          >
            <p>
              Die App wird sofort abgeschaltet und ihr Server bei Cloudflare gelöscht. Ihr Code wird
              in einem Pull Request aus dem Repository entfernt (den du mergen musst, sonst bringt
              ein späterer Deploy sie zurück).
            </p>
            <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={purge}
                onChange={(event) => setPurge(event.target.checked)}
              />
              <span>
                <strong>Auch alle Daten löschen</strong>: Daten aller Nutzer in dieser App,
                gespeicherte Dateien, Logo, Freigaben und Einstellungen. Das lässt sich nicht
                rückgängig machen. Ohne Haken bleiben die Daten liegen; um die App später wieder
                einzuspielen, lädst du sie neu hoch oder nimmst den Pull Request mit dem entfernten
                Code zurück.
              </span>
            </label>
            {purge && (
              <p className="muted">
                Tipp: Erstelle vorher unter <Link to="/admin/backups">Sicherung</Link> eine
                Sicherung, falls du Daten behalten willst.
              </p>
            )}
            {removeFor.library && (
              <p className="muted">
                Programm aus der App-Bibliothek: der Container wird auf der NucBox gestoppt, sein
                Datenordner dort bleibt liegen.
              </p>
            )}
            <label className="field">
              Tippe <span className="mono">{removeFor.slug}</span> zur Bestätigung
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
              />
            </label>
            {removeError && (
              <p className="error" role="alert">
                {removeError}
              </p>
            )}
            <div className="row row-end">
              <button type="button" className="button small" onClick={() => setRemoveOpen(false)}>
                Abbrechen
              </button>
              <button
                type="submit"
                className="button small danger"
                disabled={removing || typed !== removeFor.slug}
              >
                {removing ? 'Wird gestartet …' : purge ? 'Endgültig löschen' : 'Entfernen'}
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <section className="card" aria-labelledby="link-title">
        <h2 id="link-title" className="section-title">
          Link-Kachel anlegen
        </h2>
        <p className="muted">
          Eine Kachel, die eine externe Website in einem neuen Tab öffnet. Nichts wird gehostet.
        </p>
        <form
          className="stack"
          style={{ gap: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            saveLink(event.currentTarget);
          }}
        >
          <div className="pair-grid">
            <label className="field">
              Name
              <input name="name" maxLength={40} required />
            </label>
            <label className="field">
              Kurzname (für die Adresse im System)
              <input name="slug" maxLength={32} pattern="[a-z][a-z0-9-]*[a-z0-9]" required />
            </label>
          </div>
          <label className="field">
            Adresse
            <input name="url" type="url" placeholder="https://" required />
          </label>
          <label className="field">
            Beschreibung
            <input name="description" maxLength={120} required />
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" name="forAll" defaultChecked />
            Für alle Nutzer freigeben (nicht bei Whitelist-Kacheln; bestehende Freigaben bleiben)
          </label>
          <div className="row row-end">
            <button type="submit" className="button primary">
              Kachel speichern
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
