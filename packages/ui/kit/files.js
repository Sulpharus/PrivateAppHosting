// MiniNode files for apps that open and save the browser way, served as /_mininode/files.js.
// Plain script, after /_mininode/ui.js, /_mininode/i18n.js and /_mininode/sdk.js. It lets such an
// app (e.g. a WebAssembly program that cannot call the SDK itself) use the person's MiniNode files
// (mn.files, private per person) next to the device:
//   - a file field's picker (<input type="file">.click()) and window.showOpenFilePicker open a
//     dialog: "Aus MiniNode" lists the stored files, "Von diesem Gerät" opens the browser's picker;
//   - window.showSaveFilePicker and a download link (<a download href="blob:…">.click()) open a
//     dialog that saves to MiniNode or, as before, to the device;
//   - a download of a file that was opened from or saved to MiniNode in this page (the app's
//     "Save") goes straight back to MiniNode; the toast offers "Speichern unter …" for the dialog.
// The app needs a data mode other than "none" (mn.files) and nothing else; texts come from the
// app's language packages (keys files.*, German fallback below). data-mn-native on a field or a
// link keeps the browser's own behaviour.
(() => {
  const TEXT = {
    'files.open.title': 'Datei öffnen',
    'files.open.device': 'Von diesem Gerät …',
    'files.open.empty': 'In MiniNode liegen noch keine passenden Dateien.',
    'files.open.loading': 'Dateien werden geladen …',
    'files.open.selected': '{n} öffnen',
    'files.save.title': 'Speichern',
    'files.save.name': 'Dateiname',
    'files.save.mininode': 'In MiniNode speichern',
    'files.save.device': 'Auf diesem Gerät speichern',
    'files.save.replace': '„{name}“ gibt es schon in MiniNode. Ersetzen?',
    'files.save.done': '„{name}“ in MiniNode gespeichert',
    'files.save.as': 'Speichern unter …',
    'files.cancel': 'Abbrechen',
    'files.error': 'Das hat nicht geklappt: {message}',
    'files.source': 'MiniNode',
  };
  const t = (key, params = {}) => {
    const text = window.mnI18n?.t(key, params);
    const value = text && text !== key ? text : TEXT[key];
    return value.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
  };

  let client;
  const mn = () => {
    client ??= window.mininode.mininode();
    return client;
  };

  /** "image/*,.psd" → a test for a file name (and its guessed type). */
  const accepts = (accept) => {
    const rules = String(accept || '')
      .split(',')
      .map((rule) => rule.trim().toLowerCase())
      .filter(Boolean);
    if (!rules.length) return () => true;
    return (name) => {
      const lower = name.toLowerCase();
      const type = mimeOf(lower);
      return rules.some((rule) =>
        rule.startsWith('.')
          ? lower.endsWith(rule)
          : rule.endsWith('/*')
            ? type.startsWith(rule.slice(0, -1))
            : type === rule,
      );
    };
  };
  const MIME = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    txt: 'text/plain',
    json: 'application/json',
  };
  const mimeOf = (name) => MIME[name.split('.').pop()] ?? '';

  /** File-picker `types` ({ accept: { mime: [exts] } }) as an accept string. */
  const acceptOfTypes = (types = []) =>
    types
      .flatMap((type) =>
        Object.entries(type.accept ?? {}).flatMap(([mime, exts]) => [mime, ...[exts].flat()]),
      )
      .join(',');

  /** Names opened from or saved to MiniNode in this page: saving them again needs no dialog. */
  const linked = new Set();

  const abort = () => new DOMException('The user aborted a request.', 'AbortError');

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const button = (label, className, onClick) =>
    el('button', {
      type: 'button',
      className: `mn-btn ${className}`,
      textContent: label,
      onclick: onClick,
    });

  /** Opens a kit sheet; resolves with what `build(body, foot, done)` passes to done(), or null. */
  const sheet = (title, build) =>
    new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        window.mnui.sheet.close();
        resolve(value);
      };
      const body = el('div', { className: 'mn-sheet-body' }, el('h2', { textContent: title }));
      const foot = el('div', { className: 'mn-sheet-foot' });
      const root = el('div', { className: 'mn-app' }, body, foot);
      build(body, foot, done);
      window.mnui.sheet.open(root, {
        label: title,
        onClose: () => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        },
      });
      root.querySelector('button, input')?.focus();
    });

  const fail = (error) =>
    window.mnui.toast(t('files.error', { message: error?.message ?? String(error) }));

  /** Lets the person pick stored files; resolves with File objects, 'device' or null. */
  function chooseStored(accept, multiple) {
    return sheet(t('files.open.title'), (body, foot, done) => {
      const list = el('div', { className: 'mn-list', role: 'list' });
      const status = el('p', { className: 'mn-muted', textContent: t('files.open.loading') });
      const picked = new Set();
      const openPicked = button('', 'mn-btn--primary', () => load([...picked]));
      openPicked.hidden = true;
      foot.append(
        button(t('files.cancel'), 'mn-btn--ghost', () => done(null)),
        el('span', { className: 'mn-grow' }),
        button(t('files.open.device'), '', () => done('device')),
        openPicked,
      );
      body.append(status, list);

      const load = async (names) => {
        try {
          const client = await mn();
          const files = await Promise.all(
            names.map(async (name) => {
              const blob = await (await fetch(await client.files.url(name))).blob();
              return new File([blob], name, { type: blob.type || mimeOf(name) });
            }),
          );
          for (const name of names) linked.add(name);
          done(files);
        } catch (error) {
          fail(error);
        }
      };

      mn()
        .then((client) => client.files.list())
        .then((names) => {
          const fits = accepts(accept);
          // Folders (no extension) and files the field does not take are left out.
          const shown = names
            .filter((name) => name.includes('.') && fits(name))
            .sort((a, b) => a.localeCompare(b));
          status.textContent = shown.length ? '' : t('files.open.empty');
          status.hidden = shown.length > 0;
          for (const name of shown) {
            const row = el(
              'button',
              { type: 'button', className: 'mn-row mn-row--text' },
              el('span', { className: 'mn-row-title', textContent: name }),
              el('span', { className: 'mn-muted', textContent: t('files.source') }),
            );
            row.onclick = () => {
              if (!multiple) return load([name]);
              if (picked.has(name)) picked.delete(name);
              else picked.add(name);
              row.setAttribute('aria-pressed', String(picked.has(name)));
              openPicked.hidden = picked.size === 0;
              openPicked.textContent = t('files.open.selected', { n: picked.size });
            };
            if (multiple) row.setAttribute('aria-pressed', 'false');
            list.append(el('div', { role: 'listitem' }, row));
          }
        })
        .catch((error) => {
          status.textContent = t('files.error', { message: error?.message ?? String(error) });
        });
    });
  }

  /** Asks where to save `name`; resolves with { to: 'mininode', name } | { to: 'device' } | null. */
  function chooseTarget(suggested) {
    return sheet(t('files.save.title'), (body, foot, done) => {
      const input = el('input', { value: suggested || '', required: true });
      const field = el('label', { className: 'mn-field' }, t('files.save.name'), input);
      const toMiniNode = async () => {
        const name = input.value.trim().replace(/[\\/]/g, '-');
        if (!name) return input.focus();
        try {
          const existing = await (await mn()).files.list();
          if (existing.includes(name) && !window.confirm(t('files.save.replace', { name }))) return;
        } catch (error) {
          return fail(error);
        }
        done({ to: 'mininode', name });
      };
      input.onkeydown = (event) => {
        if (event.key === 'Enter') toMiniNode();
      };
      body.append(field);
      foot.append(
        button(t('files.cancel'), 'mn-btn--ghost', () => done(null)),
        el('span', { className: 'mn-grow' }),
        button(t('files.save.device'), '', () => done({ to: 'device' })),
        button(t('files.save.mininode'), 'mn-btn--primary', toMiniNode),
      );
    });
  }

  async function store(name, blob, toast) {
    await (await mn()).files.upload(name, blob, {
      // The name first: apps label downloads loosely (one sends every export as application/pdf).
      contentType: mimeOf(name) || blob.type || undefined,
    });
    linked.add(name);
    window.mnui.toast(t('files.save.done', { name }), toast);
  }

  /** A file handle that collects what the app writes and stores it in MiniNode on close. */
  const storedHandle = (name, type) => ({
    kind: 'file',
    name,
    async getFile() {
      return new File([], name, { type });
    },
    async createWritable() {
      const parts = [];
      return {
        async write(data) {
          parts.push(data?.type === 'write' ? data.data : data);
        },
        async close() {
          await store(name, new Blob(parts, { type: type || mimeOf(name) }));
        },
        async abort() {
          parts.length = 0;
        },
      };
    },
  });

  // ---- open: file fields and showOpenFilePicker ----
  const nativeInputClick = HTMLInputElement.prototype.click;
  const nativeShowPicker = HTMLInputElement.prototype.showPicker;
  const openField = async (input) => {
    const choice = await chooseStored(input.accept, input.multiple);
    if (choice === 'device') return nativeInputClick.call(input);
    if (!choice) return input.dispatchEvent(new Event('cancel'));
    const transfer = new DataTransfer();
    for (const file of choice) transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const intercepts = (input) => input.type === 'file' && !input.closest('[data-mn-native]');
  HTMLInputElement.prototype.click = function click() {
    if (!intercepts(this)) return nativeInputClick.call(this);
    openField(this);
  };
  if (nativeShowPicker) {
    HTMLInputElement.prototype.showPicker = function showPicker() {
      if (!intercepts(this)) return nativeShowPicker.call(this);
      openField(this);
    };
  }

  const nativeOpenPicker = window.showOpenFilePicker?.bind(window);
  if (nativeOpenPicker) {
    window.showOpenFilePicker = async (options = {}) => {
      const choice = await chooseStored(acceptOfTypes(options.types), Boolean(options.multiple));
      if (choice === 'device') return nativeOpenPicker(options);
      if (!choice) throw abort();
      return choice.map((file) => ({ kind: 'file', name: file.name, getFile: async () => file }));
    };
  }

  // ---- save: showSaveFilePicker and download links ----
  const nativeSavePicker = window.showSaveFilePicker?.bind(window);
  window.showSaveFilePicker = async (options = {}) => {
    const choice = await chooseTarget(options.suggestedName);
    if (!choice) throw abort();
    if (choice.to === 'mininode') {
      const types = Object.keys(options.types?.[0]?.accept ?? {});
      return storedHandle(choice.name, types[0] ?? '');
    }
    if (nativeSavePicker) return nativeSavePicker(options);
    // No native picker (Firefox, Safari): what the app writes becomes a download.
    const name = options.suggestedName ?? 'download';
    return {
      kind: 'file',
      name,
      async createWritable() {
        const parts = [];
        return {
          write: async (data) => parts.push(data?.type === 'write' ? data.data : data),
          close: async () => download(new Blob(parts), name),
          abort: async () => {},
        };
      },
    };
  };

  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  const download = (blob, name) => {
    const link = el('a', { href: URL.createObjectURL(blob), download: name, hidden: true });
    document.body.append(link);
    nativeAnchorClick.call(link);
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  };
  HTMLAnchorElement.prototype.click = function click() {
    if (
      !this.hasAttribute('download') ||
      !this.href.startsWith('blob:') ||
      this.closest('[data-mn-native]')
    )
      return nativeAnchorClick.call(this);
    // Read the file now: the app may revoke its address while the dialog is open.
    const name = this.download || 'download';
    const blob = fetch(this.href).then((response) => response.blob());
    const ask = () =>
      chooseTarget(name).then(async (choice) => {
        if (!choice) return;
        try {
          if (choice.to === 'mininode') await store(choice.name, await blob);
          else download(await blob, name);
        } catch (error) {
          fail(error);
        }
      });
    if (!linked.has(name)) return void ask();
    blob
      .then((file) => store(name, file, { action: { label: t('files.save.as'), onClick: ask } }))
      .catch(fail);
  };
})();
