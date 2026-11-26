// Data of the app: projects, categories and history as tables (mn.table, offline like kv),
// settings and small state in mn.kv, imported meshes and G-code in mn.files.

import { readGcode, readStl } from './io.js';
import { emptyModel, normalise } from './model.js';

export const DEFAULT_SETTINGS = {
  units: 'mm',
  grid: 5,
  gridVisible: true,
  snapGrid: true,
  snapObjects: true,
  paper: 'A4',
  orientation: 'landscape',
  projection: 'first',
  showHidden: true,
  aiModel: 'claude-sonnet',
  cam: {
    tool: 3,
    depth: 3,
    step: 1,
    feed: 600,
    plunge: 150,
    safeZ: 5,
    rpm: 12000,
    side: 'outside',
  },
  printer: { x: 220, y: 220, z: 250, density: 1.24 },
};

const HISTORY_KEEP = 20;
const TRASH_DAYS = 30;
const PROJECT_COLUMNS = [
  'id',
  'name',
  'notes',
  'category_id',
  'purpose',
  'units',
  'model',
  'sample',
  'deleted_at',
  'created_at',
  'updated_at',
];
const CATEGORY_COLUMNS = [
  'id',
  'name',
  'colour',
  'position',
  'archived',
  'sample',
  'created_at',
  'updated_at',
];

export function createStore(mn) {
  const projects = mn.table('projects');
  const categories = mn.table('categories');
  const history = mn.table('history');
  const meshCache = new Map();

  const pick = (row, cols) => Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));
  const now = () => new Date().toISOString();

  const store = {
    settings: structuredClone(DEFAULT_SETTINGS),
    user: null,

    async loadSettings() {
      const saved = (await mn.kv.get('settings')) ?? {};
      store.settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...saved,
        cam: { ...DEFAULT_SETTINGS.cam, ...(saved.cam ?? {}) },
        printer: { ...DEFAULT_SETTINGS.printer, ...(saved.printer ?? {}) },
      };
      return store.settings;
    },
    async saveSettings(patch) {
      store.settings = { ...store.settings, ...patch };
      await mn.kv.set('settings', store.settings);
    },

    // kv-collection-ok: three first-use hint flags (seen:<hint>), small state, not a list of entries
    async seen(hint) {
      return Boolean(await mn.kv.get(`seen:${hint}`));
    },
    async markSeen(hint) {
      await mn.kv.set(`seen:${hint}`, true);
    },
    async resetHints() {
      const keys = await mn.kv.list('seen:');
      for (const { key } of keys) await mn.kv.delete(key);
    },

    // --- projects -------------------------------------------------------------------------
    async allProjects() {
      const rows = await projects.list();
      return rows.map((r) => ({ ...r, model: normalise(r.model) }));
    },
    async projects() {
      return (await store.allProjects())
        .filter((p) => !p.deleted_at)
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
    },
    async project(id) {
      const r = await projects.get(id);
      return r ? { ...r, model: normalise(r.model) } : null;
    },
    newProject({ name, purpose = 'print', category_id = null, sample = false, model = null }) {
      const m = model ?? emptyModel();
      m.sheet = {
        ...m.sheet,
        paper: store.settings.paper,
        orientation: store.settings.orientation,
        title: m.sheet.title || name,
      };
      return {
        id: projects.newId(),
        name,
        notes: '',
        category_id,
        purpose,
        units: store.settings.units,
        model: m,
        sample,
        deleted_at: null,
        created_at: now(),
        updated_at: now(),
      };
    },
    async saveProject(p) {
      const row = pick({ ...p, updated_at: now() }, PROJECT_COLUMNS);
      await projects.upsert(row);
      return row;
    },
    async trashProjects(list) {
      for (const p of list) await store.saveProject({ ...p, deleted_at: now() });
    },
    async restoreProjects(list) {
      for (const p of list) await store.saveProject({ ...p, deleted_at: null });
    },
    async purgeProject(p) {
      await store.removeProjectFiles(p.id);
      await projects.remove(p.id);
      for (const h of (await history.list()).filter((x) => x.item_id === p.id))
        await history.remove(h.id);
    },
    async trash() {
      return (await store.allProjects())
        .filter((p) => p.deleted_at)
        .sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));
    },
    /** Removes projects that sit in the Papierkorb for more than 30 days. */
    async purgeOld() {
      const limit = Date.now() - TRASH_DAYS * 86_400_000;
      for (const p of await store.trash())
        if (Date.parse(p.deleted_at) < limit) await store.purgeProject(p);
    },

    // --- history --------------------------------------------------------------------------
    async versions(projectId) {
      // Online, the server returns only this project's versions; offline, the local copy.
      if (mn.offline.online()) {
        const { data, error } = await mn.db
          .from('history')
          .select('*')
          .eq('item_id', projectId)
          .order('at', { ascending: false });
        if (!error && Array.isArray(data)) return data;
      }
      return (await history.list())
        .filter((h) => h.item_id === projectId)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    },
    async addVersion(project, summary) {
      await history.upsert({
        id: history.newId(),
        item_id: project.id,
        at: now(),
        by: store.user?.id ?? null,
        changes: { summary, name: project.name, model: project.model },
        created_at: now(),
        updated_at: now(),
      });
      const all = await store.versions(project.id);
      for (const old of all.slice(HISTORY_KEEP)) await history.remove(old.id);
    },

    // --- categories -----------------------------------------------------------------------
    async categories() {
      return (await categories.list()).sort(
        (a, b) => a.position - b.position || a.name.localeCompare(b.name, window.mnI18n.locale),
      );
    },
    newCategory(name, colour = 'gray', position = 0, sample = false) {
      return {
        id: categories.newId(),
        name,
        colour,
        position,
        archived: false,
        sample,
        created_at: now(),
        updated_at: now(),
      };
    },
    async saveCategory(c) {
      await categories.upsert(pick({ ...c, updated_at: now() }, CATEGORY_COLUMNS));
    },
    async removeCategory(id) {
      await categories.remove(id);
    },

    // --- files: imported meshes and toolpaths ---------------------------------------------
    filePath: (projectId, solidId, ext) => `projects/${projectId}/${solidId}.${ext}`,
    async uploadFile(path, blob) {
      await mn.files.upload(path, blob);
    },
    async removeProjectFiles(projectId) {
      try {
        const names = await mn.files.list(`projects/${projectId}`);
        for (const n of names) await mn.files.remove(`projects/${projectId}/${n}`);
      } catch {
        // offline or nothing there: the files stay until the next purge
      }
    },
    async removeFile(path) {
      try {
        await mn.files.remove(path);
      } catch {}
    },
    /** The polygons of an imported mesh or the moves of a toolpath (cached). */
    async loadFile(solid) {
      if (meshCache.has(solid.file)) return meshCache.get(solid.file);
      const url = await mn.files.url(solid.file);
      const res = await fetch(url);
      if (!res.ok) throw new Error('load_failed');
      const data =
        solid.kind === 'mesh' ? readStl(await res.arrayBuffer()) : readGcode(await res.text());
      meshCache.set(solid.file, data);
      return data;
    },
    cache: (path, data) => meshCache.set(path, data),
    cached: (path) => meshCache.get(path),

    // --- sample data ----------------------------------------------------------------------
    async hasSamples() {
      return (
        (await store.allProjects()).some((p) => p.sample) ||
        (await store.categories()).some((c) => c.sample)
      );
    },
    async removeSamples() {
      for (const p of (await store.allProjects()).filter((x) => x.sample))
        await store.purgeProject(p);
      for (const c of (await store.categories()).filter((x) => x.sample))
        await store.removeCategory(c.id);
    },

    // --- backup ---------------------------------------------------------------------------
    async exportAll() {
      return {
        app: 'cad',
        version: 1,
        exported: now(),
        settings: store.settings,
        categories: await categories.list(),
        projects: (await store.allProjects()).filter((p) => !p.deleted_at),
      };
    },
    async importAll(data) {
      if (data?.app !== 'cad' || !Array.isArray(data.projects)) throw new Error('invalid');
      // Categories get new ids: a backup of another person never touches their rows.
      const ids = new Map();
      const colours = ['green', 'blue', 'violet', 'amber', 'rose', 'teal', 'gray'];
      for (const c of Array.isArray(data.categories) ? data.categories : []) {
        const name = typeof c?.name === 'string' ? c.name.trim().slice(0, 80) : '';
        if (!name) continue;
        const cat = store.newCategory(
          name,
          colours.includes(c.colour) ? c.colour : 'gray',
          Number.isInteger(c.position) ? c.position : 0,
        );
        await store.saveCategory(cat);
        ids.set(c.id, cat.id);
      }
      let count = 0;
      for (const p of data.projects) {
        const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 120) : '';
        if (!name || !p.model || typeof p.model !== 'object') continue;
        const row = store.newProject({
          name,
          purpose: ['print', 'cnc', 'drawing'].includes(p.purpose) ? p.purpose : 'print',
          category_id: ids.get(p.category_id) ?? null,
          model: normalise(p.model),
        });
        row.notes = typeof p.notes === 'string' ? p.notes.slice(0, 5000) : '';
        await store.saveProject(row);
        count++;
      }
      return count;
    },
    async deleteAll() {
      for (const p of await store.allProjects()) await store.purgeProject(p);
      for (const c of await categories.list()) await categories.remove(c.id);
      for (const { key } of await mn.kv.list('')) await mn.kv.delete(key);
      store.settings = structuredClone(DEFAULT_SETTINGS);
    },
  };
  return store;
}

export const categoryName = (c) => c?.name ?? '';
