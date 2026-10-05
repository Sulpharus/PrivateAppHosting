// MiniNode SDK runtime shim
(() => {
  const listeners = {
    synced: new Set(),
    online: new Set(),
  };

  window.addEventListener('online', () => {
    listeners.online.forEach((cb) => cb(true));
  });
  window.addEventListener('offline', () => {
    listeners.online.forEach((cb) => cb(false));
  });

  const mn = {
    auth: {
      requireLogin: async () => {
        const stored = localStorage.getItem('mn_user');
        if (stored) {
          try {
            return JSON.parse(stored);
          } catch (e) {}
        }
        const user = { id: 'user-aether', email: 'alex@aether.mininode.app', name: 'Alex' };
        localStorage.setItem('mn_user', JSON.stringify(user));
        return user;
      },
      role: async () => 'user',
      currentUser: () => {
        const stored = localStorage.getItem('mn_user');
        if (stored) {
          try {
            return JSON.parse(stored);
          } catch (e) {}
        }
        return { id: 'user-aether', email: 'alex@aether.mininode.app', name: 'Alex' };
      },
      logout: async () => {
        localStorage.removeItem('mn_user');
      },
    },
    kv: {
      get: async (key) => {
        const raw = localStorage.getItem('mn_kv_' + key);
        return raw !== null ? JSON.parse(raw) : null;
      },
      set: async (key, value, scope) => {
        localStorage.setItem('mn_kv_' + key, JSON.stringify(value));
      },
      delete: async (key) => {
        localStorage.removeItem('mn_kv_' + key);
      },
      list: async (prefix) => {
        const results = [];
        const target = 'mn_kv_' + (prefix || '');
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(target)) {
            const raw = localStorage.getItem(k);
            results.push({
              key: k.replace('mn_kv_', ''),
              value: raw ? JSON.parse(raw) : null,
            });
          }
        }
        return results;
      },
    },
    notify: async (title, body, path) => {
      if (typeof window !== 'undefined' && window.mnui && window.mnui.toast) {
        window.mnui.toast(title + (body ? ': ' + body : ''));
      }
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body: body || '' });
        }
      } catch (e) {}
    },
    push: {
      schedule: async ({ key, at, title, body, path }) => {
        const pending = JSON.parse(localStorage.getItem('mn_push_schedules') || '{}');
        pending[key] = { key, at, title, body, path, createdAt: new Date().toISOString() };
        localStorage.setItem('mn_push_schedules', JSON.stringify(pending));
      },
      cancel: async (key) => {
        const pending = JSON.parse(localStorage.getItem('mn_push_schedules') || '{}');
        delete pending[key];
        localStorage.setItem('mn_push_schedules', JSON.stringify(pending));
      },
      list: async () => {
        const pending = JSON.parse(localStorage.getItem('mn_push_schedules') || '{}');
        return Object.values(pending);
      },
      status: async () => 'on',
      settingsUrl: () => 'https://mininode.app/account/notifications',
    },
    files: {
      upload: async (path, file, options) => {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
          reader.onload = () => {
            try {
              localStorage.setItem('mn_file_' + path, reader.result);
              resolve({ path });
            } catch (e) {
              resolve({ path });
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      },
      url: async (path) => {
        const dataUrl = localStorage.getItem('mn_file_' + path);
        return dataUrl || '';
      },
      list: async (prefix) => {
        const results = [];
        const target = 'mn_file_' + (prefix || '');
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(target)) {
            results.push(k.replace('mn_file_', ''));
          }
        }
        return results;
      },
    },
    offline: {
      online: () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
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
    google: {
      connected: async () => false,
      connectUrl: () => 'https://mininode.app/account/google',
      fetch: async (url, init) => {
        throw new Error('Google not connected');
      },
    },
  };

  window.mininode = {
    mininode: async () => mn,
  };
})();
