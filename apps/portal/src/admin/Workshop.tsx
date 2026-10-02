import { useMemo, useRef, useState } from 'react';
import { FILES, LIBRARY } from './library.ts';
import {
  ACCENTS,
  AUDIENCES,
  type Audience,
  approxTokens,
  type Brief,
  BUILDERS,
  type Builder,
  compose,
  groupModules,
  slugify,
} from './prompts.ts';

const DESIGN_ARTIFACT = 'https://claude.ai/artifact/LX8pZt1JgeoJZ1eGT9q9Je';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const kb = (text: string) => `${Math.max(1, Math.round(new Blob([text]).size / 1024))} KB`;

/** Copies text; returns false when the browser refuses (the caller then selects it instead). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function Workshop() {
  const [brief, setBrief] = useState<Brief>({
    name: '',
    idea: '',
    audience: 'me',
    builder: 'claude-artifact',
    type: LIBRARY.types[0]?.id ?? '',
    modules: [],
    accent: LIBRARY.types[0]?.accent ?? 'green',
    extra: '',
    short: false,
    embedKit: false,
  });
  const [accentTouched, setAccentTouched] = useState(false);
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => groupModules(LIBRARY.modules), []);
  const output = useRef<HTMLTextAreaElement>(null);
  const prompt = useMemo(() => compose(brief, LIBRARY), [brief]);
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) =>
    setBrief((b) => ({ ...b, [key]: value }));

  const chooseType = (id: string) => {
    const type = LIBRARY.types.find((t) => t.id === id);
    setBrief((b) => ({
      ...b,
      type: id,
      accent: !accentTouched && type?.accent ? type.accent : b.accent,
    }));
  };
  const toggleModule = (id: string) =>
    setBrief((b) => ({
      ...b,
      modules: b.modules.includes(id) ? b.modules.filter((m) => m !== id) : [...b.modules, id],
    }));

  const say = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 2500);
  };
  const copyPrompt = async () => {
    if (await copyText(prompt)) say('Prompt kopiert');
    else {
      output.current?.focus();
      output.current?.select();
      say('Kopieren nicht erlaubt: der Prompt ist markiert, kopiere ihn mit Strg+C.');
    }
  };
  const fileName = `prompt-${slugify(brief.name) || 'neue-app'}.md`;
  const artifact = brief.builder === 'claude-artifact';

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>KI-Werkstatt</h1>
        <p className="muted">
          Alles, was eine KI zum Bauen einer neuen App braucht. Der Prompt-Ersteller setzt daraus
          einen vollständigen Prompt für deine Idee zusammen. Die fertige App kommt als ZIP in{' '}
          <code>inbox/</code> und wird mit <code>/integrate-app</code> eingebunden.
        </p>
      </div>

      <section className="card" aria-labelledby="files-title">
        <h2 id="files-title" className="section-title">
          Dateien für die KI
        </h2>
        {FILES.map((file) => (
          <div key={file.name} className="row workshop-file">
            <span className="workshop-file-text">
              <strong>{file.title}</strong>
              <span className="mono muted">
                {file.name} · {kb(file.content)}
              </span>
              <span className="muted">{file.description}</span>
            </span>
            <span className="row workshop-file-actions">
              <button
                type="button"
                className="button small"
                onClick={async () =>
                  say(
                    (await copyText(file.content))
                      ? `${file.name} kopiert`
                      : 'Kopieren nicht erlaubt',
                  )
                }
              >
                Kopieren
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => download(file.name, file.content, file.type)}
              >
                Herunterladen
              </button>
            </span>
          </div>
        ))}
        <p className="muted">
          Das Designsystem gibt es auch als durchsuchbares{' '}
          <a href={DESIGN_ARTIFACT} target="_blank" rel="noopener">
            claude.ai-Artifact mit Live-Vorschau
          </a>
          . Die Schema-Datei für <code>mininode.json</code> liegt unter{' '}
          <a href="/schema/mininode.json" target="_blank" rel="noopener">
            /schema/mininode.json
          </a>
          .
        </p>
      </section>

      <section className="card" aria-labelledby="composer-title">
        <h2 id="composer-title" className="section-title">
          Prompt-Ersteller
        </h2>
        <div className="workshop-grid">
          <form className="stack workshop-form" onSubmit={(e) => e.preventDefault()}>
            <label className="field">
              <span>Name der App</span>
              <input
                value={brief.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="z. B. Bücherregal"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Was soll die App können?</span>
              <textarea
                rows={5}
                value={brief.idea}
                onChange={(e) => set('idea', e.target.value)}
                placeholder="z. B. Ich will festhalten, welche Bücher ich lese, mit Bewertung, Notizen und einer Wunschliste. Eine Jahresstatistik wäre schön."
              />
            </label>

            <fieldset className="workshop-set">
              <legend>Art der Anwendung</legend>
              <div className="workshop-chips">
                {LIBRARY.types.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="chip"
                    aria-pressed={brief.type === t.id}
                    title={t.summary}
                    onClick={() => chooseType(t.id)}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
              <p className="muted small-text">
                {LIBRARY.types.find((t) => t.id === brief.type)?.summary}
              </p>
            </fieldset>

            <fieldset className="workshop-set">
              <legend>Funktionen</legend>
              <label className="field">
                <span className="sr-only">Funktionen durchsuchen</span>
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Funktion suchen, z. B. Kamera, Geld, Spiel"
                  autoComplete="off"
                />
              </label>
              {groups.map((group) => {
                const needle = filter.trim().toLowerCase();
                const parts = needle
                  ? group.parts.filter((m) =>
                      `${m.title} ${m.summary}`.toLowerCase().includes(needle),
                    )
                  : group.parts;
                if (parts.length === 0) return null;
                const chosen = group.parts.filter((m) => brief.modules.includes(m.id)).length;
                return (
                  <details
                    key={group.id}
                    className="workshop-group"
                    open={needle ? true : undefined}
                  >
                    <summary>
                      <span className="workshop-group-title">{group.label}</span>
                      <span className="muted small-text">{group.hint}</span>
                      <span className={`pill${chosen ? ' accent' : ''}`}>
                        {chosen > 0 ? `${chosen} gewählt` : `${group.parts.length}`}
                      </span>
                    </summary>
                    <div className="workshop-checks">
                      {parts.map((m) => (
                        <label key={m.id}>
                          <input
                            type="checkbox"
                            checked={brief.modules.includes(m.id)}
                            onChange={() => toggleModule(m.id)}
                          />
                          <span>
                            {m.title}
                            <small className="muted">{m.summary}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
              {brief.modules.length > 0 && (
                <p className="muted small-text">
                  {brief.modules.length} {brief.modules.length === 1 ? 'Funktion' : 'Funktionen'}{' '}
                  gewählt:{' '}
                  {LIBRARY.modules
                    .filter((m) => brief.modules.includes(m.id))
                    .map((m) => m.title)
                    .join(', ')}
                </p>
              )}
            </fieldset>

            <div className="workshop-two">
              <label className="field">
                <span>Wer nutzt sie?</span>
                <select
                  value={brief.audience}
                  onChange={(e) => set('audience', e.target.value as Audience)}
                >
                  {Object.entries(AUDIENCES).map(([id, a]) => (
                    <option key={id} value={id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Wo baust du sie?</span>
                <select
                  value={brief.builder}
                  onChange={(e) => set('builder', e.target.value as Builder)}
                >
                  {Object.entries(BUILDERS).map(([id, b]) => (
                    <option key={id} value={id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Akzentfarbe</span>
                <select
                  value={brief.accent}
                  onChange={(e) => {
                    setAccentTouched(true);
                    set('accent', e.target.value);
                  }}
                >
                  {ACCENTS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>Weitere Anforderungen (optional)</span>
              <textarea
                rows={3}
                value={brief.extra}
                onChange={(e) => set('extra', e.target.value)}
                placeholder="z. B. Sortierung nach Autor, Export als CSV, keine KI"
              />
            </label>

            <div className="workshop-checks">
              <label>
                <input
                  type="checkbox"
                  checked={brief.short}
                  onChange={(e) => set('short', e.target.checked)}
                />
                <span>
                  Kurzfassung der Spezifikation
                  <small className="muted">Für Tools mit kleinem Prompt-Limit</small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={artifact || brief.embedKit}
                  disabled={artifact}
                  onChange={(e) => set('embedKit', e.target.checked)}
                />
                <span>
                  App-Kit-CSS in den Prompt einbetten
                  <small className="muted">
                    {artifact
                      ? 'Für Claude-Artifacts immer enthalten, weil es dort kein /_mininode/ui.css gibt'
                      : 'Sonst lädt die App es von MiniNode'}
                  </small>
                </span>
              </label>
            </div>
          </form>

          <div className="stack workshop-output">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="muted" style={{ flex: 1 }}>
                {prompt.length.toLocaleString('de-DE')} Zeichen, etwa{' '}
                {approxTokens(prompt).toLocaleString('de-DE')} Tokens
              </span>
              <button
                type="button"
                className="button"
                onClick={() => download(fileName, prompt, 'text/markdown')}
              >
                Herunterladen
              </button>
              <button type="button" className="button primary" onClick={copyPrompt}>
                Prompt kopieren
              </button>
            </div>
            <p className="muted" role="status" aria-live="polite">
              {status}
            </p>
            <label className="sr-only" htmlFor="prompt-output">
              Fertiger Prompt
            </label>
            <textarea
              id="prompt-output"
              ref={output}
              className="mono workshop-prompt"
              readOnly
              value={prompt}
              spellCheck={false}
            />
          </div>
        </div>
      </section>
    </>
  );
}
