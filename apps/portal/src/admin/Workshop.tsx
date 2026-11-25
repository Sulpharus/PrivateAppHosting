import { type ReactNode, useId, useMemo, useRef, useState } from 'react';
import { zip } from '../lib/zip.ts';
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
  IMPLIED_REASONS,
  impliedModules,
  type PromptPart,
  slugify,
  starterFiles,
  TASKS,
  type Task,
} from './prompts.ts';

const DESIGN_ARTIFACT = 'https://claude.ai/artifact/LX8pZt1JgeoJZ1eGT9q9Je';

function download(name: string, content: string | Uint8Array, type: string) {
  const part = typeof content === 'string' ? content : new Uint8Array(content);
  const url = URL.createObjectURL(
    new Blob([part], { type: typeof content === 'string' ? `${type};charset=utf-8` : type }),
  );
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

/**
 * A tooltip in plain language: shown while the pointer is over the element or it has keyboard
 * focus, hidden with Escape, and linked with aria-describedby so screen readers read it too.
 */
function Tip({
  text,
  block,
  children,
}: {
  text: string | undefined;
  block?: boolean;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const [hidden, setHidden] = useState(false);
  if (!text) return <>{children(undefined)}</>;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: only relays Escape (WCAG 1.4.13) from the focusable child
    <span
      className={`tip${block ? ' tip--block' : ''}`}
      data-hidden={hidden ? 'true' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !hidden) {
          setHidden(true);
          e.stopPropagation();
        }
      }}
      onMouseLeave={() => setHidden(false)}
      onBlur={() => setHidden(false)}
    >
      {children(id)}
      <span role="tooltip" id={id} className="tip-text">
        {text}
      </span>
    </span>
  );
}

type Tab = 'prompt' | 'knowledge' | 'reference';

const suggestedModules = (type: PromptPart | undefined) => type?.modules ?? [];

export function Workshop() {
  const firstType = LIBRARY.types[0];
  const [brief, setBrief] = useState<Brief>({
    task: 'new',
    name: '',
    idea: '',
    audience: firstType?.audience ?? 'me',
    builder: 'claude',
    type: firstType?.id ?? '',
    modules: suggestedModules(firstType),
    accent: firstType?.accent ?? 'green',
    extra: '',
    findings: '',
    short: false,
  });
  const [accentTouched, setAccentTouched] = useState(false);
  const [audienceTouched, setAudienceTouched] = useState(false);
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<Tab>('prompt');
  const groups = useMemo(() => groupModules(LIBRARY.modules), []);
  const output = useRef<HTMLTextAreaElement>(null);
  const composed = useMemo(() => compose(brief, LIBRARY), [brief]);
  const builder = BUILDERS[brief.builder];
  const implied = impliedModules(brief.audience);
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) =>
    setBrief((b) => ({ ...b, [key]: value }));

  const chooseType = (id: string) => {
    const type = LIBRARY.types.find((t) => t.id === id);
    setBrief((b) => {
      const before = suggestedModules(LIBRARY.types.find((t) => t.id === b.type));
      const kept = b.modules.filter((m) => !before.includes(m));
      return {
        ...b,
        type: id,
        accent: !accentTouched && type?.accent ? type.accent : b.accent,
        audience: !audienceTouched && type?.audience ? type.audience : b.audience,
        modules: [...new Set([...kept, ...suggestedModules(type)])],
      };
    });
  };
  const toggleModule = (id: string) =>
    setBrief((b) => ({
      ...b,
      modules: b.modules.includes(id) ? b.modules.filter((m) => m !== id) : [...b.modules, id],
    }));

  const tabs: { id: Tab; label: string; text: string; file: string }[] = [
    {
      id: 'prompt',
      label: 'Prompt',
      text: composed.prompt,
      file: `prompt-${slugify(brief.name) || 'neue-app'}.md`,
    },
    ...(composed.knowledge
      ? [
          {
            id: 'knowledge' as const,
            label: 'Regeln fürs Wissensfeld',
            text: composed.knowledge,
            file: 'mininode-regeln.md',
          },
        ]
      : []),
    ...(composed.reference && builder.output === 'split'
      ? [
          {
            id: 'reference' as const,
            label: 'Referenzdatei',
            text: composed.reference,
            file: 'MININODE-REFERENCE.md',
          },
        ]
      : []),
  ];
  const shown = tabs.find((t) => t.id === tab) ?? tabs[0];
  const text = shown?.text ?? '';
  const tokens = approxTokens(text);

  const say = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 2500);
  };
  const copyShown = async () => {
    if (await copyText(text)) say(`${shown?.label ?? 'Text'} kopiert`);
    else {
      output.current?.focus();
      output.current?.select();
      say('Kopieren nicht erlaubt: der Text ist markiert, kopiere ihn mit Strg+C.');
    }
  };
  const downloadStarter = () => {
    const files = starterFiles(brief, LIBRARY, composed);
    download(`mininode-${slugify(brief.name) || 'app'}-start.zip`, zip(files), 'application/zip');
    say('Startpaket heruntergeladen');
  };

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>KI-Werkstatt</h1>
        <p className="muted">
          Alles, was eine KI zum Bauen einer App braucht. Der Prompt-Ersteller setzt daraus einen
          Prompt zusammen, der zu deinem Werkzeug passt. Die fertige App lädst du unter Hochladen
          hoch oder legst sie als ZIP in <code>inbox/</code> für <code>/integrate-app</code>.
        </p>
      </div>

      <section className="card" aria-labelledby="composer-title">
        <h2 id="composer-title" className="section-title">
          Prompt-Ersteller
        </h2>
        <div className="workshop-grid">
          <form className="stack workshop-form" onSubmit={(e) => e.preventDefault()}>
            <fieldset className="workshop-set">
              <legend>Was soll die KI tun?</legend>
              <div className="workshop-chips">
                {(Object.entries(TASKS) as [Task, (typeof TASKS)[Task]][]).map(([id, t]) => (
                  <Tip key={id} text={t.when}>
                    {(describedBy) => (
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={brief.task === id}
                        aria-describedby={describedBy}
                        onClick={() => set('task', id)}
                      >
                        {t.label}
                      </button>
                    )}
                  </Tip>
                ))}
              </div>
            </fieldset>

            <label className="field">
              <span>{brief.task === 'new' ? 'Name der App' : 'Name der bestehenden App'}</span>
              <input
                value={brief.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="z. B. Bücherregal"
                autoComplete="off"
              />
            </label>
            {brief.task === 'fix' ? (
              <label className="field">
                <span>Meldungen von „mininode doctor“ oder vom Upload</span>
                <textarea
                  rows={6}
                  value={brief.findings}
                  onChange={(e) => set('findings', e.target.value)}
                  placeholder="z. B. error  manifest  mininode.json: unknown key accent"
                />
              </label>
            ) : (
              <label className="field">
                <span>
                  {brief.task === 'new' ? 'Was soll die App können?' : 'Was soll dazukommen?'}
                </span>
                <textarea
                  rows={5}
                  value={brief.idea}
                  onChange={(e) => set('idea', e.target.value)}
                  placeholder="z. B. Ich will festhalten, welche Bücher ich lese, mit Bewertung, Notizen und einer Wunschliste. Eine Jahresstatistik wäre schön."
                />
              </label>
            )}

            <fieldset className="workshop-set">
              <legend>Art der Anwendung</legend>
              <div className="workshop-chips">
                {LIBRARY.types.map((t) => (
                  <Tip key={t.id} text={t.when}>
                    {(describedBy) => (
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={brief.type === t.id}
                        aria-describedby={describedBy}
                        onClick={() => chooseType(t.id)}
                      >
                        {t.title}
                      </button>
                    )}
                  </Tip>
                ))}
              </div>
              <p className="muted small-text">
                {LIBRARY.types.find((t) => t.id === brief.type)?.summary}. Passende Funktionen sind
                vorgewählt.
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
                      `${m.title} ${m.summary} ${m.when ?? ''}`.toLowerCase().includes(needle),
                    )
                  : group.parts;
                if (parts.length === 0) return null;
                const chosen = group.parts.filter(
                  (m) => brief.modules.includes(m.id) || implied.includes(m.id),
                ).length;
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
                      {parts.map((m) => {
                        const auto = implied.includes(m.id);
                        return (
                          <Tip key={m.id} text={m.when} block>
                            {(describedBy) => (
                              <label>
                                <input
                                  type="checkbox"
                                  checked={auto || brief.modules.includes(m.id)}
                                  disabled={auto}
                                  aria-describedby={describedBy}
                                  onChange={() => toggleModule(m.id)}
                                />
                                <span>
                                  {m.title}
                                  <small className="muted">
                                    {auto
                                      ? `${IMPLIED_REASONS[m.id] ?? 'Automatisch dabei.'} `
                                      : ''}
                                    {m.summary}
                                  </small>
                                </span>
                              </label>
                            )}
                          </Tip>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
              <p className="muted small-text">
                {[...new Set([...implied, ...brief.modules])].length} Funktionen im Prompt. Fahre
                mit der Maus über eine Funktion oder wähle sie mit der Tastatur, um zu sehen, wann
                sie passt.
              </p>
            </fieldset>

            <div className="workshop-two">
              <label className="field">
                <span>Wer nutzt sie?</span>
                <select
                  value={brief.audience}
                  onChange={(e) => {
                    setAudienceTouched(true);
                    set('audience', e.target.value as Audience);
                  }}
                >
                  {Object.entries(AUDIENCES).map(([id, a]) => (
                    <option key={id} value={id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <small className="muted">{AUDIENCES[brief.audience].when}</small>
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
              <span>Womit baust du sie?</span>
              <select
                value={brief.builder}
                onChange={(e) => {
                  set('builder', e.target.value as Builder);
                  setTab('prompt');
                }}
              >
                {Object.entries(BUILDERS).map(([id, b]) => (
                  <option key={id} value={id}>
                    {b.label}
                  </option>
                ))}
              </select>
              <small className="muted">{builder.when}</small>
            </label>
            <div className="workshop-steps">
              <strong>So gehst du vor</strong>
              <ol>
                {builder.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
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
              <Tip
                block
                text="Kürzt Designsystem und Sprachanleitung auf das Nötigste. Nur nehmen, wenn das Werkzeug den langen Prompt nicht annimmt."
              >
                {(describedBy) => (
                  <label>
                    <input
                      type="checkbox"
                      checked={brief.short}
                      aria-describedby={describedBy}
                      onChange={(e) => set('short', e.target.checked)}
                    />
                    <span>
                      Kurzfassung
                      <small className="muted">Für Werkzeuge mit kleinem Prompt-Limit</small>
                    </span>
                  </label>
                )}
              </Tip>
            </div>
          </form>

          <div className="stack workshop-output">
            {tabs.length > 1 && (
              <fieldset className="workshop-set">
                <legend className="sr-only">Teile des Prompts</legend>
                <div className="workshop-chips">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="chip"
                      aria-pressed={shown?.id === t.id}
                      onClick={() => setTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="muted" style={{ flex: 1, minWidth: 200 }}>
                {text.length.toLocaleString('de-DE')} Zeichen, etwa{' '}
                {tokens.gpt.toLocaleString('de-DE')} Tokens bei GPT und Gemini,{' '}
                {tokens.claude.toLocaleString('de-DE')} bei Claude
              </span>
              {builder.layout !== null && (
                <Tip
                  text={
                    brief.task === 'new'
                      ? 'Ein ZIP mit App Kit, Vorschau-SDK, Sprachdateien, mininode.json, Startseite, Regeln und Referenz. Damit läuft die App schon im Werkzeug, ohne dass die KI etwas nachbaut.'
                      : 'Ein ZIP mit App Kit, Vorschau-SDK, Regeln und Referenz, ohne neue mininode.json oder Startseite: die Dateien der bestehenden App bleiben, wie sie sind.'
                  }
                >
                  {(describedBy) => (
                    <button
                      type="button"
                      className="button"
                      aria-describedby={describedBy}
                      onClick={downloadStarter}
                    >
                      Startpaket (ZIP)
                    </button>
                  )}
                </Tip>
              )}
              <button
                type="button"
                className="button"
                onClick={() => shown && download(shown.file, shown.text, 'text/markdown')}
              >
                Herunterladen
              </button>
              <button type="button" className="button primary" onClick={copyShown}>
                {shown?.label ?? 'Prompt'} kopieren
              </button>
            </div>
            <p className="muted" role="status" aria-live="polite">
              {status}
            </p>
            <label className="sr-only" htmlFor="prompt-output">
              {shown?.label ?? 'Prompt'}
            </label>
            <textarea
              id="prompt-output"
              ref={output}
              className="mono workshop-prompt"
              readOnly
              value={text}
              spellCheck={false}
            />
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="files-title">
        <h2 id="files-title" className="section-title">
          Dateien für die KI
        </h2>
        <p className="muted">
          Einzeln, falls du sie ohne den Prompt-Ersteller brauchst. Der Prompt und das Startpaket
          enthalten sie schon.
        </p>
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
    </>
  );
}
