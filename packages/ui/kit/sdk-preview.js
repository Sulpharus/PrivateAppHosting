// Preview SDK for building outside MiniNode (KI-Werkstatt "Startpaket", ADR 0030). It goes into the
// starter package as _mininode/sdk.js, so an app built in Claude, ChatGPT, AI Studio or Bolt loads
// /_mininode/sdk.js exactly like on MiniNode and works in the tool's own preview.
//
// It is the only allowed stand-in: data stays in this browser (localStorage, or memory where that is
// blocked), AI answers with a placeholder and Google, external APIs and push report "not set up".
// On MiniNode the gate serves the real sdk.js from /_mininode/; the upload deletes this copy, and
// `mininode doctor` refuses an app that still ships a _mininode/ folder.
(() => {
  if (window.mininode) return;

  const PREFIX = 'mn-preview:';
  const memory = new Map();
  const store = {
    get(key) {
      try {
        const raw = window.localStorage.getItem(PREFIX + key);
        return raw === null ? (memory.get(key) ?? null) : JSON.parse(raw);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // Storage blocked (sandboxed preview): memory only.
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        window.localStorage.removeItem(PREFIX + key);
      } catch {
        // see set
      }
    },
    keys(prefix) {
      const found = new Set([...memory.keys()].filter((k) => k.startsWith(prefix)));
      try {
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const k = window.localStorage.key(i);
          if (k?.startsWith(PREFIX + prefix)) found.add(k.slice(PREFIX.length));
        }
      } catch {
        // see set
      }
      return [...found].sort();
    },
  };

  class AiError extends Error {
    constructor(message, code, status = 400) {
      super(message);
      this.name = 'AiError';
      this.code = code;
      this.status = status;
    }
  }
  class ExternalApiError extends Error {
    constructor(message, code, status = 503) {
      super(message);
      this.name = 'ExternalApiError';
      this.code = code;
      this.status = status;
      this.keyMissing = code === 'api_key_missing';
      this.needsPersonalKey = false;
    }
  }
  class GoogleError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'GoogleError';
      this.code = code;
    }
  }

  const uuid = () =>
    window.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'vorschau@example.com' };
  const ownerId = user.id;

  const rowsOf = (table) => store.get(`table:${table}`) ?? {};
  const table = (name) => ({
    newId: uuid,
    async list() {
      return Object.values(rowsOf(name)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    },
    async get(id) {
      return rowsOf(name)[id] ?? null;
    },
    async upsert(row) {
      const rows = rowsOf(name);
      const now = new Date().toISOString();
      rows[row.id] = {
        owner_id: ownerId,
        created_at: rows[row.id]?.created_at ?? now,
        ...row,
        updated_at: now,
      };
      store.set(`table:${name}`, rows);
      return rows[row.id];
    },
    async upsertMany(list) {
      const done = [];
      for (const row of list) done.push(await this.upsert(row));
      return done;
    },
    async remove(id) {
      const rows = rowsOf(name);
      delete rows[id];
      store.set(`table:${name}`, rows);
    },
  });

  // A small part of the query builder over the same rows, enough for filters, sorting and paging.
  const query = (name) => {
    const filters = [];
    let order = null;
    let range = null;
    const where = (test) => {
      filters.push(test);
      return builder;
    };
    const builder = {
      select: () => builder,
      eq: (c, v) => where((r) => r[c] === v),
      neq: (c, v) => where((r) => r[c] !== v),
      gt: (c, v) => where((r) => r[c] > v),
      gte: (c, v) => where((r) => r[c] >= v),
      lt: (c, v) => where((r) => r[c] < v),
      lte: (c, v) => where((r) => r[c] <= v),
      in: (c, list) => where((r) => list.includes(r[c])),
      is: (c, v) => where((r) => (r[c] ?? null) === v),
      ilike: (c, pattern) => {
        const needle = String(pattern).replaceAll('%', '').toLowerCase();
        return where((r) =>
          String(r[c] ?? '')
            .toLowerCase()
            .includes(needle),
        );
      },
      order: (c, o = {}) => {
        order = { c, asc: o.ascending !== false };
        return builder;
      },
      range: (from, to) => {
        range = [from, to];
        return builder;
      },
      limit: (n) => {
        range = [0, n - 1];
        return builder;
      },
      insert: async (input) => {
        const rows = rowsOf(name);
        for (const row of Array.isArray(input) ? input : [input]) {
          const id = row.id ?? uuid();
          if (rows[id]) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          rows[id] = { owner_id: ownerId, created_at: new Date().toISOString(), ...row, id };
        }
        store.set(`table:${name}`, rows);
        return { data: null, error: null };
      },
      // biome-ignore lint/suspicious/noThenProperty: awaitable like the real supabase-js query builder
      then(resolve, reject) {
        let data = Object.values(rowsOf(name)).filter((r) => filters.every((f) => f(r)));
        if (order) {
          const { c, asc } = order;
          data.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
        }
        if (range) data = data.slice(range[0], range[1] + 1);
        return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
      },
    };
    return builder;
  };

  const files = new Map();
  const listeners = { online: new Set(), synced: new Set() };
  const announce = (online) => {
    for (const cb of listeners.online) cb(online);
  };
  window.addEventListener('online', () => announce(true));
  window.addEventListener('offline', () => announce(false));

  const AI_TEXT =
    'Vorschau: Auf MiniNode antwortet hier die KI. (Preview: on MiniNode the AI answers here.)';
  const channel = () => {
    const ch = {
      on: () => ch,
      subscribe: (cb) => {
        cb?.('SUBSCRIBED');
        return ch;
      },
      send: async () => 'ok',
      track: async () => 'ok',
      presenceState: () => ({}),
      unsubscribe: async () => 'ok',
    };
    return ch;
  };

  let banner = false;
  const showBanner = () => {
    if (banner || !document.body) return;
    banner = true;
    const note = document.createElement('div');
    note.setAttribute('role', 'note');
    note.className = 'mn-banner mn-banner--warn';
    note.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;margin:0';
    note.textContent =
      'Vorschau ohne MiniNode: Daten bleiben in diesem Browser, KI, Google und Push sind aus.';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mn-btn mn-btn--ghost';
    close.textContent = 'Ausblenden';
    close.addEventListener('click', () => note.remove());
    note.append(' ', close);
    document.body.append(note);
  };

  const client = {
    config: {
      appSlug: 'vorschau',
      portalUrl: window.location.origin,
      apiUrl: window.location.origin,
      aiUrl: window.location.origin,
      preview: true,
    },
    supabase: null,
    auth: {
      user: async () => user,
      role: async () => 'admin',
      requireLogin: async () => {
        showBanner();
        return user;
      },
      signOut: async () => undefined,
      accountUrl: () => '#konto',
    },
    db: { from: query },
    table,
    kv: {
      get: async (key, scope = 'private') => store.get(`kv:${scope}:${key}`),
      set: async (key, value, scope = 'private') => store.set(`kv:${scope}:${key}`, value),
      delete: async (key, scope = 'private') => store.remove(`kv:${scope}:${key}`),
      list: async (prefix = '', scope = 'private') =>
        store
          .keys(`kv:${scope}:${prefix}`)
          .map((k) => ({ key: k.slice(`kv:${scope}:`.length), value: store.get(k) })),
    },
    offline: {
      online: () => navigator.onLine !== false,
      onChange: (cb) => {
        listeners.online.add(cb);
        return () => listeners.online.delete(cb);
      },
      onSynced: (cb) => {
        listeners.synced.add(cb);
        return () => listeners.synced.delete(cb);
      },
      pending: async () => 0,
    },
    files: {
      async upload(path, body) {
        files.set(path, body instanceof Blob ? body : new Blob([body]));
        return path;
      },
      async url(path) {
        const blob = files.get(path);
        if (!blob) throw new Error(`Datei nicht gefunden: ${path}`);
        return URL.createObjectURL(blob);
      },
      list: async (prefix = '') => [...files.keys()].filter((p) => p.startsWith(prefix)),
      remove: async (path) => void files.delete(path),
    },
    realtime: channel,
    ai: {
      chat: async () => AI_TEXT,
      search: async () => ({ text: AI_TEXT, sources: [] }),
      async *stream() {
        yield AI_TEXT;
      },
      json: async () => {
        throw new AiError('Die KI ist nur auf MiniNode verfügbar.', 'preview_only');
      },
    },
    google: {
      connected: async () => false,
      connectUrl: () => '#google',
      fetch: async () => {
        throw new GoogleError('Google ist nur auf MiniNode verfügbar.', 'google_not_connected');
      },
    },
    api: () => {
      const fail = async () => {
        throw new ExternalApiError(
          'Der Schlüssel wird auf MiniNode eingetragen.',
          'api_key_missing',
        );
      };
      return { fetch: fail, json: fail };
    },
    image: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Das Bild konnte nicht geladen werden.');
      return response.blob();
    },
    people: async () => [{ id: '00000000-0000-4000-8000-000000000002', name: 'Beispiel Person' }],
    birthdays: async () => [],
    notify: async (title, body) => {
      if (window.mnui?.toast) window.mnui.toast(`${title}${body ? ` · ${body}` : ''}`);
    },
    push: {
      schedule: async () => undefined,
      cancel: async () => undefined,
      list: async () => [],
      status: async () => 'unsupported',
      settingsUrl: () => '#benachrichtigungen',
    },
    game: {
      track: () => () => undefined,
      result: async () => undefined,
      username: async () => 'Vorschau',
      stats: async () => ({ records: {} }),
      leaderboard: async () => [],
      hubUrl: () => '#gaming-hub',
    },
    suite: {
      type: () => ({
        upsert: async (record) => ({ ...record, id: uuid(), merged: true, rejectedFields: [] }),
        delete: async () => undefined,
        list: async () => [],
      }),
      range: async () => [],
      collections: async () => [],
      createCollection: async (name) => ({ id: uuid(), name }),
      setMember: async () => undefined,
    },
    team: {
      list: async () => [{ id: 'team-vorschau', name: 'Vorschau-Team', role: 'owner' }],
      create: async (name) => ({ id: uuid(), name, role: 'owner' }),
      members: async () => [{ userId: user.id, name: 'Du', role: 'owner' }],
      setMember: async () => undefined,
      removeMember: async () => undefined,
      rename: async () => undefined,
      remove: async () => undefined,
      notify: async () => undefined,
    },
  };

  window.mininode = {
    mininode: async () => client,
    AiError,
    ExternalApiError,
    GoogleError,
    preview: true,
  };
})();
