import { describe, expect, it } from 'vitest';
import { headingId, inline, renderMarkdown, safeHref } from './markdown.ts';

describe('inline', () => {
  it('escapes markup and formats bold, italic and code', () => {
    expect(inline('a <script>alert(1)</script> & b')).toBe(
      'a &lt;script&gt;alert(1)&lt;/script&gt; &amp; b',
    );
    expect(inline('**fett** und *schräg* und `code <b>`')).toBe(
      '<strong>fett</strong> und <em>schräg</em> und <code>code &lt;b&gt;</code>',
    );
  });

  it('keeps stars in code and in paths', () => {
    expect(inline('`hosted/*/mininode.json`')).toBe('<code>hosted/*/mininode.json</code>');
    expect(inline('2 * 3 * 4')).toBe('2 * 3 * 4');
  });

  it('links only to safe places', () => {
    expect(inline('[x](https://example.com/a?b=1&c=2)')).toContain(
      'href="https://example.com/a?b=1&amp;c=2" target="_blank"',
    );
    expect(inline('[Rollen](wiki:rollen-zugriff)')).toBe(
      '<a href="/admin/wiki/rollen-zugriff">Rollen</a>',
    );
    expect(inline('[Apps](/admin/apps)')).toBe('<a href="/admin/apps">Apps</a>');
    expect(inline('[x](javascript:alert(1))')).not.toContain('href');
    expect(inline('[x](javascript:alert(1))')).not.toContain('<a');
    expect(inline('[x](data:text/html,hi)')).toBe('x');
    expect(inline('[x](http://example.com)')).toBe('x');
    expect(safeHref('//evil.example')).toBeNull();
  });
});

describe('renderMarkdown', () => {
  it('makes headings with unique ids and collects them', () => {
    const { html, headings } = renderMarkdown(
      '# Titel\n\n## Rollen & Zugriff\n\n## Rollen & Zugriff\n',
    );
    expect(headings.map((h) => h.id)).toEqual(['titel', 'rollen-zugriff', 'rollen-zugriff-2']);
    expect(html).toContain('<h2 id="rollen-zugriff">Rollen &amp; Zugriff</h2>');
    expect(headingId('Über Größe')).toBe('ueber-groesse');
  });

  it('renders nested lists, ordered lists and continuation lines', () => {
    const { html } = renderMarkdown(
      '- eins\n  - innen a\n  - innen b\n- zwei\n  weiter\n\n1. erst\n2. dann',
    );
    expect(html).toContain(
      '<ul><li>eins<ul><li>innen a</li><li>innen b</li></ul></li><li>zwei weiter</li></ul>',
    );
    expect(html).toContain('<ol><li>erst</li><li>dann</li></ol>');
  });

  it('renders tables, code fences and quotes', () => {
    const { html } = renderMarkdown(
      '| A | B |\n| --- | --- |\n| 1 | `x` |\n\n```bash\npnpm check <now>\n```\n\n> Hinweis **wichtig**',
    );
    expect(html).toContain('<th>A</th><th>B</th>');
    expect(html).toContain('<td>1</td><td><code>x</code></td>');
    expect(html).toContain('<pre><code>pnpm check &lt;now&gt;</code></pre>');
    expect(html).toContain('<blockquote><p>Hinweis <strong>wichtig</strong></p></blockquote>');
  });

  it('never lets raw HTML through', () => {
    const { html } = renderMarkdown(
      '<img src=x onerror=alert(1)>\n\n| <b>a</b> | b |\n| --- | --- |\n| <i>c</i> | d |',
    );
    expect(html).not.toMatch(/<img|<b>|<i>/);
    expect(html).toContain('&lt;img');
  });
});
