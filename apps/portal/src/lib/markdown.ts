// A small Markdown renderer for the wiki (Verwaltung → Wissen). The articles are part of the
// repository, but every character is still escaped first and only a short list of Markdown
// constructs becomes HTML, so an article can never inject markup or script.
//
// Supported: # to #### headings (with ids), paragraphs, **bold**, *italic*, `code`, fenced code,
// lists (nested, ordered and not), tables, > quotes, --- rules and links (https, /admin paths,
// #anchors and wiki:<slug> for another article).

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface Rendered {
  html: string;
  headings: Heading[];
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** "Rollen & Zugriff" → "rollen-zugriff" (umlauts spelled out). */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Where a link may go; anything else is shown as plain text. */
export function safeHref(url: string): string | null {
  const wiki = /^wiki:([a-z0-9-]+)(#[a-z0-9-]+)?$/.exec(url);
  if (wiki) return `/admin/wiki/${wiki[1]}${wiki[2] ?? ''}`;
  if (/^https:\/\/[^\s"'<>]+$/.test(url)) return url;
  if (/^\/admin(\/[a-z0-9/_-]*)?(#[a-z0-9-]+)?$/.test(url)) return url;
  if (/^#[a-z0-9-]+$/.test(url)) return url;
  return null;
}

/** Inline formatting of one line of text (already free of block syntax). */
export function inline(text: string): string {
  const codes: string[] = [];
  const links: string[] = [];
  // Code spans first, so nothing inside them is formatted.
  let work = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\uE000${codes.length - 1}\uE000`;
  });
  work = escapeHtml(work);
  // Links are set aside too: emphasis inside an address must not become markup.
  work = work.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    // The url went through escapeHtml: undo it for the check, the result is escaped again.
    const raw = unescapeHtml(url);
    const href = raw.includes('\uE000') ? null : safeHref(raw);
    if (!href) return label;
    const external = href.startsWith('https://');
    links.push(
      `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`,
    );
    return `\uE001${links.length - 1}\uE001`;
  });
  work = work.replace(/\*\*([^*\s][^*]*?)\*\*/g, '<strong>$1</strong>');
  work = work.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  return work
    .replace(/\uE001(\d+)\uE001/g, (_m, index: string) => links[Number(index)] ?? '')
    .replace(/\uE000(\d+)\uE000/g, (_m, index: string) => codes[Number(index)] ?? '');
}

interface ListItem {
  ordered: boolean;
  indent: number;
  text: string;
}

const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function renderList(items: ListItem[]): string {
  // Items with a deeper indent belong to the item before them.
  const build = (start: number, indent: number): [string, number] => {
    const first = items[start];
    if (!first) return ['', start];
    const tag = first.ordered ? 'ol' : 'ul';
    let html = `<${tag}>`;
    let i = start;
    while (i < items.length) {
      const item = items[i];
      if (!item || item.indent < indent) break;
      if (item.indent > indent) {
        // A deeper item without a parent: treat it as part of the previous one.
        const [nested, next] = build(i, item.indent);
        html = html.endsWith('</li>')
          ? `${html.slice(0, -5)}${nested}</li>`
          : `${html}<li>${nested}</li>`;
        i = next;
        continue;
      }
      html += `<li>${inline(item.text)}`;
      i++;
      const following = items[i];
      if (following && following.indent > indent) {
        const [nested, next] = build(i, following.indent);
        html += nested;
        i = next;
      }
      html += '</li>';
    }
    return [`${html}</${tag}>`, i];
  };
  const [html] = build(0, items[0]?.indent ?? 0);
  return html;
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));

const isSeparator = (line: string): boolean =>
  /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(line) ||
  /^\s*\|\s*:?-{2,}:?\s*\|\s*$/.test(line);

export interface RenderOptions {
  /** Put in front of every heading id, so several texts on one page cannot share an id. */
  idPrefix?: string;
}

export function renderMarkdown(source: string, options: RenderOptions = {}): Rendered {
  return render(source, options, { used: new Set<string>(), headings: [] });
}

interface Context {
  used: Set<string>;
  headings: Heading[];
}

function render(source: string, options: RenderOptions, context: Context): Rendered {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const { headings, used } = context;
  const out: string[] = [];
  let i = 0;

  const uniqueId = (text: string): string => {
    const base = `${options.idPrefix ?? ''}${headingId(text) || 'abschnitt'}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Fenced code
    const fence = /^```\s*([a-z0-9+-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        code.push(lines[i] ?? '');
        i++;
      }
      i++;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    // Heading
    const heading = /^(#{1,4})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      const text = heading[2] ?? '';
      const id = uniqueId(text.replace(/[`*]/g, ''));
      headings.push({ level, text: text.replace(/[`*]/g, ''), id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    // Quote
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        quote.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${render(quote.join('\n'), options, context).html}</blockquote>`);
      continue;
    }
    // Table: a row of cells followed by a separator row
    if (line.includes('|') && isSeparator(lines[i + 1] ?? '')) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim() !== '') {
        rows.push(splitRow(lines[i] ?? ''));
        i++;
      }
      out.push(
        `<div class="wiki-table"><table><thead><tr>${head
          .map((cell) => `<th>${inline(cell)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${head.map((_h, column) => `<td>${inline(row[column] ?? '')}</td>`).join('')}</tr>`,
          )
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    // List
    if (LIST.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? '';
        const match = LIST.exec(current);
        if (match) {
          items.push({
            ordered: /\d/.test(match[2] ?? ''),
            indent: Math.floor((match[1] ?? '').replace(/\t/g, '  ').length / 2),
            text: match[3] ?? '',
          });
          i++;
        } else if (/^\s{2,}\S/.test(current) && items.length > 0) {
          // A continuation line of the item before.
          const last = items[items.length - 1];
          if (last) last.text += ` ${current.trim()}`;
          i++;
        } else break;
      }
      out.push(renderList(items));
      continue;
    }
    // Paragraph: until a blank line or the start of another block
    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (
        current.trim() === '' ||
        /^```/.test(current) ||
        /^#{1,4}\s/.test(current) ||
        /^>\s?/.test(current) ||
        LIST.test(current) ||
        (current.includes('|') && isSeparator(lines[i + 1] ?? ''))
      )
        break;
      paragraph.push(current.trim());
      i++;
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  return { html: out.join('\n'), headings };
}
