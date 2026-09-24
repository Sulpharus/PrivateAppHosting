// Shared shopping list: every item is its own mn.kv entry in the "shared" scope, so two people
// ticking different items at the same time never overwrite each other.
window.addEventListener('DOMContentLoaded', () => {
  // Handlers are attached right away; the SDK and the profile load in the background.
  const ready = (async () => {
    const client = await window.mininode.mininode();
    await client.auth.requireLogin();
    return client;
  })();
  // Show the display name (never the email address) next to items you add.
  const myName = ready
    .then(async (client) => {
      const { data } = await client.supabase
        .schema('platform')
        .from('profiles')
        .select('display_name')
        .maybeSingle();
      return data?.display_name ?? 'jemand';
    })
    .catch(() => 'jemand');
  let mn;

  const list = document.getElementById('list');
  const form = document.getElementById('add');
  const input = document.getElementById('text');
  const clear = document.getElementById('clear');
  const error = document.getElementById('error');

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };

  async function render() {
    mn = await ready;
    const items = await mn.kv.list('item:', 'shared');
    // Open items first, then by the time they were added.
    items.sort((a, b) => Number(a.value.done) - Number(b.value.done) || a.key.localeCompare(b.key));
    list.replaceChildren();
    clear.hidden = !items.some((item) => item.value.done);
    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Die Liste ist leer.';
      list.append(empty);
      return;
    }
    for (const { key, value } of items) {
      const item = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'text';
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '0.75rem';
      label.style.minHeight = '44px';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = value.done;
      box.style.flex = '0 0 auto';
      box.style.width = '24px';
      box.style.minHeight = '24px';
      box.addEventListener('change', async () => {
        try {
          // Someone may have removed the item meanwhile; don't bring it back.
          const current = await mn.kv.get(key, 'shared');
          if (current) await mn.kv.set(key, { ...current, done: box.checked }, 'shared');
        } catch {
          fail('Konnte den Artikel nicht speichern.');
        }
        await render();
      });
      const text = document.createElement('span');
      text.textContent = value.text;
      if (value.done) text.style.textDecoration = 'line-through';
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `· ${value.by}`;
      label.append(box, text, meta);
      item.append(label);
      list.append(item);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    error.hidden = true;
    const key = `item:${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`;
    try {
      mn = await ready;
      await mn.kv.set(key, { text, done: false, by: await myName }, 'shared');
      input.value = '';
      await render();
    } catch {
      fail('Hinzufügen hat nicht geklappt. Bist du noch angemeldet?');
    }
  });

  clear.addEventListener('click', async () => {
    clear.disabled = true;
    try {
      mn = await ready;
      const done = (await mn.kv.list('item:', 'shared')).filter((item) => item.value.done);
      await Promise.all(done.map((item) => mn.kv.delete(item.key, 'shared')));
    } catch {
      fail('Aufräumen hat nicht ganz geklappt.');
    } finally {
      clear.disabled = false;
    }
    await render().catch(() => {});
  });

  // Poll while the tab is visible so everyone sees each other's changes.
  setInterval(() => {
    if (document.visibilityState === 'visible') void render().catch(() => {});
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void render();
  });

  void render().catch(() => fail('Die Liste konnte nicht geladen werden.'));
});
