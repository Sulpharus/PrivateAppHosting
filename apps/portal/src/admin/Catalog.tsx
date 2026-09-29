import { useCallback, useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { type AppRow, listApps } from '../lib/apps.ts';
import { type AppSet, type Category, listCategories, listSets } from '../lib/catalog.ts';
import { platform } from '../lib/supabase.ts';

// Categories and curated app sets for the start page (ADR 0007). New apps get a category from
// the keywords automatically; the admin can fix one per app under Apps.

const words = (text: string) =>
  [
    ...new Set(
      text
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 40);

const idFor = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `kategorie-${Date.now().toString(36)}`;

export function Catalog() {
  const { run } = useStepUp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [sets, setSets] = useState<AppSet[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [cats, curated, rows] = await Promise.all([listCategories(), listSets(), listApps()]);
    setCategories(cats);
    setSets(curated);
    // Remote apps live in their own column on the start page, not in sets. Disabled apps stay
    // selectable, so saving a set does not silently drop them.
    setApps(rows.filter((app) => app.kind !== 'remote'));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const guarded = async (action: () => Promise<void>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await run(action);
      setNotice(done);
      await load();
    } catch {
      setError('Änderung fehlgeschlagen. Ist der Name schon vergeben?');
    }
  };

  const check = (result: { error: unknown }) => {
    if (result.error) throw result.error;
  };

  const saveCategory = (form: HTMLFormElement, category?: Category) => {
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) {
      setError('Gib der Kategorie einen Namen.');
      return;
    }
    const row = {
      name,
      keywords: words(String(data.get('keywords') ?? '')),
      position: Number(data.get('position')) || 100,
    };
    void guarded(
      async () => {
        check(
          category
            ? await platform().from('app_categories').update(row).eq('id', category.id)
            : await platform()
                .from('app_categories')
                .insert({ ...row, id: idFor(name) }),
        );
        if (!category) form.reset();
      },
      category ? `${name} gespeichert.` : `Kategorie ${name} angelegt.`,
    );
  };

  const removeCategory = (category: Category) => {
    if (!confirm(`Kategorie ${category.name} löschen? Ihre Apps werden neu einsortiert.`)) return;
    void guarded(
      async () => check(await platform().rpc('admin_delete_category', { p_id: category.id })),
      `${category.name} gelöscht.`,
    );
  };

  const saveSet = (form: HTMLFormElement, set?: AppSet) => {
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const chosen = apps.map((app) => app.slug).filter((slug) => data.get(`app:${slug}`) === 'on');
    if (!name || chosen.length === 0) {
      setError('Ein Paket braucht einen Namen und mindestens eine App.');
      return;
    }
    void guarded(async () => {
      check(
        await platform().rpc('admin_save_set', {
          p_id: set?.id ?? null,
          p_name: name,
          p_description: String(data.get('description') ?? '').trim() || null,
          p_position: Number(data.get('position')) || 100,
          p_apps: chosen,
        }),
      );
      if (!set) form.reset();
    }, `Paket ${name} gespeichert.`);
  };

  const removeSet = (set: AppSet) => {
    if (!confirm(`Paket ${set.name} löschen? Die Apps bleiben erhalten.`)) return;
    void guarded(
      async () => check(await platform().rpc('admin_delete_set', { p_id: set.id })),
      `${set.name} gelöscht.`,
    );
  };

  const count = (id: string) => apps.filter((app) => app.category_id === id).length;

  const categoryForm = (category?: Category) => (
    <form
      key={category?.id ?? 'new'}
      className="catalog-row"
      aria-label={category ? `Kategorie ${category.name}` : 'Neue Kategorie'}
      onSubmit={(event) => {
        event.preventDefault();
        saveCategory(event.currentTarget, category);
      }}
    >
      <label className="field">
        Name
        <input name="name" maxLength={40} defaultValue={category?.name ?? ''} required />
      </label>
      <label className="field catalog-grow">
        Stichwörter (mit Komma getrennt)
        <input name="keywords" defaultValue={category?.keywords.join(', ') ?? ''} />
      </label>
      <label className="field catalog-narrow">
        Reihenfolge
        <input
          name="position"
          type="number"
          min="0"
          max="999"
          defaultValue={category?.position ?? 100}
        />
      </label>
      <div className="row row-end">
        {category && <span className="muted">{count(category.id)} Apps</span>}
        <button type="submit" className={`button small${category ? '' : ' primary'}`}>
          {category ? 'Speichern' : 'Anlegen'}
        </button>
        {category && (
          <button
            type="button"
            className="button small danger"
            onClick={() => removeCategory(category)}
          >
            Löschen
          </button>
        )}
      </div>
    </form>
  );

  const setForm = (set?: AppSet) => (
    <form
      key={set?.id ?? 'new'}
      className="card stack"
      style={{ gap: 12 }}
      aria-label={set ? `Paket ${set.name}` : 'Neues Paket'}
      onSubmit={(event) => {
        event.preventDefault();
        saveSet(event.currentTarget, set);
      }}
    >
      <h3 className="catalog-subtitle">{set ? set.name : 'Neues Paket'}</h3>
      <div className="pair-grid">
        <label className="field">
          Name
          <input name="name" maxLength={60} defaultValue={set?.name ?? ''} required />
        </label>
        <label className="field">
          Reihenfolge
          <input
            name="position"
            type="number"
            min="0"
            max="999"
            defaultValue={set?.position ?? 100}
          />
        </label>
      </div>
      <label className="field">
        Beschreibung
        <input name="description" maxLength={200} defaultValue={set?.description ?? ''} />
      </label>
      <fieldset className="catalog-apps">
        <legend>Apps im Paket</legend>
        {apps.map((app) => (
          <label key={app.slug} className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              name={`app:${app.slug}`}
              defaultChecked={set?.apps.includes(app.slug) ?? false}
            />
            {app.name}
            {app.status === 'disabled' && <span className="muted">(deaktiviert)</span>}
          </label>
        ))}
      </fieldset>
      <div className="row row-end">
        {set && (
          <button type="button" className="button small danger" onClick={() => removeSet(set)}>
            Löschen
          </button>
        )}
        <button type="submit" className="button small primary">
          {set ? 'Speichern' : 'Paket anlegen'}
        </button>
      </div>
    </form>
  );

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Kategorien & Pakete</h1>
        <p className="muted">
          Neue Apps landen automatisch in der Kategorie, deren Stichwörter in Name oder Beschreibung
          vorkommen. Unter Apps legst du eine Kategorie auch von Hand fest. Pakete zeigen eine
          Auswahl passender Apps auf der Startseite.
        </p>
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

      <section className="card" aria-labelledby="categories-title">
        <h2 id="categories-title" className="section-title">
          Kategorien
        </h2>
        {categories.map((category) => categoryForm(category))}
        <h3 className="catalog-subtitle">Eigene Kategorie</h3>
        {categoryForm()}
      </section>

      <section className="stack" style={{ gap: 16 }} aria-labelledby="sets-title">
        <h2 id="sets-title" className="section-title">
          Pakete
        </h2>
        {sets.length === 0 && <p className="muted">Noch keine Pakete.</p>}
        {sets.map((set) => setForm(set))}
        {setForm()}
      </section>
    </>
  );
}
