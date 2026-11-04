// MIDI keyboards through Web MIDI. The browser asks once for permission ("MIDI-Keyboard" in the
// MiniNode bar; later starts connect by themselves). The inputs go to the editor's MIDI port
// (patches/mininode.patch, WebMidiInPort), which chooses one like the desktop app does
// (Einstellungen → Noteneingabe/MIDI-Geräte) and asks the page to listen to it.

const t = (key, params = {}) => {
  const text = window.mnI18n?.t(key, params);
  return text && text !== key ? text : key;
};

/** One Web MIDI message as the editor's MIDI 1.0 package, or null for SysEx and real-time bytes. */
export function midiPackage(data) {
  const [status = 0, data1 = 0, data2 = 0] = data;
  if (status < 0x80 || status >= 0xf0) return null;
  return (status | ((data1 & 0x7f) << 8) | ((data2 & 0x7f) << 16)) >>> 0;
}

/** The inputs as the editor reads them: "id\tname" per line (tabs and new lines removed). */
export function deviceList(inputs) {
  const clean = (text) =>
    String(text ?? '')
      .replace(/[\t\n\r]+/g, ' ')
      .trim();
  return [...inputs]
    .filter((input) => input.state !== 'disconnected' && clean(input.id))
    .map((input) => `${clean(input.id)}\t${clean(input.name) || clean(input.id)}`)
    .join('\n');
}

export function installMidi(Module) {
  const button = document.getElementById('mn-midi');
  if (!navigator.requestMIDIAccess || !button) return;
  let access = null;
  let listened = '';

  const onMessage = (event) => {
    const pkg = midiPackage(event.data);
    if (pkg !== null) Module.ccall('mnMidiIn', null, ['number'], [pkg]);
  };
  const listen = () => {
    for (const input of access?.inputs.values() ?? []) {
      input.onmidimessage = input.id === listened ? onMessage : null;
    }
  };
  const report = () => {
    if (!access || !Module.mnMidiPortReady) return;
    Module.ccall('mnMidiDevices', null, ['string'], [deviceList(access.inputs.values())]);
  };
  Module.mnMidiReady = report;
  Module.mnMidiConnect = (id) => {
    listened = id;
    listen();
  };

  const connect = async () => {
    access = await navigator.requestMIDIAccess();
    access.onstatechange = () => {
      listen();
      report();
    };
    button.hidden = true;
    listen();
    report();
  };

  button.addEventListener('click', () =>
    connect().catch(() => {
      button.textContent = t('midi.denied');
      button.disabled = true;
    }),
  );
  // Asked before: connect without a click. Otherwise the button asks.
  Promise.resolve(navigator.permissions?.query({ name: 'midi' }))
    .then((status) => (status?.state === 'granted' ? connect() : Promise.reject()))
    .catch(() => {
      if (!access) button.hidden = false;
    });
}
