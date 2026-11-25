/* mininode-preview-sdk: the KI-Werkstatt preview stand-in; the upload removes it, doctor refuses it */
// Preview SDK for building outside MiniNode (KI-Werkstatt "Startpaket", ADR 0030). It goes into the
// starter package as _mininode/sdk.js, so an app built in Claude, ChatGPT, AI Studio or Bolt loads
// /_mininode/sdk.js exactly like on MiniNode and works in the tool's own preview.
//
// It is the only allowed stand-in: data stays in this browser (localStorage, or memory where that is
// blocked), AI answers with a placeholder and Google, external APIs and push report "not set up".
// Its surface and return shapes follow the real client (packages/sdk/src, checked by
// packages/sdk/src/preview-surface.test.ts). On MiniNode the gate serves the real sdk.js from
// /_mininode/; `mininode integrate` drops every file with the marker above, and `mininode doctor`
// reports it as an error wherever it is left.
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
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'vorschau@example.com',
    user_metadata: { display_name: 'Vorschau' },
  };
  const ownerId = user.id;
  const now = () => new Date().toISOString();

  const rowsOf = (table) => store.get(`table:${table}`) ?? {};
  const saveRows = (table, rows) => store.set(`table:${table}`, rows);
  const stamp = (row, before) => ({
    owner_id: ownerId,
    created_at: before?.created_at ?? now(),
    ...before,
    ...row,
    updated_at: now(),
  });

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
      rows[row.id] = stamp(row, rows[row.id]);
      saveRows(name, rows);
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
      saveRows(name, rows);
    },
  });

  // The query builder of mn.db over the same rows: select with filters, sorting and paging, and
  // insert, upsert, update and delete, each awaitable and chainable like supabase-js. A method the
  // preview does not know answers `{ data: null, error }` instead of throwing.
  const OPS = {
    eq: (a, b) => a === b,
    neq: (a, b) => a !== b,
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    like: (a, b) => new RegExp(`^${String(b).replaceAll('%', '.*')}$`).test(String(a ?? '')),
    ilike: (a, b) => new RegExp(`^${String(b).replaceAll('%', '.*')}$`, 'i').test(String(a ?? '')),
    is: (a, b) => (a ?? null) === (b === 'null' ? null : b),
    in: (a, b) =>
      (Array.isArray(b)
        ? b
        : String(b)
            .replace(/^\(|\)$/g, '')
            .split(',')
      ).includes(a),
  };
  const query = (name) => {
    const state = { op: 'select', values: null, filters: [], order: [], range: null, one: null };
    let unknown = null;
    const test = (column, op, value) => (row) => OPS[op]?.(row[column], value) ?? false;
    const chain =
      (fn) =>
      (...args) => {
        fn(...args);
        return builder;
      };
    const run = () => {
      if (unknown)
        return { data: null, error: { message: `${unknown} is not available in the preview` } };
      const rows = rowsOf(name);
      const match = (row) => state.filters.every((f) => f(row));
      let data = [];
      if (state.op === 'select') data = Object.values(rows).filter(match);
      if (state.op === 'insert' || state.op === 'upsert') {
        for (const input of state.values) {
          const id = input.id ?? uuid();
          if (state.op === 'insert' && rows[id])
            return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          rows[id] = stamp({ ...input, id }, state.op === 'upsert' ? rows[id] : undefined);
          data.push(rows[id]);
        }
      }
      if (state.op === 'update')
        for (const row of Object.values(rows).filter(match)) {
          rows[row.id] = stamp(state.values, row);
          data.push(rows[row.id]);
        }
      if (state.op === 'delete')
        for (const row of Object.values(rows).filter(match)) {
          delete rows[row.id];
          data.push(row);
        }
      if (state.op !== 'select') saveRows(name, rows);
      for (const { column, ascending } of [...state.order].reverse())
        data.sort(
          (a, b) =>
            (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * (ascending ? 1 : -1),
        );
      const count = data.length;
      if (state.range) data = data.slice(state.range[0], state.range[1] + 1);
      if (state.one === 'single' && data.length !== 1)
        return {
          data: null,
          error: { code: 'PGRST116', message: `expected 1 row, got ${data.length}` },
        };
      if (state.one) return { data: data[0] ?? null, error: null, count };
      return { data, error: null, count };
    };
    const known = {
      select: chain(() => undefined),
      insert: chain((values) => {
        state.op = 'insert';
        state.values = Array.isArray(values) ? values : [values];
      }),
      upsert: chain((values) => {
        state.op = 'upsert';
        state.values = Array.isArray(values) ? values : [values];
      }),
      update: chain((values) => {
        state.op = 'update';
        state.values = values;
      }),
      delete: chain(() => {
        state.op = 'delete';
      }),
      not: chain((column, op, value) => {
        const inner = test(column, op, value);
        state.filters.push((row) => !inner(row));
      }),
      or: chain((expression) => {
        const parts = String(expression)
          .split(',')
          .map((part) => {
            const [column, op, ...rest] = part.split('.');
            return test(column, op, rest.join('.'));
          });
        state.filters.push((row) => parts.some((p) => p(row)));
      }),
      match: chain((values) => {
        for (const [column, value] of Object.entries(values))
          state.filters.push(test(column, 'eq', value));
      }),
      order: chain((column, options = {}) => {
        state.order.push({ column, ascending: options.ascending !== false });
      }),
      range: chain((from, to) => {
        state.range = [from, to];
      }),
      limit: chain((n) => {
        state.range = [0, n - 1];
      }),
      single: chain(() => {
        state.one = 'single';
      }),
      maybeSingle: chain(() => {
        state.one = 'maybe';
      }),
      // biome-ignore lint/suspicious/noThenProperty: awaitable like the real supabase-js query builder
      then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    for (const op of Object.keys(OPS))
      known[op] = chain((column, value) => state.filters.push(test(column, op, value)));
    const builder = new Proxy(known, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'symbol') return undefined;
        return chain(() => {
          unknown = unknown ?? String(prop);
        });
      },
    });
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
      untrack: async () => 'ok',
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

  const teams = () => store.get('teams') ?? [];
  const PERSON = { id: '00000000-0000-4000-8000-000000000002', name: 'Beispiel Person' };

  const client = {
    config: {
      appSlug: 'vorschau',
      appName: 'Vorschau',
      supabaseUrl: window.location.origin,
      supabasePublishableKey: 'preview',
      portalUrl: window.location.origin,
      apiUrl: window.location.origin,
      aiUrl: window.location.origin,
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
    db: { from: query, rpc: () => query('rpc') },
    kv: {
      get: async (key, scope = 'user') => store.get(`kv:${scope}:${key}`),
      set: async (key, value, scope = 'user') => store.set(`kv:${scope}:${key}`, value),
      delete: async (key, scope = 'user') => store.remove(`kv:${scope}:${key}`),
      list: async (prefix = '', scope = 'user') =>
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
      sync: async () => 0,
    },
    table,
    team: {
      list: async () => teams(),
      async create(name) {
        const id = uuid();
        store.set('teams', [...teams(), { id, name, role: 'owner', memberCount: 1 }]);
        return id;
      },
      members: async () => [{ id: user.id, name: 'Du', role: 'owner' }],
      setMember: async () => undefined,
      removeMember: async () => undefined,
      async rename(id, name) {
        store.set(
          'teams',
          teams().map((t) => (t.id === id ? { ...t, name } : t)),
        );
      },
      async remove(id) {
        store.set(
          'teams',
          teams().filter((t) => t.id !== id),
        );
      },
      notify: async () => undefined,
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
      // Like storage: the names directly inside the folder (files and subfolders).
      async list(prefix = '') {
        const folder = prefix.replace(/\/$/, '');
        const start = folder ? `${folder}/` : '';
        const names = new Set();
        for (const key of files.keys())
          if (key.startsWith(start)) names.add(key.slice(start.length).split('/')[0]);
        return [...names];
      },
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
      accessToken: async () => {
        throw new GoogleError('Google ist nur auf MiniNode verfügbar.', 'google_not_connected');
      },
      fetch: async () => {
        throw new GoogleError('Google ist nur auf MiniNode verfügbar.', 'google_not_connected');
      },
      calendarSync: async () => {
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
      stats: async () => ({
        seconds: 0,
        sessions: 0,
        results: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        lastPlayed: null,
        records: {},
      }),
      leaderboard: async () => [],
      hubUrl: () => '#gaming-hub',
    },
    suite: {
      type: (type) => ({
        list: async () => [],
        upsert: async (fields, options = {}) => ({
          record: { ...fields, id: options.id ?? uuid(), type },
          merged: false,
          rejectedFields: [],
        }),
        delete: async () => undefined,
      }),
      range: async () => [],
      types: async () => [],
      collections: async () => [],
      personal: async () => uuid(),
      createCollection: async () => uuid(),
      setMember: async () => undefined,
      leave: async () => undefined,
    },
    people: async () => [PERSON],
    birthdays: async () => [],
    notify: async (title, body) => {
      if (window.mnui?.toast) window.mnui.toast(`${title}${body ? ` · ${body}` : ''}`);
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
