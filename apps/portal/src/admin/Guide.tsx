import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { headingId, renderMarkdown } from '../lib/markdown.ts';
import { findArticle, GUIDE_SLUG } from '../lib/wiki.ts';
import { parseGuide } from '../lib/wikiLib.ts';
import { Prose } from './Wiki.tsx';

// Verwaltung → Wissen → Startup-Guide: the first steps as a checklist (docs/wiki/startup-guide.md,
// one `## ` heading per step). What is done is remembered in this browser only.

const KEY = 'mn-guide-done';

function readDone(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return new Set(
      Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function writeDone(done: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...done]));
  } catch {
    // Storage blocked: the list still works for this visit.
  }
}

export function Guide() {
  const article = findArticle(GUIDE_SLUG);
  const guide = useMemo(() => (article ? parseGuide(article.body, headingId) : null), [article]);
  const [done, setDone] = useState<Set<string>>(() => readDone());
  const [open, setOpen] = useState<string | null>(null);

  if (!guide) return <p className="empty">Der Startup-Guide fehlt (docs/wiki/startup-guide.md).</p>;
  const steps = guide.steps;
  const finished = steps.filter((step) => done.has(step.id)).length;
  const firstOpen = open ?? steps.find((step) => !done.has(step.id))?.id ?? null;

  // Saved when the person changes something, never on load: another tab's progress stays.
  const change = (next: Set<string>) => {
    setDone(next);
    writeDone(next);
  };
  const toggle = (id: string) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    change(next);
  };

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Startup-Guide</h1>
        <Prose html={renderMarkdown(guide.intro).html} className="muted" />
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong role="status">
            {finished} von {steps.length} Schritten erledigt
          </strong>
          {finished > 0 && (
            <button type="button" className="button small" onClick={() => change(new Set())}>
              Zurücksetzen
            </button>
          )}
        </div>
        <progress
          className="guide-bar"
          value={finished}
          max={steps.length}
          aria-label="Fortschritt"
        />
        <p className="muted" style={{ fontSize: 14 }}>
          Der Fortschritt wird nur in diesem Browser gemerkt. Mehr zu jedem Thema im{' '}
          <Link to="/admin/wiki">Wiki</Link>.
        </p>
      </div>

      <ol className="guide-steps">
        {steps.map((step, index) => {
          const isDone = done.has(step.id);
          const isOpen = firstOpen === step.id;
          return (
            <li key={step.id} className={`card guide-step${isDone ? ' is-done' : ''}`}>
              <div className="row guide-head">
                <label className="guide-check">
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => toggle(step.id)}
                    aria-label={`Schritt ${index + 1} erledigt: ${step.title}`}
                  />
                </label>
                <button
                  type="button"
                  className="guide-title"
                  aria-expanded={isOpen}
                  aria-controls={`step-${step.id}`}
                  onClick={() => setOpen(isOpen ? '' : step.id)}
                >
                  <span className="muted mono">{index + 1}</span>
                  <strong>{step.title}</strong>
                </button>
              </div>
              {isOpen && (
                <Prose
                  html={renderMarkdown(step.body, { idPrefix: `${step.id}-` }).html}
                  id={`step-${step.id}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
