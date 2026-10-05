import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { renderMarkdown } from '../lib/markdown.ts';
import { findArticle, WIKI_ARTICLES } from '../lib/wiki.ts';
import { type Article, CATEGORIES, searchArticles } from '../lib/wikiLib.ts';

// Verwaltung → Wissen → Wiki: knowledge articles about MiniNode, written in docs/wiki (and the
// reference pages generated from the repository). Every article has an "Bearbeiten" link to its
// file on GitHub: the wiki is updated together with the system (docs/wiki/wissen-pflegen.md).

const REPO = 'https://github.com/Sulpharus/PrivateAppHosting';

/**
 * Rendered Markdown. Internal links navigate without a page load; the listener sits on the
 * container (not as a JSX handler), because the links are part of the generated HTML.
 */
export function Prose({ html, className = '' }: { html: string; className?: string }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (href.startsWith('/')) {
        event.preventDefault();
        navigate(href);
      } else if (href.startsWith('#')) {
        event.preventDefault();
        document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    element.addEventListener('click', onClick);
    return () => element.removeEventListener('click', onClick);
  }, [navigate]);
  return (
    <div
      ref={ref}
      className={`wiki-prose ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the Markdown renderer escapes all text and allows only its own tags
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function Wiki() {
  const { slug } = useParams();
  return slug ? <ArticleView slug={slug} /> : <Index />;
}

function Index() {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchArticles(WIKI_ARTICLES, query), [query]);
  const searching = query.trim().length > 0;

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Wiki</h1>
        <p className="muted">
          Alles, was du über MiniNode wissen musst: wie die Teile zusammenspielen, wie du Apps
          hinzufügst und verwaltest, was bei Problemen hilft. Neu hier? Beginne mit dem{' '}
          <Link to="/admin/guide">Startup-Guide</Link>.
        </p>
      </div>

      <label className="field">
        Suchen
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="z. B. Sicherung, Passkey, Hochladen"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      {searching ? (
        <div className="stack" style={{ gap: 10 }} aria-live="polite">
          <h2 className="section-title">
            {hits.length === 0
              ? 'Nichts gefunden'
              : `${hits.length} ${hits.length === 1 ? 'Artikel' : 'Artikel'}`}
          </h2>
          {hits.map((article) => (
            <ArticleLink key={article.slug} article={article} />
          ))}
        </div>
      ) : (
        CATEGORIES.map((category) => {
          const list = WIKI_ARTICLES.filter((article) => article.category === category.id);
          if (list.length === 0) return null;
          return (
            <section key={category.id} className="stack" style={{ gap: 10 }}>
              <div>
                <h2 className="section-title">{category.label}</h2>
                <p className="muted">{category.hint}</p>
              </div>
              <div className="wiki-grid">
                {list.map((article) => (
                  <ArticleLink key={article.slug} article={article} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function ArticleLink({ article }: { article: Article }) {
  return (
    <Link to={`/admin/wiki/${article.slug}`} className="card wiki-link">
      <strong>{article.title}</strong>
      <span className="muted">{article.summary}</span>
    </Link>
  );
}

function ArticleView({ slug }: { slug: string }) {
  const article = findArticle(slug);
  const rendered = useMemo(() => (article ? renderMarkdown(article.body) : null), [article]);
  if (!article || !rendered)
    return (
      <div className="stack">
        <Link to="/admin/wiki" className="muted">
          ← Alle Artikel
        </Link>
        <h1 style={{ fontSize: 36 }}>Diesen Artikel gibt es nicht</h1>
        <p className="muted">Vielleicht wurde er umbenannt. Such ihn im Wiki.</p>
      </div>
    );
  const category = CATEGORIES.find((c) => c.id === article.category);
  const sections = rendered.headings.filter((h) => h.level === 2);
  const siblings = WIKI_ARTICLES.filter((a) => a.category === article.category);
  const index = siblings.findIndex((a) => a.slug === article.slug);
  const previous = siblings[index - 1];
  const next = siblings[index + 1];

  return (
    <article className="stack wiki-article" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 6 }}>
        <Link to="/admin/wiki" className="muted">
          ← Wiki{category ? ` · ${category.label}` : ''}
        </Link>
        <h1 style={{ fontSize: 36 }}>{article.title}</h1>
        {article.summary && <p className="muted">{article.summary}</p>}
      </div>

      {sections.length > 2 && (
        <nav aria-label="Inhalt dieses Artikels" className="card wiki-toc">
          <strong>Inhalt</strong>
          <ul>
            {sections.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <Prose html={rendered.html} />

      <div className="row wiki-foot">
        {previous ? (
          <Link to={`/admin/wiki/${previous.slug}`} className="button small">
            ← {previous.title}
          </Link>
        ) : (
          <span />
        )}
        <span className="spacer" />
        {next && (
          <Link to={`/admin/wiki/${next.slug}`} className="button small">
            {next.title} →
          </Link>
        )}
      </div>
      {!article.generated && (
        <p className="muted" style={{ fontSize: 14 }}>
          Fehlt etwas oder stimmt etwas nicht mehr?{' '}
          <a
            href={`${REPO}/edit/main/docs/wiki/${article.slug}.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Artikel bearbeiten
          </a>
          . Das Wiki wird zusammen mit dem System gepflegt (
          <Link to="/admin/wiki/wissen-pflegen">wie</Link>
          ).
        </p>
      )}
    </article>
  );
}
