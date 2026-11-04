# MuseScore Studio

The MuseScore Studio desktop editor (notation: write, play back, export scores) compiled to
WebAssembly and served behind the gate at `musescore.<domain>`. It is the desktop program, not
upstream's reduced web viewer: dock panels, palettes, inspector, mixer, workspaces, preferences, every
import and export. Scores open from and save to the person's MiniNode files (Supabase Storage,
private per person) or their device.

## Origin

[musescore/MuseScore](https://github.com/musescore/MuseScore), tag `v4.7.6`
(`source.json`: version, commit), GPL-3.0. The SoundFont "MS Basic" ships with MuseScore under the
MIT licence. Both licences, the source address and our patch are served with the app under
`licenses/`.

## How it is built

Upstream has an experimental web configuration (`app-web`). It builds a small separate shell
without the desktop UI, most imports/exports and workspaces, and keeps files in memory only.
`patches/mininode.patch` adds a configuration `app-mininode` instead: the desktop application for
WebAssembly.

- **Configuration** (`SetupConfigure.cmake`): the desktop shell (`src/appshell`), dock windows,
  workspaces, shortcuts, languages, accessibility, extensions (plugins), braille, every
  import/export module and audio export. Off: what a browser tab cannot do (VST, audio plugins,
  MIDI devices, multiple windows, printing through Qt, video export) and every online service
  (MuseScore.com account and cloud, MuseHub/Muse Sounds, Learn, update check, crash reports).
- **Framework switch `MUSE_WEB_DESKTOP`**: the real (Emscripten) file system instead of upstream's
  in-memory map, so `QFile` and MuseScore's own file layer see the same files; synchronous file
  dialogs (`WebInteractive::select…Sync`) ask the page (`Module.mnFileDialog`) and wait in a
  nested event loop; the editor's language follows `MININODE_LANGUAGE` from the page.
- **No promotions**: no welcome dialog (it advertises Muse Sounds Pro, MuseScore.com, tutorials),
  no "MuseSounds" and "Learn" pages on Home, no "My online scores" tab, no "Save to cloud",
  "Publish online" or "Share on Audio.com". Licence, credits and the source link stay.
- **Qt for WebAssembly from source** (`toolchain/build-qt.sh`, Qt 6.10.2 from GitHub): static,
  single thread, `-optimize-size`, wasm exceptions and **JSPI**, so Qt's nested event loops (modal
  dialogs) work without Asyncify's size cost. JSPI needs Chrome or Edge 137+ (Firefox and Safari:
  not supported yet). The official Qt binaries have no JSPI. `toolchain/qt-<module>.patch` fixes Qt
  itself and ships with the app's licences: the queue of events taken while the editor waits stays
  consistent when a handler runs a nested event loop, and a paste keeps the app's own clipboard data
  (MuseScore's notes) while the page kept the focus since the app copied it.
- **Emscripten** 4.0.7, as upstream (`toolchain/env.sh`).

`node build.mjs --source` clones the tag, applies the patch, builds Qt (once, into `.cache/qt`, or
`MUSESCORE_QT_PREFIX`) and MuseScore (`toolchain/build-musescore.sh`), compiles the translations
(`lrelease`; without Qt's tools PySide6's copy from PyPI) and writes `.cache/source-<key>.zip`.
The key covers version, commit, patches and toolchain. A first build takes several hours (Qt about
two, MuseScore about one and a half on four cores); `ccache` shortens later ones.

`node build.mjs` then writes `dist/`:

- `web/` (the page) and `i18n/`;
- `MuseScoreStudio-<hash>.wasm.br`: the editor, Brotli quality 11, named after its content; the
  gate serves it with `Content-Encoding: br` and a year of caching (`"wasm": true`);
- `muse-audio-<hash>.js`: the audio engine and its worklet glue in one file (upstream builds a
  `blob:` script at run time, which the CSP forbids);
- `share-<hash>.pack.gz`: templates, instruments, styles, workspaces, wallpapers, plugins and the
  translations as one archive, unpacked in the browser into `/files/share`;
- `ms-basic-<hash>.sf3.0`, `.1`, …: the SoundFont in parts below the 25 MiB asset limit;
- `licenses/`: GPL text, SoundFont licence, `mininode.patch`, `SOURCE.md`.

## The page (`web/`)

- `mn-musescore.js`: login, language, start (Qt's loader), file dialogs, saving, user data.
- **Open**: MiniNode's dialog (kit `files.js`): the person's files in MiniNode or the device. A
  file from MiniNode is placed at `/mininode/<name>`, one from the device below `/mn-save/<n>/`
  with its file handle, so **Save** goes back to where the score came from, like on a desktop.
- **Save as, Export**: the editor asks for a path; the page shows MiniNode's save dialog and
  answers with `/mininode/<name>` (MiniNode) or `/mn-save/<n>/<name>` (device). Each file the
  editor finishes there (hooked `FS.close`) goes to that place: uploaded to the person's MiniNode
  files (Supabase Storage) or written to the device file. MuseScore's temporary `…_saving` file and
  its hidden `.mscbackup` folder stay in the editor. Further files of one export (parts) go to the
  same place under their own names (on the device: as downloads).
- **Open recent** after a reload: a score at `/mininode/<name>` that is not in the editor yet is
  fetched from MiniNode first (`muse::web::fetchFile`). Device files in the recent list cannot be
  reopened after a reload (no lasting handle); open them again from the device.
- **Print**: File → Print writes the score as PDF and opens it in the browser's PDF viewer.
- **User data**: `/files/data` (settings `.ini`, workspaces, palettes, plugins, recent list) lives
  in IndexedDB (IDBFS), written back a moment after each change and when the tab is hidden, and
  follows the person to other browsers (`mn-sync.js`): a snapshot `.musescore-data.zip` in their
  MiniNode files and its stamp in `mn.kv` (`dataStamp`). A newer snapshot from another device
  replaces this browser's copy before the editor starts; a change is stored 15 seconds later.
- **Daten** in the MiniNode strip exports all scores from MiniNode and the user data as one ZIP
  and imports such a ZIP (`mn-data.js`).
- **Audio** (`mn-audio.js`): the engine runs in an AudioWorklet; it starts with the first click
  (browsers allow sound only after a user gesture). The SoundFont loads in the background after
  the editor is up (`mn-soundfont.js`) and stays in Cache Storage.
- **Languages**: the page has `i18n/de.json` and `i18n/en.json`. The editor follows the MiniNode
  language: English is MuseScore's own, German is compiled from `musescore_de.ts` and
  `instruments_de.ts`. Other languages: add their code to `languages` in `source.json`.

## Plugins

MuseScore plugins are QML files run by the editor's plugin engine, so they work unchanged when
they are written for MuseScore 4.4+ (Qt 6). They are shared by everyone who has the app: each is a
ZIP in the app's shared files (`plugins/<id>@<hash>.zip`), unpacked into `/files/plugins` (the
editor's plugin folder in this build) before the editor starts and cached in Cache Storage.

- **Plugins panel** (`mn-plugins.js`; "Plugins" in the MiniNode strip, and "Manage plugins…" on
  MuseScore's Plugins page, which opens `mininode:plugins`): add a `.qml` file or a zipped plugin
  folder, remove one (for everyone). After adding, "Reload plugins" in MuseScore picks it up; each
  person enables plugins for themselves (they start disabled, as on the desktop).
- **AI prompt** (`mn-plugin-prompt.js`, German and English): for a plugin written for Qt 5 or for
  the desktop (external programs, files on the computer, other websites). Copy it into any AI tool
  with the plugin's files; it answers with corrected files and how to install them.
- Anyone with the app can add and remove plugins, and a plugin is code that runs in the editor of
  whoever enables it. Restricting this to admins would need a storage rule.

## Sound library

`mn-sounds.js` ("Klänge" in the MiniNode strip): folders of sounds in the person's files
(`sounds/<folder>/…`, private) or the shared ones (everyone), created and deleted in the panel.

- **SoundFonts** (`.sf2`, `.sf3`) are added to MuseScore as they are (`addSoundFont`) and appear in
  the mixer's sound list. Files above 45 MB are stored as `.part0`, `.part1`, … (the storage takes
  at most 50 MB per file) and joined in the browser.
- **Sound effects** (WAV, MP3, OGG, FLAC, M4A …): the audio files of a folder become one SoundFont
  named after the folder, built in the browser (`mn-sf2.js`: decoded to 44.1 kHz, stereo as a
  linked pair, one key per sound from C4 in alphabetical order, no loop). The panel shows each
  sound's key. In the mixer, set a staff's sound to it and write notes on those keys.
- **Per person:** which folders load is a setting (`mn.kv` key `sounds`: `{ off: ["shared:Name"] }`).
  Switching a folder on loads it at once; switching it off or deleting files takes effect at the
  next start (MuseScore cannot unload a SoundFont).
- Effects in the mixer: MuseScore's own reverb and equaliser. VST effects and instruments, Muse
  Sounds and other Muse Hub content cannot run in a browser.

## Data

`data.mode: private`: scores and exports are files in the person's own folder of this app
(`mn.files`), with the hidden settings snapshot `.musescore-data.zip`, and the private sound
folders (`sounds/`). Shared files: `plugins/` and the shared `sounds/` folders. `mn.kv` holds two
settings (`dataStamp`, `sounds`). Nothing in tables.

## Requirements

Chrome or Edge 137 or newer on a desktop computer (JSPI); about 1 GB of memory for large scores.
Mobile is not a target.

## Updating

Set `version` and `commit` in `source.json` (and the toolchain versions in `toolchain/env.sh` to
what upstream's `build_wasm.yml` uses), then `node build.mjs --source`. A patch that no longer
applies stops the build: rebase it in `.cache/src-<version>` (`git apply --3way`) and save it again
with `git diff > patches/mininode.patch`. Qt patches are made the same way in a clone of the Qt module
(`git diff > toolchain/qt-qtbase.patch`); they change the Qt cache key in CI, so Qt is built again once.

## State

Work in progress: see `docs/STATUS.md` for what runs and what is still open.
