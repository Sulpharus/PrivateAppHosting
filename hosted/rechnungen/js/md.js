// A small Markdown subset for notes and invoice texts: paragraphs, **bold**, *italic*, lists,
// checklists (- [ ] / - [x]) and http(s) links. It builds DOM nodes with textContent only, so no
// typed text can ever become markup or script.

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;

/** Inline parts of a line: [{ type: 'text'|'bold'|'italic'|'link', text, href }]. */
export function inlineParts(line) {
  const parts = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index > last) parts.push({ type: 'text', text: line.slice(last, match.index) });
    const token = match[0];
    if (token.startsWith('**')) parts.push({ type: 'bold', text: token.slice(2, -2) });
    else if (token.startsWith('[')) {
      const text = token.slice(1, token.indexOf(']('));
      parts.push({ type: 'link', text, href: match[2] });
    } else parts.push({ type: 'italic', text: token.slice(1, -1) });
    last = match.index + token.length;
  }
  if (last < line.length) parts.push({ type: 'text', text: line.slice(last) });
  return parts;
}

/** Blocks of a text: paragraphs, list items and checklist items (with their line number). */
export function blocks(text) {
  const out = [];
  String(text ?? '')
    .split(/\r?\n/)
    .forEach((raw, lineNo) => {
      const check = raw.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
      const item = raw.match(/^\s*[-*]\s+(.*)$/);
      if (check) out.push({ type: 'check', done: check[1] !== ' ', text: check[2], lineNo });
      else if (item) out.push({ type: 'item', text: item[1], lineNo });
      else if (raw.trim()) out.push({ type: 'para', text: raw.trim(), lineNo });
      else out.push({ type: 'gap', lineNo });
    });
  return out;
}

/** The text without markup, for the PDF: lists become bullets, checklists ☐-free bullets. */
export function mdToPlain(text) {
  return blocks(text)
    .map((b) => {
      if (b.type === 'gap') return '';
      const plain = inlineParts(b.text)
        .map((p) => (p.type === 'link' ? `${p.text} (${p.href})` : p.text))
        .join('');
      if (b.type === 'check') return `${b.done ? '[x]' : '[ ]'} ${plain}`;
      if (b.type === 'item') return `• ${plain}`;
      return plain;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Flips the checkbox on line `lineNo` of the text. */
export function toggleCheck(text, lineNo) {
  const lines = String(text ?? '').split(/\r?\n/);
  const line = lines[lineNo];
  if (line === undefined) return text;
  lines[lineNo] = line.replace(/\[([ xX])\]/, (_m, mark) => (mark === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

function appendInline(parent, text) {
  for (const part of inlineParts(text)) {
    if (part.type === 'text') parent.append(part.text);
    else if (part.type === 'bold') {
      const b = document.createElement('strong');
      b.textContent = part.text;
      parent.append(b);
    } else if (part.type === 'italic') {
      const i = document.createElement('em');
      i.textContent = part.text;
      parent.append(i);
    } else {
      const a = document.createElement('a');
      a.textContent = part.text;
      a.href = part.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      parent.append(a);
    }
  }
}

/**
 * Renders the text as DOM. With `onToggle(lineNo)` checklist boxes are clickable buttons
 * (`checkLabel(text, done)` names them for screen readers).
 */
export function mdToDom(text, { onToggle, checkLabel } = {}) {
  const root = document.createElement('div');
  root.className = 'md';
  let list = null;
  for (const block of blocks(text)) {
    if (block.type === 'item' || block.type === 'check') {
      if (!list) {
        list = document.createElement('ul');
        root.append(list);
      }
      const li = document.createElement('li');
      if (block.type === 'check') {
        li.className = 'md-check';
        const box = document.createElement(onToggle ? 'button' : 'span');
        box.className = 'md-box';
        if (onToggle) {
          box.type = 'button';
          box.setAttribute('aria-pressed', String(block.done));
          if (checkLabel) box.setAttribute('aria-label', checkLabel(block.text, block.done));
          box.addEventListener('click', () => onToggle(block.lineNo));
        }
        box.dataset.done = String(block.done);
        li.append(box);
        const span = document.createElement('span');
        appendInline(span, block.text);
        li.append(span);
      } else appendInline(li, block.text);
      list.append(li);
      continue;
    }
    list = null;
    if (block.type === 'para') {
      const p = document.createElement('p');
      appendInline(p, block.text);
      root.append(p);
    }
  }
  return root;
}
