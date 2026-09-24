// Private notes: one mn.kv entry per note (key "note:<time>-<id>"), so saving from two
// devices at once never overwrites the other note.
window.addEventListener('DOMContentLoaded', () => {
  // Handlers are attached right away; the SDK loads in the background.
  const ready = (async () => {
    const client = await window.mininode.mininode();
    await client.auth.requireLogin();
    return client;
  })();

  const list = document.getElementById('list');
  const form = document.getElementById('add');
  const input = document.getElementById('text');
  const error = document.getElementById('error');
  const when = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };

  async function render() {
    const mn = await ready;
    const notes = (await mn.kv.list('note:')).sort((a, b) => b.key.localeCompare(a.key));
    list.replaceChildren();
    if (notes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Noch keine Notizen – schreib oben die erste.';
      list.append(empty);
      return;
    }
    for (const { key, value } of notes) {
      const item = document.createElement('li');
      const body = document.createElement('div');
      body.className = 'text';
      body.textContent = value.text;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const at = new Date(value.at);
      meta.textContent = Number.isNaN(at.getTime()) ? '' : when.format(at);
      body.append(meta);
      const remove = document.createElement('button');
      remove.className = 'ghost';
      remove.type = 'button';
      remove.textContent = 'Löschen';
      remove.setAttribute('aria-label', `Notiz löschen: ${value.text.slice(0, 40)}`);
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        const mn = await ready;
        await mn.kv.delete(key).catch(() => fail('Löschen hat nicht geklappt.'));
        await render();
      });
      item.append(body, remove);
      list.append(item);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    error.hidden = true;
    const at = new Date().toISOString();
    try {
      const mn = await ready;
      await mn.kv.set(`note:${at}-${crypto.randomUUID().slice(0, 8)}`, { text, at });
      input.value = '';
      await render();
    } catch {
      fail('Speichern hat nicht geklappt. Bist du noch angemeldet?');
    }
  });

  // Pick up notes written on another device when you come back to this tab.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void render();
  });

  void render().catch(() => fail('Die Notizen konnten nicht geladen werden.'));
});
